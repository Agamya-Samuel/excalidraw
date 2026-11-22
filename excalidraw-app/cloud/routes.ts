export const DASHBOARD_PATH = "/dashboard";

export const isDashboardPath = () =>
  window.location.pathname === DASHBOARD_PATH;

export const getDocIdFromPath = () =>
  window.location.pathname.match(/^\/d\/([0-9a-z-]+)$/i)?.[1] ?? null;

export const getPublicViewData = () => {
  const match = window.location.hash.match(
    /^#view=([0-9a-z-]+),([a-zA-Z0-9_-]+)$/i,
  );
  return match ? { docId: match[1], key: match[2] } : null;
};

export const getPublicViewLink = (docId: string, roomKey: string) =>
  `${window.location.origin}/#view=${docId},${roomKey}`;

export const getDocLink = (docId: string) =>
  `${window.location.origin}/d/${docId}`;

export const navigate = (path: string) => {
  const current = window.location.pathname + window.location.search;
  if (current === path) {
    return;
  }
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
};
