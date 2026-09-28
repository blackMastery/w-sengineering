import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getCheckoutDefaults } from "@/lib/orders";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage() {
  const user = await requireUser("/checkout");
  const defaults = await getCheckoutDefaults(user.id);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 pb-14 md:px-8 md:pt-8 md:pb-16">
      <h1 className="font-serif text-[34px] font-medium md:text-[44px]">Place order request</h1>
      <p className="mt-1 mb-6 max-w-2xl text-[14.5px] leading-relaxed opacity-75">
        Nothing is charged now. We review your request, order the items from the supplier, and invoice you for what arrives.
      </p>
      <CheckoutForm defaults={defaults} email={user.email} />
    </div>
  );
}
