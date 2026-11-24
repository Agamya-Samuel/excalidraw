import {
  CaptureUpdateAction,
  exportScene,
  getSceneVersion,
  restoreElements,
  THEME,
  zoomToFitBounds,
  reconcileElements,
} from "@excalidraw/excalidraw";
import { ErrorDialog } from "@excalidraw/excalidraw/components/ErrorDialog";
import { APP_NAME, cloneJSON, EVENT, toBrandedType } from "@excalidraw/common";
import {
  IDLE_THRESHOLD,
  ACTIVE_THRESHOLD,
  UserIdleState,
  assertNever,
  debounce,
  isDevEnv,
  isTestEnv,
  preventUnload,
  resolvablePromise,
  throttleRAF,
} from "@excalidraw/common";
import { decryptData } from "@excalidraw/excalidraw/data/encryption";
import { getVisibleSceneBounds } from "@excalidraw/element";
import { newElementWith } from "@excalidraw/element";
import { isImageElement, isInitializedImageElement } from "@excalidraw/element";
import { AbortError } from "@excalidraw/excalidraw/errors";
import { t } from "@excalidraw/excalidraw/i18n";
import { withBatchedUpdates } from "@excalidraw/excalidraw/reactUtils";
import { clearAppStateForLocalStorage } from "@excalidraw/excalidraw/appState";

import throttle from "lodash.throttle";
import { PureComponent } from "react";

import { bumpElementVersions } from "@excalidraw/excalidraw/data/restore";

import type {
  ReconciledExcalidrawElement,
  RemoteExcalidrawElement,
} from "@excalidraw/excalidraw/data/reconcile";
import type { ImportedDataState } from "@excalidraw/excalidraw/data/types";
import type {
  ExcalidrawElement,
  FileId,
  InitializedExcalidrawImageElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  BinaryFileData,
  ExcalidrawImperativeAPI,
  SocketId,
  Collaborator,
  Gesture,
  UserToFollow,
} from "@excalidraw/excalidraw/types";
import type { Mutable, ValueOf } from "@excalidraw/common/utility-types";

import { appJotaiStore, atom } from "../app-jotai";
import {
  CLOUD_DOC_SAVE_DEBOUNCE_MS,
  CLOUD_DOC_SAVE_MAX_WAIT_MS,
  CURSOR_SYNC_TIMEOUT,
  FILE_UPLOAD_MAX_BYTES,
  STORAGE_PREFIXES,
  INITIAL_SCENE_UPDATE_TIMEOUT,
  LOAD_IMAGES_TIMEOUT,
  WS_SUBTYPES,
  SYNC_FULL_SCENE_INTERVAL_MS,
  WS_EVENTS,
} from "../app_constants";
import {
  generateCollaborationLinkData,
  getCollaborationLink,
  getSyncableElements,
} from "../data";
import {
  encodeFilesForUpload,
  FileManager,
  updateStaleImageStatuses,
} from "../data/FileManager";
import { FileStatusStore } from "../data/fileStatusStore";
import { LocalData } from "../data/LocalData";
import { loadDocScene, saveDocScene } from "../cloud/docScene";
import {
  isSceneSaved,
  loadFiles,
  loadScene,
  saveFiles,
  saveScene,
} from "../data/remote";
import {
  importUsernameFromLocalStorage,
  saveUsernameToLocalStorage,
} from "../data/localStorage";
import { resetBrowserStateVersions } from "../data/tabSync";
import { authUserAtom } from "../auth/authAtoms";
import {
  cloudConnectionStatusAtom,
  cloudSaveStatusAtom,
} from "../cloud/cloudAtoms";
import { deleteCloudDraft, putCloudDraft } from "../cloud/draftStore";
import { uploadThumbnail } from "../cloud/documents";
import { navigate } from "../cloud/routes";

import { collabErrorIndicatorAtom } from "./CollabError";
import Portal from "./Portal";

import type {
  CloudConnectionStatus,
  CloudSaveStatus,
} from "../cloud/cloudAtoms";
import type { CloudDraft } from "../cloud/draftStore";

import type {
  SocketUpdateDataSource,
  SyncableExcalidrawElement,
} from "../data";

export const collabAPIAtom = atom<CollabAPI | null>(null);
export const isCollaboratingAtom = atom(false);
export const isOfflineAtom = atom(
  typeof navigator !== "undefined" && !navigator.onLine,
);

const OFFLINE_STATUS_DEBOUNCE_TIMEOUT = 1000;

interface CollabState {
  errorMessage: string | null;
  /** errors related to saving */
  dialogNotifiedErrors: Record<string, boolean>;
  username: string;
  activeRoomLink: string | null;
}

export const activeRoomLinkAtom = atom<string | null>(null);
export const userToFollowAtom = atom<UserToFollow | null>(null);

type CollabInstance = InstanceType<typeof Collab>;

export interface CollabAPI {
  /** function so that we can access the latest value from stale callbacks */
  isCollaborating: () => boolean;
  onPointerUpdate: CollabInstance["onPointerUpdate"];
  startCollaboration: CollabInstance["startCollaboration"];
  stopCollaboration: CollabInstance["stopCollaboration"];
  syncElements: CollabInstance["syncElements"];
  fetchImageFiles: CollabInstance["fetchImageFiles"];
  setUsername: CollabInstance["setUsername"];
  getUsername: CollabInstance["getUsername"];
  getActiveRoomLink: CollabInstance["getActiveRoomLink"];
  setCollabError: CollabInstance["setErrorDialog"];
  setUserToFollow: CollabInstance["setUserToFollow"];
}

interface CollabProps {
  excalidrawAPI: ExcalidrawImperativeAPI;
}

class Collab extends PureComponent<CollabProps, CollabState> {
  portal: Portal;
  fileManager: FileManager;
  docId: string | null = null;
  thumbnailTimer: number | null = null;
  private docLastSavedVersion: number | null = null;
  private lastScheduledSceneVersion: number | null = null;
  private cloudSaveTimer: number | null = null;
  private cloudSaveMaxTimer: number | null = null;
  private saveStatusTimer: number | null = null;
  private firstInRoomTimer: number | null = null;
  private draftTimer: number | null = null;
  excalidrawAPI: CollabProps["excalidrawAPI"];
  activeIntervalId: number | null;
  idleTimeoutId: number | null;

