import { getSceneVersion } from "@excalidraw/element";
import { reconcileElements } from "@excalidraw/excalidraw";
import {
  compressData,
  decompressData,
} from "@excalidraw/excalidraw/data/encode";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";

import type { AppState } from "@excalidraw/excalidraw/types";

import { getSyncableElements } from "../data";
import { base64ToBytes, bytesToBase64 } from "../lib/base64";
import { getSupabase } from "../lib/supabase";

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
   * Last version this client successfully persisted. When supplied, we try a
   * single RPC without reading/decrypting the stored scene. The RPC rejects
   * with 40001 if a peer saved in the meantime, and we fall back to
   * read + reconcile + retry below.
   */
  baseVersion?: number | null;
}) => {
  const supabase = getSupabase();

  if (baseVersion != null) {
    const reconciled = getSyncableElements(elements);
    const { error } = await supabase.rpc("save_doc_scene", {
      p_doc: docId,
      p_base_version: baseVersion,
      p_scene_version: getSceneVersion(reconciled),
      p_blob: await encryptScene(roomKey, reconciled),
    });

    if (!error) {
      return reconciled;
    }

    if (error.code !== "40001") {
      throw error;
    }
  }

  for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
    const { data: current, error } = await supabase
      .from("doc_scenes")
      .select("scene_version, blob")
      .eq("doc_id", docId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    let reconciled = getSyncableElements(elements);

    if (current) {
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

    const { error: rpcError } = await supabase.rpc("save_doc_scene", {
      p_doc: docId,
      p_base_version: current?.scene_version ?? 0,
      p_scene_version: getSceneVersion(reconciled),
      p_blob: await encryptScene(roomKey, reconciled),
    });

    if (!rpcError) {
      return reconciled;
    }

    if (rpcError.code !== "40001") {
      throw rpcError;
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
  const { data, error } = await getSupabase()
    .from("doc_scenes")
    .select("blob")
    .eq("doc_id", docId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return getSyncableElements(
    restoreElements(await decryptScene(roomKey, data.blob), null, {
      deleteInvisibleElements: true,
    }),
  );
};

export const subscribeDocScene = async (
  docId: string,
  roomKey: string,
  onChange: (elements: readonly SyncableExcalidrawElement[]) => void,
) => {
  const supabase = getSupabase();

  const channel = supabase
    .channel(`doc-scene-${docId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "doc_scene_meta",
        filter: `doc_id=eq.${docId}`,
      },
      async () => {
        try {
          const elements = await loadDocScene({ docId, roomKey });
          if (elements) {
            onChange(elements);
          }
        } catch (error: any) {
          console.error(error);
        }
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
};
