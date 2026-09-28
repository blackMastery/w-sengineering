// Store prices are Guyanese dollars (GYD), whole units. Shown as "GYD 5,299" so they can't be
// confused with the USD supplier costs admins work with.
const priceFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "GYD",
  currencyDisplay: "code",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export const PRICE_ON_REQUEST = "Price on request";

export function formatPrice(price: number | null | undefined): string {
  if (price == null) return PRICE_ON_REQUEST;
  return priceFormat.format(price);
}

/** USD supplier costs (admin only). */
export function formatUsd(amount: number): string {
  return `US$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function imageUrl(storagePath: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${storagePath}`;
}

export function describeOptions(optionValues: Record<string, string>): string {
  return Object.entries(optionValues)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}
