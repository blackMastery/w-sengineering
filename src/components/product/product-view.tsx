"use client";

import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import type { ProductDetail } from "@/lib/types";
import { pickerAxes, resolvePicker, selectionsFor } from "@/lib/variant-picker";
import { useCart } from "../cart/cart-provider";
import { QtyStepper } from "../qty-stepper";
import { Gallery } from "./gallery";

function optionClass(selected: boolean, enabled: boolean) {
  if (selected) return "border-navy bg-navy text-cream-2";
  if (!enabled) return "border-navy/15 text-navy/35 line-through";
  return "border-navy/30 bg-cream hover:border-navy";
}

export function ProductView({ product, initialSku }: { product: ProductDetail; initialSku?: string }) {
  const axes = useMemo(() => pickerAxes(product.options, product.variants), [product]);
  const initial = product.variants.find((v) => v.sku === initialSku) ?? product.variants[0];
  const [wanted, setWanted] = useState(() => selectionsFor(axes, initial));
  const [wantedId, setWantedId] = useState(initial.id);
  const [qty, setQty] = useState(1);
  const { add } = useCart();

  const { rows, candidates, variant } = resolvePicker(axes, product.variants, wanted, wantedId);

  const select = (next: Record<string, string>, id?: string) => {
    const resolved = resolvePicker(axes, product.variants, next, id);
    setWanted(next);
    setWantedId(resolved.variant.id);
    // Keep the chosen SKU in the URL so it can be shared, without a navigation.
    const url = new URL(window.location.href);
    url.searchParams.set("sku", resolved.variant.sku);
    window.history.replaceState(null, "", url);
  };

  const variantImage = product.images.find((i) => i.variantId === variant.id)?.path ?? null;
  const optionRows = Object.entries(variant.optionValues);
  const specRows = Object.entries(product.specs).filter(([k]) => !(k in variant.optionValues));

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-12">
      <Gallery images={product.images} name={product.name} focusPath={variantImage} />

      <div className="flex flex-col gap-5">
        <div>
          <div className="font-mono text-[12.5px] opacity-65">
            {product.brand.name} · {product.category.name}
          </div>
          <h1 className="mt-1.5 font-serif text-[32px] leading-[1.05] font-medium text-balance md:text-[44px]">{product.name}</h1>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
          <span className={variant.price == null ? "font-serif text-2xl font-medium" : "font-serif text-[32px] font-medium"}>
            {formatPrice(variant.price)}
          </span>
          <span className="font-mono text-[12.5px] opacity-70">SKU {variant.sku}</span>
        </div>
        {variant.price == null && (
          <p className="-mt-3 text-[13.5px] leading-relaxed text-navy/75">
            You can still order this. We confirm the price with the supplier and show it on your invoice.
          </p>
        )}

        {product.description && <p className="text-[15.5px] leading-relaxed opacity-85">{product.description}</p>}

        {rows.map((row, i) => (
          <fieldset key={row.name}>
            <legend className="mb-2 text-[13.5px]">
              <span className="font-medium">{row.name}:</span>{" "}
              <span className="opacity-75">{row.values.find((v) => v.value === row.selected)?.label}</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {row.values.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  disabled={!v.enabled}
                  aria-pressed={v.value === row.selected}
                  onClick={() => {
                    // Keep choices above this one, change this one, let the ones below re-resolve.
                    const next = { ...Object.fromEntries(rows.slice(0, i).map((r) => [r.name, r.selected])), [row.name]: v.value };
                    for (const r of rows.slice(i + 1)) next[r.name] = wanted[r.name] ?? r.selected;
                    select(next);
                  }}
                  className={`min-h-11 min-w-11 rounded-lg border px-3.5 text-[14px] font-medium disabled:cursor-not-allowed ${optionClass(
                    v.value === row.selected,
                    v.enabled,
                  )}`}
                  title={v.enabled ? undefined : "Not available with the options above"}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </fieldset>
        ))}

        {candidates.length > 1 && (
          <fieldset>
            <legend className="mb-2 text-[13.5px] font-medium">Part #</legend>
            <div className="flex flex-wrap gap-2">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={c.id === variant.id}
                  onClick={() => select(wanted, c.id)}
                  className={`min-h-11 rounded-lg border px-3.5 font-mono text-[13px] font-medium ${optionClass(c.id === variant.id, true)}`}
                >
                  {c.sku}
                  {c.price != null && <span className="ml-2 font-sans opacity-70">{formatPrice(c.price)}</span>}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className="flex items-stretch gap-3">
          <QtyStepper value={qty} onChange={setQty} />
          <button
            type="button"
            onClick={() => {
              add(variant.id, qty, `${qty > 1 ? `${qty} × ` : ""}${product.name}`);
              setQty(1);
            }}
            className="min-w-0 flex-1 rounded-lg bg-navy px-3 py-2 text-[15px] leading-tight font-semibold text-cream-2 hover:bg-navy-deep"
          >
            Add to cart{variant.price != null && ` — ${formatPrice(variant.price * qty)}`}
          </button>
        </div>

        <dl className="border-t border-navy/15 text-sm">
          <div className="flex justify-between gap-4 border-b border-navy/10 py-2.5">
            <dt className="opacity-65">Part #</dt>
            <dd className="font-mono font-medium">{variant.sku}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-navy/10 py-2.5">
            <dt className="opacity-65">Brand</dt>
            <dd className="font-medium">{product.brand.name}</dd>
          </div>
          {[...optionRows, ...specRows].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-navy/10 py-2.5">
              <dt className="opacity-65">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>

        {product.features.length > 0 && (
          <div>
            <h2 className="mb-2 font-serif text-xl font-medium">Features</h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[14.5px] leading-relaxed marker:text-gold">
              {product.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
