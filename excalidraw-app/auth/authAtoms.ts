import { atom } from "../app-jotai";

import type { AuthUser } from "../lib/api";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export const authUserAtom = atom<AuthUser | null>(null);
export const authStatusAtom = atom<AuthStatus>("loading");
export const authDialogOpenAtom = atom<boolean>(false);