  private socketInitializationTimer?: number;
  private lastBroadcastedOrReceivedSceneVersion: number = -1;
  private collaborators = new Map<SocketId, Collaborator>();
  /** the socket ids of the users following the current user */
  private followedBy = new Set<SocketId>();

  /** pending startCollaboration call, shared with duplicate callers */
  private collaborationPromise: Promise<
    | (ImportedDataState & { elements: readonly OrderedExcalidrawElement[] })
    | null
  > | null = null;
  /** bumped whenever the socket is torn down to invalidate stale inits */
  private collabGeneration = 0;
  /** whether the persisted cloud doc scene has already been loaded */
  private cloudSceneLoaded = false;

  constructor(props: CollabProps) {
    super(props);
    this.state = {
      errorMessage: null,
      dialogNotifiedErrors: {},
      username: importUsernameFromLocalStorage() || "",
      activeRoomLink: null,
    };
    this.portal = new Portal(this);
    this.fileManager = new FileManager({
      onFileStatusChange: FileStatusStore.updateStatuses.bind(FileStatusStore),
      getFiles: async (fileIds) => {
        const { roomId, roomKey } = this.portal;
        if (!roomId || !roomKey) {
          throw new AbortError();
        }

        return loadFiles(
          this.docId
            ? `docs/${this.docId}`
            : `${STORAGE_PREFIXES.collabFiles}/${roomId}`,
          roomKey,
          fileIds,
        );
      },
      saveFiles: async ({ addedFiles }) => {
        const { roomId, roomKey } = this.portal;
        if (!roomId || !roomKey) {
          throw new AbortError();
        }

        const { savedFiles, erroredFiles } = await saveFiles({
          prefix: this.docId
            ? `docs/${this.docId}`
            : `${STORAGE_PREFIXES.collabFiles}/${roomId}`,
          files: await encodeFilesForUpload({
            files: addedFiles,
            encryptionKey: roomKey,
            maxBytes: FILE_UPLOAD_MAX_BYTES,
          }),
        });

        return {
          savedFiles: savedFiles.reduce(
            (acc: Map<FileId, BinaryFileData>, id) => {
              const fileData = addedFiles.get(id);
              if (fileData) {
                acc.set(id, fileData);
              }
              return acc;
            },
            new Map(),
          ),
          erroredFiles: erroredFiles.reduce(
            (acc: Map<FileId, BinaryFileData>, id) => {
              const fileData = addedFiles.get(id);
              if (fileData) {
                acc.set(id, fileData);
              }
              return acc;
            },
            new Map(),
          ),
        };
      },
    });
    this.excalidrawAPI = props.excalidrawAPI;
    this.activeIntervalId = null;
    this.idleTimeoutId = null;
  }

  private onUmmount: (() => void) | null = null;

  componentDidMount() {
    window.addEventListener(EVENT.BEFORE_UNLOAD, this.beforeUnload);
    window.addEventListener("online", this.onOfflineStatusChange);
    window.addEventListener("offline", this.onOfflineStatusChange);
    window.addEventListener("online", this.onOnline);
    window.addEventListener("pagehide", this.onPageHide);
    window.addEventListener(EVENT.UNLOAD, this.onUnload);

    const unsubOnUserFollow = this.excalidrawAPI.onUserFollow((payload) => {
      this.setUserToFollow(
        payload.action === "FOLLOW" ? payload.userToFollow : null,
      );
    });
    const throttledRelayUserViewportBounds = throttleRAF(
      this.relayVisibleSceneBounds,
    );
    const unsubOnScrollChange = this.excalidrawAPI.onScrollChange(() =>
      throttledRelayUserViewportBounds(),
    );
    this.onUmmount = () => {
      unsubOnUserFollow();
      unsubOnScrollChange();
    };

    this.onOfflineStatusToggle();

    const collabAPI: CollabAPI = {
      isCollaborating: this.isCollaborating,
      onPointerUpdate: this.onPointerUpdate,
      startCollaboration: this.startCollaboration,
      syncElements: this.syncElements,
      fetchImageFiles: this.fetchImageFiles,
      stopCollaboration: this.stopCollaboration,
      setUsername: this.setUsername,
      getUsername: this.getUsername,
      getActiveRoomLink: this.getActiveRoomLink,
      setCollabError: this.setErrorDialog,
      setUserToFollow: this.setUserToFollow,
    };

    appJotaiStore.set(collabAPIAtom, collabAPI);

    if (isTestEnv() || isDevEnv()) {
      window.collab = window.collab || ({} as Window["collab"]);
      Object.defineProperties(window, {
        collab: {
          configurable: true,
          value: this,
        },
      });
    }
  }

  onOfflineStatusToggle = () => {
    appJotaiStore.set(isOfflineAtom, !window.navigator.onLine);
  };

  onOfflineStatusChange = debounce(
    this.onOfflineStatusToggle,
    OFFLINE_STATUS_DEBOUNCE_TIMEOUT,
  );

  componentWillUnmount() {
    // Leaving a cloud board must persist pending edits and close the socket.
    // Otherwise the detached socket keeps the collab room non-empty, so the
    // next visit never receives `first-in-room` and never reloads from the DB.
    if (this.docId) {
      this.flushCloudSave();
    }
    this.destroySocketClient();

    window.removeEventListener("online", this.onOfflineStatusChange);
    window.removeEventListener("offline", this.onOfflineStatusChange);
    this.onOfflineStatusChange.cancel();
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("pagehide", this.onPageHide);
    window.removeEventListener(EVENT.BEFORE_UNLOAD, this.beforeUnload);
    window.removeEventListener(EVENT.UNLOAD, this.onUnload);
    window.removeEventListener(EVENT.POINTER_MOVE, this.onPointerMove);
    window.removeEventListener(
      EVENT.VISIBILITY_CHANGE,
      this.onVisibilityChange,
    );
    if (this.activeIntervalId) {
      window.clearInterval(this.activeIntervalId);
      this.activeIntervalId = null;
    }
    if (this.idleTimeoutId) {
      window.clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
    }
    this.onUmmount?.();
  }

