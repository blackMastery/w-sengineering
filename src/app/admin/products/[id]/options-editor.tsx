"use client";

import { useState } from "react";
import type { AdminOption, AdminVariant } from "@/lib/admin/data";
import { saveOptionsAction, type OptionInput } from "../actions";
import { ActionMessage, useAdminAction, useUnsavedGuard } from "../../use-admin-action";

type ValueDraft = { key: string; value: string; orig?: string };
type OptionDraft = { key: string; name: string; orig?: string; values: ValueDraft[] };
type Removal = { option: string; value: string; variants: { id: string; sku: string | null; ordered: boolean }[] };

const btn = "grid size-10 flex-none place-items-center rounded-md border border-navy/25 text-[15px] disabled:opacity-30";
const field = "h-10 min-w-0 flex-1 rounded-md border border-navy/30 bg-white/70 px-3 outline-none focus:border-navy aria-invalid:border-red-700";

// Stable keys for rows being edited (never shown).
let seq = 0;
const k = () => `o${seq++}`;

function move<T>(list: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/**
 * Option names and their values (e.g. Handle: ProForm, Wood, Cork). Renames apply to every
 * variant; removing a value that variants use asks first, then deletes or discontinues them.
 */
export function OptionsEditor({
  productId,
  options,
  variants,
  orderedVariantIds,
}: {
  productId: string;
  options: AdminOption[];
  variants: AdminVariant[];
  orderedVariantIds: string[];
}) {
  const fromServer = () =>
    options.map((o) => ({ key: k(), name: o.name, orig: o.name, values: o.values.map((v) => ({ key: k(), value: v, orig: v })) }));
  const [drafts, setDrafts] = useState<OptionDraft[]>(fromServer);
  const sig = JSON.stringify(options);
  const [seenSig, setSeenSig] = useState(sig);
  if (sig !== seenSig) {
    setSeenSig(sig);
    setDrafts(fromServer());
  }
  const [newValue, setNewValue] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<Removal[] | null>(null);
  const { pending, message, run } = useAdminAction();

  const payload: OptionInput[] = drafts.map((o) => ({
    name: o.name.trim(),
    ...(o.orig && o.orig !== o.name.trim() ? { renamed_from: o.orig } : {}),
    values: o.values.map((v) => ({ value: v.value.trim(), ...(v.orig && v.orig !== v.value.trim() ? { renamed_from: v.orig } : {}) })),
  }));
  const dirty = JSON.stringify(payload.map((o) => ({ n: o.name, v: o.values.map((v) => v.value) }))) !== JSON.stringify(options.map((o) => ({ n: o.name, v: o.values })));
  useUnsavedGuard(dirty, "option changes");

  // validation
  const names = drafts.map((o) => o.name.trim().toLowerCase());
  const badName = (i: number) => !names[i] || names.indexOf(names[i]) !== i;
  const badValue = (o: OptionDraft, j: number) => {
    const vals = o.values.map((v) => v.value.trim());
    return !vals[j] || vals.indexOf(vals[j]) !== j;
  };
  const invalid = drafts.some((o, i) => badName(i) || o.values.some((_, j) => badValue(o, j)));

  const patch = (i: number, fn: (o: OptionDraft) => OptionDraft) => setDrafts((d) => d.map((o, x) => (x === i ? fn(o) : o)));

  // Variants that use a value being removed (options removed entirely just drop the key).
  function removals(): Removal[] {
    const ordered = new Set(orderedVariantIds);
    const out: Removal[] = [];
    for (const o of options) {
      const kept = drafts.find((d) => d.orig === o.name);
      if (!kept) continue;
      for (const v of o.values) {
        if (kept.values.some((x) => x.orig === v)) continue;
        const using = variants.filter((x) => x.option_values[o.name] === v);
        if (using.length) out.push({ option: o.name, value: v, variants: using.map((x) => ({ id: x.id, sku: x.sku, ordered: ordered.has(x.id) })) });
      }
    }
    return out;
  }

  function save(removeVariants: boolean) {
    run(() => saveOptionsAction(productId, payload, options, removeVariants), () => setConfirming(null));
  }

  const droppedOptions = options.filter((o) => !drafts.some((d) => d.orig === o.name));

  return (
    <div className="flex flex-col gap-4">
      {drafts.length === 0 && <p className="opacity-70">No options: every variant is just a part number. Add one (e.g. Size) to offer choices.</p>}
      {drafts.map((o, i) => (
        <div key={o.key} className="flex flex-col gap-2 rounded-xl border border-navy/12 p-3">
          <div className="flex items-center gap-1.5">
            <input
              aria-label="Option name"
              value={o.name}
              onChange={(e) => patch(i, (x) => ({ ...x, name: e.target.value }))}
              aria-invalid={badName(i)}
              placeholder="Option name, e.g. Size"
              maxLength={60}
              className={`${field} font-medium`}
            />
            <button type="button" className={btn} disabled={i === 0} onClick={() => setDrafts((d) => move(d, i, -1))} aria-label={`Move ${o.name} up`}>
              ↑
            </button>
            <button type="button" className={btn} disabled={i === drafts.length - 1} onClick={() => setDrafts((d) => move(d, i, 1))} aria-label={`Move ${o.name} down`}>
              ↓
            </button>
            <button type="button" className={`${btn} text-red-800`} onClick={() => setDrafts((d) => d.filter((_, x) => x !== i))} aria-label={`Remove option ${o.name}`}>
              ✕
            </button>
          </div>
          <ul className="flex flex-col gap-1.5 pl-2 sm:pl-4">
            {o.values.map((v, j) => (
              <li key={v.key} className="flex items-center gap-1.5">
                <input
                  aria-label={`${o.name || "Option"} value`}
                  value={v.value}
                  onChange={(e) => patch(i, (x) => ({ ...x, values: x.values.map((y, z) => (z === j ? { ...y, value: e.target.value } : y)) }))}
                  aria-invalid={badValue(o, j)}
                  maxLength={80}
                  className={field}
                />
                <button type="button" className={btn} disabled={j === 0} onClick={() => patch(i, (x) => ({ ...x, values: move(x.values, j, -1) }))} aria-label={`Move ${v.value} up`}>
                  ↑
                </button>
                <button type="button" className={btn} disabled={j === o.values.length - 1} onClick={() => patch(i, (x) => ({ ...x, values: move(x.values, j, 1) }))} aria-label={`Move ${v.value} down`}>
                  ↓
                </button>
                <button type="button" className={`${btn} text-red-800`} onClick={() => patch(i, (x) => ({ ...x, values: x.values.filter((_, z) => z !== j) }))} aria-label={`Remove ${v.value}`}>
                  ✕
                </button>
              </li>
            ))}
            <li className="flex items-center gap-1.5">
              <input
                aria-label={`New ${o.name || "option"} value`}
                value={newValue[o.key] ?? ""}
                onChange={(e) => setNewValue((s) => ({ ...s, [o.key]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  (e.currentTarget.nextElementSibling as HTMLButtonElement | null)?.click();
                }}
                placeholder="Add a value"
                maxLength={80}
                className={field}
              />
              <button
                type="button"
                className="h-10 flex-none rounded-md border border-navy/35 px-3 text-[13px] font-medium disabled:opacity-40"
                disabled={!(newValue[o.key] ?? "").trim()}
                onClick={() => {
                  const value = (newValue[o.key] ?? "").trim();
                  patch(i, (x) => ({ ...x, values: [...x.values, { key: k(), value }] }));
                  setNewValue((s) => ({ ...s, [o.key]: "" }));
                }}
              >
                Add
              </button>
            </li>
          </ul>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setDrafts((d) => [...d, { key: k(), name: "", values: [] }])}
        className="h-10 self-start rounded-lg border border-dashed border-navy/40 px-4 font-medium"
      >
        + Add option
      </button>

      {droppedOptions.length > 0 && (
        <p className="text-[13px] text-gold">
          Removing {droppedOptions.map((o) => o.name).join(", ")} clears it from every variant. Variants may end up looking identical; you’ll see a
          warning under Variants.
        </p>
      )}

      {confirming && (
        <div role="alertdialog" aria-label="Variants use removed values" className="flex flex-col gap-2 rounded-xl border border-red-800/30 bg-red-50/60 p-3">
          <p className="font-medium">Some variants use values you removed:</p>
          <ul className="list-disc pl-5 text-[13.5px]">
            {confirming.map((r) => (
              <li key={`${r.option}:${r.value}`}>
                {r.option}: {r.value} — {r.variants.length} {r.variants.length === 1 ? "variant" : "variants"} (
                {r.variants.map((v) => v.sku ?? "no SKU").join(", ")})
              </li>
            ))}
          </ul>
          <p className="text-[13px] opacity-80">
            Saving deletes the variants that were never ordered and discontinues the ones with order history.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => save(true)} className="h-10 rounded-lg bg-red-800 px-4 font-semibold text-white disabled:opacity-50">
              {pending ? "Saving…" : "Remove values and those variants"}
            </button>
            <button type="button" onClick={() => setConfirming(null)} className="h-10 px-3 underline">
              Go back
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || !dirty || invalid || !!confirming}
          onClick={() => {
            const r = removals();
            if (r.length) setConfirming(r);
            else save(false);
          }}
          className="h-10 rounded-lg bg-navy px-5 font-semibold text-cream-2 disabled:opacity-50"
        >
          {pending ? "Saving…" : dirty ? "Save options" : "Saved"}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => setDrafts(fromServer())}
            className="h-10 px-2 underline"
          >
            Discard
          </button>
        )}
        {invalid && <span className="text-[13px] text-red-800">Names and values can’t be empty or repeated.</span>}
        <ActionMessage message={message} />
      </div>
    </div>
  );
}
