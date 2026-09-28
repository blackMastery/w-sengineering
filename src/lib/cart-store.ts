// Guest cart in localStorage: variant id + qty only. Prices and names are always looked up
// from the server when shown, so they are never stale or computed in the client.

export type CartItem = { variantId: string; qty: number };

const KEY = "ws-cart-v1";
export const MAX_QTY = 999;
const EMPTY: CartItem[] = [];

let items: CartItem[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function parse(raw: string | null): CartItem[] {
  try {
    const data = JSON.parse(raw ?? "[]");
    if (!Array.isArray(data)) return EMPTY;
    return data
      .filter((x) => typeof x?.variantId === "string" && Number.isInteger(x?.qty) && x.qty > 0)
      .map((x) => ({ variantId: x.variantId, qty: Math.min(x.qty, MAX_QTY) }));
  } catch {
    return EMPTY;
  }
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    items = parse(localStorage.getItem(KEY));
  } catch {
    items = EMPTY;
  }
}

function commit(next: CartItem[]) {
  items = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode): the cart still works for this page session
  }
  listeners.forEach((fn) => fn());
}

function onStorage(e: StorageEvent) {
  if (e.key !== KEY) return;
  items = parse(e.newValue);
  listeners.forEach((fn) => fn());
}

export const cartStore = {
  subscribe(fn: () => void) {
    load();
    listeners.add(fn);
    if (listeners.size === 1) window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(fn);
      if (listeners.size === 0) window.removeEventListener("storage", onStorage);
    };
  },
  getSnapshot() {
    load();
    return items;
  },
  getServerSnapshot() {
    return EMPTY;
  },
  add(variantId: string, qty = 1) {
    const existing = items.find((i) => i.variantId === variantId);
    commit(
      existing
        ? items.map((i) => (i.variantId === variantId ? { ...i, qty: Math.min(i.qty + qty, MAX_QTY) } : i))
        : [...items, { variantId, qty: Math.min(qty, MAX_QTY) }],
    );
  },
  setQty(variantId: string, qty: number) {
    if (qty <= 0) return cartStore.remove(variantId);
    commit(items.map((i) => (i.variantId === variantId ? { ...i, qty: Math.min(qty, MAX_QTY) } : i)));
  },
  remove(variantId: string) {
    commit(items.filter((i) => i.variantId !== variantId));
  },
  /** Replace the whole cart, e.g. with the account cart after sign-in. */
  replace(next: CartItem[]) {
    const same =
      next.length === items.length && next.every((n, i) => n.variantId === items[i].variantId && n.qty === items[i].qty);
    if (!same) commit(next.map((i) => ({ variantId: i.variantId, qty: Math.min(Math.max(1, i.qty), MAX_QTY) })));
  },
  clear() {
    if (items.length) commit(EMPTY);
  },
  /** Drop lines the server no longer offers (discontinued or deleted variants). */
  keepOnly(validIds: Set<string>) {
    const next = items.filter((i) => validIds.has(i.variantId));
    if (next.length !== items.length) commit(next);
  },
};
