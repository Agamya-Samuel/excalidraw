import { createClient } from "@supabase/supabase-js";

import type { Database } from "../cloud/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient<Database> | null = null;

export const isCloudEnabled = () =>
  import.meta.env.VITE_APP_CLOUD_ENABLED === "true";

export const getSupabase = () => {
  if (!client) {
    const url = import.meta.env.VITE_APP_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_APP_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      throw new Error(
        "Supabase is not configured: set VITE_APP_SUPABASE_URL and VITE_APP_SUPABASE_ANON_KEY",
      );
    }

    client = createClient<Database>(url, anonKey, {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        autoRefreshToken: true,
      },
    });
  }

  return client;
};

export const STORAGE_BUCKET = "excalidraw";

export const normalizeStoragePath = (prefix: string) =>
  prefix
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "");
