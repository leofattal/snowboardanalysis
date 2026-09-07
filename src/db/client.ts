import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase";

let client: SupabaseClient<Database> | null = null;

/** Returns the Supabase client, or null when env vars are not configured. */
export function getSupabase(): SupabaseClient<Database> | null {
  if (client) return client;
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  if (!url || !key) return null;
  client = createClient<Database>(url, key);
  return client;
}
