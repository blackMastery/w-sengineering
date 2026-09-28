import Link from "next/link";
import { ProductImage } from "@/components/product-image";
import { requireAdmin } from "@/lib/admin/auth";
import { ADMIN_PAGE_SIZE, getTaxonomy, listAdminProducts, PRODUCT_FLAGS, type ProductFlag } from "@/lib/admin/data";

export const metadata = { title: "Products" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requireAdmin("/admin/products");
  const sp = await searchParams;
  const q = first(sp.q) ?? "";
  const categoryId = first(sp.category) ?? "";
  const flag = (first(sp.flag) ?? "") as ProductFlag | "";
  const page = Math.max(1, Number.parseInt(first(sp.page) ?? "1", 10) || 1);

  const [{ rows, total }, { categories }] = await Promise.all([
    listAdminProducts({ q, categoryId: categoryId || undefined, flag: flag in PRODUCT_FLAGS ? (flag as ProductFlag) : undefined, page }),
    getTaxonomy(),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const href = (p: number) => {
    const params = new URLSearchParams({ ...(q && { q }), ...(categoryId && { category: categoryId }), ...(flag && { flag }), page: String(p) });
    return `/admin/products?${params}`;
  };
  const groups = [...new Set(categories.map((c) => c.group))];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <h1 className="font-serif text-[32px] font-medium">Products</h1>
        <span className="opacity-65">{total}</span>
      </div>

      <form className="flex flex-wrap gap-2" action="/admin/products">
        <input
          name="q"
          defaultValue={q}
          placeholder="Name or SKU"
          className="h-10 min-w-0 flex-1 basis-48 rounded-lg border border-navy/30 bg-white/70 px-3 text-[15px] outline-none focus:border-navy"
        />
        <select name="category" defaultValue={categoryId} className="h-10 rounded-lg border border-navy/30 bg-white/70 px-2">
          <option value="">All categories</option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {categories
                .filter((c) => c.group === g)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <select name="flag" defaultValue={flag} className="h-10 rounded-lg border border-navy/30 bg-white/70 px-2">
          <option value="">Any status</option>
          {Object.entries(PRODUCT_FLAGS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <button className="h-10 rounded-lg bg-navy px-4 font-medium text-cream-2">Filter</button>
        {(q || categoryId || flag) && (
          <Link href="/admin/products" className="flex h-10 items-center px-2 underline">
            Clear
          </Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-xl border border-navy/12">
        <table className="w-full min-w-[720px] text-left text-[13.5px]">
          <thead className="bg-sand/60 font-mono text-[11px] tracking-wider uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 text-right font-medium">Variants</th>
              <th className="px-3 py-2 text-right font-medium">Unpriced</th>
              <th className="px-3 py-2 text-right font-medium">Photos</th>
              <th className="px-3 py-2 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy/8">
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-sand/40">
                <td className="px-3 py-2">
                  <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3">
                    <ProductImage path={p.image} alt="" sizes="40px" className="size-10 flex-none overflow-hidden rounded-md" />
                    <span className="min-w-0">
                      <span className="block font-medium hover:underline">{p.name}</span>
                      <span className="block truncate font-mono text-[11px] opacity-55">
                        {p.brand} · {p.skus?.split(" ").slice(0, 4).join(" ")}
                        {(p.skus?.split(" ").length ?? 0) > 4 ? " …" : ""}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2 opacity-80">
                  {p.category}
                  <span className="block text-[11.5px] opacity-60">{p.group_name}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {p.orderable_count}
                  {p.orderable_count !== p.variant_count && <span className="opacity-50"> / {p.variant_count}</span>}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${p.unpriced_count ? "text-gold" : "opacity-40"}`}>{p.unpriced_count}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${p.image_count ? "" : "text-gold"}`}>{p.image_count}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1 font-mono text-[10.5px]">
                    {p.needs_review && <span className="rounded bg-gold-light/60 px-1.5 py-0.5">REVIEW</span>}
                    {p.is_featured && <span className="rounded bg-gold px-1.5 py-0.5 text-navy-deep">BEST</span>}
                    {p.is_new && <span className="rounded bg-navy px-1.5 py-0.5 text-cream-2">NEW</span>}
                    {p.orderable_count === 0 && <span className="rounded bg-navy/10 px-1.5 py-0.5">DISCONTINUED</span>}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center opacity-70">
                  No products match.
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
