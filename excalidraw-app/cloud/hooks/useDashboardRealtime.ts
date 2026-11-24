import { useEffect } from "react";

/**
 * The dashboard refreshes on focus/visibility and polls while the tab is
 * visible; there is no server push channel for dashboard changes.
 */
export const useDashboardRealtime = (
  user: { id: string; email?: string | null } | null,
  refresh: () => void,
) => {
  useEffect(() => {
    if (!user) {
      return;
    }

    let timer: number | null = null;

    const schedule = () => {
      if (document.hidden) {
        return;
      }
      if (timer != null) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => {
        timer = null;
        refresh();
      }, 500);
    };

    const interval = window.setInterval(schedule, 30_000);

    const onVisibilityChange = () => {
      if (!document.hidden) {
        schedule();
      }
    };

    window.addEventListener("focus", schedule);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (timer != null) {
        window.clearTimeout(timer);
      }
      window.clearInterval(interval);
      window.removeEventListener("focus", schedule);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user, refresh]);
};
