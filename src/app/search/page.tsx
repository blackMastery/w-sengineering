import type { Metadata } from "next";
import Link from "next/link";
import { FindByPartButton } from "@/components/layout/find-by-part-button";
import { ProductGrid } from "@/components/product-card";
import { searchCatalog } from "@/lib/catalog";

export async function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  const q = (await searchParams).q;
  return { title: typeof q === "string" && q ? `Search: ${q}` : "Search", robots: { index: false } };
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const raw = (await searchParams).q;
  const q = (typeof raw === "string" ? raw : "").trim();
  const { products, categories } = await searchCatalog(q);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-5 pb-14 md:px-8 md:pt-6 md:pb-16">
      <h1 className="font-serif text-[34px] leading-tight font-medium md:text-[44px]">
        {q ? <>Results for “{q}”</> : "Search"}
      </h1>
      {q.length >= 2 && <p className="mt-1 text-sm opacity-65">{products.length === 48 ? "48+" : products.length} products</p>}

      {categories.length > 0 && (
        <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto">
          {categories.map((c) => (
            <Link key={c.href} href={c.href} className="flex h-10 flex-none items-center rounded-full bg-sand px-4 text-[13.5px]">
              {c.name} <span className="ml-1.5 opacity-55">{c.count}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6">
        {products.length > 0 ? (
          <ProductGrid products={products} priorityCount={4} />
        ) : (
          <div className="flex flex-col items-start gap-3 py-10">
            <p className="text-[15px] opacity-75">
              {q.length < 2 ? "Type at least two characters." : "No products match that. Check the part number, or try a simpler word like “trowel”."}
            </p>
            <FindByPartButton className="rounded-lg bg-navy px-4.5 py-2.5 text-sm font-medium text-cream-2" />
          </div>
        )}
      </div>
    </div>
  );
}
