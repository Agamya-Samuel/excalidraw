/**
 * Paths, besides `/`, that the app is served on.
 *
 * Adding a path here lets the service worker serve the cached app for it
 * (via `navigateFallbackAllowlist` in vite.config.mts). The host must serve
 * the app for it too, or the path is a 404: add a matching rewrite to
 * `/index.html` in the root vercel.json (tests/appRoutes.test.ts checks it).
 *
 * This fork's cloud workspace adds `/dashboard` and `/d/:id` separately in
 * `navigateFallbackAllowlist` and vercel.json.
 */
export const APP_ROUTES = {
  excalidrawPlusExport: "/excalidraw-plus-export",
} as const;
