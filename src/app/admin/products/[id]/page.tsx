import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminProduct, getTaxonomy } from "@/lib/admin/data";
import { ImagesEditor } from "./images-editor";
import { OptionsEditor } from "./options-editor";
import { ProductForm } from "./product-form";
import { RelatedEditor } from "./related-editor";
import { StatusBar, StatusPillProduct } from "./status-bar";
import { VariantsEditor } from "./variants-editor";

export async function generateMetadata({ params }: PageProps<"/admin/products/[id]">): Promise<Metadata> {
  await requireAdmin();
  const product = await getAdminProduct((await params).id);
  return { title: product?.name ?? "Product" };
}

function Section({ title, id, children, aside, hint }: { title: string; id: string; children: ReactNode; aside?: ReactNode; hint?: string }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 border-t border-navy/12 pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={id} className="font-serif text-2xl font-medium">
          {title}
        </h2>
        {aside}
      </div>
      {hint && <p className="-mt-2 text-[13px] opacity-65">{hint}</p>}
      {children}
    </section>
  );
}

export default async function AdminProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  await requireAdmin(`/admin/products/${id}`);
  const [product, taxonomy] = await Promise.all([getAdminProduct(id), getTaxonomy()]);
  if (!product) notFound();
  const orderable = product.variants.filter((v) => v.is_orderable).length;
  const live = product.status === "published" && orderable > 0;

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <Link href="/admin/products" className="text-[13px] underline opacity-70">
          ← Products
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-serif text-[28px] leading-tight font-medium md:text-[30px]">{product.name}</h1>
          <StatusPillProduct status={product.status} />
          {live && (
            <Link href={`/p/${product.slug}`} className="text-[13px] underline" target="_blank">
              View in store ↗
            </Link>
          )}
        </div>
        <p className="font-mono text-[11.5px] break-all opacity-55">
          /p/{product.slug}
          {product.catalog_page != null && ` · catalog p. ${product.catalog_page}`}
        </p>
      </div>

      {sp.created === "1" && (
        <p role="status" className="rounded-lg bg-sand px-4 py-3">
          Draft created. Add options and variants, a photo, then publish. Customers can’t see it until then.
        </p>
      )}
      {sp.duplicated === "1" && (
        <p role="status" className="rounded-lg bg-sand px-4 py-3">
          Copy created as a draft. Rename it, give its variants SKUs, then publish.
        </p>
      )}

      <StatusBar productId={product.id} status={product.status} problems={product.publishProblems} hasHistory={product.hasHistory} />

      <Section title="Details" id="details">
        <ProductForm product={product} brands={taxonomy.brands} categories={taxonomy.categories} />
      </Section>

      <Section title="Options" id="options" hint="What customers choose between, e.g. Size and Handle. Values are offered in this order.">
        <OptionsEditor productId={product.id} options={product.options} variants={product.variants} orderedVariantIds={product.orderedVariantIds} />
      </Section>

      <Section
        title="Variants"
        id="variants"
        aside={
          <span className="text-[13px] opacity-65">
            {orderable} of {product.variants.length} orderable
          </span>
        }
        hint="One row per part number. Leave the price empty for “Price on request”. Untick Orderable to discontinue."
      >
        <VariantsEditor
          productId={product.id}
          status={product.status}
          options={product.options}
          variants={product.variants}
          orderedVariantIds={product.orderedVariantIds}
        />
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
