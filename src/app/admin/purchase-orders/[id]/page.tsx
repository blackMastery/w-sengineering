import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusPill } from "@/components/account/status-pill";
import { LocalTime } from "@/components/local-time";
import { requireAdmin } from "@/lib/admin/auth";
import { getPurchaseOrder } from "@/lib/admin/orders";
import { describeOptions } from "@/lib/format";
import { PoActions } from "./po-actions";

export const metadata = { title: "Purchase order" };

export default async function PurchaseOrderPage({ params }: PageProps<"/admin/purchase-orders/[id]">) {
  const { id } = await params;
  await requireAdmin(`/admin/purchase-orders/${id}`);
  const po = await getPurchaseOrder(id);
  if (!po) notFound();
  const units = po.lines.reduce((n, l) => n + l.qty, 0);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <Link href="/admin/purchase-orders" className="text-[13px] underline opacity-70">
          ← Purchase orders
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-[28px] font-medium">{po.number}</h1>
          <span className="rounded-full bg-sand px-2.5 py-1 font-mono text-[11px] font-medium capitalize">{po.status}</span>
        </div>
        <p className="opacity-70">
          {po.suppliers.name} · created <LocalTime iso={po.created_at} />
          {po.sent_at && (
            <>
              {" "}
              · sent <LocalTime iso={po.sent_at} />
            </>
          )}
          {po.received_at && (
            <>
              {" "}
              · received <LocalTime iso={po.received_at} />
            </>
          )}
        </p>
      </div>

      <PoActions poId={po.id} status={po.status} />
      {po.status === "draft" && (
        <p className="text-[13px] opacity-70">
          Newly confirmed orders are added to this draft when you use “Add to draft purchase order”. Cancelled orders drop off it automatically.
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-2xl font-medium">
          {po.lines.length} SKUs · {units} units
        </h2>
        <div className="overflow-x-auto rounded-xl border border-navy/12">
          <table className="w-full min-w-[560px] text-left text-[13.5px]">
            <thead className="bg-sand/60 font-mono text-[11px] tracking-wider uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/8">
              {po.lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2 font-mono font-medium">{l.sku}</td>
                  <td className="px-3 py-2">
                    {l.name}
                    <div className="text-[12px] opacity-60">{describeOptions(l.option_values)}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{l.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-serif text-xl font-medium">Orders on this PO</h2>
        <ul className="divide-y divide-navy/8 rounded-xl border border-navy/12">
          {po.orders.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <Link href={`/admin/orders/${o.number}`} className="font-mono font-medium hover:underline">
                {o.number}
              </Link>
              <span className="min-w-0 flex-1 truncate">{o.contact_name}</span>
              <StatusPill status={o.status} admin />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
