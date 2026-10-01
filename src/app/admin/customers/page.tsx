import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { requireAdmin } from "@/lib/admin/auth";
import {
  CUSTOMER_FILTERS,
  CUSTOMER_SORTS,
  type CustomerFilter,
  type CustomerRow,
  type CustomerSort,
  customerFilterCounts,
  listCustomers,
} from "@/lib/admin/customers";
import { formatPrice } from "@/lib/format";

export const metadata = { title: "Customers" };

const pick = <T extends string>(v: unknown, keys: Record<T, string>, fallback: T): T =>
  typeof v === "string" && v in keys ? (v as T) : fallback;

function Tags({ c }: { c: CustomerRow }) {
  return (
    <>
      {c.role === "admin" && <span className="rounded-full bg-navy px-2 py-0.5 font-mono text-[10.5px] tracking-wider text-cream-2 uppercase">Admin</span>}
      {c.blocked_at && <span className="rounded-full bg-red-800 px-2 py-0.5 font-mono text-[10.5px] tracking-wider text-white uppercase">Blocked</span>}
      {!c.email_confirmed_at && <span className="rounded-full border border-gold px-2 py-0.5 font-mono text-[10.5px] tracking-wider uppercase">Unconfirmed</span>}
    </>
  );
}

const orderCount = (c: CustomerRow) =>
  c.total_orders === 0 ? "No orders" : `${c.open_orders} open / ${c.total_orders} ${c.total_orders === 1 ? "order" : "orders"}`;

export default async function AdminCustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  await requireAdmin("/admin/customers");
  const sp = await searchParams;
  const filter = pick<CustomerFilter>(sp.filter, CUSTOMER_FILTERS, "all");
  const sort = pick<CustomerSort>(sp.sort, CUSTOMER_SORTS, "last_order");
  const q = typeof sp.q === "string" ? sp.q : "";
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const [counts, { rows, total, pageCount }] = await Promise.all([customerFilterCounts(), listCustomers({ q, filter, sort, page })]);

  const href = (over: Record<string, string>) => {
    const params = new URLSearchParams({ ...(q && { q }), filter, sort, ...over });
    if (params.get("filter") === "all") params.delete("filter");
    if (params.get("sort") === "last_order") params.delete("sort");
    if (params.get("page") === "1") params.delete("page");
    if (!params.get("q")) params.delete("q");
    return `/admin/customers${params.size ? `?${params}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <h1 className="font-serif text-[32px] leading-tight font-medium">Customers</h1>
        <span className="opacity-65">{total}</span>
      </div>

      <nav className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" aria-label="Customer filter">
        {(Object.keys(CUSTOMER_FILTERS) as CustomerFilter[]).map((f) => (
          <Link
            key={f}
            href={href({ filter: f, page: "1" })}
            aria-current={filter === f ? "page" : undefined}
            className={`flex h-9 flex-none items-center gap-1.5 rounded-full border px-3 text-[13px] whitespace-nowrap ${
              filter === f ? "border-navy bg-navy text-cream-2!" : "border-navy/25"
            }`}
          >
            {CUSTOMER_FILTERS[f]}
            <span className="font-mono text-[11px] opacity-70">{counts[f]}</span>
          </Link>
        ))}
      </nav>

      <form action="/admin/customers" className="flex flex-wrap gap-2">
        {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        <input
          name="q"
          type="search"
          defaultValue={q}
          aria-label="Search customers"
          placeholder="Name, email or phone"
          className="h-10 min-w-0 flex-1 basis-48 rounded-lg border border-navy/30 bg-white/70 px-3 text-[15px] outline-none focus:border-navy"
        />
        <select name="sort" defaultValue={sort} aria-label="Sort" className="h-10 min-w-0 flex-1 basis-40 rounded-lg border border-navy/30 bg-white/70 px-2 sm:flex-none">
          {(Object.keys(CUSTOMER_SORTS) as CustomerSort[]).map((s) => (
            <option key={s} value={s}>
              {CUSTOMER_SORTS[s]}
            </option>
          ))}
        </select>
        <button className="h-10 rounded-lg bg-navy px-4 font-medium text-cream-2">Search</button>
        {q && (
          <Link href={href({ q: "", page: "1" })} className="flex h-10 items-center px-2 underline">
            Clear
          </Link>
        )}
      </form>

      {/* Phones: one card per customer. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((c) => (
          <li key={c.id}>
            <Link href={`/admin/customers/${c.id}`} className="flex flex-col gap-1.5 rounded-xl border border-navy/12 p-3 active:bg-sand/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.full_name || <span className="opacity-60">No name</span>}</div>
                  <div className="truncate text-[12.5px] opacity-70">{c.email}</div>
                  {c.phone && <div className="text-[12.5px] opacity-70">{c.phone}</div>}
                </div>
                <div className="flex flex-none flex-col items-end gap-1">
                  <Tags c={c} />
                </div>
              </div>
              <div className="flex items-end justify-between gap-3 text-[12.5px]">
                <div className="opacity-70">
                  {orderCount(c)}
                  {c.last_order_at && (
                    <>
                      {" · last "}
                      <LocalTime iso={c.last_order_at} />
                    </>
                  )}
                </div>
                {c.open_estimate > 0 && <div className="flex-none tabular-nums">{formatPrice(Number(c.open_estimate))}</div>}
              </div>
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="rounded-xl border border-navy/12 px-3 py-8 text-center opacity-70">No customers match.</li>}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-navy/12 md:block">
        <table className="w-full min-w-[720px] text-left text-[13.5px]">
          <thead className="bg-sand/60 font-mono text-[11px] tracking-wider uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 text-right font-medium">Orders (open / total)</th>
              <th className="px-3 py-2 text-right font-medium">Open estimate</th>
              <th className="px-3 py-2 font-medium">Last order</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy/8">
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-sand/40">
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link href={`/admin/customers/${c.id}`} className="font-medium hover:underline">
                      {c.full_name || <span className="opacity-60">No name</span>}
                    </Link>
                    <Tags c={c} />
                  </div>
                  <div className="text-[12px] opacity-60">{c.email}</div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{c.phone || <span className="opacity-40">—</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {c.total_orders === 0 ? <span className="opacity-40">—</span> : `${c.open_orders} / ${c.total_orders}`}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{c.open_estimate > 0 ? formatPrice(Number(c.open_estimate)) : <span className="opacity-40">—</span>}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {c.last_order_at ? <LocalTime iso={c.last_order_at} /> : <span className="opacity-40">—</span>}
                  <div className="text-[12px] opacity-60">
                    Joined <LocalTime iso={c.signed_up_at} />
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center opacity-70">
                  No customers match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <nav className="flex items-center justify-center gap-3" aria-label="Pagination">
          {page > 1 && (
            <Link href={href({ page: String(page - 1) })} className="rounded-lg border border-navy/25 px-3 py-2">
              ← Previous
            </Link>
          )}
          <span className="tabular-nums opacity-70">
            Page {page} of {pageCount}
          </span>
          {page < pageCount && (
            <Link href={href({ page: String(page + 1) })} className="rounded-lg border border-navy/25 px-3 py-2">
              Next →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
