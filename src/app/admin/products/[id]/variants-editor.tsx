"use client";

import { useMemo, useState } from "react";
import { describeOptions } from "@/lib/format";
import type { AdminVariant } from "@/lib/admin/data";
import { saveVariantsAction, type VariantChange } from "../../actions";
import { ActionMessage, parsePriceInput, useAdminAction } from "../../use-admin-action";

type Draft = { price: string; orderable: boolean };

const toDraft = (v: AdminVariant): Draft => ({ price: v.price == null ? "" : String(v.price), orderable: v.is_orderable });

/** Per-variant GYD price and orderable toggle. Saved in one atomic, audited call. */
export function VariantsEditor({ variants }: { variants: AdminVariant[] }) {
  const initial = useMemo(() => Object.fromEntries(variants.map((v) => [v.id, toDraft(v)])), [variants]);
  const [drafts, setDrafts] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const { pending, message, run } = useAdminAction();

  // Server data changed (after a save): start from it again.
  if (seen !== initial) {
    setSeen(initial);
    setDrafts(initial);
  }

  const set = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const changes: VariantChange[] = [];
  const invalid = new Set<string>();
  for (const v of variants) {
    const d = drafts[v.id];
    const price = parsePriceInput(d.price);
    if (Number.isNaN(price)) {
      invalid.add(v.id);
      continue;
    }
    const c: VariantChange = { id: v.id };
    if (price !== v.price) c.price = price;
    if (d.orderable !== v.is_orderable) c.is_orderable = d.orderable;
    if (Object.keys(c).length > 1) changes.push(c);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-navy/12">
        <table className="w-full min-w-[480px] text-left text-[13px]">
          <thead className="bg-sand/60 font-mono text-[11px] tracking-wider uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">SKU / options</th>
              <th className="px-3 py-2 text-right font-medium">Price (GYD)</th>
              <th className="px-3 py-2 text-center font-medium">Orderable</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy/8">
            {variants.map((v) => {
              const d = drafts[v.id];
              const dirty = changes.some((c) => c.id === v.id);
              return (
                <tr key={v.id} className={dirty ? "bg-gold-light/20" : !d.orderable ? "opacity-55" : ""}>
                  <td className="px-3 py-1.5">
                    <div className="font-mono font-medium">{v.sku}</div>
                    <div className="text-[12px] opacity-65">{describeOptions(v.option_values) || "—"}</div>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      aria-label={`Price in GYD for ${v.sku}`}
                      inputMode="numeric"
                      value={d.price}
                      onChange={(e) => set(v.id, { price: e.target.value })}
                      aria-invalid={invalid.has(v.id)}
                      placeholder="On request"
                      className="h-9 w-28 rounded-md border border-navy/30 bg-white/70 px-2 text-right tabular-nums outline-none placeholder:text-gold/80 focus:border-navy aria-invalid:border-red-700"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${v.sku} orderable`}
                      checked={d.orderable}
                      onChange={(e) => set(v.id, { orderable: e.target.checked })}
                      className="size-4 accent-navy"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[12.5px] opacity-65">
        Whole Guyanese dollars. Leave a price empty to show “Price on request” (it can still be ordered). Unticking
        “Orderable” marks a variant discontinued: it disappears from the store.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || changes.length === 0 || invalid.size > 0}
          onClick={() => run(() => saveVariantsAction(changes))}
          className="h-10 rounded-lg bg-navy px-5 font-semibold text-cream-2 disabled:opacity-50"
        >
          {pending ? "Saving…" : changes.length ? `Save ${changes.length} ${changes.length === 1 ? "change" : "changes"}` : "No changes"}
        </button>
        {changes.length > 0 && (
          <button type="button" onClick={() => setDrafts(initial)} className="h-10 px-2 underline">
            Discard
          </button>
        )}
        {invalid.size > 0 && <span className="text-[13px] text-red-800">Prices must be whole GYD amounts, like 5299 or 5,299.</span>}
        <ActionMessage message={message} />
      </div>
    </div>
  );
}
