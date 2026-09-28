"use client";

import { useEffect, useRef } from "react";
import { cartStore, type CartItem } from "@/lib/cart-store";
import { createClient } from "@/lib/supabase/client";
import { useSessionUser } from "../auth/session-provider";

// Which account the cart in localStorage belongs to. Unset = guest cart.
const OWNER_KEY = "ws-cart-owner";
// Set while a signed-in change hasn't reached the account yet (survives reloads and closed tabs).
const DIRTY_KEY = "ws-cart-dirty";

function flag(key: string, on?: boolean) {
  try {
    if (on === undefined) return localStorage.getItem(key) === "1";
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {}
  return false;
}

function getOwner() {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}
function setOwner(id: string | null) {
  try {
    if (id) localStorage.setItem(OWNER_KEY, id);
    else localStorage.removeItem(OWNER_KEY);
  } catch {}
}

const toRpc = (items: readonly CartItem[]) => items.map((i) => ({ variant_id: i.variantId, qty: i.qty }));
const fromRpc = (rows: { variant_id: string; qty: number }[]) => rows.map((r) => ({ variantId: r.variant_id, qty: r.qty }));

/**
 * Keeps the localStorage cart and the account cart in step:
 * - first sign-in on this device: merge guest cart into the account (higher qty wins)
 * - later visits: the account cart wins (so it follows the customer across devices), unless
 *   this device has changes that weren't saved yet, which are pushed instead
 * - while signed in: local changes are saved to the account
 * - sign-out: the account's cart is removed from this device
 */
export function CartSync() {
  const user = useSessionUser();
  const applying = useRef(false);

  useEffect(() => {
    if (user === undefined) return; // still checking the session
    const supabase = createClient();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Set when the customer changes the cart while we're loading the account cart, so a slow
    // response never overwrites what they just did.
    let changedLocally = false;

    const apply = (items: CartItem[]) => {
      applying.current = true;
      cartStore.replace(items);
      applying.current = false;
    };

    if (!user) {
      if (getOwner()) {
        apply([]);
        setOwner(null);
        flag(DIRTY_KEY, false);
      }
      return;
    }

    const save = async () => {
      // Query builders are lazy: the request is only sent when awaited.
      const { error } = await supabase.rpc("set_cart", { p_items: toRpc(cartStore.getSnapshot()) });
      if (error) console.warn("Couldn't save cart to your account", error.message);
      else flag(DIRTY_KEY, false);
    };
    const push = () => {
      flag(DIRTY_KEY, true);
      clearTimeout(timer);
      timer = setTimeout(save, 400);
    };

    const unsubscribe = cartStore.subscribe(() => {
      if (applying.current) return;
      changedLocally = true;
      if (getOwner() === user.id) push();
    });

    (async () => {
      if (getOwner() !== user.id) {
        // Merge until no local change slipped in while the request was in flight.
        for (let attempt = 0; attempt < 3; attempt++) {
          changedLocally = false;
          const { data, error } = await supabase.rpc("merge_cart", { p_items: toRpc(cartStore.getSnapshot()) });
          if (cancelled || error) return;
          if (changedLocally) continue;
          apply(fromRpc(data ?? []));
          setOwner(user.id);
          return;
        }
      } else if (flag(DIRTY_KEY)) {
        await save(); // last visit's change never reached the account: this device wins
      } else {
        const { data, error } = await supabase.from("cart_items").select("variant_id, qty").order("updated_at");
        if (cancelled || error || changedLocally) return; // a local change is already being saved
        apply(fromRpc(data ?? []));
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [user]);

  return null;
}
