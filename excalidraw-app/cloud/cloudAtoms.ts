import type { ExcalidrawElement } from "@excalidraw/element/types";

import { atom } from "../app-jotai";

import type { DocRole } from "./documents";
import type { CloudDraft } from "./draftStore";

export type ActiveDoc = {
  docId: string;
  role: DocRole;
  roomId: string;
  roomKey: string;
  isPublic: boolean;
  /** true when the viewer is a signed-in owner/member (has a real role row) */
  isMember: boolean;
  /** true when the board was opened through an edit-enabled public link */
  publicEdit?: boolean;
};

export const activeDocAtom = atom<ActiveDoc | null>(null);
export const dashboardVersionAtom = atom(0);

export type CloudSaveStatus = "idle" | "saving" | "saved" | "local" | "error";

export const cloudSaveStatusAtom = atom<CloudSaveStatus>("idle");

export type PendingDraft = {
  draft: CloudDraft;
  serverElements: readonly ExcalidrawElement[];
};

export const pendingDraftAtom = atom<PendingDraft | null>(null);

export type CloudConnectionStatus = "idle" | "connecting" | "live" | "offline";

export const cloudConnectionStatusAtom = atom<CloudConnectionStatus>("idle");
