import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminProduct, getTaxonomy } from "@/lib/admin/data";
import { ImagesEditor } from "./images-editor";
import { ProductForm } from "./product-form";
import { RelatedEditor } from "./related-editor";
import { VariantsEditor } from "./variants-editor";

export async function generateMetadata({ params }: PageProps<"/admin/products/[id]">): Promise<Metadata> {
  await requireAdmin();
  const product = await getAdminProduct((await params).id);
  return { title: product?.name ?? "Product" };
}

function Section({ title, id, children, aside }: { title: string; id: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 border-t border-navy/12 pt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="font-serif text-2xl font-medium">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default async function AdminProductPage({ params }: PageProps<"/admin/products/[id]">) {
  const { id } = await params;
  await requireAdmin(`/admin/products/${id}`);
  const [product, taxonomy] = await Promise.all([getAdminProduct(id), getTaxonomy()]);
  if (!product) notFound();
  const orderable = product.variants.filter((v) => v.is_orderable).length;

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <Link href="/admin/products" className="text-[13px] underline opacity-70">
          ← Products
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-serif text-[30px] leading-tight font-medium">{product.name}</h1>
          {orderable > 0 ? (
            <Link href={`/p/${product.slug}`} className="text-[13px] underline" target="_blank">
              View in store ↗
            </Link>
          ) : (
            <span className="text-[13px] text-gold">Hidden: every variant is discontinued</span>
          )}
        </div>
        <p className="font-mono text-[11.5px] opacity-55">
          /{product.slug}
          {product.catalog_page != null && ` · catalog p. ${product.catalog_page}`}
        </p>
      </div>

      <Section title="Details" id="details">
        <ProductForm product={product} brands={taxonomy.brands} categories={taxonomy.categories} />
      </Section>

      <Section title="Variants & pricing" id="variants" aside={<span className="text-[13px] opacity-65">{orderable} of {product.variants.length} orderable</span>}>
        <VariantsEditor variants={product.variants} />
      </Section>

      <Section title="Photos" id="photos">
        <ImagesEditor product={product} />
      </Section>

      <Section title="Often bought together" id="related">
        <RelatedEditor product={product} />
      </Section>
    </div>
  );
}
