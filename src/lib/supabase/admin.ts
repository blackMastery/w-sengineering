import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./config";

// Service-role client: bypasses RLS and can read usd_cost. Only use it after
// requireAdmin()/adminActor() has confirmed the caller is an admin.
let client: SupabaseClient | undefined;

export function adminDb(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  client ??= createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
