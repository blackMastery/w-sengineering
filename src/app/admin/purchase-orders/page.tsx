import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { requireAdmin } from "@/lib/admin/auth";
import { linesAwaitingPo, listPurchaseOrders } from "@/lib/admin/orders";
import { BuildButton } from "./build-button";

export const metadata = { title: "Purchase orders" };

const TONE = { draft: "bg-gold-light/60", sent: "bg-navy text-cream-2", received: "bg-navy/10" };

export default async function PurchaseOrdersPage() {
  await requireAdmin("/admin/purchase-orders");
  const [pos, waiting] = await Promise.all([listPurchaseOrders(), linesAwaitingPo()]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-[32px] leading-tight font-medium">Purchase orders</h1>

      <section className="flex flex-col gap-2 rounded-xl border border-navy/12 p-4">
        <h2 className="font-serif text-xl font-medium">Ready to order</h2>
        {waiting.lines === 0 ? (
          <p className="opacity-70">Nothing waiting. Confirmed orders show up here.</p>
        ) : (
          <p>
            <b className="font-medium">{waiting.lines}</b> {waiting.lines === 1 ? "line" : "lines"} ({waiting.units} units) from{" "}
            <b className="font-medium">{waiting.orders}</b> {waiting.orders === 1 ? "order" : "orders"} aren’t on a purchase order yet.
          </p>
        )}
        <p className="text-[13px] opacity-65">
          Lines are grouped by SKU onto one draft per supplier. Review the draft, export it for the supplier, then mark it sent.
        </p>
        <BuildButton disabled={waiting.lines === 0} />
      </section>

      {/* Phones: one card per PO, so status and totals are visible without scrolling sideways. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {pos.map((po) => (
          <li key={po.id}>
            <Link href={`/admin/purchase-orders/${po.id}`} className="flex flex-col gap-2 rounded-xl border border-navy/12 p-3 active:bg-sand/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-mono font-medium">{po.number}</span>
                  <div className="text-[12px] opacity-60">
                    <LocalTime iso={po.received_at ?? po.sent_at ?? po.created_at} />
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 font-mono text-[11px] font-medium capitalize ${TONE[po.status]}`}>{po.status}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">{po.suppliers.name}</span>
                <span className="flex-none text-[12.5px] tabular-nums opacity-70">
                  {po.po_lines.length} SKUs · {po.po_lines.reduce((n, l) => n + l.qty, 0)} units
                </span>
              </div>
            </Link>
          </li>
        ))}
        {pos.length === 0 && <li className="rounded-xl border border-navy/12 px-3 py-8 text-center opacity-70">No purchase orders yet.</li>}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-navy/12 md:block">
        <table className="w-full min-w-[560px] text-left text-[13.5px]">
          <thead className="bg-sand/60 font-mono text-[11px] tracking-wider uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">PO</th>
              <th className="px-3 py-2 font-medium">Supplier</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">SKUs</th>
              <th className="px-3 py-2 text-right font-medium">Units</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy/8">
            {pos.map((po) => (
              <tr key={po.id} className="hover:bg-sand/40">
                <td className="px-3 py-2">
                  <Link href={`/admin/purchase-orders/${po.id}`} className="font-mono font-medium hover:underline">
                    {po.number}
                  </Link>
                  <div className="text-[12px] opacity-60">
                    <LocalTime iso={po.received_at ?? po.sent_at ?? po.created_at} />
                  </div>
                </td>
                <td className="px-3 py-2">{po.suppliers.name}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2.5 py-1 font-mono text-[11px] font-medium capitalize ${TONE[po.status]}`}>{po.status}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{po.po_lines.length}</td>
                <td className="px-3 py-2 text-right tabular-nums">{po.po_lines.reduce((n, l) => n + l.qty, 0)}</td>
              </tr>
            ))}
            {pos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center opacity-70">
                  No purchase orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
