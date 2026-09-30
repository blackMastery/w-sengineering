"use client";

import { useState } from "react";
import { describeOptions, formatPrice } from "@/lib/format";
import { ActionMessage, parsePriceInput, useAdminAction, useUnsavedGuard } from "../../use-admin-action";
import { priceOrderLinesAction } from "../actions";

type Line = { id: string; sku: string; name: string; option_values: Record<string, string>; qty: number; catalog_price: number | null };

/**
 * Put prices on the order's "Price on request" lines, pre-filled from today's catalog price.
 * Lines that already had a price when the customer ordered are never touched.
 */
export function PriceLines({ orderId, number, lines }: { orderId: string; number: string; lines: Line[] }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const { pending, message, run } = useAdminAction();
  const withCatalog = lines.filter((l) => l.catalog_price != null);

  const parsed = lines.map((l) => ({ line: l, price: parsePriceInput(drafts[l.id] ?? "") }));
  const toSave = parsed.filter((p) => p.price !== null && !Number.isNaN(p.price));
  const invalid = parsed.some((p) => Number.isNaN(p.price));
  const added = toSave.reduce((sum, p) => sum + (p.price as number) * p.line.qty, 0);
  useUnsavedGuard(toSave.length > 0, "prices");

  return (
    <section aria-labelledby="price-lines" className="flex flex-col gap-3 rounded-xl border border-gold/50 bg-gold-light/10 p-4">
      <div>
        <h2 id="price-lines" className="font-serif text-xl font-medium">
          Price the “Price on request” lines
        </h2>
        <p className="mt-0.5 text-[13px] opacity-75">
          The customer ordered these without a price. Enter what you’ll charge per item. Lines already priced at order time stay as they are.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-navy/10 rounded-lg border border-navy/12 bg-cream">
        {lines.map((l) => {
          const bad = Number.isNaN(parsePriceInput(drafts[l.id] ?? ""));
          return (
            <li key={l.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{l.name}</div>
                <div className="font-mono text-[11.5px] opacity-60">
                  {l.sku} · Qty {l.qty}
                  {Object.keys(l.option_values).length > 0 && <span className="font-sans"> · {describeOptions(l.option_values)}</span>}
                </div>
                <div className="text-[12px] opacity-65">
                  Catalog price now: {l.catalog_price == null ? "none set" : formatPrice(l.catalog_price)}
                </div>
              </div>
              <label className="flex items-center gap-2 sm:flex-none">
                <span className="text-[12.5px] opacity-70">GYD each</span>
                <input
                  value={drafts[l.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [l.id]: e.target.value }))}
                  inputMode="numeric"
                  placeholder="—"
                  aria-invalid={bad}
                  aria-label={`Price per item for ${l.sku}`}
                  className="h-10 w-32 rounded-md border border-navy/30 bg-white/80 px-2.5 text-right tabular-nums outline-none focus:border-navy aria-invalid:border-red-700"
                />
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        {withCatalog.length > 0 && (
          <button
            type="button"
            onClick={() => setDrafts((d) => ({ ...d, ...Object.fromEntries(withCatalog.map((l) => [l.id, String(l.catalog_price)])) }))}
            className="h-10 rounded-lg border border-navy/35 px-4 font-medium"
          >
            Use catalog prices
          </button>
        )}
        <button
          type="button"
          disabled={pending || toSave.length === 0 || invalid}
          onClick={() =>
            run(
              () => priceOrderLinesAction(orderId, number, toSave.map((p) => ({ line_id: p.line.id, unit_price: p.price as number }))),
              () => setDrafts({}),
            )
          }
          className="h-10 rounded-lg bg-navy px-5 font-semibold text-cream-2 disabled:opacity-50"
        >
          {pending ? "Saving…" : toSave.length ? `Save ${toSave.length} ${toSave.length === 1 ? "price" : "prices"} (+${formatPrice(added)})` : "Save prices"}
        </button>
        {invalid && <span className="text-[13px] text-red-800">Whole GYD amounts, like 5,000.</span>}
        <ActionMessage message={message} />
      </div>
      <p className="text-[12.5px] opacity-60">You can price some lines now and the rest later; unpriced lines are priced when you invoice.</p>
    </section>
  );
}
