import { clear, createStore, del, get, set } from "idb-keyval";

import type { AppState } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import type { SyncableExcalidrawElement } from "../data";

export type CloudDraft = {
  userId: string;
  docId: string;
  elements: readonly SyncableExcalidrawElement[];
  appState: Partial<AppState>;
  baseVersion: number | null;
  updatedAt: number;
};

const store = createStore("cloud-drafts-db", "drafts-store");

const keyFor = (userId: string, docId: string) => `${userId}:${docId}`;

export const getCloudDraft = async (userId: string, docId: string) =>
  (await get<CloudDraft>(keyFor(userId, docId), store)) ?? null;

export const putCloudDraft = async (draft: CloudDraft) => {
  await set(keyFor(draft.userId, draft.docId), draft, store);
};

export const deleteCloudDraft = async (userId: string, docId: string) => {
  await del(keyFor(userId, docId), store);
};

/**
 * A draft can outlive its own usefulness: visibility/page-hide handlers write
 * one even when the canvas was already saved. Treat it as redundant when it
 * matches the scene loaded from the cloud.
 */
export const isCloudDraftRedundant = (
  draft: CloudDraft,
  serverElements: readonly OrderedExcalidrawElement[],
) =>
  draft.elements.length === serverElements.length &&
  draft.elements.every((element, index) => {
    const serverElement = serverElements[index];
    return (
      element.id === serverElement.id &&
      element.version === serverElement.version &&
      element.versionNonce === serverElement.versionNonce
    );
  });

export const clearCloudDrafts = async () => {
  await clear(store);
};
