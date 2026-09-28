import type { Metadata } from "next";
import { CartView } from "./cart-view";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 pb-14 md:px-8 md:pt-8 md:pb-16">
      <h1 className="mb-5 font-serif text-[34px] font-medium md:mb-6 md:text-[44px]">Your cart</h1>
      <CartView />
    </div>
  );
}
