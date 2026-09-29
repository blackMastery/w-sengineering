import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import {
  ADMIN_PAGE_SIZE,
  getTaxonomy,
  listAdminProducts,
  PRODUCT_FLAGS,
  productStatusCounts,
  type ProductFlag,
  type ProductStatus,
} from "@/lib/admin/data";
import { ProductList } from "./product-list";

export const metadata = { title: "Products" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const TABS: { key: ProductStatus | "active"; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "published", label: "Published" },
  { key: "draft", label: "Drafts" },
  { key: "archived", label: "Archived" },
];

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requireAdmin("/admin/products");
  const sp = await searchParams;
  const q = first(sp.q) ?? "";
  const categoryId = first(sp.category) ?? "";
  const flag = (first(sp.flag) ?? "") as ProductFlag | "";
  const statusParam = first(sp.status) ?? "active";
  const status = (TABS.some((t) => t.key === statusParam) ? statusParam : "active") as ProductStatus | "active";
  const page = Math.max(1, Number.parseInt(first(sp.page) ?? "1", 10) || 1);

  const [{ rows, total }, taxonomy, counts] = await Promise.all([
    listAdminProducts({ q, categoryId: categoryId || undefined, flag: flag in PRODUCT_FLAGS ? (flag as ProductFlag) : undefined, status, page }),
    getTaxonomy(),
    productStatusCounts(),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const href = (over: Record<string, string>) => {
    const params = new URLSearchParams({ ...(q && { q }), ...(categoryId && { category: categoryId }), ...(flag && { flag }), status, ...over });
    if (params.get("status") === "active") params.delete("status");
    if (params.get("page") === "1") params.delete("page");
    return `/admin/products${params.size ? `?${params}` : ""}`;
  };
  const countFor = (k: ProductStatus | "active") => (k === "active" ? counts.draft + counts.published : counts[k]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-serif text-[32px] leading-tight font-medium">Products</h1>
          <span className="opacity-65">{total}</span>
        </div>
        <Link href="/admin/products/new" className="flex h-10 items-center rounded-lg bg-navy px-4 font-semibold text-cream-2!">
          + New product
        </Link>
      </div>

      {sp.deleted === "1" && (
        <p role="status" className="rounded-lg bg-sand px-4 py-3">
          Product deleted.
        </p>
      )}

      <nav className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="Product status">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={href({ status: t.key, page: "1" })}
            aria-current={status === t.key ? "page" : undefined}
            className={`flex h-9 flex-none items-center gap-1.5 rounded-full border px-3 text-[13px] ${status === t.key ? "border-navy bg-navy text-cream-2!" : "border-navy/25"}`}
          >
            {t.label}
            <span className="font-mono text-[11px] opacity-70">{countFor(t.key)}</span>
          </Link>
        ))}
      </nav>

      <form className="flex flex-wrap gap-2" action="/admin/products">
        {status !== "active" && <input type="hidden" name="status" value={status} />}
        <input
          name="q"
          defaultValue={q}
          placeholder="Name or SKU"
          className="h-10 min-w-0 flex-1 basis-48 rounded-lg border border-navy/30 bg-white/70 px-3 text-[15px] outline-none focus:border-navy"
        />
        <select name="category" defaultValue={categoryId} className="h-10 min-w-0 flex-1 basis-40 rounded-lg border border-navy/30 bg-white/70 px-2 sm:flex-none">
          <option value="">All categories</option>
          {taxonomy.groups.map((g) => (
            <optgroup key={g.id} label={g.name}>
              {taxonomy.categories
                .filter((c) => c.group_id === g.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <select name="flag" defaultValue={flag} className="h-10 min-w-0 flex-1 basis-40 rounded-lg border border-navy/30 bg-white/70 px-2 sm:flex-none">
          <option value="">Any flag</option>
          {Object.entries(PRODUCT_FLAGS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <button className="h-10 rounded-lg bg-navy px-4 font-medium text-cream-2">Filter</button>
        {(q || categoryId || flag) && (
          <Link href={status === "active" ? "/admin/products" : `/admin/products?status=${status}`} className="flex h-10 items-center px-2 underline">
            Clear
          </Link>
        )}
      </form>

      <ProductList key={`${status}:${page}:${q}:${categoryId}:${flag}`} rows={rows} taxonomy={taxonomy} tab={status} />

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
