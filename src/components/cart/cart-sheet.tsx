"use client";

import Link from "next/link";
import { CloseIcon } from "../icons";
import { useOverlay } from "../use-overlay";
import { CartEstimate } from "./cart-estimate";
import { CartLineRow } from "./cart-line-row";
import { useCart, useCartLines } from "./cart-provider";

/** Bottom sheet on phones, right-hand drawer from md up. */
export function CartSheet() {
  const { sheetOpen, closeSheet, count } = useCart();
  const { lines, subtotal, priced, onRequest } = useCartLines(sheetOpen);

  useOverlay(sheetOpen, closeSheet);

  if (!sheetOpen) return null;
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Cart">
      <div className="absolute inset-0 animate-fade-in bg-navy-deep/45" onClick={closeSheet} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] animate-sheet-up flex-col rounded-t-2xl bg-cream md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[420px] md:animate-fade-in md:rounded-none">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-navy/20 md:hidden" />
        <div className="flex items-center justify-between border-b border-navy/15 px-5 py-3 md:py-5">
          <span className="font-serif text-2xl font-medium">Cart ({count})</span>
          <button type="button" onClick={closeSheet} className="-mr-2 grid size-11 place-items-center" aria-label="Close cart">
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5">
          {lines.length === 0 ? (
            <div className="py-8 text-[14.5px] opacity-75">Your cart is empty.</div>
          ) : (
            lines.map((l) => <CartLineRow key={l.variantId} line={l} compact onNavigate={closeSheet} />)
          )}
        </div>
        {lines.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-navy/15 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <CartEstimate subtotal={subtotal} priced={priced} onRequest={onRequest} />
            <Link href="/checkout" className="rounded-lg bg-navy py-3.5 text-center text-[15px] font-semibold text-cream-2!">
              Place order request
            </Link>
            <Link href="/cart" className="rounded-lg border border-navy/35 py-3 text-center text-[14.5px] font-medium">
              View cart
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
