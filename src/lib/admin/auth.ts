import "server-only";
import { notFound, redirect } from "next/navigation";
import { getUser, type SessionUser } from "../auth";
import { adminDb } from "../supabase/admin";

/** The signed-in user if their profile role is admin, else null. */
export async function getAdmin(): Promise<SessionUser | null> {
  const user = await getUser();
  if (!user) return null;
  const { data } = await adminDb().from("profiles").select("role").eq("id", user.id).maybeSingle();
  return data?.role === "admin" ? user : null;
}

/** For admin pages: signed-out → login; signed-in non-admins get a 404 (the area isn't advertised). */
export async function requireAdmin(next = "/admin"): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const admin = await getAdmin();
  if (!admin) notFound();
  return admin;
}

/** For admin server actions (public endpoints): the admin's user id, or throws. */
export async function adminActor(): Promise<string> {
  const admin = await getAdmin();
  if (!admin) throw new Error("Not authorized");
  return admin.id;
}
