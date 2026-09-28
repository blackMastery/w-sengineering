import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusPill } from "@/components/account/status-pill";
import { LocalTime } from "@/components/local-time";
import { requireUser } from "@/lib/auth";
import { describeOptions, formatPrice } from "@/lib/format";
import { STATUS_HELP, STATUS_LABEL } from "@/lib/order-status";
import { getOrder } from "@/lib/orders";
import { ProposalView } from "@/components/account/proposal-view";
import { CancelOrderButton } from "./cancel-button";
import { RespondButtons } from "./respond-buttons";

export async function generateMetadata({ params }: PageProps<"/account/orders/[number]">): Promise<Metadata> {
  return { title: `Order ${(await params).number}`, robots: { index: false } };
}

export default async function OrderPage({ params, searchParams }: PageProps<"/account/orders/[number]">) {
  const [{ number }, query] = await Promise.all([params, searchParams]);
  const user = await requireUser(`/account/orders/${number}`);
  const order = await getOrder(user.id, number);
  if (!order) notFound();

  const justPlaced = query.placed === "1";
  const hasPriced = order.lineCount > order.unpricedCount;

  return (
    <div className="mx-auto max-w-4xl px-4 pt-6 pb-14 md:px-8 md:pt-8 md:pb-16">
      <nav className="mb-4 flex gap-1.5 text-[13px] opacity-65" aria-label="Breadcrumb">
        <Link href="/account" className="underline">Your account</Link>
        <span>/</span>
        <span>{order.number}</span>
      </nav>

      {justPlaced && (
        <div className="mb-6 rounded-2xl bg-navy p-5 text-cream-2 md:p-6">
          <p className="font-mono text-[11px] font-medium tracking-widest text-gold-light">ORDER REQUEST PLACED</p>
          <p className="mt-2 font-serif text-2xl font-medium">Thank you. We’ve received <span className="whitespace-nowrap">{order.number}</span>.</p>
          <p className="mt-2 text-[14px] leading-relaxed opacity-85">
            We’ll review your request and order the items from the supplier. Nothing has been charged. You’ll get an invoice
            for what arrives, and you can follow the status here.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-[28px] font-medium md:text-[34px]">{order.number}</h1>
        <StatusPill status={order.status} />
      </div>
      <p className="mt-1 text-[14px] opacity-70">
        Placed <LocalTime iso={order.createdAt} withTime /> · {order.fulfillment === "pickup" ? "Pickup" : "Delivery"}
      </p>
      <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed">{STATUS_HELP[order.status]}</p>
      {order.status === "pending" && (
        <div className="mt-4 flex">
          <CancelOrderButton orderId={order.id} number={order.number} />
        </div>
      )}

      {order.status === "awaiting_approval" && order.proposal && (
        <section className="mt-6 flex flex-col gap-4 rounded-2xl border-2 border-gold bg-gold-light/15 p-4 md:p-5" aria-labelledby="changes">
          <div>
            <h2 id="changes" className="font-serif text-2xl font-medium">
              Please review these changes
            </h2>
            <p className="mt-1 text-[14px] leading-relaxed opacity-80">
              The supplier couldn’t fill your order exactly as placed. Approve to continue with the changes below, or reject to
              cancel the request.
            </p>
            {order.proposal.note && <p className="mt-3 rounded-lg bg-white/60 px-3 py-2 text-[14.5px]">“{order.proposal.note}”</p>}
          </div>
          <ProposalView proposed={order.proposal.proposed} />
          <RespondButtons orderId={order.id} number={order.number} />
        </section>
      )}

      <div className="mt-8 grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_280px]">
        <section aria-labelledby="items">
          <h2 id="items" className="mb-2 font-serif text-2xl font-medium">Items</h2>
          <ul className="border-t border-navy/15">
            {order.lines.map((l) => {
              const options = describeOptions(l.optionValues);
              return (
                <li key={l.id} className="flex justify-between gap-4 border-b border-navy/10 py-3.5">
                  <div className="min-w-0">
                    {l.productSlug ? (
                      <Link href={`/p/${l.productSlug}?sku=${encodeURIComponent(l.sku)}`} className="text-[14.5px] font-medium hover:underline">
                        {l.name}
                      </Link>
                    ) : (
                      <span className="text-[14.5px] font-medium">{l.name}</span>
                    )}
                    <div className="font-mono text-[11.5px] opacity-60">
                      {l.sku} · Qty {l.qty}
                      {l.unitPrice != null && ` · ${formatPrice(l.unitPrice)} each`}
                    </div>
                    {options && <div className="text-[12.5px] opacity-70">{options}</div>}
                  </div>
                  <span className={`flex-none text-right ${l.unitPrice == null ? "max-w-24 text-[12.5px] leading-tight text-gold" : "font-serif text-base font-medium"}`}>
                    {formatPrice(l.unitPrice == null ? null : l.unitPrice * l.qty)}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-col gap-1.5 text-[14px]">
            {order.invoiceTotal != null ? (
              <div className="flex justify-between font-serif text-xl font-medium">
                <span>Invoice total</span>
                <span>{formatPrice(order.invoiceTotal)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between font-serif text-xl font-medium">
                  <span>Estimated total</span>
                  <span>{hasPriced ? formatPrice(order.estimateTotal) : "Priced on invoice"}</span>
                </div>
                <p className="text-[13px] leading-relaxed opacity-70">
                  {order.unpricedCount > 0 && hasPriced && `${order.unpricedCount} “Price on request” ${order.unpricedCount === 1 ? "item is" : "items are"} not included. `}
                  Your invoice covers only what arrives from the supplier
                  {order.fulfillment === "delivery" ? ", plus the delivery fee" : ""}.
                </p>
              </>
            )}
          </div>
        </section>

        <aside className="flex flex-col gap-6 text-[14px]">
          <div>
            <h2 className="mb-1.5 font-mono text-[11px] font-medium tracking-widest opacity-60">
              {order.fulfillment === "pickup" ? "PICKUP" : "DELIVER TO"}
            </h2>
            {order.address ? (
              <address className="leading-relaxed not-italic">
                {order.address.line1}
                {order.address.line2 && <><br />{order.address.line2}</>}
                <br />
                {order.address.city}
                {order.address.notes && <span className="mt-1 block text-[13px] opacity-70">{order.address.notes}</span>}
              </address>
            ) : (
              <p className="leading-relaxed opacity-80">We’ll let you know when your order is ready to collect.</p>
            )}
          </div>
          <div>
            <h2 className="mb-1.5 font-mono text-[11px] font-medium tracking-widest opacity-60">CONTACT</h2>
            <p className="leading-relaxed">
              {order.contactName}
              <br />
              {order.contactPhone}
            </p>
          </div>
          {order.notes && (
            <div>
              <h2 className="mb-1.5 font-mono text-[11px] font-medium tracking-widest opacity-60">YOUR NOTES</h2>
              <p className="leading-relaxed whitespace-pre-line">{order.notes}</p>
            </div>
          )}
          <div>
            <h2 className="mb-2 font-mono text-[11px] font-medium tracking-widest opacity-60">TIMELINE</h2>
            <ol className="flex flex-col gap-3 border-l-2 border-navy/15 pl-4">
              {order.events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-navy" aria-hidden />
                  <div className="font-medium">{STATUS_LABEL[e.status]}</div>
                  <div className="text-[12.5px] opacity-65">
                    <LocalTime iso={e.createdAt} withTime />
                    {e.note && ` · ${e.note}`}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
