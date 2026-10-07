import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { ProductGrid } from "@/components/product-card";
import { ProductView } from "@/components/product/product-view";
import { SectionHeading } from "@/components/section-heading";
import { UnavailableProduct } from "@/components/product/unavailable-product";
import { getCategoryNeighbours, getProduct, getRelated, resolveMissingProduct } from "@/lib/catalog";
import { imageUrl } from "@/lib/format";
import { absoluteUrl, breadcrumbJsonLd, metaDescription, openGraph, SITE_URL } from "@/lib/site";
import type { ProductDetail } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const slug = (await params).slug;
  const product = await getProduct(slug);
  if (!product) {
    const missing = await resolveMissingProduct(slug);
    return missing && "unavailable" in missing
      ? { title: `${missing.unavailable.name} (no longer available)`, robots: { index: false } }
      : { title: "Product not found" };
  }
  const description = metaDescription(
    product.description ?? `${product.name} by ${product.brand.name}. ${product.features.slice(0, 2).join(". ")}`,
  );
  const path = `/p/${product.slug}`;
  return {
    title: product.name,
    description,
    alternates: { canonical: path },
    openGraph: openGraph({
      title: product.name,
      description,
      url: path,
      ...(product.images.length > 0 && {
        images: product.images.slice(0, 4).map((i) => ({ url: imageUrl(i.path), alt: product.name })),
      }),
    }),
  };
}

/** schema.org Product. No availability: W&S keeps no stock (orders from the supplier). */
function productJsonLd(product: ProductDetail) {
  const priced = product.variants.filter((v) => v.price != null);
  const single = product.variants.length === 1 ? product.variants[0] : null;
  const url = absoluteUrl(`/p/${product.slug}`);
  const prices = priced.map((v) => v.price as number);
  const offers =
    priced.length === 0
      ? undefined
      : single
        ? { "@type": "Offer", url, price: single.price, priceCurrency: "GYD", sku: single.sku, seller: { "@id": `${SITE_URL}/#organization` } }
        : {
            "@type": "AggregateOffer",
            url,
            priceCurrency: "GYD",
            lowPrice: Math.min(...prices),
            highPrice: Math.max(...prices),
            offerCount: priced.length,
          };
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    url,
    description: product.description ?? (product.features.join(". ") || undefined),
    image: product.images.map((i) => imageUrl(i.path)),
    brand: { "@type": "Brand", name: product.brand.name },
    category: `${product.group.name} > ${product.category.name}`,
    ...(single && { sku: single.sku, mpn: single.sku }),
    ...(offers && { offers }),
  };
}

export default async function ProductPage({ params, searchParams }: PageProps<"/p/[slug]">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const product = await getProduct(slug);
  if (!product) {
    // Renamed → its new URL; archived/unpublished after being live → "no longer available".
    const missing = await resolveMissingProduct(slug);
    if (!missing) notFound();
    if ("redirectTo" in missing) permanentRedirect(`/p/${missing.redirectTo}${typeof query.sku === "string" ? `?sku=${encodeURIComponent(query.sku)}` : ""}`);
    const info = missing.unavailable;
    return <UnavailableProduct product={info} alternatives={await getCategoryNeighbours(info.category.id, info.id)} />;
  }
  const related = await getRelated(product);
  const sku = typeof query.sku === "string" ? query.sku : undefined;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-5 pb-14 md:px-8 md:pt-6 md:pb-16">
      <JsonLd data={productJsonLd(product)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: product.group.name, path: `/c/${product.group.slug}` },
          { name: product.category.name, path: `/c/${product.group.slug}/${product.category.slug}` },
          { name: product.name, path: `/p/${product.slug}` },
        ])}
      />
      <nav className="mb-4 flex flex-wrap gap-1.5 text-[13px] opacity-65 md:mb-5" aria-label="Breadcrumb">
        <Link href="/" className="underline">Home</Link>
        <span>/</span>
        <Link href={`/c/${product.group.slug}`} className="underline">{product.group.name}</Link>
        <span>/</span>
        <Link href={`/c/${product.group.slug}/${product.category.slug}`} className="underline">{product.category.name}</Link>
      </nav>

      {/* key: a new ?sku= from search or cart links resets the picker */}
      <ProductView key={sku ?? ""} product={product} initialSku={sku} />

      {related.products.length > 0 && (
        <section className="mt-14" aria-labelledby="related">
          <SectionHeading
            id="related"
            title={related.curated ? "Often bought together" : `More in ${product.category.name}`}
            href={related.curated ? undefined : `/c/${product.group.slug}/${product.category.slug}`}
          />
          <ProductGrid products={related.products} />
        </section>
      )}
    </div>
  );
}
