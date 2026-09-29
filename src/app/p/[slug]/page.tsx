import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ProductGrid } from "@/components/product-card";
import { ProductView } from "@/components/product/product-view";
import { SectionHeading } from "@/components/section-heading";
import { UnavailableProduct } from "@/components/product/unavailable-product";
import { getCategoryNeighbours, getProduct, getRelated, resolveMissingProduct } from "@/lib/catalog";
import { imageUrl } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const slug = (await params).slug;
  const product = await getProduct(slug);
  if (!product) {
    const missing = await resolveMissingProduct(slug);
    return missing && "unavailable" in missing
      ? { title: `${missing.unavailable.name} (no longer available)`, robots: { index: false } }
      : { title: "Product not found" };
  }
  return {
    title: product.name,
    description: product.description ?? `${product.name} by ${product.brand.name}. ${product.features.slice(0, 2).join(". ")}`,
    openGraph: product.images[0] ? { images: [imageUrl(product.images[0].path)] } : undefined,
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
