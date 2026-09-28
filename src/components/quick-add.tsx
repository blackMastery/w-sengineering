"use client";

import Link from "next/link";
import { useCart } from "./cart/cart-provider";
import { QtyStepper } from "./qty-stepper";
import type { ProductCard } from "@/lib/types";

/** Always-visible tile action: add a single-variant product, or go pick options. */
export function QuickAdd({ product }: { product: ProductCard }) {
  const { items, add, setQty } = useCart();

  if (!product.quickAdd) {
    return (
      <Link
        href={`/p/${product.slug}`}
        className="inline-flex h-10 items-center rounded-lg border border-navy/35 px-3 text-[13px] font-medium whitespace-nowrap"
      >
        Choose options
      </Link>
    );
  }

  const { variantId } = product.quickAdd;
  const inCart = items.find((i) => i.variantId === variantId);
  if (inCart) {
    return (
      <QtyStepper
        value={inCart.qty}
        min={0}
        size="sm"
        variant="solid"
        onChange={(q) => setQty(variantId, q)}
        label={`Quantity of ${product.name} in cart`}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => add(variantId, 1, product.name)}
      className="h-10 rounded-lg border border-navy/35 px-3 text-[13px] font-medium whitespace-nowrap"
    >
      Add to cart
    </button>
  );
}
