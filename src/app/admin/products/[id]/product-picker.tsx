"use client";

import { useEffect, useState } from "react";
import { ProductImage } from "@/components/product-image";
import { searchProductsAction } from "../../actions";

type Hit = Awaited<ReturnType<typeof searchProductsAction>>[number];

/** Search products by name or SKU and pick one. */
export function ProductPicker({
  excludeId,
  placeholder,
  actionLabel,
  onPick,
  disabled,
}: {
  excludeId: string;
  placeholder: string;
  actionLabel: string;
  onPick: (hit: Hit) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const term = q.trim();

  useEffect(() => {
    if (term.length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      searchProductsAction(term, excludeId)
        .then((r) => !cancelled && setHits(r))
        .catch(() => !cancelled && setHits([]));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term, excludeId]);

  const shown = term.length < 2 ? [] : hits;
  return (
    <div className="flex flex-col gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="h-10 rounded-lg border border-navy/30 bg-white/70 px-3 outline-none focus:border-navy"
      />
      {shown.length > 0 && (
        <ul className="max-h-72 divide-y divide-navy/8 overflow-y-auto rounded-lg border border-navy/15">
          {shown.map((h) => (
            <li key={h.id} className="flex items-center gap-3 px-2 py-1.5">
              <ProductImage path={h.image} alt="" sizes="36px" className="size-9 flex-none overflow-hidden rounded" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{h.name}</span>
                <span className="block truncate font-mono text-[11px] opacity-55">
                  {h.brand} · {h.skus?.split(" ").slice(0, 3).join(" ")}
                </span>
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  onPick(h);
                  setQ("");
                }}
                className="h-9 flex-none rounded-md border border-navy/35 px-3 text-[12.5px] font-medium disabled:opacity-50"
              >
                {actionLabel}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
