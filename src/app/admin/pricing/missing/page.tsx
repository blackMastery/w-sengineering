import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { missingPrices } from "@/lib/admin/data";
import { describeOptions } from "@/lib/format";

export const metadata = { title: "Price on request" };

/** Letters at the start of a SKU, e.g. CFE435PF → CFE, for jumping to bulk entry. */
const letterPrefix = (sku: string) => sku.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? sku.slice(0, 3);

export default async function MissingPricesPage({ searchParams }: PageProps<"/admin/pricing/missing">) {
  await requireAdmin("/admin/pricing/missing");
  const sp = await searchParams;
  const prefix = (typeof sp.prefix === "string" ? sp.prefix : "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const { rows, total, pageCount } = await missingPrices(page, prefix);
  const href = (p: number) => `/admin/pricing/missing?${new URLSearchParams({ ...(prefix && { prefix }), page: String(p) })}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <h1 className="font-serif text-[32px] font-medium">Price on request</h1>
        <span className="opacity-65">{total} orderable variants</span>
      </div>
      <p className="max-w-2xl opacity-75">
        These can still be ordered; customers see “Price on request” and you price them on the invoice. Enter a GYD
        price to show it in the store.
      </p>
      <form action="/admin/pricing/missing" className="flex flex-wrap gap-2">
        <input
          name="prefix"
          defaultValue={prefix}
          placeholder="SKU prefix"
          className="h-10 w-40 rounded-lg border border-navy/30 bg-white/70 px-3 font-mono uppercase outline-none focus:border-navy"
        />
        <button className="h-10 rounded-lg bg-navy px-4 font-medium text-cream-2">Filter</button>
        {prefix && (
          <Link href={`/admin/pricing/bulk?prefix=${prefix}`} className="flex h-10 items-center rounded-lg border border-navy/35 px-4 font-medium">
            Enter prices for {prefix}…
          </Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-xl border border-navy/12">
        <table className="w-full min-w-[560px] text-left text-[13px]">
          <thead className="bg-sand/60 font-mono text-[11px] tracking-wider uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Product / options</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-navy/8">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-1.5 font-mono font-medium">{r.sku}</td>
                <td className="px-3 py-1.5">
                  <Link href={`/admin/products/${r.products.id}`} className="hover:underline">
                    {r.products.name}
                  </Link>
                  <div className="text-[12px] opacity-60">{describeOptions(r.option_values)}</div>
                </td>
                <td className="px-3 py-1.5 text-right">
                  <Link href={`/admin/pricing/bulk?prefix=${letterPrefix(r.sku)}`} className="text-[12.5px] whitespace-nowrap underline">
                    Bulk {letterPrefix(r.sku)}…
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center opacity-70">
                  Everything orderable has a price.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <nav className="flex items-center justify-center gap-3" aria-label="Pagination">
          {page > 1 && (
            <Link href={href(page - 1)} className="rounded-lg border border-navy/25 px-3 py-2">
              ← Previous
            </Link>
          )}
          <span className="tabular-nums opacity-70">
            Page {page} of {pageCount}
          </span>
          {page < pageCount && (
            <Link href={href(page + 1)} className="rounded-lg border border-navy/25 px-3 py-2">
              Next →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
