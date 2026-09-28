import Link from "next/link";
import { Suspense } from "react";
import { getListing, type SortKey } from "@/lib/catalog";
import type { Group } from "@/lib/types";
import { ProductGrid } from "../product-card";
import { SortSelect } from "./sort-select";

export type ListingParams = { brand?: string; sort?: string; page?: string };
type RawParams = Record<string, string | string[] | undefined>;

const SORTS: SortKey[] = ["name", "price-asc", "price-desc"];
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function pill(active: boolean) {
  return `flex h-10 flex-none items-center rounded-full border px-4 text-[13.5px] font-medium whitespace-nowrap ${
    active ? "border-navy bg-navy text-cream-2!" : "border-navy/25 bg-cream"
  }`;
}

/** Group or subcategory product grid with subcategory tabs, brand pills, sort and pagination. */
export async function CategoryListing({
  group,
  categorySlug,
  searchParams,
}: {
  group: Group;
  categorySlug?: string;
  searchParams: RawParams;
}) {
  const params: ListingParams = {
    brand: first(searchParams.brand),
    sort: first(searchParams.sort),
    page: first(searchParams.page),
  };
  const category = categorySlug ? group.categories.find((c) => c.slug === categorySlug) : undefined;
  const sort = SORTS.includes(params.sort as SortKey) ? (params.sort as SortKey) : "name";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const listing = await getListing({
    categoryIds: category ? [category.id] : group.categories.map((c) => c.id),
    brand: params.brand,
    sort,
    page,
  });

  const base = category ? `/c/${group.slug}/${category.slug}` : `/c/${group.slug}`;
  const href = (next: ListingParams) => {
    const merged = { brand: params.brand, sort: params.sort, ...next };
    const qs = new URLSearchParams(Object.entries(merged).filter((e): e is [string, string] => !!e[1])).toString();
    return qs ? `${base}?${qs}` : base;
  };
  const title = category?.name ?? group.name;
  const showBrands = listing.brands.length > 1;

  return (
    <>
      <div className="mx-auto max-w-7xl px-4 pt-5 md:px-8 md:pt-6">
        <nav className="flex flex-wrap gap-1.5 text-[13px] opacity-65" aria-label="Breadcrumb">
          <Link href="/" className="underline">Home</Link>
          <span>/</span>
          {category ? (
            <>
              <Link href={`/c/${group.slug}`} className="underline">{group.name}</Link>
              <span>/</span>
              <span>{category.name}</span>
            </>
          ) : (
            <span>{group.name}</span>
          )}
        </nav>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3.5">
          <h1 className="font-serif text-[34px] leading-tight font-medium md:text-[44px]">{title}</h1>
          <span className="text-sm opacity-65">{listing.total} products</span>
          <div className="ml-auto">
            <Suspense>
              <SortSelect value={sort} />
            </Suspense>
          </div>
        </div>
      </div>

      <div className="sticky top-14 z-20 mt-3 border-b border-navy/12 bg-cream/92 backdrop-blur-md md:top-16 md:mt-4">
        <div className="mx-auto max-w-7xl md:px-8">
          {group.categories.length > 1 && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pt-3 md:px-0" role="tablist" aria-label="Subcategories">
              <Link href={`/c/${group.slug}`} className={pill(!category)} role="tab" aria-selected={!category}>
                All
              </Link>
              {group.categories.map((c) => (
                <Link
                  key={c.id}
                  href={`/c/${group.slug}/${c.slug}`}
                  className={pill(category?.id === c.id)}
                  role="tab"
                  aria-selected={category?.id === c.id}
                >
                  {c.name} <span className="ml-1.5 font-mono text-[11px] opacity-60">{c.count}</span>
                </Link>
              ))}
            </div>
          )}
          {showBrands ? (
            <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2.5 md:px-0" aria-label="Brand">
              <Link href={href({ brand: undefined, page: undefined })} className={pill(!params.brand)} scroll={false}>
                All brands
              </Link>
              {listing.brands.map((b) => (
                <Link key={b.slug} href={href({ brand: b.slug, page: undefined })} className={pill(params.brand === b.slug)} scroll={false}>
                  {b.name} <span className="ml-1.5 font-mono text-[11px] opacity-60">{b.count}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="h-3" />
          )}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pt-6 pb-14 md:px-8 md:pt-7 md:pb-16">
        {listing.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 py-16 text-center">
            <span className="font-serif text-2xl font-medium">Nothing matches those filters.</span>
            <Link href={base} className="mt-2 rounded-lg bg-navy px-4.5 py-2.5 text-sm font-medium text-cream-2!">
              Clear filters
            </Link>
          </div>
        ) : (
          <ProductGrid products={listing.items} priorityCount={4} />
        )}

        {listing.pageCount > 1 && (
          <nav className="mt-10 flex items-center justify-center gap-2 text-sm" aria-label="Pagination">
            {listing.page > 1 && (
              <Link href={href({ page: String(listing.page - 1) })} className="flex h-11 items-center rounded-lg border border-navy/25 px-4">
                ← Previous
              </Link>
            )}
            <span className="px-3 tabular-nums opacity-70">
              Page {listing.page} of {listing.pageCount}
            </span>
            {listing.page < listing.pageCount && (
              <Link href={href({ page: String(listing.page + 1) })} className="flex h-11 items-center rounded-lg border border-navy/25 px-4">
                Next →
              </Link>
            )}
          </nav>
        )}
      </div>
    </>
  );
}
