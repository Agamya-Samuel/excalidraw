import { useEffect, useState } from "react";

import { STORAGE_KEYS } from "../app_constants";

export type ResolvedTheme = "light" | "dark";

export const resolveTheme = (): ResolvedTheme => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.LOCAL_STORAGE_THEME);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    // localStorage can be unavailable in restricted contexts
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

export const useResolvedTheme = () => {
  const [theme, setTheme] = useState<ResolvedTheme>(resolveTheme);

  useEffect(() => {
    const refresh = () => setTheme(resolveTheme());

    refresh();

    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");

    mediaQuery?.addEventListener("change", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("excalidraw-theme-change", refresh);

    return () => {
      mediaQuery?.removeEventListener("change", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("excalidraw-theme-change", refresh);
    };
  }, []);

  return theme;
};
