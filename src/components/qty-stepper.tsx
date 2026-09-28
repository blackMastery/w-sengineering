"use client";

import { MAX_QTY } from "@/lib/cart-store";

export function QtyStepper({
  value,
  onChange,
  min = 1,
  variant = "outline",
  size = "md",
  label = "Quantity",
}: {
  value: number;
  onChange: (qty: number) => void;
  min?: number;
  variant?: "outline" | "solid";
  size?: "sm" | "md";
  label?: string;
}) {
  const tone = variant === "solid" ? "bg-navy text-cream-2" : "border border-navy/35 text-navy";
  const h = size === "sm" ? "h-10" : "h-12";
  const w = size === "sm" ? "w-9" : "w-11";
  return (
    <div className={`inline-flex items-center rounded-lg ${tone} ${h}`} role="group" aria-label={label}>
      <button
        type="button"
        className={`${w} h-full text-lg disabled:opacity-30`}
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <span className="min-w-7 text-center text-sm font-medium tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={`${w} h-full text-lg disabled:opacity-30`}
        onClick={() => onChange(value + 1)}
        disabled={value >= MAX_QTY}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}
