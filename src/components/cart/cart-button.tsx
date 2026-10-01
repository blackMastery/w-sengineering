"use client";

import { BagIcon } from "../icons";
import { useCart } from "./cart-provider";

export function CartButton() {
  const { count, openSheet } = useCart();
  return (
    <button
      type="button"
      onClick={openSheet}
      className="ml-1 flex h-11 items-center gap-1.5 rounded-lg bg-cream-2 px-2.5 text-sm font-medium text-navy md:ml-0 md:gap-2 md:px-3.5"
      aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`}
    >
      <BagIcon className="size-5 md:hidden" />
      <span className="hidden md:inline">Cart</span>
      <span className={`min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums ${count ? "bg-gold text-navy-deep" : "bg-navy/60 text-cream-2"}`}>
        {count}
      </span>
    </button>
  );
}
