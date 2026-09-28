"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { cartLinesAction } from "@/app/actions";
import { cartStore, type CartItem } from "@/lib/cart-store";
import type { CartLineInfo } from "@/lib/types";

export type CartLine = CartItem & { info: CartLineInfo | undefined };

type CartContextValue = {
  items: CartItem[];
  count: number;
  sheetOpen: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  toast: string | null;
  add: (variantId: string, qty: number, label: string) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const items = useSyncExternalStore(cartStore.subscribe, cartStore.getSnapshot, cartStore.getServerSnapshot);
  // The sheet remembers the page it was opened on, so any navigation closes it.
  const pathname = usePathname();
  const [sheetOn, setSheetOn] = useState<string | null>(null);
  const sheetOpen = sheetOn === pathname;
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const add = useCallback((variantId: string, qty: number, label: string) => {
    cartStore.add(variantId, qty);
    setToast(label);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const openSheet = useCallback(() => {
    setToast(null);
    setSheetOn(window.location.pathname);
  }, []);
  const closeSheet = useCallback(() => setSheetOn(null), []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count: items.reduce((n, i) => n + i.qty, 0),
      sheetOpen,
      openSheet,
      closeSheet,
      toast,
      add,
      setQty: cartStore.setQty,
      remove: cartStore.remove,
    }),
    [items, sheetOpen, toast, add, openSheet, closeSheet],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

const noopSubscribe = () => () => {};
/** False during SSR and hydration, true once the browser (and localStorage) is available. */
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

/** Cart lines joined with current server details. Discontinued lines are dropped once confirmed. */
export function useCartLines(enabled = true) {
  const { items } = useCart();
  const [info, setInfo] = useState<Map<string, CartLineInfo>>(new Map());
  const [version, setVersion] = useState(0); // bump to re-check lines against the catalog
  const idsKey = items.map((i) => i.variantId).sort().join(",");

  useEffect(() => {
    if (!enabled || !idsKey) return;
    let cancelled = false;
    cartLinesAction(idsKey.split(","))
      .then((rows) => {
        if (cancelled) return;
        setInfo(new Map(rows.map((r) => [r.variantId, r])));
        cartStore.keepOnly(new Set(rows.map((r) => r.variantId)));
      })
      .catch(() => {
        // network error: keep the cart as is; rows without details show a placeholder
      });
    return () => {
      cancelled = true;
    };
  }, [idsKey, enabled, version]);

  const lines: CartLine[] = items.map((i) => ({ ...i, info: info.get(i.variantId) }));
  const priced = lines.filter((l) => l.info && l.info.price != null);
  const subtotal = priced.reduce((sum, l) => sum + l.info!.price! * l.qty, 0);
  const onRequest = lines.filter((l) => l.info && l.info.price == null).length;
  const ready = lines.every((l) => l.info);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  return { lines, subtotal, priced: priced.length, onRequest, ready, refresh };
}
