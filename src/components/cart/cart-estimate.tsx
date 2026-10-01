import { formatPrice } from "@/lib/format";

/** Estimated total. Orders are requests: the final amount is set on the invoice. */
export function CartEstimate({
  subtotal,
  priced,
  onRequest,
  tone = "light",
}: {
  subtotal: number;
  priced: number; // lines with a price
  onRequest: number; // lines without one
  tone?: "light" | "dark";
}) {
  const muted = tone === "dark" ? "opacity-80" : "opacity-70";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span>Estimated total</span>
        {priced > 0 ? (
          <span className="font-serif text-2xl font-medium">{formatPrice(subtotal)}</span>
        ) : (
          <span className="font-serif text-xl font-medium">Priced on invoice</span>
        )}
      </div>
      {onRequest > 0 && priced > 0 && (
        <p className={`text-[13px] ${tone === "dark" ? "text-gold-light" : "text-gold-ink"}`}>
          {onRequest === 1 ? "1 item is" : `${onRequest} items are`} “Price on request” and not included. We’ll price{" "}
          {onRequest === 1 ? "it" : "them"} on your invoice.
        </p>
      )}
      <p className={`text-[13px] leading-relaxed ${muted}`}>
        This is an estimate. We order from the supplier after you place your request, then invoice only what arrives. Any
        delivery fee is added on the invoice. Nothing is charged online.
      </p>
    </div>
  );
}
