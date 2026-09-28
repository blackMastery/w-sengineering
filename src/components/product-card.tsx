import Link from "next/link";
import { formatPrice } from "@/lib/format";
import type { ProductCard as Card } from "@/lib/types";
import { ProductImage } from "./product-image";
import { QuickAdd } from "./quick-add";

export function ProductCard({ product, priority = false }: { product: Card; priority?: boolean }) {
  const href = `/p/${product.slug}`;
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <Link href={href} className="relative block overflow-hidden rounded-xl" tabIndex={-1} aria-hidden>
        <ProductImage
          path={product.image}
          alt=""
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="aspect-4/3"
          priority={priority}
        />
        {product.isFeatured && (
          <span className="absolute top-2 right-2 rounded-full bg-gold px-2 py-0.5 font-mono text-[10.5px] font-medium text-navy-deep">
            BEST SELLER
          </span>
        )}
        {!product.isFeatured && product.isNew && (
          <span className="absolute top-2 right-2 rounded-full bg-navy px-2 py-0.5 font-mono text-[10.5px] font-medium text-gold-light">
            NEW
          </span>
        )}
      </Link>
      <Link href={href} className="min-w-0">
        <div className="truncate font-mono text-[11.5px] opacity-60">
          {product.brand}
          {product.quickAdd ? ` · ${product.quickAdd.sku}` : ` · ${product.variantCount} options`}
        </div>
        <div className="mt-0.5 line-clamp-2 text-[14.5px] leading-snug font-medium">{product.name}</div>
      </Link>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <span className={product.price == null ? "text-[13px] opacity-75" : "font-serif text-lg font-medium"}>
          {product.price != null && product.hasFrom && <span className="font-sans text-xs opacity-60">From </span>}
          {formatPrice(product.price)}
        </span>
        <QuickAdd product={product} />
      </div>
    </div>
  );
}

export function ProductGrid({ products, priorityCount = 0 }: { products: Card[]; priorityCount?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3.5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-5">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < priorityCount} />
      ))}
    </div>
  );
}
