"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CartEstimate } from "@/components/cart/cart-estimate";
import { useCartLines, useHydrated } from "@/components/cart/cart-provider";
import { Field, FormError, Input, PrimaryButton, TextArea } from "@/components/form";
import { ProductImage } from "@/components/product-image";
import { cartStore } from "@/lib/cart-store";
import { describeOptions, formatPrice } from "@/lib/format";
import type { Address } from "@/lib/orders";
import { placeOrderAction } from "./actions";

type Defaults = { name: string; phone: string; address: Address | null };

function Choice({
  checked,
  onSelect,
  title,
  detail,
  value,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
  value: string;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${checked ? "border-navy bg-sand ring-1 ring-navy" : "border-navy/25"}`}
    >
      <input type="radio" name="fulfillment" value={value} checked={checked} onChange={onSelect} className="mt-1 accent-navy" />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug opacity-70">{detail}</span>
      </span>
    </label>
  );
}

export function CheckoutForm({ defaults, email }: { defaults: Defaults; email: string | null }) {
  const router = useRouter();
  const { lines, subtotal, priced, onRequest, ready, refresh } = useCartLines();
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">(defaults.address ? "delivery" : "pickup");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();

  if (!hydrated) return <div className="h-64 animate-pulse rounded-2xl bg-navy/5" aria-busy="true" />;
  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 py-6">
        <p className="text-[15px] opacity-75">Your cart is empty.</p>
        <Link href="/c" className="rounded-lg bg-navy px-4.5 py-2.5 text-sm font-medium text-cream-2!">
          Browse products
        </Link>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const get = (k: string) => String(form.get(k) ?? "");
    setPending(true);
    setError(null);
    const result = await placeOrderAction({
      items: cartStore.getSnapshot().map((i) => ({ variantId: i.variantId, qty: i.qty })),
      fulfillment,
      name: get("name"),
      phone: get("phone"),
      address:
        fulfillment === "delivery"
          ? { line1: get("line1"), line2: get("line2"), city: get("city"), notes: get("address_notes") }
          : null,
      notes: get("notes"),
    });
    if (result.ok) {
      cartStore.clear();
      router.push(`/account/orders/${result.number}?placed=1`);
      return;
    }
    setPending(false);
    setError(result.error);
    if (result.reason === "unavailable") refresh();
    if (result.reason === "signin") router.push("/login?next=/checkout");
  }

  return (
    <form onSubmit={onSubmit} className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_380px] md:gap-10">
      <div className="flex flex-col gap-7">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 font-serif text-2xl font-medium">Pickup or delivery</legend>
          <Choice
            value="pickup"
            checked={fulfillment === "pickup"}
            onSelect={() => setFulfillment("pickup")}
            title="Pickup"
            detail="Collect from W&S when your order arrives. We’ll let you know when it’s ready."
          />
          <Choice
            value="delivery"
            checked={fulfillment === "delivery"}
            onSelect={() => setFulfillment("delivery")}
            title="Delivery"
            detail="We deliver to your address. The delivery fee is added on your invoice."
          />
        </fieldset>

        {fulfillment === "delivery" && (
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-3 font-serif text-2xl font-medium">Delivery address</legend>
            <Field label="Street address">
              <Input name="line1" autoComplete="address-line1" required maxLength={200} defaultValue={defaults.address?.line1} />
            </Field>
            <Field label="Apartment, building, etc. (optional)">
              <Input name="line2" autoComplete="address-line2" maxLength={200} defaultValue={defaults.address?.line2} />
            </Field>
            <Field label="Town / city">
              <Input name="city" autoComplete="address-level2" required maxLength={100} defaultValue={defaults.address?.city} />
            </Field>
            <Field label="Directions for the driver (optional)">
              <TextArea name="address_notes" maxLength={500} defaultValue={defaults.address?.notes} />
            </Field>
          </fieldset>
        )}

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 font-serif text-2xl font-medium">Your details</legend>
          <Field label="Full name">
            <Input name="name" autoComplete="name" required maxLength={120} defaultValue={defaults.name} />
          </Field>
          <Field label="Phone" hint="We’ll call if we need to check anything about your order.">
            <Input name="phone" type="tel" autoComplete="tel" required maxLength={40} inputMode="tel" defaultValue={defaults.phone} />
          </Field>
          {email && <p className="text-[13.5px] opacity-70">Signed in as {email}</p>}
          <Field label="Notes for W&S (optional)">
            <TextArea name="notes" maxLength={1000} placeholder="Anything we should know about this order" />
          </Field>
        </fieldset>
      </div>

      <aside className="flex flex-col gap-4 rounded-2xl border border-navy/15 bg-white/50 p-5 md:sticky md:top-24">
        <h2 className="font-serif text-2xl font-medium">Your order</h2>
        <ul className="flex flex-col divide-y divide-navy/10">
          {lines.map((l) => (
            <li key={l.variantId} className="flex gap-3 py-3">
              <ProductImage path={l.info?.image ?? null} alt="" sizes="56px" className="size-14 flex-none overflow-hidden rounded-lg" />
              <div className="min-w-0 flex-1 text-[13.5px]">
                <div className="leading-snug font-medium">{l.info?.productName ?? "…"}</div>
                <div className="font-mono text-[11.5px] opacity-60">
                  {l.info?.sku} × {l.qty}
                </div>
                {l.info && Object.keys(l.info.optionValues).length > 0 && (
                  <div className="text-[12px] opacity-65">{describeOptions(l.info.optionValues)}</div>
                )}
              </div>
              <span className={`flex-none text-right text-[13px] ${l.info?.price == null ? "max-w-20 leading-tight text-gold-ink" : "font-medium"}`}>
                {l.info ? formatPrice(l.info.price == null ? null : l.info.price * l.qty) : ""}
              </span>
            </li>
          ))}
        </ul>
        <CartEstimate subtotal={subtotal} priced={priced} onRequest={onRequest} />
        <FormError>{error}</FormError>
        <PrimaryButton type="submit" pending={pending || !ready}>
          {pending ? "Placing order request…" : "Place order request"}
        </PrimaryButton>
        <Link href="/cart" className="text-center text-[13.5px] underline">
          Edit cart
        </Link>
      </aside>
    </form>
  );
}
