"use client";

import Link from "next/link";
import { CartEstimate } from "@/components/cart/cart-estimate";
import { CartLineRow } from "@/components/cart/cart-line-row";
import { useCartLines, useHydrated } from "@/components/cart/cart-provider";

export function CartView() {
  const { lines, subtotal, priced, onRequest } = useCartLines();
  const hydrated = useHydrated();

  if (!hydrated) return <div className="h-48 animate-pulse rounded-2xl bg-navy/5" aria-busy="true" />;
  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 border-t border-navy/15 py-10">
        <span className="font-serif text-2xl font-medium">Your cart is empty.</span>
        <Link href="/c" className="rounded-lg bg-navy px-4.5 py-2.5 text-sm font-medium text-cream-2!">
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_340px] md:gap-10">
      <div className="border-t border-navy/15">
        {lines.map((l) => (
          <CartLineRow key={l.variantId} line={l} />
        ))}
        <Link href="/c" className="mt-4 inline-block text-sm underline">
          ← Continue shopping
        </Link>
      </div>
      <aside className="flex flex-col gap-4 rounded-2xl bg-navy p-6 text-[14.5px] text-cream-2 md:sticky md:top-24">
        <span className="font-serif text-2xl font-medium">Order summary</span>
        <CartEstimate subtotal={subtotal} priced={priced} onRequest={onRequest} tone="dark" />
        <Link href="/checkout" className="rounded-lg bg-cream-2 py-3.5 text-center text-[15px] font-semibold text-navy!">
          Place order request
        </Link>
      </aside>
    </div>
  );
}
