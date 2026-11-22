import { useEffect } from "react";

import { getSupabase } from "../../lib/supabase";

export const useDashboardRealtime = (
  user: { id: string; email?: string | null } | null,
  refresh: () => void,
) => {
  useEffect(() => {
    if (!user) {
      return;
    }

    const supabase = getSupabase();
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

    const channel = supabase
      .channel(`dashboard-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "documents",
          filter: `owner_id=eq.${user.id}`,
        },
        schedule,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "doc_members",
          filter: `user_id=eq.${user.id}`,
        },
        schedule,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "doc_invites",
          filter: `email=eq.${user.email ?? ""}`,
        },
        schedule,
      )
      .subscribe();

    const onVisibilityChange = () => {
      if (!document.hidden) {
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (timer != null) {
        window.clearTimeout(timer);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [user, refresh]);
};
