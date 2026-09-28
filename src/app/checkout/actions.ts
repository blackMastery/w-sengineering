"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type PlaceOrderInput = {
  items: { variantId: string; qty: number }[];
  fulfillment: "pickup" | "delivery";
  name: string;
  phone: string;
  address: { line1: string; line2: string; city: string; notes: string } | null;
  notes: string;
};

export type PlaceOrderResult =
  | { ok: true; number: string }
  | { ok: false; error: string; reason?: "signin" | "unavailable" };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function placeOrderAction(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Your session ended. Sign in again to place your order.", reason: "signin" };

  const items = Array.isArray(input?.items)
    ? input.items
        .filter((i) => typeof i?.variantId === "string" && Number.isInteger(i?.qty))
        .map((i) => ({ variant_id: i.variantId, qty: i.qty }))
    : [];
  const fulfillment = input?.fulfillment === "delivery" ? "delivery" : "pickup";
  const name = str(input?.name, 120);
  const phone = str(input?.phone, 40);

  const supabase = await createClient();
  // Every rule (orderable lines, qty range, required fields, address) is enforced again in place_order.
  const { data, error } = await supabase.rpc("place_order", {
    p_items: items,
    p_fulfillment: fulfillment,
    p_contact: { name, phone },
    p_address:
      fulfillment === "delivery" && input.address
        ? {
            line1: str(input.address.line1, 200),
            line2: str(input.address.line2, 200),
            city: str(input.address.city, 100),
            notes: str(input.address.notes, 500),
          }
        : null,
    p_notes: str(input?.notes, 1000) || null,
  });

  if (error) {
    if (error.hint === "unavailable") {
      return { ok: false, reason: "unavailable", error: "Some items are no longer available. We’ve updated your cart; check it and try again." };
    }
    // 22023 = our validation messages, written for customers
    if (error.code === "22023") return { ok: false, error: error.message };
    console.error("place_order failed", error);
    return { ok: false, error: "We couldn’t place your order request. Please try again in a moment." };
  }

  // Remember name and phone for next time (column grants allow only these two).
  await supabase.from("profiles").update({ full_name: name, phone }).eq("id", user.id);

  revalidatePath("/account");
  return { ok: true, number: (data as { number: string }).number };
}

export async function cancelOrderAction(orderId: string, number: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: "Sign in again to cancel this order." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId });
  revalidatePath(`/account/orders/${number}`);
  revalidatePath("/account");
  if (error) {
    return { ok: false, error: error.hint === "not_cancellable" ? error.message : "We couldn’t cancel the order. Please try again." };
  }
  return { ok: true };
}
