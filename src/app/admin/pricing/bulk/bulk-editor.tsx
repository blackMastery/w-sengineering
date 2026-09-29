"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PricingRow } from "@/lib/admin/data";
import { parsePaste } from "@/lib/admin/paste";
import { describeOptions } from "@/lib/format";
import { saveVariantsAction, type VariantChange } from "../../actions";
import { ActionMessage, parsePriceInput, useAdminAction } from "../../use-admin-action";

const toDrafts = (rows: PricingRow[]) => rows.map((r) => (r.price == null ? "" : String(r.price)));

export function BulkEditor({ rows }: { rows: PricingRow[] }) {
  const initial = useMemo(() => toDrafts(rows), [rows]);
  const [drafts, setDrafts] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const [paste, setPaste] = useState("");
  const [pasteNote, setPasteNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [onlyUnpriced, setOnlyUnpriced] = useState(false);
  const { pending, message, run } = useAdminAction();

  if (seen !== initial) {
    setSeen(initial);
    setDrafts(initial);
  }

  const parsed = drafts.map(parsePriceInput);
  const invalid = parsed.some((v) => Number.isNaN(v));
  const changes: VariantChange[] = rows.flatMap((r, i) =>
    !Number.isNaN(parsed[i]) && parsed[i] !== r.price ? [{ id: r.id, price: parsed[i] }] : [],
  );
  const visible = rows.map((_, i) => i).filter((i) => !onlyUnpriced || rows[i].price == null);

  function applyPaste() {
    // Column mode fills the rows as currently shown (so filter first if needed).
    const result = parsePaste(paste, visible.map((i) => rows[i].sku));
    if (result.mode === "empty") return setPasteNote({ ok: false, text: "Nothing to apply." });
    const next = [...drafts];
    for (const [pos, price] of result.prices) next[visible[pos]] = String(price);
    setDrafts(next);

    const notes = [`Filled ${result.prices.size} ${result.prices.size === 1 ? "price" : "prices"} (not saved yet).`];
    if (result.mode === "column" && result.countMismatch) {
      notes.push(`You pasted ${result.countMismatch.pasted} values for ${result.countMismatch.rows} rows; check the rows filled in order.`);
    }
    if (result.mode === "sku" && result.unknown.length) {
      notes.push(`Not in this list: ${result.unknown.slice(0, 8).join(", ")}${result.unknown.length > 8 ? "…" : ""}. Widen the SKU prefix to include them.`);
    }
    if (result.invalid.length) notes.push(`Couldn’t read ${result.invalid.length} ${result.invalid.length === 1 ? "line" : "lines"}: “${result.invalid[0]}”`);
    setPasteNote({ ok: result.invalid.length === 0 && !(result.mode === "sku" && result.unknown.length), text: notes.join(" ") });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 rounded-xl border border-navy/12 p-4">
        <label htmlFor="paste" className="font-medium">
          Paste prices
        </label>
        <p className="text-[12.5px] leading-relaxed opacity-70">
          Either <code>SKU price</code> per line (straight from a spreadsheet: SKU in the first column, GYD price in the
          last), or a single column of prices to fill the rows below in order. Whole GYD: <code>5299</code>,{" "}
          <code>5,299</code> and <code>GYD 5,299</code> all work.
        </p>
        <textarea
          id="paste"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={5}
          placeholder={"CFE435PF\t7,499\nCFE435\t6,999"}
          className="rounded-lg border border-navy/30 bg-white/70 px-3 py-2 font-mono text-[13px] outline-none focus:border-navy"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={applyPaste} className="h-10 rounded-lg border border-navy/40 px-4 font-medium">
            Fill prices from paste
          </button>
          {pasteNote && <span className={`text-[13px] ${pasteNote.ok ? "opacity-75" : "text-red-800"}`}>{pasteNote.text}</span>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={onlyUnpriced} onChange={(e) => setOnlyUnpriced(e.target.checked)} className="size-4 accent-navy" />
          Only rows showing “Price on request”
        </label>
        <span className="opacity-60">
          {visible.length} of {rows.length} rows
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-navy/12">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-sand/60 font-mono text-[11px] tracking-wider uppercase">
            <tr>
              <th className="hidden px-3 py-2 font-medium sm:table-cell">SKU</th>
              <th className="px-3 py-2 font-medium">
                <span className="sm:hidden">SKU / product</span>
                <span className="hidden sm:inline">Product / options</span>
              </th>
              <th className="px-3 py-2 text-right font-medium">Price (GYD)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy/8">
            {visible.map((i) => {
              const r = rows[i];
              const dirty = changes.some((c) => c.id === r.id);
              return (
                <tr key={r.id} className={dirty ? "bg-gold-light/20" : !r.is_orderable ? "opacity-50" : ""}>
                  <td className="hidden px-3 py-1.5 font-mono font-medium sm:table-cell">
                    {r.sku}
                    {!r.is_orderable && <span className="ml-1.5 font-sans text-[11px] font-normal">(discontinued)</span>}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="font-mono font-medium sm:hidden">
                      {r.sku}
                      {!r.is_orderable && <span className="ml-1.5 font-sans text-[11px] font-normal">(discontinued)</span>}
                    </div>
                    <Link href={`/admin/products/${r.product.id}`} className="hover:underline">
                      {r.product.name}
                    </Link>
                    <div className="text-[12px] opacity-60">{describeOptions(r.option_values)}</div>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      aria-label={`Price in GYD for ${r.sku}`}
                      inputMode="numeric"
                      value={drafts[i]}
                      onChange={(e) => setDrafts((d) => d.map((v, j) => (j === i ? e.target.value : v)))}
                      aria-invalid={Number.isNaN(parsed[i])}
                      placeholder="On request"
                      className="h-9 w-24 rounded-md sm:w-28 border border-navy/30 bg-white/70 px-2 text-right tabular-nums outline-none placeholder:text-gold/80 focus:border-navy aria-invalid:border-red-700"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-3 flex flex-wrap items-center gap-3 rounded-xl bg-cream/95 p-2 shadow-[0_4px_20px_rgba(12,22,54,.12)] backdrop-blur">
        <button
          type="button"
          disabled={pending || changes.length === 0 || invalid}
          onClick={() => run(() => saveVariantsAction(changes), () => setPasteNote(null))}
          className="h-10 rounded-lg bg-navy px-5 font-semibold text-cream-2 disabled:opacity-50"
        >
          {pending ? "Saving…" : changes.length ? `Save ${changes.length} ${changes.length === 1 ? "price" : "prices"}` : "No changes"}
        </button>
        {changes.length > 0 && (
          <button type="button" onClick={() => setDrafts(initial)} className="h-10 px-2 underline">
            Discard
          </button>
        )}
        {invalid && <span className="text-[13px] text-red-800">Fix the highlighted prices (whole GYD, like 5,299).</span>}
        <ActionMessage message={message} />
      </div>
    </div>
  );
}
