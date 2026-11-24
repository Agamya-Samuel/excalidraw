import { getSceneVersion } from "@excalidraw/element";
import { reconcileElements } from "@excalidraw/excalidraw";
import {
  compressData,
  decompressData,
} from "@excalidraw/excalidraw/data/encode";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";

import type { AppState } from "@excalidraw/excalidraw/types";

import { ApiError, apiFetch } from "../lib/api";
import { base64ToBytes, bytesToBase64 } from "../lib/base64";
import { getSyncableElements } from "../data";

import type { SyncableExcalidrawElement } from "../data";

const MAX_SAVE_ATTEMPTS = 3;

const encryptScene = async (
  roomKey: string,
  elements: readonly SyncableExcalidrawElement[],
) => {
  const compressed = await compressData(
    new TextEncoder().encode(JSON.stringify(elements)),
    { encryptionKey: roomKey },
  );
  return bytesToBase64(compressed);
};

const decryptScene = async (roomKey: string, blob: string) => {
  const { data } = await decompressData(base64ToBytes(blob), {
    decryptionKey: roomKey,
  });
  return JSON.parse(new TextDecoder().decode(data));
};

export const saveDocScene = async ({
  docId,
  roomKey,
  elements,
  appState,
  baseVersion,
}: {
  docId: string;
  roomKey: string;
  elements: readonly SyncableExcalidrawElement[];
  appState: AppState;
  /**
   * Last version this client successfully persisted. When supplied, try a
   * single write without reading the stored scene. A 409 means a peer saved
   * in the meantime, and we fall back to read + reconcile + retry.
   */
  baseVersion?: number | null;
}) => {
  if (baseVersion != null) {
    const reconciled = getSyncableElements(elements);
    const sceneVersion = getSceneVersion(reconciled);
    try {
      await apiFetch(`/documents/${docId}/scene`, {
        method: "PUT",
        json: {
          baseVersion,
          sceneVersion,
          blob: await encryptScene(roomKey, reconciled),
        },
      });
      return reconciled;
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 409)) {
        throw error;
      }
    }
  }

  for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
    const current = await apiFetch<{
      blob: string | null;
      sceneVersion: number;
    }>(`/documents/${docId}/scene`);

    let reconciled = getSyncableElements(elements);

    if (current.blob) {
      const prevStoredElements = getSyncableElements(
        restoreElements(await decryptScene(roomKey, current.blob), null),
      );
      reconciled = getSyncableElements(
        reconcileElements(
          reconciled,
          prevStoredElements as unknown as RemoteExcalidrawElement[],
          appState,
        ),
      );
    }

    try {
      await apiFetch(`/documents/${docId}/scene`, {
        method: "PUT",
        json: {
          baseVersion: current.sceneVersion,
          sceneVersion: getSceneVersion(reconciled),
          blob: await encryptScene(roomKey, reconciled),
        },
      });
      return reconciled;
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 409)) {
        throw error;
      }
    }
  }

  throw new Error("Failed to save document: too many concurrent writes");
};

export const loadDocScene = async ({
  docId,
  roomKey,
}: {
  docId: string;
  roomKey: string;
}): Promise<readonly SyncableExcalidrawElement[] | null> => {
  const { blob } = await apiFetch<{ blob: string | null }>(
    `/documents/${docId}/scene`,
  );

  if (!blob) {
    return null;
  }

  return getSyncableElements(
    restoreElements(await decryptScene(roomKey, blob), null, {
      deleteInvisibleElements: true,
    }),
  );
};
