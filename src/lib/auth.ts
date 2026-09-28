import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export type SessionUser = { id: string; email: string | null };

/** Verified user from the session cookie (signature checked by getClaims), or null. */
export async function getUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}

export async function requireUser(next: string): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}
