"use client";

import { useState } from "react";
import type { AdminOption, AdminVariant, ProductStatus } from "@/lib/admin/data";
import { saveProductVariantsAction, type VariantOp } from "../actions";
import { ActionMessage, parsePriceInput, useAdminAction, useUnsavedGuard } from "../../use-admin-action";

type Row = {
  key: string;
  id?: string; // missing = new
  sku: string;
  opts: Record<string, string>;
  price: string;
  orderable: boolean;
  deleted: boolean;
};

// Same rule as public.normalize_sku / the variants_sku_format check.
const normalizeSku = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "-");
const SKU_RE = /^[A-Z0-9][A-Z0-9/-]*$/;
const cleanOpts = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));
const optsKey = (o: Record<string, string>) => JSON.stringify(Object.entries(cleanOpts(o)).sort(([a], [b]) => a.localeCompare(b)));

let seq = 0;
const key = () => `v${seq++}`;

const toRow = (v: AdminVariant): Row => ({
  key: v.id,
  id: v.id,
  sku: v.sku ?? "",
  opts: { ...v.option_values },
  price: v.price == null ? "" : String(v.price),
  orderable: v.is_orderable,
  deleted: false,
});

const small = "grid size-10 flex-none place-items-center rounded-md border border-navy/25 text-[15px] disabled:opacity-30";
const field = "h-10 w-full rounded-md border border-navy/30 bg-white/70 px-2.5 outline-none focus:border-navy aria-invalid:border-red-700";

