import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "./config";

// Cookie-less anon client for public catalog reads in Server Components.
// RLS still applies.
export const publicDb = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
