"use client";

import { useMemo, useState } from "react";
import { describeOptions, formatPrice } from "@/lib/format";
import type { AdminVariant } from "@/lib/admin/data";
import { saveVariantsAction, type VariantChange } from "../../actions";
import { ActionMessage, parseMoney, useAdminAction } from "../../use-admin-action";

type Draft = { cost: string; override: string; orderable: boolean };

const toDraft = (v: AdminVariant): Draft => ({
  cost: v.usd_cost == null ? "" : String(v.usd_cost),
  override: v.price_override == null ? "" : String(v.price_override),
  orderable: v.is_orderable,
});

/** Per-variant USD cost, price override and orderable toggle. Saved in one atomic, audited call. */
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
    const cost = parseMoney(d.cost);
    const override = parseMoney(d.override);
    if (Number.isNaN(cost) || Number.isNaN(override)) {
      invalid.add(v.id);
      continue;
    }
    const c: VariantChange = { id: v.id };
    if (cost !== v.usd_cost) c.usd_cost = cost;
    if (override !== v.price_override) c.price_override = override;
    if (d.orderable !== v.is_orderable) c.is_orderable = d.orderable;
    if (Object.keys(c).length > 1) changes.push(c);
  }

  const cell = "h-9 w-24 rounded-md border border-navy/30 bg-white/70 px-2 text-right tabular-nums outline-none focus:border-navy";

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-navy/12">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="bg-sand/60 font-mono text-[11px] tracking-wider uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">SKU / options</th>
              <th className="px-3 py-2 text-right font-medium">USD cost</th>
              <th className="px-3 py-2 text-right font-medium">Override (GYD)</th>
              <th className="px-3 py-2 text-right font-medium">Price now</th>
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
                      aria-label={`USD cost for ${v.sku}`}
                      inputMode="decimal"
                      value={d.cost}
                      onChange={(e) => set(v.id, { cost: e.target.value })}
                      aria-invalid={invalid.has(v.id) && Number.isNaN(parseMoney(d.cost))}
                      className={`${cell} aria-invalid:border-red-700`}
                      placeholder="—"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      aria-label={`Price override for ${v.sku}`}
                      inputMode="decimal"
                      value={d.override}
                      onChange={(e) => set(v.id, { override: e.target.value })}
                      aria-invalid={invalid.has(v.id) && Number.isNaN(parseMoney(d.override))}
                      className={`${cell} aria-invalid:border-red-700`}
                      placeholder="—"
                    />
                  </td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${v.price == null ? "text-gold" : ""}`}>
                    {v.price == null ? "On request" : formatPrice(v.price)}
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
        Price (GYD) = override if set, otherwise USD cost × exchange rate × (1 + markup), rounded up to end in 99. Unticking
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
        {invalid.size > 0 && <span className="text-[13px] text-red-800">Fix the highlighted amounts (numbers like 12.50).</span>}
        <ActionMessage message={message} />
      </div>
    </div>
  );
}