/** Every variant: SKU, option values, GYD price, orderable, order. Saved as one audited change. */
export function VariantsEditor({
  productId,
  status,
  options,
  variants,
  orderedVariantIds,
}: {
  productId: string;
  status: ProductStatus;
  options: AdminOption[];
  variants: AdminVariant[];
  orderedVariantIds: string[];
}) {
  const [stateRows, setRows] = useState<Row[]>(() => variants.map(toRow));
  // Start again from the server's data when it changes (after a save), not on every refresh.
  // This render already uses the fresh rows: the old ones may reference deleted variants.
  const sig = JSON.stringify([variants, options]);
  const [seenSig, setSeenSig] = useState(sig);
  const stale = sig !== seenSig;
  if (stale) {
    setSeenSig(sig);
    setRows(variants.map(toRow));
  }
  const rows = stale ? variants.map(toRow) : stateRows;
  const [showGen, setShowGen] = useState(false);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [dupes, setDupes] = useState<string[][]>([]);
  const { pending, message, run } = useAdminAction();
  const ordered = new Set(orderedVariantIds);
  const byId = new Map(variants.map((v) => [v.id, v]));

  const patch = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) =>
    setRows((r) => {
      const j = i + d;
      if (j < 0 || j >= r.length) return r;
      const n = [...r];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  // ---- build the change set -----------------------------------------------------------
  const live = rows.filter((r) => !r.deleted);
  const ops: VariantOp[] = [];
  const errors = new Map<string, string>();
  const skuCount = new Map<string, number>();
  for (const r of live) {
    const s = normalizeSku(r.sku);
    if (s) skuCount.set(s, (skuCount.get(s) ?? 0) + 1);
  }
  for (const r of rows) if (r.deleted && r.id) ops.push({ op: "delete", id: r.id });
  // Only renumber when rows were actually reordered (stored sorts can have gaps after deletes).
  const keptIds = live.filter((r) => r.id).map((r) => r.id);
  const reordered = keptIds.join() !== variants.map((v) => v.id).filter((id) => keptIds.includes(id)).join();
  const nextSort = Math.max(-1, ...variants.map((v) => v.sort)) + 1;
  live.forEach((r, index) => {
    const sort = reordered ? index : r.id ? byId.get(r.id)?.sort ?? index : nextSort + index;
    const sku = normalizeSku(r.sku) || null;
    const price = parsePriceInput(r.price);
    if (sku && !SKU_RE.test(sku)) errors.set(r.key, "SKU: letters, numbers, - and / only");
    else if (sku && (skuCount.get(sku) ?? 0) > 1) errors.set(r.key, "SKU used twice");
    else if (!sku && r.orderable && status === "published") errors.set(r.key, "Needs a SKU (product is live)");
    if (Number.isNaN(price)) errors.set(r.key, "Price: whole GYD, e.g. 5,299");
    const opts = cleanOpts(r.opts);
    if (!r.id) {
      ops.push({ op: "create", sku, option_values: opts, price: Number.isNaN(price) ? null : price, is_orderable: r.orderable, sort });
      return;
    }
    const o = byId.get(r.id);
    if (!o) return;
    const set: Record<string, unknown> = {};
    const expect: Record<string, unknown> = {};
    const diff = (k: string, next: unknown, prev: unknown) => {
      if (JSON.stringify(next) !== JSON.stringify(prev)) {
        set[k] = next;
        expect[k] = prev;
      }
    };
    diff("sku", sku, o.sku);
    if (optsKey(opts) !== optsKey(o.option_values)) {
      set.option_values = opts;
      expect.option_values = o.option_values;
    }
    if (!Number.isNaN(price)) diff("price", price, o.price);
    diff("is_orderable", r.orderable, o.is_orderable);
    diff("sort", sort, o.sort);
    if (Object.keys(set).length) ops.push({ op: "update", id: r.id, set, expect } as VariantOp);
  });
  const dirty = ops.length > 0;
  useUnsavedGuard(dirty, "variant changes");

  // identical option combinations among orderable variants (allowed, but worth a warning)
  const comboCount = new Map<string, number>();
  for (const r of live) if (r.orderable) comboCount.set(optsKey(r.opts), (comboCount.get(optsKey(r.opts)) ?? 0) + 1);
  const isDupe = (r: Row) => !r.deleted && r.orderable && options.length > 0 && (comboCount.get(optsKey(r.opts)) ?? 0) > 1;

  // ---- generator ------------------------------------------------------------------------
  const genOptions = options.filter((o) => (picked[o.name] ?? []).length);
  const combos: Record<string, string>[] = genOptions.reduce<Record<string, string>[]>(
    (acc, o) => acc.flatMap((c) => (picked[o.name] ?? []).map((v) => ({ ...c, [o.name]: v }))),
    [{}],
  );
  const existing = new Set(live.map((r) => optsKey(r.opts)));
  const fresh = genOptions.length ? combos.filter((c) => !existing.has(optsKey(c))) : [];

  return (
    <div className="flex flex-col gap-3">
      {options.length === 0 && variants.length > 1 && (
        <p className="text-[13px] opacity-70">This product has no options, so customers choose by part number.</p>
      )}

      <div className="hidden grid-cols-[150px_minmax(0,1fr)_120px_92px_132px] gap-2 px-2 font-mono text-[11px] tracking-wider uppercase opacity-60 xl:grid">
        <span>SKU</span>
        <span>Options</span>
        <span className="text-right">Price (GYD)</span>
        <span className="text-center">Orderable</span>
        <span />
      </div>

      <ul className="flex flex-col gap-2 xl:gap-0">
        {rows.map((r, i) => {
          const err = errors.get(r.key);
          const hist = r.id ? ordered.has(r.id) : false;
          return (
            <li
              key={r.key}
              className={`grid gap-2 rounded-xl border p-2.5 xl:grid-cols-[150px_minmax(0,1fr)_120px_92px_132px] xl:items-center xl:rounded-none xl:border-0 xl:border-b xl:border-navy/10 xl:px-2 xl:py-1.5 ${
                r.deleted ? "border-red-800/20 bg-red-50/40 opacity-70" : isDupe(r) ? "border-gold/60 bg-gold-light/15" : "border-navy/12"
              }`}
            >
              {r.deleted ? (
                <div className="flex items-center justify-between gap-2 xl:col-span-5">
                  <span className="text-[13px]">
                    <s className="font-mono">{r.sku || "(no SKU)"}</s> will be {hist ? "discontinued (it has order history)" : "deleted"}.
                  </span>
                  <button type="button" className="h-10 px-3 text-[13px] underline" onClick={() => patch(i, { deleted: false })}>
                    Undo
                  </button>
                </div>
              ) : (
                <>
                  <label className="flex flex-col gap-1 xl:block">
                    <span className="text-[12px] font-medium opacity-70 xl:sr-only">SKU</span>
                    <input
                      value={r.sku}
                      onChange={(e) => patch(i, { sku: e.target.value })}
                      onBlur={(e) => patch(i, { sku: normalizeSku(e.target.value) })}
                      aria-invalid={!!err && err.startsWith("SKU")}
                      placeholder={status === "published" ? "Required" : "SKU"}
                      autoCapitalize="characters"
                      spellCheck={false}
                      className={`${field} font-mono`}
                      aria-label={`SKU, row ${i + 1}`}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {options.map((o) => (
                      <label key={o.name} className="flex min-w-[45%] flex-1 flex-col gap-1 xl:min-w-0">
                        <span className="text-[12px] opacity-60">{o.name}</span>
                        <select
                          value={r.opts[o.name] ?? ""}
                          onChange={(e) => patch(i, { opts: { ...r.opts, [o.name]: e.target.value } })}
                          className={`${field} px-1.5`}
                          aria-label={`${o.name}, row ${i + 1}`}
                        >
                          <option value="">— Standard</option>
                          {o.values.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                          {r.opts[o.name] && !o.values.includes(r.opts[o.name]) && <option value={r.opts[o.name]}>{r.opts[o.name]} (not in list)</option>}
                        </select>
                      </label>
                    ))}
                    {options.length === 0 && <span className="self-center text-[13px] opacity-50">—</span>}
                  </div>
                  <div className="flex items-end gap-3 xl:contents">
                    <label className="flex flex-1 flex-col gap-1 xl:block">
                      <span className="text-[12px] font-medium opacity-70 xl:sr-only">Price (GYD)</span>
                      <input
                        value={r.price}
                        onChange={(e) => patch(i, { price: e.target.value })}
                        inputMode="numeric"
                        placeholder="On request"
                        aria-invalid={!!err && err.startsWith("Price")}
                        className={`${field} text-right tabular-nums placeholder:text-gold/80`}
                        aria-label={`Price in GYD, row ${i + 1}`}
                      />
                    </label>
                    <label className="flex h-10 items-center gap-2 xl:justify-center">
                      <input
                        type="checkbox"
                        checked={r.orderable}
                        onChange={(e) => patch(i, { orderable: e.target.checked })}
                        className="size-5 accent-navy"
                        aria-label={`Orderable, row ${i + 1}`}
                      />
                      <span aria-hidden className="text-[13px] xl:sr-only">Orderable</span>
                    </label>
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <button type="button" className={small} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move row ${i + 1} up`}>
                      ↑
                    </button>
                    <button type="button" className={small} disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={`Move row ${i + 1} down`}>
                      ↓
                    </button>
                    <button
                      type="button"
                      className={`${small} text-red-800`}
                      onClick={() => (r.id ? patch(i, { deleted: true }) : setRows((x) => x.filter((_, j) => j !== i)))}
                      aria-label={`Remove row ${i + 1}`}
                    >
                      ✕
                    </button>
                  </div>
                  {(err || isDupe(r)) && (
                    <p className={`text-[12.5px] xl:col-span-5 ${err ? "text-red-800" : "text-gold"}`}>
                      {err ?? "Same options as another variant: customers will pick by part number."}
                    </p>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setRows((r) => [...r, { key: key(), sku: "", opts: {}, price: "", orderable: true, deleted: false }])}
          className="h-10 rounded-lg border border-dashed border-navy/40 px-4 font-medium"
        >
          + Add variant
        </button>
        {options.length > 0 && (
          <button type="button" onClick={() => setShowGen((s) => !s)} className="h-10 rounded-lg border border-dashed border-navy/40 px-4 font-medium" aria-expanded={showGen}>
            Generate combinations…
          </button>
        )}
      </div>

      {showGen && (
        <div className="flex flex-col gap-3 rounded-xl border border-navy/15 bg-sand/30 p-3">
          <p className="text-[13px] opacity-75">
            Tick values to combine. New rows are added for combinations that don’t exist yet; remove the ones the supplier doesn’t make, then add SKUs.
          </p>
          {options.map((o) => (
            <fieldset key={o.name} className="flex flex-col gap-1.5">
              <legend className="mb-1 text-[13px] font-medium">{o.name}</legend>
              <div className="flex flex-wrap gap-2">
                {o.values.map((v) => {
                  const on = (picked[o.name] ?? []).includes(v);
                  return (
                    <label key={v} className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 text-[13.5px] ${on ? "border-navy bg-navy text-cream-2" : "border-navy/25 bg-cream"}`}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        onChange={() =>
                          setPicked((p) => ({ ...p, [o.name]: on ? (p[o.name] ?? []).filter((x) => x !== v) : [...(p[o.name] ?? []), v] }))
                        }
                      />
                      {v}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!fresh.length || fresh.length > 200}
              onClick={() => {
                setRows((r) => [...r, ...fresh.map((opts) => ({ key: key(), sku: "", opts, price: "", orderable: true, deleted: false }))]);
                setPicked({});
                setShowGen(false);
              }}
              className="h-10 rounded-lg bg-navy px-4 font-semibold text-cream-2 disabled:opacity-40"
            >
              Add {fresh.length} {fresh.length === 1 ? "combination" : "combinations"}
            </button>
            {genOptions.length > 0 && combos.length !== fresh.length && (
              <span className="text-[12.5px] opacity-70">{combos.length - fresh.length} already exist</span>
            )}
            {fresh.length > 200 && <span className="text-[12.5px] text-red-800">That’s over 200 rows. Pick fewer values.</span>}
          </div>
        </div>
      )}

      {dupes.length > 0 && !dirty && (
        <p className="text-[13px] text-gold">
          Heads-up: {dupes.map((d) => d.join(" / ")).join("; ")} have identical options. It works (customers pick the part number), but an extra option would
          make them clearer.
        </p>
      )}

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl bg-cream/95 p-2 shadow-[0_4px_20px_rgba(12,22,54,.12)] backdrop-blur">
        <button
          type="button"
          disabled={pending || !dirty || errors.size > 0}
          onClick={() => run(() => saveProductVariantsAction(productId, ops), (res) => setDupes(res.duplicates ?? []))}
          className="h-10 rounded-lg bg-navy px-5 font-semibold text-cream-2 disabled:opacity-50"
        >
          {pending ? "Saving…" : dirty ? `Save ${ops.length} ${ops.length === 1 ? "change" : "changes"}` : "Saved"}
        </button>
        {dirty && (
          <button type="button" onClick={() => setRows(variants.map(toRow))} className="h-10 px-2 underline">
            Discard
          </button>
        )}
        {errors.size > 0 && <span className="text-[13px] text-red-800">Fix the highlighted rows.</span>}
        <span className="text-[12.5px] opacity-60">
          {live.filter((r) => r.orderable).length} of {live.length} orderable
        </span>
        <ActionMessage message={message} />
      </div>
    </div>
  );
}
