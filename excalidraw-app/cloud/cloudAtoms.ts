import { atom } from "../app-jotai";

import type { DocRole } from "./documents";

export type ActiveDoc = {
  docId: string;
  role: DocRole;
  roomId: string;
  roomKey: string;
  isPublic: boolean;
};

export const activeDocAtom = atom<ActiveDoc | null>(null);
export const dashboardVersionAtom = atom(0);

export type CloudSaveStatus = "idle" | "saving" | "saved" | "error";

export const cloudSaveStatusAtom = atom<CloudSaveStatus>("idle");
