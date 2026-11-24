import { MIME_TYPES, toBrandedType } from "@excalidraw/common";
import { reconcileElements } from "@excalidraw/excalidraw";
import { decompressData } from "@excalidraw/excalidraw/data/encode";
import {
  decryptData,
  encryptData,
} from "@excalidraw/excalidraw/data/encryption";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { getSceneVersion } from "@excalidraw/element";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";

import type {
  ExcalidrawElement,
  FileId,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";

import type {
  AppState,
  BinaryFileData,
  BinaryFileMetadata,
  DataURL,
} from "@excalidraw/excalidraw/types";

import { ApiError, apiFetch, apiFetchBlob } from "../lib/api";
import { base64ToBytes, bytesToBase64 } from "../lib/base64";

import { getSyncableElements } from ".";

import type Portal from "../collab/Portal";
import type { Socket } from "socket.io-client";

import type { SyncableExcalidrawElement } from ".";

type StoredScene = {
  scene_version: number;
  iv: string;
  ciphertext: string;
};

const encryptElements = async (
  key: string,
  elements: readonly ExcalidrawElement[],
): Promise<{ ciphertext: string; iv: string }> => {
  const json = JSON.stringify(elements);
  const encoded = new TextEncoder().encode(json);
  const { encryptedBuffer, iv } = await encryptData(key, encoded);

  return {
    ciphertext: bytesToBase64(new Uint8Array(encryptedBuffer)),
    iv: bytesToBase64(iv),
  };
};

const decryptElements = async (
  data: Pick<StoredScene, "iv" | "ciphertext">,
  roomKey: string,
): Promise<readonly ExcalidrawElement[]> => {
  const decrypted = await decryptData(
    base64ToBytes(data.iv),
    base64ToBytes(data.ciphertext),
    roomKey,
  );
  return JSON.parse(new TextDecoder("utf-8").decode(new Uint8Array(decrypted)));
};

class SceneVersionCache {
  private static cache = new WeakMap<Socket, number>();

  static get = (socket: Socket) => {
    return SceneVersionCache.cache.get(socket);
  };

  static set = (
    socket: Socket,
    elements: readonly SyncableExcalidrawElement[],
  ) => {
    SceneVersionCache.cache.set(socket, getSceneVersion(elements));
  };
}

export const isSceneSaved = (
  portal: Portal,
  elements: readonly ExcalidrawElement[],
): boolean => {
  if (portal.socket && portal.roomId && portal.roomKey) {
    return SceneVersionCache.get(portal.socket) === getSceneVersion(elements);
  }
  return true;
};

export const saveFiles = async ({
  prefix,
  files,
}: {
  prefix: string;
  files: { id: FileId; buffer: Uint8Array }[];
}) => {
  const base = prefix
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "");
  const erroredFiles: FileId[] = [];
  const savedFiles: FileId[] = [];

  await Promise.all(
    files.map(async ({ id, buffer }) => {
      try {
        await apiFetch(`/files/${base}/${id}`, {
          method: "PUT",
          body: buffer,
          headers: { "content-type": "application/octet-stream" },
        });
        savedFiles.push(id);
      } catch (error) {
        erroredFiles.push(id);
      }
    }),
  );

  return { savedFiles, erroredFiles };
};

const createStoredScene = async (
  elements: readonly SyncableExcalidrawElement[],
  roomKey: string,
) => {
  const sceneVersion = getSceneVersion(elements);
  const { ciphertext, iv } = await encryptElements(roomKey, elements);
  return { sceneVersion, ciphertext, iv };
};

const readStoredScene = async (roomId: string) => {
  const { scene } = await apiFetch<{ scene: StoredScene | null }>(
    `/legacy/scenes/${encodeURIComponent(roomId)}`,
  );
  return scene;
};

const MAX_SAVE_ATTEMPTS = 3;

export const saveScene = async (
  portal: Portal,
  elements: readonly SyncableExcalidrawElement[],
  appState: AppState,
) => {
  const { roomId, roomKey, socket } = portal;

  if (!roomId || !roomKey || !socket || isSceneSaved(portal, elements)) {
    return null;
  }

  for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
    const prevStoredScene = await readStoredScene(roomId);
    const baseVersion = prevStoredScene?.scene_version ?? 0;

    const prevStoredElements = prevStoredScene
      ? getSyncableElements(
          restoreElements(
            await decryptElements(prevStoredScene, roomKey),
            null,
          ),
        )
      : [];

    const reconciledElements = getSyncableElements(
      reconcileElements(
        elements,
        prevStoredElements as OrderedExcalidrawElement[] as RemoteExcalidrawElement[],
        appState,
      ),
    );

    const storedScene = await createStoredScene(reconciledElements, roomKey);

    try {
      await apiFetch(`/legacy/scenes/${encodeURIComponent(roomId)}`, {
        method: "PUT",
        json: {
          baseVersion,
          sceneVersion: storedScene.sceneVersion,
          iv: storedScene.iv,
          ciphertext: storedScene.ciphertext,
        },
      });
      SceneVersionCache.set(socket, reconciledElements);
      return toBrandedType<RemoteExcalidrawElement[]>(reconciledElements);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 409)) {
        throw error;
      }
    }
  }

  throw new Error("Failed to save scene: too many concurrent writes");
};

export const loadScene = async (
  roomId: string,
  roomKey: string,
  socket: Socket | null,
): Promise<readonly SyncableExcalidrawElement[] | null> => {
  const storedScene = await readStoredScene(roomId);

  if (!storedScene) {
    return null;
  }

  const elements = getSyncableElements(
    restoreElements(await decryptElements(storedScene, roomKey), null, {
      deleteInvisibleElements: true,
    }),
  );

  if (socket) {
    SceneVersionCache.set(socket, elements);
  }

  return elements;
};

export const loadFiles = async (
  prefix: string,
  decryptionKey: string,
  filesIds: readonly FileId[],
) => {
  const base = prefix
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "");

  const loadedFiles: BinaryFileData[] = [];
  const erroredFiles = new Map<FileId, true>();

  await Promise.all(
    [...new Set(filesIds)].map(async (id) => {
      try {
        const blob = await apiFetchBlob(`/files/${base}/${id}`);
        const arrayBuffer = await blob.arrayBuffer();

        const { data: decoded, metadata } =
          await decompressData<BinaryFileMetadata>(
            new Uint8Array(arrayBuffer),
            { decryptionKey },
          );

        loadedFiles.push({
          mimeType: metadata.mimeType || MIME_TYPES.binary,
          id,
          dataURL: new TextDecoder().decode(decoded) as DataURL,
          created: metadata?.created || Date.now(),
          lastRetrieved: metadata?.created || Date.now(),
        });
      } catch (error: any) {
        erroredFiles.set(id, true);
        console.error(error);
      }
    }),
  );

  return { loadedFiles, erroredFiles };
};
