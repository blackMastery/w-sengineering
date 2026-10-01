import "server-only";
import { cache } from "react";
import type { OrderStatus } from "../order-status";
import type { Address } from "../orders";
import { adminDb } from "../supabase/admin";
import { cleanSearch } from "./data";

// Admin customer reads (service role; callers must have passed requireAdmin()).
// admin_customers (0010) joins auth.users with profiles and order aggregates.

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Admin query failed: ${res.error.message}`);
  return res.data as T;
}

/** Same as public.phone_digits: digits only, without a leading Guyana 592. */
export function phoneDigits(s: string): string {
  const d = s.replace(/\D/g, "");
  return d.length > 7 && d.startsWith("592") ? d.slice(3) : d;
}

export type CustomerRow = {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  signed_up_at: string;
  last_sign_in_at: string | null;
  full_name: string | null;
  phone: string | null;
  role: "customer" | "admin";
  blocked_at: string | null;
  blocked_reason: string | null;
  total_orders: number;
  open_orders: number;
  open_estimate: number;
  last_order_at: string | null;
  banned_until: string | null;
};

const ROW =
  "id, email, email_confirmed_at, signed_up_at, last_sign_in_at, full_name, phone, role, blocked_at, blocked_reason, total_orders, open_orders, open_estimate, last_order_at, banned_until";

export const CUSTOMER_FILTERS = {
  all: "All",
  has_orders: "Has orders",
  no_orders: "No orders",
  unconfirmed: "Email not confirmed",
  blocked: "Blocked",
  staff: "Staff",
} as const;
export type CustomerFilter = keyof typeof CUSTOMER_FILTERS;

export const CUSTOMER_SORTS = {
  last_order: "Most recent order",
  newest: "Newest sign-up",
  name: "Name",
  most_orders: "Most orders",
} as const;
export type CustomerSort = keyof typeof CUSTOMER_SORTS;

export const CUSTOMERS_PAGE_SIZE = 50;

export async function listCustomers(opts: { q?: string; filter: CustomerFilter; sort: CustomerSort; page: number }) {
  let query = adminDb().from("admin_customers").select(ROW, { count: "exact" });

  const q = cleanSearch(opts.q).toLowerCase();
  if (q) {
    const digits = phoneDigits(q);
    query = digits.length >= 3 ? query.or(`search_text.ilike.*${q}*,phone_search.ilike.*${digits}*`) : query.ilike("search_text", `%${q}%`);
  }
  switch (opts.filter) {
    case "has_orders":
      query = query.gt("total_orders", 0);
      break;
    case "no_orders":
      query = query.eq("total_orders", 0);
      break;
    case "unconfirmed":
      query = query.is("email_confirmed_at", null);
      break;
    case "blocked":
      query = query.not("blocked_at", "is", null);
      break;
    case "staff":
      query = query.eq("role", "admin");
      break;
  }
  switch (opts.sort) {
    case "newest":
      query = query.order("signed_up_at", { ascending: false });
      break;
    case "name":
      query = query.order("full_name", { ascending: true, nullsFirst: false }).order("email");
      break;
    case "most_orders":
      query = query.order("total_orders", { ascending: false }).order("last_order_at", { ascending: false, nullsFirst: false });
      break;
    default:
      query = query.order("last_order_at", { ascending: false, nullsFirst: false }).order("signed_up_at", { ascending: false });
  }
  const from = (opts.page - 1) * CUSTOMERS_PAGE_SIZE;
  const res = await query.range(from, from + CUSTOMERS_PAGE_SIZE - 1);
  return {
    rows: check(res) as unknown as CustomerRow[],
    total: res.count ?? 0,
    pageCount: Math.max(1, Math.ceil((res.count ?? 0) / CUSTOMERS_PAGE_SIZE)),
  };
}

export async function customerFilterCounts(): Promise<Record<CustomerFilter, number>> {
  const db = adminDb();
  const count = async (fn: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const r = await fn(base());
    if (r.error) throw new Error(r.error.message);
    return r.count ?? 0;
  };
  const base = () => db.from("admin_customers").select("id", { count: "exact", head: true });
  const [all, has, none, unconfirmed, blocked, staff] = await Promise.all([
    count((q) => q),
    count((q) => q.gt("total_orders", 0)),
    count((q) => q.eq("total_orders", 0)),
    count((q) => q.is("email_confirmed_at", null)),
    count((q) => q.not("blocked_at", "is", null)),
    count((q) => q.eq("role", "admin")),
  ]);
  return { all, has_orders: has, no_orders: none, unconfirmed, blocked, staff };
}

// ---------------------------------------------------------------------------------------
// Detail

export type CustomerOrder = {
  id: string;
  number: string;
  status: OrderStatus;
  fulfillment: "pickup" | "delivery";
  estimate_total: number;
  created_at: string;
  items: number;
  unpriced: number;
};

export type CustomerNote = {
  id: string;
  body: string;
  created_at: string;
  updated_at: string;
  edited: boolean;
  author_id: string | null;
  author: string;
};

export type CustomerDetail = CustomerRow & {
  orders: CustomerOrder[];
  addresses: { address: Address; uses: number; last_used: string }[];
  contacts: { name: string; phone: string; uses: number; last_used: string }[]; // differing from the profile
  notes: CustomerNote[];
  statusCounts: Partial<Record<OrderStatus, number>>;
  /** Auth ban out of step with blocked_at (a block/unblock whose Auth call failed). */
  signInMismatch: "not_banned" | "still_banned" | null;
};

export async function getCustomerNotes(customerId: string, limit = 50): Promise<CustomerNote[]> {
  const db = adminDb();
  const notes = check(
    await db
      .from("customer_notes")
      .select("id, body, created_at, updated_at, edited, author_id")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(limit),
  ) as Omit<CustomerNote, "author">[];
  const authorIds = [...new Set(notes.map((n) => n.author_id).filter((x): x is string => !!x))];
  const authors = authorIds.length
    ? (check(await db.from("admin_customers").select("id, full_name, email").in("id", authorIds)) as { id: string; full_name: string | null; email: string }[])
    : [];
  const name = new Map(authors.map((a) => [a.id, a.full_name || a.email]));
  return notes.map((n) => ({ ...n, author: (n.author_id && name.get(n.author_id)) || "Former admin" }));
}

/** Cached per request: the page and its metadata both read it. */
export const getCustomer = cache(async (id: string): Promise<CustomerDetail | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = adminDb();
  const [rowRes, ordersRes, notes] = await Promise.all([
    db.from("admin_customers").select(ROW).eq("id", id).maybeSingle(),
    db
      .from("orders")
      .select("id, number, status, fulfillment, estimate_total, created_at, contact_name, contact_phone, address, order_lines(qty, unit_price)")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(500),
    getCustomerNotes(id),
  ]);
  const row = check(rowRes) as unknown as CustomerRow | null;
  if (!row) return null;
  const raw = check(ordersRes) as unknown as (Omit<CustomerOrder, "items" | "unpriced"> & {
    contact_name: string;
    contact_phone: string;
    address: Address | null;
    order_lines: { qty: number; unit_price: number | null }[];
  })[];

  const orders: CustomerOrder[] = raw.map((o) => ({
    id: o.id,
    number: o.number,
    status: o.status,
    fulfillment: o.fulfillment,
    estimate_total: Number(o.estimate_total),
    created_at: o.created_at,
    items: o.order_lines.reduce((n, l) => n + l.qty, 0),
    unpriced: o.order_lines.filter((l) => l.unit_price == null).length,
  }));

  const statusCounts: Partial<Record<OrderStatus, number>> = {};
  for (const o of orders) statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;

  // newest first, so the first time we see something is its last use
  const addresses = new Map<string, CustomerDetail["addresses"][number]>();
  const contacts = new Map<string, CustomerDetail["contacts"][number]>();
  const profileName = (row.full_name ?? "").trim().toLowerCase();
  const profilePhone = phoneDigits(row.phone ?? "");
  for (const o of raw) {
    if (o.address) {
      const key = [o.address.line1, o.address.line2 ?? "", o.address.city].map((s) => s.trim().toLowerCase()).join("|");
      const a = addresses.get(key);
      if (a) a.uses++;
      else addresses.set(key, { address: o.address, uses: 1, last_used: o.created_at });
    }
    const differs = o.contact_name.trim().toLowerCase() !== profileName || phoneDigits(o.contact_phone) !== profilePhone;
    if (differs) {
      const key = `${o.contact_name.trim().toLowerCase()}|${phoneDigits(o.contact_phone)}`;
      const c = contacts.get(key);
      if (c) c.uses++;
      else contacts.set(key, { name: o.contact_name, phone: o.contact_phone, uses: 1, last_used: o.created_at });
    }
  }

  const banned = !!row.banned_until && new Date(row.banned_until).getTime() > Date.now();
  const signInMismatch = row.blocked_at && !banned ? "not_banned" : !row.blocked_at && banned ? "still_banned" : null;

  return { ...row, signInMismatch, open_estimate: Number(row.open_estimate), orders, addresses: [...addresses.values()], contacts: [...contacts.values()], notes, statusCounts };
});

/** For the admin order sidebar: the customer's latest notes and whether they're blocked. */
export async function getOrderCustomerContext(userId: string) {
  const db = adminDb();
  const [notes, countRes, profileRes] = await Promise.all([
    getCustomerNotes(userId, 3),
    db.from("customer_notes").select("id", { count: "exact", head: true }).eq("customer_id", userId),
    db.from("profiles").select("blocked_at").eq("id", userId).maybeSingle(),
  ]);
  return { notes, noteCount: countRes.count ?? notes.length, blocked: !!profileRes.data?.blocked_at };
}
