import "server-only";
import type { OrderStatus } from "../order-status";
import type { Address } from "../orders";
import { adminDb } from "../supabase/admin";

// Admin order + purchase order reads (service role). Callers must have passed requireAdmin().

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Admin query failed: ${res.error.message}`);
  return res.data as T;
}

export const ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "ordered_from_supplier",
  "awaiting_approval",
  "received",
  "invoiced",
  "paid",
  "delivered",
  "cancelled",
];

export type AdminOrderRow = {
  id: string;
  number: string;
  status: OrderStatus;
  fulfillment: "pickup" | "delivery";
  contact_name: string;
  contact_phone: string;
  estimate_total: number;
  created_at: string;
  updated_at: string;
  order_lines: { qty: number; unit_price: number | null }[];
  waitingDays: number; // days since the last status change
};

export async function statusCounts(): Promise<Record<OrderStatus, number>> {
  const db = adminDb();
  const counts = await Promise.all(
    ORDER_STATUSES.map(async (s) => {
      const r = await db.from("orders").select("id", { count: "exact", head: true }).eq("status", s);
      if (r.error) throw new Error(r.error.message);
      return [s, r.count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts) as Record<OrderStatus, number>;
}

export async function listAdminOrders(opts: { status?: OrderStatus; q?: string; page: number }) {
  const size = 50;
  let query = adminDb()
    .from("orders")
    .select("id, number, status, fulfillment, contact_name, contact_phone, estimate_total, created_at, updated_at, order_lines(qty, unit_price)", {
      count: "exact",
    });
  if (opts.status) query = query.eq("status", opts.status);
  const q = (opts.q ?? "").replace(/[,()*%\\:"']/g, " ").trim().slice(0, 60);
  if (q) query = query.or(`number.ilike.*${q}*,contact_name.ilike.*${q}*,contact_phone.ilike.*${q}*,contact_email.ilike.*${q}*`);
  // oldest first while work is waiting on us, newest first otherwise
  const oldestFirst = opts.status && ["pending", "confirmed", "awaiting_approval", "received"].includes(opts.status);
  const res = await query.order("created_at", { ascending: !!oldestFirst }).range((opts.page - 1) * size, opts.page * size - 1);
  const now = Date.now();
  const rows = (check(res) as unknown as Omit<AdminOrderRow, "waitingDays">[]).map((r) => ({
    ...r,
    waitingDays: Math.floor((now - new Date(r.updated_at).getTime()) / 86_400_000),
  }));
  return { rows, total: res.count ?? 0, pageCount: Math.max(1, Math.ceil((res.count ?? 0) / size)) };
}

export type ProposalLine = {
  line_id: string;
  sku: string;
  name: string;
  option_values: Record<string, string>;
  unit_price: number | null;
  qty_before: number;
  qty: number;
};
export type ProposalAdd = {
  variant_id: string;
  sku: string;
  name: string;
  option_values: Record<string, string>;
  unit_price: number | null;
  qty: number;
};
export type Proposal = {
  id: string;
  proposed: { lines: ProposalLine[]; add: ProposalAdd[] };
  note: string | null;
  status: "proposed" | "approved" | "rejected" | "withdrawn";
  created_at: string;
  decided_at: string | null;
  reminded_at: string | null;
};

export type AdminOrder = {
  id: string;
  number: string;
  status: OrderStatus;
  user_id: string;
  fulfillment: "pickup" | "delivery";
  contact_name: string;
  contact_phone: string;
  contact_email: string | null;
  address: Address | null;
  notes: string | null;
  estimate_total: number;
  created_at: string;
  lines: {
    id: string;
    sku: string;
    name: string;
    option_values: Record<string, string>;
    qty: number;
    unit_price: number | null;
    variant_id: string | null;
    po: { id: string; number: string; status: string } | null;
    product: { id: string; slug: string } | null;
  }[];
  events: { id: number; status: OrderStatus; note: string | null; created_at: string; actor_id: string | null }[];
  proposals: Proposal[];
  customerOrderCount: number;
};

export async function getAdminOrder(number: string): Promise<AdminOrder | null> {
  const db = adminDb();
  const row = check(
    await db
      .from("orders")
      .select(
        "id, number, status, user_id, fulfillment, contact_name, contact_phone, contact_email, address, notes, estimate_total, created_at, " +
          "order_lines(id, sku, name, option_values, qty, unit_price, variant_id, sort, purchase_orders(id, number, status), products(id, slug)), " +
          "order_events(id, status, note, created_at, actor_id), " +
          "order_changes(id, proposed, note, status, created_at, decided_at, reminded_at)",
      )
      .eq("number", number)
      .order("sort", { referencedTable: "order_lines" })
      .order("id", { referencedTable: "order_events" })
      .order("created_at", { referencedTable: "order_changes", ascending: false })
      .maybeSingle(),
  ) as unknown as (Omit<AdminOrder, "lines" | "events" | "proposals" | "customerOrderCount"> & {
    order_lines: (Omit<AdminOrder["lines"][number], "po" | "product"> & {
      purchase_orders: AdminOrder["lines"][number]["po"];
      products: AdminOrder["lines"][number]["product"];
    })[];
    order_events: AdminOrder["events"];
    order_changes: Proposal[];
  }) | null;
  if (!row) return null;

  const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("user_id", row.user_id);
  const { order_lines, order_events, order_changes, ...order } = row;
  return {
    ...order,
    lines: order_lines.map(({ purchase_orders, products, ...l }) => ({ ...l, po: purchase_orders, product: products })),
    events: order_events,
    proposals: order_changes,
    customerOrderCount: count ?? 0,
  };
}

/** Variants to offer as replacements, by SKU or product name. */
export async function searchVariants(q: string) {
  const term = q.replace(/[,()*%\\:"']/g, " ").trim().slice(0, 40);
  if (term.length < 2) return [];
  const db = adminDb();
  const [bySku, byName] = await Promise.all([
    db.from("variant_prices").select("id, sku, option_values, price, products(name)").eq("is_orderable", true).ilike("sku", `${term}%`).order("sku").limit(15),
    db
      .from("variant_prices")
      .select("id, sku, option_values, price, products!inner(name)")
      .eq("is_orderable", true)
      .ilike("products.name", `%${term}%`)
      .order("sku")
      .limit(15),
  ]);
  const rows = [...(check(bySku) as unknown[]), ...(check(byName) as unknown[])] as {
    id: string;
    sku: string;
    option_values: Record<string, string>;
    price: number | null;
    products: { name: string };
  }[];
  const seen = new Set<string>();
  return rows
    .filter((r) => !seen.has(r.id) && seen.add(r.id))
    .slice(0, 15)
    .map((r) => ({ id: r.id, sku: r.sku, optionValues: r.option_values, price: r.price, name: r.products.name }));
}

// ---------------------------------------------------------------------------------------
// Purchase orders

export type PoSummary = {
  id: string;
  number: string;
  status: "draft" | "sent" | "received";
  created_at: string;
  sent_at: string | null;
  received_at: string | null;
  suppliers: { name: string };
  po_lines: { qty: number }[];
};

export async function listPurchaseOrders(): Promise<PoSummary[]> {
  return check(
    await adminDb()
      .from("purchase_orders")
      .select("id, number, status, created_at, sent_at, received_at, suppliers(name), po_lines(qty)")
      .order("created_at", { ascending: false })
      .limit(200),
  ) as unknown as PoSummary[];
}

/** Order lines waiting to go on a PO (confirmed orders, plus approved replacements). */
export async function linesAwaitingPo() {
  const rows = check(
    await adminDb()
      .from("order_lines")
      .select("qty, orders!inner(id, status)")
      .is("po_id", null)
      .in("orders.status", ["confirmed", "ordered_from_supplier"])
      .limit(1000),
  ) as unknown as { qty: number; orders: { id: string } }[];
  return { lines: rows.length, orders: new Set(rows.map((r) => r.orders.id)).size, units: rows.reduce((n, r) => n + r.qty, 0) };
}

export type PoDetail = PoSummary & {
  supplier_id: string;
  lines: { id: string; sku: string; name: string; option_values: Record<string, string>; qty: number; usd_cost: number | null }[];
  orders: { id: string; number: string; status: OrderStatus; contact_name: string }[];
};

export async function getPurchaseOrder(id: string): Promise<PoDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = adminDb();
  const po = check(
    await db
      .from("purchase_orders")
      .select("id, number, status, supplier_id, created_at, sent_at, received_at, suppliers(name), po_lines(id, sku, name, option_values, qty, variant_id, variants(usd_cost))")
      .eq("id", id)
      .order("sku", { referencedTable: "po_lines" })
      .maybeSingle(),
  ) as unknown as (Omit<PoDetail, "lines" | "orders" | "po_lines"> & {
    po_lines: { id: string; sku: string; name: string; option_values: Record<string, string>; qty: number; variants: { usd_cost: number | null } | null }[];
  }) | null;
  if (!po) return null;

  const orderRows = check(
    await db.from("order_lines").select("orders(id, number, status, contact_name)").eq("po_id", id).limit(1000),
  ) as unknown as { orders: PoDetail["orders"][number] }[];
  const orders = [...new Map(orderRows.map((r) => [r.orders.id, r.orders])).values()].sort((a, b) => a.number.localeCompare(b.number));

  const { po_lines, ...rest } = po;
  return {
    ...rest,
    po_lines: po_lines.map((l) => ({ qty: l.qty })),
    lines: po_lines.map(({ variants, ...l }) => ({ ...l, usd_cost: variants?.usd_cost ?? null })),
    orders,
  };
}
