import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusPill } from "@/components/account/status-pill";
import { LocalTime } from "@/components/local-time";
import { requireAdmin } from "@/lib/admin/auth";
import { getCustomer } from "@/lib/admin/customers";
import { ORDER_STATUSES } from "@/lib/admin/orders";
import { formatPrice } from "@/lib/format";
import { ADMIN_STATUS_LABEL, type OrderStatus } from "@/lib/order-status";
import { AccountActions, SignInMismatch } from "./account-actions";
import { CustomerNotes } from "./notes";

export async function generateMetadata({ params }: PageProps<"/admin/customers/[id]">) {
  const c = await getCustomer((await params).id);
  return { title: c ? c.full_name || c.email : "Customer" };
}

const label = "mb-1 font-mono text-[11px] font-medium tracking-widest opacity-60";

export default async function AdminCustomerPage({ params, searchParams }: PageProps<"/admin/customers/[id]">) {
  const { id } = await params;
  const admin = await requireAdmin(`/admin/customers/${id}`);
  const c = await getCustomer(id);
  if (!c) notFound();

  const sp = await searchParams;
  const status = typeof sp.status === "string" && (ORDER_STATUSES as string[]).includes(sp.status) ? (sp.status as OrderStatus) : undefined;
  const orders = status ? c.orders.filter((o) => o.status === status) : c.orders;
  const usedStatuses = ORDER_STATUSES.filter((s) => c.statusCounts[s]);
  const tabHref = (s?: OrderStatus) => `/admin/customers/${c.id}${s ? `?status=${s}` : ""}#orders`;

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <Link href="/admin/customers" className="text-[13px] underline opacity-70">
          ← Customers
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="font-serif text-[30px] leading-tight font-medium break-words">{c.full_name || c.email}</h1>
          {c.role === "admin" && <span className="rounded-full bg-navy px-2 py-0.5 font-mono text-[11px] tracking-wider text-cream-2 uppercase">Admin</span>}
          {c.blocked_at && <span className="rounded-full bg-red-800 px-2 py-0.5 font-mono text-[11px] tracking-wider text-white uppercase">Blocked</span>}
        </div>
        {c.full_name && <p className="break-all opacity-70">{c.email}</p>}
      </div>

      {c.blocked_at && (
        <div role="note" className="rounded-xl border border-red-800/30 bg-red-50/60 px-4 py-3">
          <p className="font-medium text-red-900">
            Blocked <LocalTime iso={c.blocked_at} withTime />. They can’t sign in or place orders.
          </p>
          {c.blocked_reason && <p className="mt-0.5 whitespace-pre-line">Reason: {c.blocked_reason}</p>}
        </div>
      )}

      {c.signInMismatch && <SignInMismatch userId={c.id} kind={c.signInMismatch} />}

      <AccountActions
        userId={c.id}
        email={c.email}
        role={c.role}
        blocked={!!c.blocked_at}
        isSelf={c.id === admin.id}
      />

      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-navy/12 p-3">
              <div className={label}>OPEN ESTIMATE</div>
              <div className="font-serif text-xl font-medium tabular-nums">{formatPrice(c.open_estimate)}</div>
              <div className="text-[12px] opacity-60">not yet invoiced</div>
            </div>
            <div className="rounded-xl border border-navy/12 p-3">
              <div className={label}>OPEN ORDERS</div>
              <div className="font-serif text-xl font-medium tabular-nums">{c.open_orders}</div>
              <div className="text-[12px] opacity-60">of {c.total_orders} in total</div>
            </div>
            <div className="col-span-2 rounded-xl border border-navy/12 p-3 sm:col-span-1">
              <div className={label}>INVOICED</div>
              <div className="font-serif text-xl font-medium opacity-50">—</div>
              <div className="text-[12px] opacity-60">comes with invoicing</div>
            </div>
          </section>

          <section id="orders" className="flex scroll-mt-20 flex-col gap-2">
            <h2 className="font-serif text-2xl font-medium">Orders</h2>
            {usedStatuses.length > 1 && (
              <nav className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" aria-label="Order status">
                <Link href={tabHref()} className={`flex h-9 flex-none items-center gap-1.5 rounded-full border px-3 text-[13px] ${!status ? "border-navy bg-navy text-cream-2!" : "border-navy/25"}`}>
                  All <span className="font-mono text-[11px] opacity-70">{c.total_orders}</span>
                </Link>
                {usedStatuses.map((s) => (
                  <Link
                    key={s}
                    href={tabHref(s)}
                    aria-current={status === s ? "page" : undefined}
                    className={`flex h-9 flex-none items-center gap-1.5 rounded-full border px-3 text-[13px] whitespace-nowrap ${
                      status === s ? "border-navy bg-navy text-cream-2!" : "border-navy/25"
                    }`}
                  >
                    {ADMIN_STATUS_LABEL[s]}
                    <span className="font-mono text-[11px] opacity-70">{c.statusCounts[s]}</span>
                  </Link>
                ))}
              </nav>
            )}
            {orders.length === 0 ? (
              <p className="rounded-xl border border-navy/12 px-3 py-6 text-center opacity-70">{c.total_orders ? "No orders with this status." : "No orders yet."}</p>
            ) : (
              <ul className="divide-y divide-navy/8 rounded-xl border border-navy/12">
                {orders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/admin/orders/${o.number}`} className="flex items-start justify-between gap-3 px-3 py-2.5 hover:bg-sand/40 active:bg-sand/40">
                      <div className="min-w-0">
                        <span className="font-mono font-medium">{o.number}</span>
                        <div className="text-[12px] opacity-60">
                          <LocalTime iso={o.created_at} /> · {o.fulfillment === "pickup" ? "Pickup" : "Delivery"} · {o.items} {o.items === 1 ? "item" : "items"}
                        </div>
                      </div>
                      <div className="flex flex-none flex-col items-end gap-1 text-right">
                        <StatusPill status={o.status} admin />
                        <span className="tabular-nums">
                          {formatPrice(o.estimate_total)}
                          {o.unpriced > 0 && <span className="block text-[11.5px] text-gold">+{o.unpriced} on request</span>}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <CustomerNotes customerId={c.id} notes={c.notes} me={admin.id} />
        </div>

        <aside className="flex flex-col gap-5">
          <div>
            <h2 className={label}>PROFILE</h2>
            <p className="leading-relaxed">
              {c.full_name || <span className="opacity-60">No name</span>}
              <br />
              {c.phone ? (
                <a href={`tel:${c.phone}`} className="underline">
                  {c.phone}
                </a>
              ) : (
                <span className="opacity-60">No phone</span>
              )}
              <br />
              <a href={`mailto:${c.email}`} className="break-all underline">
                {c.email}
              </a>
            </p>
          </div>
          <div>
            <h2 className={label}>ACCOUNT</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13.5px]">
              <dt className="opacity-65">Email</dt>
              <dd>{c.email_confirmed_at ? "Confirmed" : <span className="font-medium text-gold">Not confirmed</span>}</dd>
              <dt className="opacity-65">Signed up</dt>
              <dd>
                <LocalTime iso={c.signed_up_at} />
              </dd>
              <dt className="opacity-65">Last sign-in</dt>
              <dd>{c.last_sign_in_at ? <LocalTime iso={c.last_sign_in_at} withTime /> : "Never"}</dd>
            </dl>
          </div>
          {c.addresses.length > 0 && (
            <div>
              <h2 className={label}>DELIVERY ADDRESSES</h2>
              <ul className="flex flex-col gap-2.5">
                {c.addresses.map((a, i) => (
                  <li key={i}>
                    <address className="leading-snug not-italic">
                      {a.address.line1}
                      {a.address.line2 && <>, {a.address.line2}</>}
                      <br />
                      {a.address.city}
                    </address>
                    <div className="text-[12px] opacity-60">
                      {a.uses} {a.uses === 1 ? "order" : "orders"} · last <LocalTime iso={a.last_used} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {c.contacts.length > 0 && (
            <div>
              <h2 className={label}>OTHER NAMES &amp; PHONES ON ORDERS</h2>
              <ul className="flex flex-col gap-2">
                {c.contacts.map((p, i) => (
                  <li key={i}>
                    {p.name} · <a href={`tel:${p.phone}`} className="underline">{p.phone}</a>
                    <div className="text-[12px] opacity-60">
                      {p.uses} {p.uses === 1 ? "order" : "orders"} · last <LocalTime iso={p.last_used} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
