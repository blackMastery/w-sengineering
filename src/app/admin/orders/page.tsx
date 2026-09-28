import Link from "next/link";
import { StatusPill } from "@/components/account/status-pill";
import { LocalTime } from "@/components/local-time";
import { requireAdmin } from "@/lib/admin/auth";
import { listAdminOrders, ORDER_STATUSES, statusCounts } from "@/lib/admin/orders";
import { formatPrice } from "@/lib/format";
import { ADMIN_STATUS_LABEL, type OrderStatus } from "@/lib/order-status";

export const metadata = { title: "Orders" };

// What each queue is waiting on, shown under the tabs.
const NEXT_STEP: Partial<Record<OrderStatus, string>> = {
  pending: "Review and confirm (or cancel) each request.",
  confirmed: "Confirmed lines go on a purchase order. Build one from Purchase orders.",
  ordered_from_supplier: "Waiting for the supplier. Propose changes if they’re short.",
  awaiting_approval: "Waiting for the customer to approve changes. After 3 days, decide yourself.",
  received: "Arrived. Invoicing comes in the next build step.",
};

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requireAdmin("/admin/orders");
  const sp = await searchParams;
  const status = (typeof sp.status === "string" && (ORDER_STATUSES as string[]).includes(sp.status) ? sp.status : undefined) as
    | OrderStatus
    | undefined;
  const q = typeof sp.q === "string" ? sp.q : "";
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const [counts, { rows, total, pageCount }] = await Promise.all([statusCounts(), listAdminOrders({ status, q, page })]);
  const tabHref = (s?: string) => `/admin/orders${s ? `?status=${s}` : ""}`;
  const pageHref = (p: number) => `/admin/orders?${new URLSearchParams({ ...(status && { status }), ...(q && { q }), page: String(p) })}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <h1 className="font-serif text-[32px] font-medium">Orders</h1>
        <span className="opacity-65">{total}</span>
      </div>

      <nav className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" aria-label="Order status">
        <Link href={tabHref()} className={`flex h-9 flex-none items-center rounded-full border px-3 text-[13px] ${!status ? "border-navy bg-navy text-cream-2!" : "border-navy/25"}`}>
          All
        </Link>
        {ORDER_STATUSES.map((s) => (
          <Link
            key={s}
            href={tabHref(s)}
            className={`flex h-9 flex-none items-center gap-1.5 rounded-full border px-3 text-[13px] whitespace-nowrap ${
              status === s ? "border-navy bg-navy text-cream-2!" : "border-navy/25"
            }`}
          >
            {ADMIN_STATUS_LABEL[s]}
            <span className={`font-mono text-[11px] ${counts[s] && s !== "cancelled" && s !== "delivered" ? "font-semibold" : "opacity-50"}`}>{counts[s]}</span>
          </Link>
        ))}
      </nav>
      {status && NEXT_STEP[status] && <p className="opacity-70">{NEXT_STEP[status]}</p>}

      <form action="/admin/orders" className="flex gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          name="q"
          defaultValue={q}
          placeholder="Order number, name, phone or email"
          className="h-10 min-w-0 flex-1 rounded-lg border border-navy/30 bg-white/70 px-3 outline-none focus:border-navy"
        />
        <button className="h-10 rounded-lg bg-navy px-4 font-medium text-cream-2">Search</button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-navy/12">
        <table className="w-full min-w-[680px] text-left text-[13.5px]">
          <thead className="bg-sand/60 font-mono text-[11px] tracking-wider uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Order</th>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Items</th>
              <th className="px-3 py-2 text-right font-medium">Estimate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy/8">
            {rows.map((o) => {
              const items = o.order_lines.reduce((n, l) => n + l.qty, 0);
              const unpriced = o.order_lines.filter((l) => l.unit_price == null).length;
              const { waitingDays } = o;
              return (
                <tr key={o.id} className="hover:bg-sand/40">
                  <td className="px-3 py-2">
                    <Link href={`/admin/orders/${o.number}`} className="font-mono font-medium hover:underline">
                      {o.number}
                    </Link>
                    <div className="text-[12px] opacity-60">
                      <LocalTime iso={o.created_at} /> · {o.fulfillment === "pickup" ? "Pickup" : "Delivery"}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {o.contact_name}
                    <div className="text-[12px] opacity-60">{o.contact_phone}</div>
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={o.status} admin />
                    {o.status === "awaiting_approval" && waitingDays >= 1 && (
                      <div className={`mt-0.5 text-[11.5px] ${waitingDays >= 3 ? "font-medium text-red-800" : "opacity-60"}`}>
                        waiting {waitingDays} {waitingDays === 1 ? "day" : "days"}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{items}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatPrice(Number(o.estimate_total))}
                    {unpriced > 0 && <div className="text-[11.5px] text-gold">+{unpriced} on request</div>}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center opacity-70">
                  No orders here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <nav className="flex items-center justify-center gap-3" aria-label="Pagination">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="rounded-lg border border-navy/25 px-3 py-2">
              ← Previous
            </Link>
          )}
          <span className="tabular-nums opacity-70">
            Page {page} of {pageCount}
          </span>
          {page < pageCount && (
            <Link href={pageHref(page + 1)} className="rounded-lg border border-navy/25 px-3 py-2">
              Next →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
