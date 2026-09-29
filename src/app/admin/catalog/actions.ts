"use server";

import { revalidatePath } from "next/cache";
import { type ActionResult, dbError, fail, refreshStorefront, UUID } from "@/lib/admin/action-helpers";
import { adminActor } from "@/lib/admin/auth";
import { adminDb } from "@/lib/supabase/admin";

// Brands, subcategories and groups. Deleting something in use needs a target to move its
// products to; renaming categories/groups changes their URLs and keeps the old ones redirecting.

function done(message: string): ActionResult {
  refreshStorefront();
  revalidatePath("/admin/catalog");
  return { ok: true, message };
}

export async function saveBrandAction(id: string | null, name: string): Promise<ActionResult> {
  const actor = await adminActor();
  const { error } = await adminDb().rpc("admin_save_brand", { p_actor: actor, p_id: id && UUID.test(id) ? id : null, p_name: String(name ?? "") });
  return error ? dbError(error) : done(id ? "Brand renamed." : "Brand added.");
}

export async function deleteBrandAction(id: string, moveTo: string | null): Promise<ActionResult> {
  const actor = await adminActor();
  if (!UUID.test(id)) return fail("Unknown brand.");
  const { data, error } = await adminDb().rpc("admin_delete_brand", { p_actor: actor, p_id: id, p_move_to: moveTo && UUID.test(moveTo) ? moveTo : null });
  if (error) return dbError(error);
  const n = data as number;
  return done(n ? `Brand deleted; ${n} products moved.` : "Brand deleted.");
}

export async function saveCategoryAction(id: string | null, name: string, groupId: string): Promise<ActionResult> {
  const actor = await adminActor();
  if (!UUID.test(groupId)) return fail("Choose a group.");
  const { error } = await adminDb().rpc("admin_save_category", {
    p_actor: actor,
    p_id: id && UUID.test(id) ? id : null,
    p_name: String(name ?? ""),
    p_group: groupId,
  });
  return error ? dbError(error) : done(id ? "Category saved. If its name changed, the old web address redirects." : "Category added. It appears in the store once it has products.");
}

export async function deleteCategoryAction(id: string, moveTo: string | null): Promise<ActionResult> {
  const actor = await adminActor();
  if (!UUID.test(id)) return fail("Unknown category.");
  const { data, error } = await adminDb().rpc("admin_delete_category", { p_actor: actor, p_id: id, p_move_to: moveTo && UUID.test(moveTo) ? moveTo : null });
  if (error) return dbError(error);
  const n = data as number;
  return done(n ? `Category deleted; ${n} products moved.` : "Category deleted.");
}

export async function renameGroupAction(id: string, name: string): Promise<ActionResult> {
  const actor = await adminActor();
  if (!UUID.test(id)) return fail("Unknown group.");
  const { error } = await adminDb().rpc("admin_rename_group", { p_actor: actor, p_id: id, p_name: String(name ?? "") });
  return error ? dbError(error) : done("Group renamed. The old web address redirects.");
}

export async function reorderAction(kind: "group" | "category", orderedIds: string[]): Promise<ActionResult> {
  const actor = await adminActor();
  const list = Array.isArray(orderedIds) ? orderedIds.filter((x) => UUID.test(x)) : [];
  if (!["group", "category"].includes(kind) || !list.length) return fail("Nothing to reorder.");
  const { error } = await adminDb().rpc("admin_reorder", { p_actor: actor, p_kind: kind, p_ids: list });
  return error ? dbError(error) : done("Order saved.");
}
