import React, { useEffect } from "react";

import { appJotaiStore, useSetAtom } from "../app-jotai";
import { saveUsernameToLocalStorage } from "../data/localStorage";
import { apiFetch, isCloudEnabled } from "../lib/api";

import { authStatusAtom, authUserAtom } from "./authAtoms";

import type { AuthUser } from "../lib/api";

const syncCollabUsername = (user: AuthUser) => {
  // Keep the live-collaboration name in sync with the profile name.
  if (user.displayName) {
    saveUsernameToLocalStorage(user.displayName);
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const setUser = useSetAtom(authUserAtom);
  const setStatus = useSetAtom(authStatusAtom);

  useEffect(() => {
    if (!isCloudEnabled()) {
      setStatus("unauthenticated");
      return;
    }

    let active = true;

    apiFetch<AuthUser>("/auth/me")
      .then((user) => {
        if (!active) {
          return;
        }
        setUser(user);
        setStatus("authenticated");
        syncCollabUsername(user);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setUser(null);
        setStatus("unauthenticated");
      });

    return () => {
      active = false;
    };
  }, [setStatus, setUser]);

  return <>{children}</>;
};

export const signInWithEmail = async (email: string, password: string) => {
  const user = await apiFetch<AuthUser>("/auth/login", {
    method: "POST",
    json: { email, password },
  });
  appJotaiStore.set(authUserAtom, user);
  appJotaiStore.set(authStatusAtom, "authenticated");
  syncCollabUsername(user);
  return user;
};

export const updateDisplayName = async (displayName: string | null) => {
  const user = await apiFetch<AuthUser>("/auth/me", {
    method: "PATCH",
    json: { displayName },
  });
  appJotaiStore.set(authUserAtom, user);
  syncCollabUsername(user);
  return user;
};

export const sendMagicLink = async (email: string) => {
  await apiFetch<{ ok: boolean }>("/auth/magic-link", {
    method: "POST",
    json: { email },
  });
};

export const signInWithOAuth = async (provider: "google" | "github") => {
  window.location.assign(`/api/auth/oauth/${provider}`);
};

export const signOut = async () => {
  await apiFetch("/auth/logout", { method: "POST" });
  appJotaiStore.set(authUserAtom, null);
  appJotaiStore.set(authStatusAtom, "unauthenticated");
};
