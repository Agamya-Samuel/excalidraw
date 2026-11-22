import { atom } from "../app-jotai";

import type { User } from "@supabase/supabase-js";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export const authUserAtom = atom<User | null>(null);
export const authStatusAtom = atom<AuthStatus>("loading");
export const authDialogOpenAtom = atom<boolean>(false);