  isCollaborating = () => appJotaiStore.get(isCollaboratingAtom)!;

  private setIsCollaborating = (isCollaborating: boolean) => {
    appJotaiStore.set(isCollaboratingAtom, isCollaborating);
  };

  private onUnload = () => {
    this.destroySocketClient({ isUnload: true });
  };

  private beforeUnload = withBatchedUpdates((event: BeforeUnloadEvent) => {
    const syncableElements = getSyncableElements(
      this.getSceneElementsIncludingDeleted(),
    );

    if (this.docId) {
      void this.writeDraft(syncableElements);
    }

    if (
      this.isCollaborating() &&
      (this.fileManager.shouldPreventUnload(syncableElements) ||
        !isSceneSaved(this.portal, syncableElements))
    ) {
      // this won't run in time if user decides to leave the site, but
      //  the purpose is to run in immediately after user decides to stay
      this.saveCollabRoom(syncableElements);

      if (import.meta.env.VITE_APP_DISABLE_PREVENT_UNLOAD !== "true") {
        preventUnload(event);
      } else {
        console.warn(
          "preventing unload disabled (VITE_APP_DISABLE_PREVENT_UNLOAD)",
        );
      }
    }
  });

  private scheduleThumbnail = () => {
    if (!this.docId) {
      return;
    }
    if (this.thumbnailTimer) {
      window.clearTimeout(this.thumbnailTimer);
    }
    this.thumbnailTimer = window.setTimeout(async () => {
      this.thumbnailTimer = null;
      const docId = this.docId;
      if (!docId) {
        return;
      }
      try {
        const elements = this.excalidrawAPI.getSceneElements();
        if (!elements.length) {
          return;
        }
        const appState = this.excalidrawAPI.getAppState();
        const blob = await exportScene({
          type: "png",
          data: {
            elements,
            appState,
            files: this.excalidrawAPI.getFiles(),
          },
          config: {
            maxWidthOrHeight: 640,
            padding: 16,
            scale: 1,
            canvasBackgroundColor: "#ffffff",
            theme: THEME.LIGHT,
          },
        });
        await uploadThumbnail(docId, blob);
      } catch (error) {
        console.error("Failed to generate board thumbnail", error);
      }
    }, 4000);
  };

  saveCollabRoom = async (
    syncableElements: readonly SyncableExcalidrawElement[],
  ) => {
    syncableElements = cloneJSON(syncableElements);
    const isCloudDoc = !!this.docId;
    const sceneVersion = getSceneVersion(syncableElements);

    if (
      isCloudDoc &&
      syncableElements.length === 0 &&
      (this.docLastSavedVersion ?? 0) > 0
    ) {
      // empty canvas while the cloud copy has content: usually a failed or
      // partial initial scene application. Never overwrite the cloud copy.
      this.setSaveStatus("idle");
      return;
    }

    if (isCloudDoc && this.docLastSavedVersion === sceneVersion) {
      this.lastScheduledSceneVersion = this.docLastSavedVersion;
      this.clearDraft();
      this.setSaveStatus("saved");
      return;
    }

    if (isCloudDoc) {
      this.setSaveStatus("saving");
    }
    try {
      const storedElements = (this.docId && this.portal.roomKey
        ? await saveDocScene({
            docId: this.docId,
            roomKey: this.portal.roomKey,
            elements: syncableElements,
            appState: this.excalidrawAPI.getAppState(),
            baseVersion: this.docLastSavedVersion,
          })
        : await saveScene(
            this.portal,
            syncableElements,
            this.excalidrawAPI.getAppState(),
          )) as unknown as RemoteExcalidrawElement[] | null;

      if (isCloudDoc) {
        this.docLastSavedVersion = getSceneVersion(
          (storedElements ??
            syncableElements) as readonly OrderedExcalidrawElement[],
        );
        this.lastScheduledSceneVersion = this.docLastSavedVersion;
        this.clearDraft();
        this.setSaveStatus("saved");
        this.scheduleThumbnail();
      }
      this.resetErrorIndicator();

      if (this.isCollaborating() && storedElements) {
        this.handleRemoteSceneUpdate(this._reconcileElements(storedElements));
      }
    } catch (error: any) {
      if (isCloudDoc) {
        const offline =
          !navigator.onLine ||
          appJotaiStore.get(cloudConnectionStatusAtom) === "offline";
        if (offline) {
          const cached = await this.writeDraft(syncableElements);
          if (cached) {
            this.resetErrorIndicator();
            this.setSaveStatus("local");
            return;
          }
          this.setSaveStatus("error");
        } else {
          this.setSaveStatus("error");
        }
      }
      const errorMessage = /is longer than.*?bytes/.test(error.message)
        ? t("errors.collabSaveFailed_sizeExceeded")
        : t("errors.collabSaveFailed");

      if (
        !this.state.dialogNotifiedErrors[errorMessage] ||
        !this.isCollaborating()
      ) {
        this.setErrorDialog(errorMessage);
        this.setState({
          dialogNotifiedErrors: {
            ...this.state.dialogNotifiedErrors,
            [errorMessage]: true,
          },
        });
      }

      if (this.isCollaborating()) {
        this.setErrorIndicator(errorMessage);
      }

      console.error(error);
    }
  };

