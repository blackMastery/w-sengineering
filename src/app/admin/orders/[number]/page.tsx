import Link from "next/link";
import { notFound } from "next/navigation";
import { ProposalView } from "@/components/account/proposal-view";
import { StatusPill } from "@/components/account/status-pill";
import { LocalTime } from "@/components/local-time";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminOrder } from "@/lib/admin/orders";
import { describeOptions, formatPrice } from "@/lib/format";
import { ADMIN_STATUS_LABEL } from "@/lib/order-status";
import { OrderActions } from "./order-actions";
import { PriceLines } from "./price-lines";
import { ProposeChanges } from "./propose-changes";

export async function generateMetadata({ params }: PageProps<"/admin/orders/[number]">) {
  return { title: `Order ${(await params).number}` };
}

const PROPOSAL_STATUS = { proposed: "Waiting for customer", approved: "Approved", rejected: "Rejected", withdrawn: "Withdrawn" };

export default async function AdminOrderPage({ params }: PageProps<"/admin/orders/[number]">) {
  const { number } = await params;
  await requireAdmin(`/admin/orders/${number}`);
  const order = await getAdminOrder(number);
  if (!order) notFound();

  const open = order.proposals.find((p) => p.status === "proposed");
  const past = order.proposals.filter((p) => p.status !== "proposed");
  const unpriced = order.lines.filter((l) => l.unit_price == null).length;
  const canPropose = order.status === "confirmed" || order.status === "ordered_from_supplier";
  // same statuses admin_price_order_lines accepts
  const canPrice = ["pending", "confirmed", "ordered_from_supplier", "received"].includes(order.status);
  const unpricedLines = order.lines.filter((l) => l.unit_price == null);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <Link href="/admin/orders" className="text-[13px] underline opacity-70">
          ← Orders
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-[28px] font-medium">{order.number}</h1>
          <StatusPill status={order.status} admin />
        </div>
        <p className="opacity-70">
          Placed <LocalTime iso={order.created_at} withTime /> · {order.fulfillment === "pickup" ? "Pickup" : "Delivery"}
        </p>
      </div>

      <OrderActions orderId={order.id} number={order.number} status={order.status} />

      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          {open && (
            <section className="flex flex-col gap-3 rounded-xl border border-gold/50 bg-gold-light/15 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-serif text-xl font-medium">Proposed changes: waiting for the customer</h2>
                <span className="text-[12.5px] opacity-70">
                  Sent <LocalTime iso={open.created_at} withTime />
                </span>
              </div>
              {open.note && <p className="italic">“{open.note}”</p>}
              <ProposalView proposed={open.proposed} />
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="font-serif text-2xl font-medium">Items</h2>
            <div className="overflow-x-auto rounded-xl border border-navy/12">
              <table className="w-full text-left text-[13.5px] sm:min-w-[560px]">
                <thead className="bg-sand/60 font-mono text-[11px] tracking-wider uppercase">
                  <tr>
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Qty</th>
                    <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Unit (GYD)</th>
                    <th className="px-3 py-2 text-right font-medium">Line</th>
                    <th className="hidden px-3 py-2 font-medium sm:table-cell">PO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy/8">
                  {order.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2">
                        {l.product ? (
                          <Link href={`/admin/products/${l.product.id}`} className="font-medium hover:underline">
                            {l.name}
                          </Link>
                        ) : (
                          <span className="font-medium">{l.name}</span>
                        )}
                        <div className="font-mono text-[11.5px] opacity-60">
                          {l.sku}
                          {Object.keys(l.option_values).length > 0 && <span className="font-sans"> · {describeOptions(l.option_values)}</span>}
                        </div>
                        {/* Phones: qty, unit price and PO sit under the item instead of in their own columns. */}
                        <div className="mt-0.5 text-[12.5px] tabular-nums sm:hidden">
                          {l.qty} × {l.unit_price == null ? <span className="text-gold">On request</span> : formatPrice(Number(l.unit_price))}
                          {l.po && (
                            <>
                              {" · "}
                              <Link href={`/admin/purchase-orders/${l.po.id}`} className="font-mono text-[12px] underline">
                                {l.po.number}
                              </Link>{" "}
                              <span className="opacity-60">({l.po.status})</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{l.qty}</td>
                      <td className={`hidden px-3 py-2 text-right tabular-nums sm:table-cell ${l.unit_price == null ? "text-gold" : ""}`}>
                        {l.unit_price == null ? "On request" : formatPrice(Number(l.unit_price))}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.unit_price == null ? "—" : formatPrice(Number(l.unit_price) * l.qty)}</td>
                      <td className="hidden px-3 py-2 sm:table-cell">
                        {l.po ? (
                          <Link href={`/admin/purchase-orders/${l.po.id}`} className="font-mono text-[12px] hover:underline">
                            {l.po.number} <span className="font-sans opacity-60">({l.po.status})</span>
                          </Link>
                        ) : (
                          <span className="text-[12px] opacity-50">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-6 text-[14px]">
              <span>
                Estimate <b className="font-serif text-lg font-medium">{formatPrice(Number(order.estimate_total))}</b>
              </span>
            </div>
            {unpriced > 0 && <p className="text-right text-[12.5px] text-gold">{unpriced} “Price on request” {unpriced === 1 ? "line" : "lines"}{canPrice ? " — price them below, or at invoice." : order.status === "awaiting_approval" ? " — price them once the customer answers." : "."}</p>}
          </section>

          {canPrice && unpricedLines.length > 0 && (
            <PriceLines key={unpricedLines.map((l) => l.id).join()} orderId={order.id} number={order.number} lines={unpricedLines} />
          )}

          {canPropose && <ProposeChanges key={order.lines.map((l) => `${l.id}:${l.qty}`).join()} orderId={order.id} number={order.number} lines={order.lines} />}

          {past.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="font-serif text-xl font-medium">Earlier proposals</h2>
              {past.map((p) => (
                <details key={p.id} className="rounded-lg border border-navy/12 px-3 py-2">
                  <summary className="cursor-pointer">
                    {PROPOSAL_STATUS[p.status]} · <LocalTime iso={p.created_at} /> {p.note && <span className="opacity-70">· “{p.note}”</span>}
                  </summary>
                  <div className="mt-2">
                    <ProposalView proposed={p.proposed} />
                  </div>
                </details>
              ))}
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-5">
          <div>
            <h2 className="mb-1 font-mono text-[11px] font-medium tracking-widest opacity-60">CUSTOMER</h2>
            <p className="leading-relaxed">
              {order.contact_name}
              <br />
              <a href={`tel:${order.contact_phone}`} className="underline">
                {order.contact_phone}
              </a>
              {order.contact_email && (
                <>
                  <br />
                  <a href={`mailto:${order.contact_email}`} className="underline">
                    {order.contact_email}
                  </a>
                </>
              )}
            </p>
            <p className="mt-1 text-[12.5px] opacity-60">
              {order.customerOrderCount} {order.customerOrderCount === 1 ? "order" : "orders"} in total
            </p>
          </div>
          <div>
            <h2 className="mb-1 font-mono text-[11px] font-medium tracking-widest opacity-60">{order.fulfillment === "pickup" ? "PICKUP" : "DELIVER TO"}</h2>
            {order.address ? (
              <address className="leading-relaxed not-italic">
                {order.address.line1}
                {order.address.line2 && <><br />{order.address.line2}</>}
                <br />
                {order.address.city}
                {order.address.notes && <span className="mt-1 block text-[12.5px] opacity-70">{order.address.notes}</span>}
              </address>
            ) : (
              <p className="opacity-70">Customer collects.</p>
            )}
          </div>
          {order.notes && (
            <div>
              <h2 className="mb-1 font-mono text-[11px] font-medium tracking-widest opacity-60">CUSTOMER NOTES</h2>
              <p className="whitespace-pre-line">{order.notes}</p>
            </div>
          )}
          <div>
            <h2 className="mb-2 font-mono text-[11px] font-medium tracking-widest opacity-60">TIMELINE</h2>
            <ol className="flex flex-col gap-2.5 border-l-2 border-navy/15 pl-4">
              {order.events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-navy" aria-hidden />
                  <div className="font-medium">{ADMIN_STATUS_LABEL[e.status]}</div>
                  <div className="text-[12px] opacity-65">
                    <LocalTime iso={e.created_at} withTime />
                    {e.actor_id === order.user_id ? " · customer" : e.actor_id ? " · admin" : ""}
                  </div>
                  {e.note && <div className="text-[12.5px]">{e.note}</div>}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
