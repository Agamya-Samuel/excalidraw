import { clear, createStore, del, get, set } from "idb-keyval";

import type { AppState } from "@excalidraw/excalidraw/types";

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

export const clearCloudDrafts = async () => {
  await clear(store);
};
