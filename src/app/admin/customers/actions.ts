"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, dbError, fail, UUID } from "@/lib/admin/action-helpers";
import { adminActor } from "@/lib/admin/auth";
import { adminDb } from "@/lib/supabase/admin";

// Customer account actions. Rules live in the 0010 functions; these check the admin role
// (server actions are public endpoints) and keep Supabase Auth's ban in step with blocking.

// Supabase Auth has no "forever": 100 years.
const BAN_FOREVER = "876000h";

function refreshCustomer() {
  revalidatePath("/admin/customers", "layout");
  revalidatePath("/admin/orders", "layout");
}

/**
 * Supabase Auth's ban, kept in step with profiles.blocked_at. A ban ends their sessions at
 * the next token refresh and refuses new sign-ins; until then the database triggers already
 * refuse their orders and cart saves. Returns false if Auth didn't accept the change.
 */
async function applyBan(userId: string, banned: boolean): Promise<boolean> {
  const { error } = await adminDb().auth.admin.updateUserById(userId, { ban_duration: banned ? BAN_FOREVER : "none" });
  if (error) console.error(banned ? "auth ban failed" : "auth unban failed", error);
  return !error;
}

// When the Auth call fails the database change still stands; the customer page shows the
// mismatch with a "Retry" button (syncSignInAction).
const BAN_FAILED = "Blocked: they can’t order, but signing them out failed. Use “Retry” on the warning below.";
const UNBAN_FAILED = "Unblocked, but their sign-in is still suspended. Use “Retry” on the warning below.";

export type BlockResult = (ActionResult & { ok: true; openOrders: string[] }) | (ActionResult & { ok: false });

export async function blockCustomerAction(userId: string, reason: string): Promise<BlockResult> {
  const actor = await adminActor();
  if (!UUID.test(userId)) return fail("Unknown customer.") as BlockResult;
  if (!reason?.trim()) return fail("Give a reason for blocking (only admins see it).") as BlockResult;
  const { data, error } = await adminDb().rpc("admin_block_customer", { p_actor: actor, p_user: userId, p_reason: reason.trim() });
  if (error) return dbError(error) as BlockResult;
  const banned = await applyBan(userId, true);
  refreshCustomer();
  const openOrders = ((data as { open_orders?: string[] } | null)?.open_orders ?? []).filter((n) => typeof n === "string");
  return { ok: true, openOrders, message: banned ? "Account blocked and signed out." : BAN_FAILED };
}

export async function unblockCustomerAction(userId: string): Promise<ActionResult> {
  const actor = await adminActor();
  if (!UUID.test(userId)) return fail("Unknown customer.");
  const { error } = await adminDb().rpc("admin_unblock_customer", { p_actor: actor, p_user: userId });
  if (error) return dbError(error);
  const lifted = await applyBan(userId, false);
  refreshCustomer();
  return lifted ? { ok: true, message: "Account unblocked. They can sign in and order again." } : { ok: false, error: UNBAN_FAILED };
}

/** Re-applies the Auth ban to match the account's blocked state (after a failed block/unblock). */
export async function syncSignInAction(userId: string): Promise<ActionResult> {
  await adminActor();
  if (!UUID.test(userId)) return fail("Unknown customer.");
  const { data, error } = await adminDb().from("profiles").select("blocked_at").eq("id", userId).maybeSingle();
  if (error || !data) return fail("Customer not found.");
  const blocked = !!data.blocked_at;
  const ok = await applyBan(userId, blocked);
  refreshCustomer();
  if (!ok) return fail("Supabase Auth didn’t accept the change. Try again in a minute.");
  return { ok: true, message: blocked ? "Signed out. They can’t sign in." : "Sign-in restored." };
}

export async function setRoleAction(userId: string, role: "customer" | "admin", confirmEmail?: string): Promise<ActionResult> {
  const actor = await adminActor();
  if (!UUID.test(userId) || (role !== "customer" && role !== "admin")) return fail("Unknown customer.");
  const { error } = await adminDb().rpc("admin_set_role", {
    p_actor: actor,
    p_user: userId,
    p_role: role,
    p_confirm_email: confirmEmail ?? null,
  });
  if (error) return dbError(error);
  refreshCustomer();
  return { ok: true, message: role === "admin" ? "They’re now an admin." : "Admin role removed." };
}

// ---------------------------------------------------------------------------------------
// Notes (admin-only; never shown to the customer)

export async function addNoteAction(customerId: string, body: string): Promise<ActionResult> {
  const actor = await adminActor();
  if (!UUID.test(customerId)) return fail("Unknown customer.");
  if (!body?.trim()) return fail("Write a note first.");
  const { error } = await adminDb().rpc("admin_add_note", { p_actor: actor, p_customer: customerId, p_body: body });
  if (error) return dbError(error);
  refreshCustomer();
  return { ok: true, message: "Note added." };
}

export async function editNoteAction(noteId: string, body: string): Promise<ActionResult> {
  const actor = await adminActor();
  if (!UUID.test(noteId)) return fail("Unknown note.");
  const { error } = await adminDb().rpc("admin_edit_note", { p_actor: actor, p_note: noteId, p_body: body ?? "" });
  if (error) return dbError(error);
  refreshCustomer();
  return { ok: true, message: "Note saved." };
}

export async function deleteNoteAction(noteId: string): Promise<ActionResult> {
  const actor = await adminActor();
  if (!UUID.test(noteId)) return fail("Unknown note.");
  const { error } = await adminDb().rpc("admin_delete_note", { p_actor: actor, p_note: noteId });
  if (error) return dbError(error);
  refreshCustomer();
  return { ok: true, message: "Note deleted." };
}
