"use client";

import Link from "next/link";
import { describeOptions, formatPrice } from "@/lib/format";
import { ProductImage } from "../product-image";
import { QtyStepper } from "../qty-stepper";
import { useCart, type CartLine } from "./cart-provider";

export function CartLineRow({ line, compact = false, onNavigate }: { line: CartLine; compact?: boolean; onNavigate?: () => void }) {
  const { setQty, remove } = useCart();
  const { info } = line;

  if (!info) {
    return (
      <div className="flex gap-3.5 border-b border-navy/10 py-4">
        <div className="stripes size-16 flex-none animate-pulse rounded-lg" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3.5 w-3/4 rounded bg-navy/10" />
          <div className="h-3 w-1/3 rounded bg-navy/10" />
        </div>
      </div>
    );
  }

  const options = describeOptions(info.optionValues);
  const lineTotal = info.price == null ? null : info.price * line.qty;
  return (
    <div className="flex gap-3.5 border-b border-navy/10 py-4">
      <Link href={`/p/${info.productSlug}?sku=${encodeURIComponent(info.sku)}`} onClick={onNavigate} className="flex-none">
        <ProductImage path={info.image} alt="" sizes="96px" className={`${compact ? "size-16" : "size-20 sm:size-24"} overflow-hidden rounded-lg`} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex justify-between gap-3">
          <Link href={`/p/${info.productSlug}?sku=${encodeURIComponent(info.sku)}`} onClick={onNavigate} className="min-w-0">
            <div className="text-[14.5px] leading-snug font-medium">{info.productName}</div>
            <div className="mt-0.5 font-mono text-[11.5px] opacity-60">{info.sku}</div>
            {options && <div className="mt-0.5 text-[12.5px] opacity-70">{options}</div>}
          </Link>
          <span className={`flex-none text-right ${lineTotal == null ? "max-w-24 text-[12.5px] leading-tight text-gold" : "font-serif text-base font-medium"}`}>
            {formatPrice(lineTotal)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <QtyStepper size="sm" value={line.qty} onChange={(q) => setQty(line.variantId, q)} label={`Quantity of ${info.productName}`} />
          <div className="flex items-center gap-3">
            {info.price != null && line.qty > 1 && <span className="text-xs opacity-60">{formatPrice(info.price)} each</span>}
            <button type="button" onClick={() => remove(line.variantId)} className="h-10 px-1 text-[13px] underline opacity-70">
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
