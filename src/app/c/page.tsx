import type { Metadata } from "next";
import Link from "next/link";
import { ProductImage } from "@/components/product-image";
import { getGroups } from "@/lib/catalog";

export const metadata: Metadata = { title: "All categories" };

export default async function AllCategoriesPage() {
  const groups = await getGroups();
  return (
    <div className="mx-auto max-w-7xl px-4 pt-5 pb-14 md:px-8 md:pt-6 md:pb-16">
      <nav className="flex gap-1.5 text-[13px] opacity-65" aria-label="Breadcrumb">
        <Link href="/" className="underline">Home</Link>
        <span>/</span>
        <span>All categories</span>
      </nav>
      <h1 className="mt-2 font-serif text-[34px] font-medium md:text-[44px]">All categories</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <div key={g.id} className="flex gap-4 rounded-2xl border border-navy/12 p-4">
            <Link href={`/c/${g.slug}`} className="flex-none" tabIndex={-1} aria-hidden>
              <ProductImage path={g.image} alt="" sizes="96px" className="size-24 overflow-hidden rounded-xl" />
            </Link>
            <div className="flex min-w-0 flex-col gap-1">
              <Link href={`/c/${g.slug}`} className="font-serif text-2xl font-medium hover:underline">
                {g.name}
              </Link>
              <span className="font-mono text-xs opacity-55">{g.count} products</span>
              <ul className="mt-1.5 flex flex-col text-sm">
                {g.categories.map((c) => (
                  <li key={c.id}>
                    <Link href={`/c/${g.slug}/${c.slug}`} className="flex min-h-9 items-center gap-2 hover:underline">
                      {c.name} <span className="font-mono text-[11px] opacity-50">{c.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
