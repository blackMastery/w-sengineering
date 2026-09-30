"use server";

import { revalidatePath } from "next/cache";
import { adminActor } from "@/lib/admin/auth";
import { searchVariants } from "@/lib/admin/orders";
import { adminDb } from "@/lib/supabase/admin";
import type { ActionResult } from "../actions";

// Order workflow actions. Every transition runs in a Postgres function that validates it;
// these wrappers check the admin role (server actions are public endpoints) and map errors.

const UUID = /^[0-9a-f-]{36}$/i;

function mapError(error: { code?: string; hint?: string; message: string }): ActionResult {
  // 22023 = validation, P0001 with a hint = a transition that isn't allowed from the current state
  if (error.hint === "conflict") return { ok: false, error: error.message, conflict: true };
  if (error.code === "22023" || error.hint) return { ok: false, error: error.message };
  console.error("workflow action failed", error);
  return { ok: false, error: "That didn’t work. Reload the page and try again." };
}

function refreshOrders(number?: string) {
  revalidatePath("/admin/orders", "layout");
  revalidatePath("/admin/purchase-orders", "layout");
  revalidatePath("/admin");
  if (number) revalidatePath(`/account/orders/${number}`);
}

export async function setOrderStatusAction(
  orderId: string,
  number: string,
  to: "confirmed" | "cancelled" | "received",
  note?: string,
): Promise<ActionResult> {
  const actor = await adminActor();
  if (!UUID.test(orderId) || !["confirmed", "cancelled", "received"].includes(to)) return { ok: false, error: "Unknown order." };
  if (to === "cancelled" && !note?.trim()) return { ok: false, error: "Add a reason for cancelling. The customer sees it." };
  const { error } = await adminDb().rpc("admin_set_order_status", {
    p_actor: actor,
    p_order: orderId,
    p_to: to,
    p_note: note?.trim() || null,
  });
  if (error) return mapError(error);
  refreshOrders(number);
  return { ok: true, message: to === "confirmed" ? "Order confirmed." : to === "cancelled" ? "Order cancelled." : "Marked as arrived." };
}

export type ChangeInput = { lines: { line_id: string; qty: number }[]; add: { variant_id: string; qty: number }[] };

export async function proposeChangesAction(orderId: string, number: string, changes: ChangeInput, note: string): Promise<ActionResult> {
  const actor = await adminActor();
  if (!UUID.test(orderId)) return { ok: false, error: "Unknown order." };
  const lines = (changes?.lines ?? []).filter((l) => UUID.test(l.line_id) && Number.isInteger(l.qty));
  const add = (changes?.add ?? []).filter((a) => UUID.test(a.variant_id) && Number.isInteger(a.qty));
  if (!note?.trim()) return { ok: false, error: "Explain the change for the customer (e.g. what the supplier is short of)." };
  const { error } = await adminDb().rpc("admin_propose_changes", {
    p_actor: actor,
    p_order: orderId,
    p_changes: { lines, add },
    p_note: note.trim(),
  });
  if (error) return mapError(error);
  refreshOrders(number);
  return { ok: true, message: "Changes sent to the customer for approval." };
}

export async function withdrawChangesAction(orderId: string, number: string): Promise<ActionResult> {
  const actor = await adminActor();
  if (!UUID.test(orderId)) return { ok: false, error: "Unknown order." };
  const { error } = await adminDb().rpc("admin_withdraw_changes", { p_actor: actor, p_order: orderId });
  if (error) return mapError(error);
  refreshOrders(number);
  return { ok: true, message: "Proposal withdrawn." };
}

export async function searchVariantsAction(q: string) {
  await adminActor();
  return searchVariants(String(q ?? ""));
}

// ---------------------------------------------------------------------------------------
// Purchase orders

export async function buildPurchaseOrdersAction(): Promise<ActionResult & { poIds?: string[] }> {
  const actor = await adminActor();
  const { data, error } = await adminDb().rpc("admin_build_purchase_orders", { p_actor: actor });
  if (error) return mapError(error);
  refreshOrders();
  const ids = (data as string[]) ?? [];
  return ids.length ? { ok: true, message: "Draft purchase order updated.", poIds: ids } : { ok: true, message: "Nothing waiting to be ordered." };
}

export async function setPoStatusAction(poId: string, to: "sent" | "received" | "deleted"): Promise<ActionResult> {
  const actor = await adminActor();
  if (!UUID.test(poId) || !["sent", "received", "deleted"].includes(to)) return { ok: false, error: "Unknown purchase order." };
  const { data, error } = await adminDb().rpc("admin_set_po_status", { p_actor: actor, p_po: poId, p_to: to });
  if (error) return mapError(error);
  refreshOrders();
  const moved = data as number;
  if (to === "deleted") return { ok: true, message: "Draft deleted. Its orders are back in the queue." };
  const what = to === "sent" ? "ordered from supplier" : "arrived";
  return { ok: true, message: `Marked ${to}. ${moved} ${moved === 1 ? "order" : "orders"} moved to “${what}”.` };
}

// ---------------------------------------------------------------------------------------
// Price "Price on request" lines (only unpriced lines; prices the customer ordered at stay)

export async function priceOrderLinesAction(orderId: string, number: string, prices: { line_id: string; unit_price: number }[]): Promise<ActionResult> {
  const actor = await adminActor();
  if (!UUID.test(orderId)) return { ok: false, error: "Unknown order." };
  const clean = (Array.isArray(prices) ? prices : []).filter(
    (p) => UUID.test(p?.line_id) && Number.isSafeInteger(p?.unit_price) && p.unit_price >= 0 && p.unit_price < 1e9,
  );
  if (!clean.length || clean.length !== prices.length) return { ok: false, error: "Prices must be whole GYD amounts." };
  const { data, error } = await adminDb().rpc("admin_price_order_lines", { p_actor: actor, p_order: orderId, p_prices: clean });
  if (error) return mapError(error);
  refreshOrders(number);
  const r = data as { priced: number; unpriced_left: number };
  return {
    ok: true,
    message: `Priced ${r.priced} ${r.priced === 1 ? "line" : "lines"}.${r.unpriced_left ? ` ${r.unpriced_left} still “Price on request”.` : ""} The customer sees the new estimate.`,
  };
}
