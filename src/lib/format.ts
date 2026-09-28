// Local currency, whole units. The currency symbol is an open question for the owner;
// change it here only.
const CURRENCY_SYMBOL = "$";
const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export const PRICE_ON_REQUEST = "Price on request";

export function formatPrice(price: number | null | undefined): string {
  if (price == null) return PRICE_ON_REQUEST;
  return `${CURRENCY_SYMBOL}${numberFormat.format(price)}`;
}

export function imageUrl(storagePath: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${storagePath}`;
}

export function describeOptions(optionValues: Record<string, string>): string {
  return Object.entries(optionValues)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}
