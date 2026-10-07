import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { FindByPartButton } from "@/components/layout/find-by-part-button";
import { ProductGrid } from "@/components/product-card";
import { ProductImage } from "@/components/product-image";
import { SectionHeading } from "@/components/section-heading";
import { getGroups, getHomeLists } from "@/lib/catalog";
import { absoluteUrl, SITE_DESCRIPTION, SITE_LOGO, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const siteJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: absoluteUrl(SITE_LOGO),
      description: SITE_DESCRIPTION,
      areaServed: { "@type": "Country", name: "Guyana" },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default async function Home() {
  const [groups, { bestSellers, newArrivals }] = await Promise.all([getGroups(), getHomeLists()]);
  const heroPhotos = bestSellers.filter((p) => p.image).slice(0, 4);

  return (
    <>
      <JsonLd data={siteJsonLd} />
      <section className="mx-auto max-w-7xl px-4 pt-4 md:px-8 md:pt-7">
        <div className="on-dark grid overflow-hidden rounded-2xl bg-navy text-cream-2 md:min-h-[420px] md:grid-cols-[1.15fr_1fr]">
          <div className="flex flex-col justify-center gap-4 px-6 py-9 md:gap-5 md:p-14">
            <span className="font-mono text-[11px] font-medium tracking-[.12em] text-gold-light md:text-xs">
              AUTHORIZED KRAFT TOOL CO. RESELLER
            </span>
            <h1 className="font-serif text-[40px] leading-[1.02] font-medium text-balance md:text-[60px]">
              The tools the trades trust, ordered for you.
            </h1>
            <p className="max-w-md text-[15px] leading-relaxed opacity-85 md:text-base">
              Concrete, masonry, drywall, tile and layout tools from Kraft Tool Co., W. Rose, Sands Level, Gator Tools and
              Hi-Craft. Place an order request and we source it from the supplier, then invoice only what arrives.
            </p>
            <div className="mt-1 flex flex-wrap gap-3">
              <Link href="/c" className="rounded-lg bg-cream-2 px-5 py-3.5 text-[14.5px] font-semibold text-navy!">
                Shop all categories
              </Link>
              <FindByPartButton className="rounded-lg border border-cream-2/45 px-5 py-3.5 text-[14.5px] font-medium" />
            </div>
          </div>
          {heroPhotos.length === 4 && (
            <div className="hidden grid-cols-2 gap-3 bg-navy-soft p-5 md:grid">
              {heroPhotos.map((p) => (
                <Link key={p.id} href={`/p/${p.slug}`} className="overflow-hidden rounded-xl" aria-label={p.name}>
                  <ProductImage path={p.image} alt="" sizes="25vw" className="h-full min-h-40" priority />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-10 md:px-8 md:pt-12" aria-labelledby="shop-by-category">
        <SectionHeading id="shop-by-category" title="Shop by category" href="/c" />
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
          {groups.map((g, i) => (
            <Link key={g.id} href={`/c/${g.slug}`} className="group flex flex-col gap-2.5">
              {/* first row is above the fold on phones (the hero photos are desktop-only) */}
              <ProductImage
                path={g.image}
                alt=""
                sizes="(min-width: 1024px) 16vw, 50vw"
                className="aspect-square overflow-hidden rounded-xl"
                priority={i < 2}
              />
              <div className="flex justify-between gap-2 text-[14.5px]">
                <span className="font-medium group-hover:underline">{g.name}</span>
                <span className="opacity-55">{g.count}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {bestSellers.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-10 md:px-8 md:pt-12" aria-labelledby="best-sellers">
          <SectionHeading id="best-sellers" title="Best sellers" href="/c" linkLabel="Shop all" />
          <ProductGrid products={bestSellers} />
        </section>
      )}

      {newArrivals.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pt-10 pb-14 md:px-8 md:pt-12 md:pb-16" aria-labelledby="new-arrivals">
          <SectionHeading id="new-arrivals" title="New arrivals" />
          <ProductGrid products={newArrivals} />
        </section>
      )}
    </>
  );
}
