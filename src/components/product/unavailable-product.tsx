import Link from "next/link";
import type { UnavailableProduct as Info } from "@/lib/catalog";
import type { ProductCard } from "@/lib/types";
import { ProductGrid } from "../product-card";
import { ProductImage } from "../product-image";
import { SectionHeading } from "../section-heading";

/** Archived / unpublished product: keep the name and photo, no add to cart, show alternatives. */
export function UnavailableProduct({ product, alternatives }: { product: Info; alternatives: ProductCard[] }) {
  const categoryHref = `/c/${product.group.slug}/${product.category.slug}`;
  return (
    <div className="mx-auto max-w-7xl px-4 pt-5 pb-14 md:px-8 md:pt-6 md:pb-16">
      <nav className="mb-4 flex flex-wrap gap-1.5 text-[13px] opacity-65 md:mb-5" aria-label="Breadcrumb">
        <Link href="/" className="underline">Home</Link>
        <span>/</span>
        <Link href={`/c/${product.group.slug}`} className="underline">{product.group.name}</Link>
        <span>/</span>
        <Link href={categoryHref} className="underline">{product.category.name}</Link>
      </nav>

      <div className="grid items-center gap-6 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:gap-10">
        <ProductImage path={product.image} alt={product.name} sizes="(min-width: 768px) 320px, 100vw" className="aspect-square overflow-hidden rounded-2xl opacity-80 grayscale-[35%]" />
        <div className="flex flex-col items-start gap-3">
          <span className="rounded-full bg-navy/10 px-2.5 py-1 font-mono text-[11.5px] font-medium">NO LONGER AVAILABLE</span>
          <h1 className="font-serif text-[32px] leading-[1.05] font-medium text-balance md:text-[40px]">{product.name}</h1>
          <p className="max-w-lg text-[15px] leading-relaxed opacity-75">
            We don’t sell this item any more. Have a look at similar tools in {product.category.name}, or search by part number.
          </p>
          <Link href={categoryHref} className="mt-1 rounded-lg bg-navy px-5 py-3 text-[14.5px] font-semibold text-cream-2!">
            Browse {product.category.name}
          </Link>
        </div>
      </div>

      {alternatives.length > 0 && (
        <section className="mt-14" aria-labelledby="alternatives">
          <SectionHeading id="alternatives" title="You might need instead" href={categoryHref} />
          <ProductGrid products={alternatives} />
        </section>
      )}
    </div>
  );
}
