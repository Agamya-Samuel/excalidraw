import { reconcileElements } from "@excalidraw/excalidraw";
import { MIME_TYPES, toBrandedType } from "@excalidraw/common";
import { decompressData } from "@excalidraw/excalidraw/data/encode";
import {
  encryptData,
  decryptData,
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

import { FILE_CACHE_MAX_AGE_SEC } from "../app_constants";
import { base64ToBytes, bytesToBase64 } from "../lib/base64";
import {
  getSupabase,
  normalizeStoragePath,
  STORAGE_BUCKET,
} from "../lib/supabase";

import { getSyncableElements } from ".";

import type { SyncableExcalidrawElement } from ".";
import type Portal from "../collab/Portal";
import type { Socket } from "socket.io-client";

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
  const supabase = getSupabase();
  const base = normalizeStoragePath(prefix);

  const erroredFiles: FileId[] = [];
  const savedFiles: FileId[] = [];

  await Promise.all(
    files.map(async ({ id, buffer }) => {
      try {
        const { error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(`${base}/${id}`, new Uint8Array(buffer).buffer, {
            cacheControl: `public, max-age=${FILE_CACHE_MAX_AGE_SEC}`,
            contentType: "application/octet-stream",
            upsert: true,
          });

        if (error) {
          throw error;
        }
        savedFiles.push(id);
      } catch (error: any) {
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
  const { data, error } = await getSupabase()
    .from("scenes")
    .select("scene_version, iv, ciphertext")
    .eq("room_id", roomId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as StoredScene | null) ?? null;
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

    const { error } = await getSupabase().rpc("save_anonymous_scene", {
      p_room_id: roomId,
      p_base_version: baseVersion,
      p_scene_version: storedScene.sceneVersion,
      p_iv: storedScene.iv,
      p_ciphertext: storedScene.ciphertext,
    });

    if (!error) {
      SceneVersionCache.set(socket, reconciledElements);
      return toBrandedType<RemoteExcalidrawElement[]>(reconciledElements);
    }

    if (error.code !== "40001") {
      throw error;
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
  const supabase = getSupabase();
  const base = normalizeStoragePath(prefix);

  const loadedFiles: BinaryFileData[] = [];
  const erroredFiles = new Map<FileId, true>();

  await Promise.all(
    [...new Set(filesIds)].map(async (id) => {
      try {
        const { data, error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .download(`${base}/${id}`);

        if (error || !data) {
          throw error || new Error("missing file");
        }

        const arrayBuffer = await data.arrayBuffer();

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