  stopCollaboration = (keepRemoteState = true) => {
    this.queueBroadcastAllElements.cancel();
    this.queueSaveToRoom.cancel();
    this.clearCloudSaveTimers();
    this.loadImageFiles.cancel();
    this.resetErrorIndicator(true);

    this.saveCollabRoom(
      getSyncableElements(
        this.excalidrawAPI.getSceneElementsIncludingDeleted(),
      ),
    );

    if (this.portal.socket && this.fallbackInitializationHandler) {
      this.portal.socket.off(
        "connect_error",
        this.fallbackInitializationHandler,
      );
    }

    if (!keepRemoteState) {
      LocalData.fileStorage.reset();
      this.destroySocketClient();
    } else if (window.confirm(t("alerts.collabStopOverridePrompt"))) {
      // hack to ensure that we prefer we disregard any new browser state
      // that could have been saved in other tabs while we were collaborating
      resetBrowserStateVersions();

      if (this.docId && this.getCurrentUserId()) {
        navigate("/dashboard");
      } else {
        window.history.pushState({}, APP_NAME, window.location.origin);
      }
      this.destroySocketClient();

      LocalData.fileStorage.reset();

      const elements = this.excalidrawAPI
        .getSceneElementsIncludingDeleted()
        .map((element) => {
          if (isImageElement(element) && element.status === "saved") {
            return newElementWith(element, { status: "pending" });
          }
          return element;
        });

      this.excalidrawAPI.updateScene({
        elements,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }
  };

  private destroySocketClient = (opts?: { isUnload: boolean }) => {
    // invalidate any in-flight startCollaboration and reset load state
    this.collabGeneration++;
    this.collaborationPromise = null;
    this.cloudSceneLoaded = false;
    this.lastBroadcastedOrReceivedSceneVersion = -1;
    this.docId = null;
    this.docLastSavedVersion = null;
    this.lastScheduledSceneVersion = null;
    this.clearFirstInRoomTimer();
    this.setConnectionStatus("idle");
    this.clearCloudSaveTimers();
    if (this.draftTimer != null) {
      window.clearTimeout(this.draftTimer);
      this.draftTimer = null;
    }
    if (this.thumbnailTimer) {
      window.clearTimeout(this.thumbnailTimer);
      this.thumbnailTimer = null;
    }
    if (this.saveStatusTimer != null) {
      window.clearTimeout(this.saveStatusTimer);
      this.saveStatusTimer = null;
    }
    appJotaiStore.set(cloudSaveStatusAtom, "idle");
    this.portal.close();
    this.fileManager.reset();
    this.followedBy = new Set();
    if (!opts?.isUnload) {
      this.setIsCollaborating(false);
      this.setActiveRoomLink(null);
      appJotaiStore.set(userToFollowAtom, null);
      this.collaborators = new Map();
      this.excalidrawAPI.updateScene({
        collaborators: this.collaborators,
      });
      LocalData.resumeSave("collaboration");
    }
  };

  private fetchImageFiles = async (opts: {
    elements: readonly ExcalidrawElement[];
    /**
     * Indicates whether to fetch files that are errored or pending and older
     * than 10 seconds.
     *
     * Use this as a mechanism to fetch files which may be ok but for some
     * reason their status was not updated correctly.
     */
    forceFetchFiles?: boolean;
  }) => {
    const unfetchedImages = opts.elements
      .filter((element) => {
        return (
          isInitializedImageElement(element) &&
          !this.fileManager.isFileTracked(element.fileId) &&
          !element.isDeleted &&
          (opts.forceFetchFiles
            ? element.status !== "pending" ||
              Date.now() - element.updated > 10000
            : element.status === "saved")
        );
      })
      .map((element) => (element as InitializedExcalidrawImageElement).fileId);

    return await this.fileManager.getFiles(unfetchedImages);
  };

  private decryptPayload = async (
    iv: Uint8Array<ArrayBuffer>,
    encryptedData: ArrayBuffer,
    decryptionKey: string,
  ): Promise<ValueOf<SocketUpdateDataSource>> => {
    try {
      const decrypted = await decryptData(iv, encryptedData, decryptionKey);

      const decodedData = new TextDecoder("utf-8").decode(
        new Uint8Array(decrypted),
      );
      return JSON.parse(decodedData);
    } catch (error) {
      window.alert(t("alerts.decryptFailed"));
      console.error(error);
      return {
        type: WS_SUBTYPES.INVALID_RESPONSE,
      };
    }
  };

  private fallbackInitializationHandler: null | (() => any) = null;

  startCollaboration = (
    existingRoomLinkData: null | { roomId: string; roomKey: string },
    docId?: string | null,
  ) => {
    // The init effect can run more than once (React StrictMode, atom updates).
    // Share the in-flight promise instead of returning `null`, which would
    // resolve the initial scene as empty.
    if (this.collaborationPromise) {
      return this.collaborationPromise;
    }

    const promise: Promise<
      | (ImportedDataState & { elements: readonly OrderedExcalidrawElement[] })
      | null
    > = this._startCollaboration(existingRoomLinkData, docId).finally(() => {
      if (this.collaborationPromise === promise) {
        this.collaborationPromise = null;
      }
    });
    this.collaborationPromise = promise;
    return promise;
  };

  private _startCollaboration = async (
    existingRoomLinkData: null | { roomId: string; roomKey: string },
    docId?: string | null,
  ) => {
    const generation = ++this.collabGeneration;
    this.docId = docId ?? null;
    this.docLastSavedVersion = null;
    this.lastScheduledSceneVersion = null;
    this.cloudSceneLoaded = false;

    if (this.docId) {
      this.setConnectionStatus("connecting");
    }

    if (!this.state.username) {
      import("@excalidraw/random-username").then(({ getRandomUsername }) => {
        const username = getRandomUsername();
        this.setUsername(username);
      });
    }

    let roomId;
    let roomKey;

    if (existingRoomLinkData) {
      ({ roomId, roomKey } = existingRoomLinkData);
    } else {
      ({ roomId, roomKey } = await generateCollaborationLinkData());
      if (!this.docId) {
        window.history.pushState(
          {},
          APP_NAME,
          getCollaborationLink({ roomId, roomKey }),
        );
      }
    }

    // TODO: `ImportedDataState` type here seems abused
    const scenePromise = resolvablePromise<
      | (ImportedDataState & { elements: readonly OrderedExcalidrawElement[] })
      | null
    >();

    this.setIsCollaborating(true);
    LocalData.pauseSave("collaboration");

    const { default: socketIOClient } = await import(
      /* webpackChunkName: "socketIoClient" */ "socket.io-client"
    );

    // a newer start (or an unmount) superseded this one while importing
    if (generation !== this.collabGeneration) {
      return null;
    }

    const fallbackInitializationHandler = () => {
      if (this.docId) {
        this.clearFirstInRoomTimer();
        this.setConnectionStatus("offline");
      }
      this.initializeRoom({
        roomLinkData: existingRoomLinkData,
        fetchScene: true,
      }).then((scene) => {
        scenePromise.resolve(scene);
      });
    };
    this.fallbackInitializationHandler = fallbackInitializationHandler;

    try {
      this.portal.socket = this.portal.open(
        socketIOClient(
          import.meta.env.VITE_APP_WS_SERVER_URL || window.location.origin,
          {
            transports: ["websocket", "polling"],
          },
        ),
        roomId,
        roomKey,
      );

      this.portal.socket.once("connect_error", fallbackInitializationHandler);
    } catch (error: any) {
      console.error(error);
      this.setErrorDialog(error.message);
      return null;
    }

    if (this.docId) {
      this.portal.socket.on("connect", () => {
        if (this.docId) {
          this.setConnectionStatus("connecting");
          this.scheduleFirstInRoomTimeout();
        }
      });
      this.portal.socket.on("disconnect", () => {
        if (this.docId) {
          this.setConnectionStatus("offline");
        }
      });
      this.portal.socket.on("connect_error", () => {
        if (this.docId) {
          this.setConnectionStatus("offline");
        }
      });
      this.scheduleFirstInRoomTimeout();
    }

    if (existingRoomLinkData) {
      // when joining existing room, don't merge it with current scene data
      this.excalidrawAPI.resetScene();
    } else {
      const elements = this.excalidrawAPI.getSceneElements().map((element) => {
        if (isImageElement(element) && element.status === "saved") {
          return newElementWith(element, { status: "pending" });
        }
        return element;
      });
      // remove deleted elements from elements array to ensure we don't
      // expose potentially sensitive user data in case user manually deletes
      // existing elements (or clears scene), which would otherwise be persisted
      // to database even if deleted before creating the room.
      this.excalidrawAPI.updateScene({
        elements,
        captureUpdate: CaptureUpdateAction.NEVER,
      });

      this.saveCollabRoom(getSyncableElements(elements));
    }

    // fallback in case you're not alone in the room but still don't receive
    // initial SCENE_INIT message
    this.socketInitializationTimer = window.setTimeout(
      fallbackInitializationHandler,
      INITIAL_SCENE_UPDATE_TIMEOUT,
    );

    // All socket listeners are moving to Portal
    this.portal.socket.on(
      "client-broadcast",
      async (encryptedData: ArrayBuffer, iv: Uint8Array<ArrayBuffer>) => {
        if (!this.portal.roomKey) {
          return;
        }

        const decryptedData = await this.decryptPayload(
          iv,
          encryptedData,
          this.portal.roomKey,
        );

        if (this.docId) {
          this.clearFirstInRoomTimer();
          this.setConnectionStatus("live");
        }

        switch (decryptedData.type) {
          case WS_SUBTYPES.INVALID_RESPONSE:
            return;
          case WS_SUBTYPES.INIT: {
            if (!this.portal.socketInitialized) {
              this.initializeRoom({ fetchScene: false });
              const remoteElements = toBrandedType<
                readonly RemoteExcalidrawElement[]
              >(decryptedData.payload.elements);
              const reconciledElements =
                this._reconcileElements(remoteElements);
              this.handleRemoteSceneUpdate(reconciledElements);
              // noop if already resolved via backend init
              scenePromise.resolve({
                elements: reconciledElements,
                scrollToContent: true,
              });
            }
            break;
          }
          case WS_SUBTYPES.UPDATE:
            this.handleRemoteSceneUpdate(
              this._reconcileElements(
                toBrandedType<readonly RemoteExcalidrawElement[]>(
                  decryptedData.payload.elements,
                ),
              ),
            );
            break;
          case WS_SUBTYPES.MOUSE_LOCATION: {
            const { pointer, button, username, selectedElementIds } =
              decryptedData.payload;

            const socketId: SocketUpdateDataSource["MOUSE_LOCATION"]["payload"]["socketId"] =
              decryptedData.payload.socketId ||
              // @ts-ignore legacy, see #2094 (#2097)
              decryptedData.payload.socketID;

            this.updateCollaborator(socketId, {
              pointer,
              button,
              selectedElementIds,
              username,
            });

            break;
          }

          case WS_SUBTYPES.USER_VISIBLE_SCENE_BOUNDS: {
            const { sceneBounds, socketId } = decryptedData.payload;

            const userToFollow = appJotaiStore.get(userToFollowAtom);

            // we're not following the user
            // (shouldn't happen, but could be late message or bug upstream)
            if (userToFollow?.socketId !== socketId) {
              console.warn(
                `receiving remote client's (from ${socketId}) viewport bounds even though we're not subscribed to it!`,
              );
              return;
            }

            // cross-follow case, ignore updates in this case
            if (this.followedBy.has(userToFollow.socketId)) {
              return;
            }

            const appState = this.excalidrawAPI.getAppState();

            this.excalidrawAPI.updateScene({
              appState: zoomToFitBounds({
                appState,
                bounds: sceneBounds,
                fit: "contain",
              }).appState,
            });

            break;
          }

          case WS_SUBTYPES.IDLE_STATUS: {
            const { userState, socketId, username } = decryptedData.payload;
            this.updateCollaborator(socketId, {
              userState,
              username,
            });
            break;
          }

          default: {
            assertNever(decryptedData, null);
          }
        }
      },
    );

    this.portal.socket.on("first-in-room", async () => {
      // keep this listener for cloud docs so reconnects can flip the status
      // back to "live"; initializeRoom is a no-op once the scene is loaded
      if (this.portal.socket && !this.docId) {
        this.portal.socket.off("first-in-room");
      }
      this.clearFirstInRoomTimer();
      if (this.docId) {
        this.setConnectionStatus("live");
      }
      const sceneData = await this.initializeRoom({
        fetchScene: true,
        roomLinkData: existingRoomLinkData,
      });
      scenePromise.resolve(sceneData);
    });

    this.portal.socket.on(
      WS_EVENTS.USER_FOLLOW_ROOM_CHANGE,
      (followedBy: SocketId[]) => {
        this.followedBy = new Set(followedBy);

        this.relayVisibleSceneBounds({ force: true });
      },
    );

    // For cloud docs the persisted scene is the source of truth, so load it
    // directly instead of depending on `first-in-room` (a stale/zombie socket
    // or a peer already in the room would otherwise skip the DB read).
    if (this.docId && existingRoomLinkData) {
      void this.initializeRoom({
        fetchScene: true,
        roomLinkData: existingRoomLinkData,
      }).then((scene) => {
        scenePromise.resolve(scene);
      });
    }

    this.initializeIdleDetector();

    this.setActiveRoomLink(window.location.href);

    return scenePromise;
  };

  private initializeRoom = async ({
    fetchScene,
    roomLinkData,
  }:
    | {
        fetchScene: true;
        roomLinkData: { roomId: string; roomKey: string } | null;
      }
    | { fetchScene: false; roomLinkData?: null }) => {
    clearTimeout(this.socketInitializationTimer!);
    if (this.portal.socket && this.fallbackInitializationHandler) {
      this.portal.socket.off(
        "connect_error",
        this.fallbackInitializationHandler,
      );
    }
    if (fetchScene && roomLinkData && this.portal.socket) {
      if (this.docId) {
        // already loaded (or loading) the persisted scene; a later
        // first-in-room / timeout fallback must not reset and wipe it
        if (this.cloudSceneLoaded) {
          return null;
        }
        this.cloudSceneLoaded = true;
      }

      this.excalidrawAPI.resetScene();

      try {
        const elements = this.docId
          ? await loadDocScene({
              docId: this.docId,
              roomKey: roomLinkData.roomKey,
            })
          : await loadScene(
              roomLinkData.roomId,
              roomLinkData.roomKey,
              this.portal.socket,
            );
        if (elements) {
          if (this.docId) {
            this.docLastSavedVersion = getSceneVersion(elements);
          }
          this.setLastBroadcastedOrReceivedSceneVersion(
            getSceneVersion(elements),
          );

          return {
            elements,
            scrollToContent: true,
          };
        }
      } catch (error: any) {
        // log the error and move on. other peers will sync us the scene.
        console.error(error);
        // allow a later fallback/first-in-room to retry the DB load
        if (this.docId) {
          this.cloudSceneLoaded = false;
        }
      } finally {
        this.portal.socketInitialized = true;
      }
    } else {
      this.portal.socketInitialized = true;
    }
    return null;
  };

  private _reconcileElements = (
    remoteElements: readonly RemoteExcalidrawElement[],
  ): ReconciledExcalidrawElement[] => {
    const appState = this.excalidrawAPI.getAppState();

    const existingElements = this.getSceneElementsIncludingDeleted();

    // NOTE ideally we restore _after_ reconciliation but we can't do that
    // as we'd regenerate even elements such as appState.newElement which would
    // break the state
    remoteElements = restoreElements(remoteElements, existingElements);

    let reconciledElements = reconcileElements(
      existingElements,
      remoteElements,
      appState,
    );

    reconciledElements = bumpElementVersions(
      reconciledElements,
      existingElements,
    );

    // Avoid broadcasting to the rest of the collaborators the scene
    // we just received!
    // Note: this needs to be set before updating the scene as it
    // synchronously calls render.
    this.setLastBroadcastedOrReceivedSceneVersion(
      getSceneVersion(reconciledElements),
    );

    return reconciledElements;
  };

  private loadImageFiles = throttle(async () => {
    const { loadedFiles, erroredFiles } = await this.fetchImageFiles({
      elements: this.excalidrawAPI.getSceneElementsIncludingDeleted(),
    });

    this.excalidrawAPI.addFiles(loadedFiles);

    updateStaleImageStatuses({
      excalidrawAPI: this.excalidrawAPI,
      erroredFiles,
      elements: this.excalidrawAPI.getSceneElementsIncludingDeleted(),
    });
  }, LOAD_IMAGES_TIMEOUT);

  private handleRemoteSceneUpdate = (
    elements: ReconciledExcalidrawElement[],
  ) => {
    this.excalidrawAPI.updateScene({
      elements,
      captureUpdate: CaptureUpdateAction.NEVER,
    });

    this.loadImageFiles();
  };

  private onPointerMove = () => {
    if (this.idleTimeoutId) {
      window.clearTimeout(this.idleTimeoutId);
      this.idleTimeoutId = null;
    }

    this.idleTimeoutId = window.setTimeout(this.reportIdle, IDLE_THRESHOLD);

    if (!this.activeIntervalId) {
      this.activeIntervalId = window.setInterval(
        this.reportActive,
        ACTIVE_THRESHOLD,
      );
    }
  };

  private onOnline = () => {
    if (this.docId) {
      this.setConnectionStatus("connecting");
      this.flushCloudSave();
    }
  };

  private onPageHide = () => {
    if (this.docId) {
      void this.writeDraft();
    }
  };

  private onVisibilityChange = () => {
    if (document.hidden) {
      if (this.idleTimeoutId) {
        window.clearTimeout(this.idleTimeoutId);
        this.idleTimeoutId = null;
      }
      if (this.activeIntervalId) {
        window.clearInterval(this.activeIntervalId);
        this.activeIntervalId = null;
      }
      if (this.docId) {
        void this.writeDraft();
        this.flushCloudSave();
      }
      this.onIdleStateChange(UserIdleState.AWAY);
    } else {
      this.idleTimeoutId = window.setTimeout(this.reportIdle, IDLE_THRESHOLD);
      this.activeIntervalId = window.setInterval(
        this.reportActive,
        ACTIVE_THRESHOLD,
      );
      this.onIdleStateChange(UserIdleState.ACTIVE);
    }
  };

  private reportIdle = () => {
    this.onIdleStateChange(UserIdleState.IDLE);
    if (this.activeIntervalId) {
      window.clearInterval(this.activeIntervalId);
      this.activeIntervalId = null;
    }
  };

  private reportActive = () => {
    this.onIdleStateChange(UserIdleState.ACTIVE);
  };

  private initializeIdleDetector = () => {
    document.addEventListener(EVENT.POINTER_MOVE, this.onPointerMove);
    document.addEventListener(EVENT.VISIBILITY_CHANGE, this.onVisibilityChange);
  };

  setCollaborators(sockets: SocketId[]) {
    const collaborators: InstanceType<typeof Collab>["collaborators"] =
      new Map();
    for (const socketId of sockets) {
      const isCurrentUser = socketId === this.portal.socket?.id;
      collaborators.set(
        socketId,
        Object.assign(
          // we never receive our own broadcasts, so we need to seed
          // our own collaborator entry with the local username
          isCurrentUser ? { username: this.state.username } : {},
          this.collaborators.get(socketId),
          { isCurrentUser },
        ),
      );
    }
    this.collaborators = collaborators;
    this.excalidrawAPI.updateScene({ collaborators });

    // unfollow if the followed user left the room
    const userToFollow = appJotaiStore.get(userToFollowAtom);
    if (userToFollow && !collaborators.has(userToFollow.socketId)) {
      this.setUserToFollow(null);
    }
  }

  updateCollaborator = (socketId: SocketId, updates: Partial<Collaborator>) => {
    const isCurrentUser = socketId === this.portal.socket?.id;
    const collaborators = new Map(this.collaborators);
    const user: Mutable<Collaborator> = Object.assign(
      // we never receive our own broadcasts, so we need to seed
      // our own collaborator entry with the local username
      isCurrentUser ? { username: this.state.username } : {},
      collaborators.get(socketId),
      updates,
      { isCurrentUser },
    );
    collaborators.set(socketId, user);
    this.collaborators = collaborators;

    this.excalidrawAPI.updateScene({
      collaborators,
    });
  };

  public setLastBroadcastedOrReceivedSceneVersion = (version: number) => {
    this.lastBroadcastedOrReceivedSceneVersion = version;
  };

  public getLastBroadcastedOrReceivedSceneVersion = () => {
    return this.lastBroadcastedOrReceivedSceneVersion;
  };

  public getSceneElementsIncludingDeleted = () => {
    return this.excalidrawAPI.getSceneElementsIncludingDeleted();
  };

  onPointerUpdate = throttle(
    (payload: {
      pointer: SocketUpdateDataSource["MOUSE_LOCATION"]["payload"]["pointer"];
      button: SocketUpdateDataSource["MOUSE_LOCATION"]["payload"]["button"];
      pointersMap: Gesture["pointers"];
    }) => {
      payload.pointersMap.size < 2 &&
        this.portal.socket &&
        this.portal.broadcastMouseLocation(payload);
    },
    CURSOR_SYNC_TIMEOUT,
  );

  relayVisibleSceneBounds = (props?: { force: boolean }) => {
    if (this.portal.socket && (this.followedBy.size > 0 || props?.force)) {
      this.portal.broadcastVisibleSceneBounds(
        {
          sceneBounds: getVisibleSceneBounds(this.excalidrawAPI.getAppState()),
        },
        `follow@${this.portal.socket.id}`,
      );
    }
  };

  onIdleStateChange = (userState: UserIdleState) => {
    this.portal.broadcastIdleChange(userState);
  };

  broadcastElements = (elements: readonly OrderedExcalidrawElement[]) => {
    if (
      getSceneVersion(elements) >
      this.getLastBroadcastedOrReceivedSceneVersion()
    ) {
      this.portal.broadcastScene(WS_SUBTYPES.UPDATE, elements, false);
      this.lastBroadcastedOrReceivedSceneVersion = getSceneVersion(elements);
      this.queueBroadcastAllElements();
    }
  };

  syncElements = (elements: readonly OrderedExcalidrawElement[]) => {
    this.broadcastElements(elements);
    if (this.docId) {
      if (elements.length === 0 && (this.docLastSavedVersion ?? 0) > 0) {
        return;
      }
      const sceneVersion = getSceneVersion(elements);
      if (
        sceneVersion !== this.docLastSavedVersion &&
        sceneVersion !== this.lastScheduledSceneVersion
      ) {
        this.lastScheduledSceneVersion = sceneVersion;
        this.setSaveStatus("saving");
        this.scheduleDraft(elements);
        this.queueSaveToCloudDoc();
      }
    } else {
      this.queueSaveToRoom();
    }
  };

  queueBroadcastAllElements = throttle(() => {
    this.portal.broadcastScene(
      WS_SUBTYPES.UPDATE,
      this.excalidrawAPI.getSceneElementsIncludingDeleted(),
      true,
    );
    const currentVersion = this.getLastBroadcastedOrReceivedSceneVersion();
    const newVersion = Math.max(
      currentVersion,
      getSceneVersion(this.getSceneElementsIncludingDeleted()),
    );
    this.setLastBroadcastedOrReceivedSceneVersion(newVersion);
  }, SYNC_FULL_SCENE_INTERVAL_MS);

  queueSaveToCloudDoc = () => {
    if (this.cloudSaveTimer != null) {
      window.clearTimeout(this.cloudSaveTimer);
    }
    this.cloudSaveTimer = window.setTimeout(
      this.flushCloudSave,
      CLOUD_DOC_SAVE_DEBOUNCE_MS,
    );
    if (this.cloudSaveMaxTimer == null) {
      this.cloudSaveMaxTimer = window.setTimeout(
        this.flushCloudSave,
        CLOUD_DOC_SAVE_MAX_WAIT_MS,
      );
    }
  };

  flushCloudSave = () => {
    this.clearCloudSaveTimers();
    this.saveCollabRoom(
      getSyncableElements(
        this.excalidrawAPI.getSceneElementsIncludingDeleted(),
      ),
    );
  };

  private clearCloudSaveTimers = () => {
    if (this.cloudSaveTimer != null) {
      window.clearTimeout(this.cloudSaveTimer);
      this.cloudSaveTimer = null;
    }
    if (this.cloudSaveMaxTimer != null) {
      window.clearTimeout(this.cloudSaveMaxTimer);
      this.cloudSaveMaxTimer = null;
    }
  };

  private setSaveStatus = (status: CloudSaveStatus) => {
    if (this.saveStatusTimer != null) {
      window.clearTimeout(this.saveStatusTimer);
      this.saveStatusTimer = null;
    }
    appJotaiStore.set(cloudSaveStatusAtom, status);
    if (status === "saved") {
      this.saveStatusTimer = window.setTimeout(() => {
        this.saveStatusTimer = null;
        appJotaiStore.set(cloudSaveStatusAtom, "idle");
      }, 2000);
    }
  };

  private getCurrentUserId = () => appJotaiStore.get(authUserAtom)?.id ?? null;

  private scheduleDraft = (elements: readonly OrderedExcalidrawElement[]) => {
    if (!this.docId) {
      return;
    }
    if (this.draftTimer != null) {
      window.clearTimeout(this.draftTimer);
    }
    this.draftTimer = window.setTimeout(() => {
      this.draftTimer = null;
      void this.writeDraft(elements);
    }, 500);
  };

  private writeDraft = async (
    elements?: readonly OrderedExcalidrawElement[],
  ): Promise<boolean> => {
    const docId = this.docId;
    const userId = this.getCurrentUserId();
    if (!docId || !userId) {
      return false;
    }

    const syncableElements = getSyncableElements(
      elements ?? this.excalidrawAPI.getSceneElementsIncludingDeleted(),
    );

    // Page-hide/visibility-change handlers always write a draft. Skip it when
    // the canvas already matches the last successful save so reopening the
    // board doesn't trigger the "unsaved changes" dialog for nothing.
    if (
      this.docLastSavedVersion != null &&
      getSceneVersion(syncableElements) === this.docLastSavedVersion
    ) {
      return false;
    }

    const draft: CloudDraft = {
      userId,
      docId,
      elements: syncableElements,
      appState: clearAppStateForLocalStorage(this.excalidrawAPI.getAppState()),
      baseVersion: this.docLastSavedVersion,
      updatedAt: Date.now(),
    };

    try {
      if (JSON.stringify(draft).length > 5 * 1024 * 1024) {
        console.warn("Cloud draft is too large to cache offline");
        return false;
      }
      await putCloudDraft(draft);
      return true;
    } catch (error) {
      console.error("Failed to cache cloud draft", error);
      return false;
    }
  };

  private clearDraft = () => {
    if (this.draftTimer != null) {
      window.clearTimeout(this.draftTimer);
      this.draftTimer = null;
    }
    const docId = this.docId;
    const userId = this.getCurrentUserId();
    if (docId && userId) {
      void deleteCloudDraft(userId, docId);
    }
  };

  private setConnectionStatus = (status: CloudConnectionStatus) => {
    appJotaiStore.set(cloudConnectionStatusAtom, status);
  };

  private clearFirstInRoomTimer = () => {
    if (this.firstInRoomTimer != null) {
      window.clearTimeout(this.firstInRoomTimer);
      this.firstInRoomTimer = null;
    }
  };

  private scheduleFirstInRoomTimeout = () => {
    this.clearFirstInRoomTimer();
    if (!this.docId) {
      return;
    }
    this.firstInRoomTimer = window.setTimeout(() => {
      this.firstInRoomTimer = null;
      if (this.docId) {
        this.setConnectionStatus("offline");
      }
    }, INITIAL_SCENE_UPDATE_TIMEOUT);
  };

  queueSaveToRoom = throttle(
    () => {
      if (this.portal.socketInitialized) {
        this.saveCollabRoom(
          getSyncableElements(
            this.excalidrawAPI.getSceneElementsIncludingDeleted(),
          ),
        );
      }
    },
    SYNC_FULL_SCENE_INTERVAL_MS,
    { leading: false },
  );

  setUserToFollow = (userToFollow: UserToFollow | null) => {
    const prev = appJotaiStore.get(userToFollowAtom) ?? null;

    if (prev?.socketId !== userToFollow?.socketId && this.portal.socket) {
      // leave the previous user's follow room before joining the next one
      if (prev) {
        this.portal.broadcastUserFollowed({
          userToFollow: prev,
          action: "UNFOLLOW",
        });
      }
      if (userToFollow) {
        this.portal.broadcastUserFollowed({
          userToFollow,
          action: "FOLLOW",
        });
      }
    }

    appJotaiStore.set(userToFollowAtom, userToFollow);
  };

  setUsername = (username: string) => {
    this.setState({ username });
    saveUsernameToLocalStorage(username);

    // keep our own collaborator entry in sync
    const socketId = this.portal.socket?.id as SocketId | undefined;
    if (socketId && this.collaborators.has(socketId)) {
      this.updateCollaborator(socketId, { username });
    }
  };

  getUsername = () => this.state.username;

  setActiveRoomLink = (activeRoomLink: string | null) => {
    this.setState({ activeRoomLink });
    appJotaiStore.set(activeRoomLinkAtom, activeRoomLink);
  };

  getActiveRoomLink = () => this.state.activeRoomLink;

  setErrorIndicator = (errorMessage: string | null) => {
    appJotaiStore.set(collabErrorIndicatorAtom, {
      message: errorMessage,
      nonce: Date.now(),
    });
  };

  resetErrorIndicator = (resetDialogNotifiedErrors = false) => {
    appJotaiStore.set(collabErrorIndicatorAtom, { message: null, nonce: 0 });
    if (resetDialogNotifiedErrors) {
      this.setState({
        dialogNotifiedErrors: {},
      });
    }
  };

  setErrorDialog = (errorMessage: string | null) => {
    this.setState({
      errorMessage,
    });
  };

  render() {
    const { errorMessage } = this.state;

    return (
      <>
        {errorMessage != null && (
          <ErrorDialog onClose={() => this.setErrorDialog(null)}>
            {errorMessage}
          </ErrorDialog>
        )}
      </>
    );
  }
}

declare global {
  interface Window {
    collab: InstanceType<typeof Collab>;
  }
}

if (isTestEnv() || isDevEnv()) {
  window.collab = window.collab || ({} as Window["collab"]);
}

export default Collab;

export type TCollabClass = Collab;
