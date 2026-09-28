import "server-only";
import type { OrderStatus } from "./order-status";
import { createClient } from "./supabase/server";

// Customer order reads, with the signed-in user's client. RLS already limits customers to their
// own orders; the explicit user_id filter keeps an admin's account page to their own orders too.

export type Address = { line1: string; line2?: string; city: string; notes?: string };

export type OrderSummary = {
  id: string;
  number: string;
  status: OrderStatus;
  fulfillment: "pickup" | "delivery";
  estimateTotal: number;
  invoiceTotal: number | null;
  createdAt: string;
  lineCount: number;
  itemCount: number;
  unpricedCount: number;
};

export type OrderDetail = OrderSummary & {
  contactName: string;
  contactPhone: string;
  address: Address | null;
  notes: string | null;
  deliveryFee: number | null;
  lines: {
    id: string;
    sku: string;
    name: string;
    optionValues: Record<string, string>;
    qty: number;
    unitPrice: number | null;
    productSlug: string | null;
  }[];
  events: { id: number; status: OrderStatus; note: string | null; createdAt: string }[];
};

type Row = {
  id: string;
  number: string;
  status: OrderStatus;
  fulfillment: "pickup" | "delivery";
  estimate_total: number;
  invoice_total: number | null;
  created_at: string;
  order_lines: { qty: number; unit_price: number | null }[];
};

function summarize(r: Row): OrderSummary {
  return {
    id: r.id,
    number: r.number,
    status: r.status,
    fulfillment: r.fulfillment,
    estimateTotal: Number(r.estimate_total),
    invoiceTotal: r.invoice_total == null ? null : Number(r.invoice_total),
    createdAt: r.created_at,
    lineCount: r.order_lines.length,
    itemCount: r.order_lines.reduce((n, l) => n + l.qty, 0),
    unpricedCount: r.order_lines.filter((l) => l.unit_price == null).length,
  };
}

export async function listOrders(userId: string): Promise<OrderSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, number, status, fulfillment, estimate_total, invoice_total, created_at, order_lines(qty, unit_price)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Couldn't load orders: ${error.message}`);
  return (data as unknown as Row[]).map(summarize);
}

export async function getOrder(userId: string, number: string): Promise<OrderDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, number, status, fulfillment, estimate_total, invoice_total, created_at, contact_name, contact_phone, address, notes, delivery_fee, " +
        "order_lines(id, sku, name, option_values, qty, unit_price, sort, products(slug)), order_events(id, status, note, created_at)",
    )
    .eq("number", number)
    .eq("user_id", userId)
    .order("sort", { referencedTable: "order_lines" })
    .order("created_at", { referencedTable: "order_events" })
    .maybeSingle();
  if (error) throw new Error(`Couldn't load order: ${error.message}`);
  if (!data) return null;

  const r = data as unknown as Omit<Row, "order_lines"> & {
    contact_name: string;
    contact_phone: string;
    address: Address | null;
    notes: string | null;
    delivery_fee: number | null;
    order_lines: {
      id: string;
      sku: string;
      name: string;
      option_values: Record<string, string>;
      qty: number;
      unit_price: number | null;
      products: { slug: string } | null;
    }[];
    order_events: { id: number; status: OrderStatus; note: string | null; created_at: string }[];
  };

  return {
    ...summarize(r),
    contactName: r.contact_name,
    contactPhone: r.contact_phone,
    address: r.address,
    notes: r.notes,
    deliveryFee: r.delivery_fee == null ? null : Number(r.delivery_fee),
    lines: r.order_lines.map((l) => ({
      id: l.id,
      sku: l.sku,
      name: l.name,
      optionValues: l.option_values,
      qty: l.qty,
      unitPrice: l.unit_price == null ? null : Number(l.unit_price),
      productSlug: l.products?.slug ?? null,
    })),
    events: r.order_events.map((e) => ({ id: e.id, status: e.status, note: e.note, createdAt: e.created_at })),
  };
}

/** Name/phone from the profile and the address from the customer's last delivery order. */
export async function getCheckoutDefaults(userId: string) {
  const supabase = await createClient();
  const [profile, last] = await Promise.all([
    supabase.from("profiles").select("full_name, phone").eq("id", userId).maybeSingle(),
    supabase
      .from("orders")
      .select("address, contact_name, contact_phone")
      .eq("user_id", userId)
      .eq("fulfillment", "delivery")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    name: profile.data?.full_name ?? last.data?.contact_name ?? "",
    phone: profile.data?.phone ?? last.data?.contact_phone ?? "",
    address: (last.data?.address as Address | null) ?? null,
  };
}
