"use client";

import { useEffect, useState } from "react";
import { describeOptions, formatPrice } from "@/lib/format";
import { ActionMessage, useAdminAction } from "../../use-admin-action";
import { proposeChangesAction, searchVariantsAction } from "../actions";

type Line = { id: string; sku: string; name: string; option_values: Record<string, string>; qty: number; unit_price: number | null };
type Hit = Awaited<ReturnType<typeof searchVariantsAction>>[number];

/** Supplier is short: change quantities (0 removes), add replacements, explain; the customer approves. */
export function ProposeChanges({ orderId, number, lines }: { orderId: string; number: string; lines: Line[] }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.id, String(l.qty)])));
  const [adds, setAdds] = useState<{ hit: Hit; qty: string }[]>([]);
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const { pending, message, run } = useAdminAction();
  const term = q.trim();

  useEffect(() => {
    if (term.length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      searchVariantsAction(term)
        .then((r) => !cancelled && setHits(r))
        .catch(() => !cancelled && setHits([]));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-10 self-start rounded-lg border border-navy/35 px-4 font-medium">
        Propose changes (supplier short)…
      </button>
    );
  }

  const parsed = lines.map((l) => ({ line: l, qty: Number(qty[l.id]) }));
  const addParsed = adds.map((a) => ({ ...a, n: Number(a.qty) }));
  const invalid =
    parsed.some((p) => !Number.isInteger(p.qty) || p.qty < 0 || p.qty > 999) ||
    addParsed.some((a) => !Number.isInteger(a.n) || a.n < 1 || a.n > 999);
  const changedLines = parsed.filter((p) => p.qty !== p.line.qty);
  const remaining = parsed.filter((p) => p.qty > 0).length + adds.length;
  const hasChanges = changedLines.length > 0 || adds.length > 0;
  const cell = "h-9 w-16 rounded-md border border-navy/30 bg-white/70 px-2 text-right tabular-nums outline-none focus:border-navy";

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-navy/15 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-serif text-xl font-medium">Propose changes</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-[13px] underline">
          Close
        </button>
      </div>
      <p className="text-[13px] opacity-70">
        Set a quantity to 0 to remove an item. The customer sees the changes and your note, and approves (the order
        continues) or rejects (the order is cancelled).
      </p>

      <ul className="divide-y divide-navy/8 rounded-lg border border-navy/12">
        {lines.map((l) => (
          <li key={l.id} className={`flex items-center justify-between gap-3 px-3 py-2 ${Number(qty[l.id]) === 0 ? "opacity-55" : ""}`}>
            <div className="min-w-0">
              <div className={`font-medium ${Number(qty[l.id]) === 0 ? "line-through" : ""}`}>{l.name}</div>
              <div className="font-mono text-[11.5px] opacity-60">
                {l.sku} · ordered {l.qty}
              </div>
            </div>
            <label className="flex flex-none items-center gap-1.5 text-[12.5px]">
              Qty
              <input value={qty[l.id]} onChange={(e) => setQty((s) => ({ ...s, [l.id]: e.target.value }))} inputMode="numeric" className={cell} aria-label={`New quantity for ${l.sku}`} />
            </label>
          </li>
        ))}
        {adds.map((a, i) => (
          <li key={a.hit.id} className="flex items-center justify-between gap-3 bg-sand/50 px-3 py-2">
            <div className="min-w-0">
              <div className="font-medium">
                <span className="mr-1.5 rounded bg-navy px-1.5 py-0.5 font-mono text-[10px] text-cream-2">ADD</span>
                {a.hit.name}
              </div>
              <div className="font-mono text-[11.5px] opacity-60">
                {a.hit.sku} · {formatPrice(a.hit.price)}
              </div>
            </div>
            <div className="flex flex-none items-center gap-2">
              <input
                value={a.qty}
                onChange={(e) => setAdds((s) => s.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
                inputMode="numeric"
                className={cell}
                aria-label={`Quantity for ${a.hit.sku}`}
              />
              <button type="button" onClick={() => setAdds((s) => s.filter((_, j) => j !== i))} className="text-[12.5px] underline">
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <label htmlFor="replacement" className="font-medium">
          Add a replacement
        </label>
        <input
          id="replacement"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="SKU or product name"
          className="h-10 rounded-lg border border-navy/30 bg-white/70 px-3 outline-none focus:border-navy"
        />
        {term.length >= 2 && hits.length > 0 && (
          <ul className="max-h-60 divide-y divide-navy/8 overflow-y-auto rounded-lg border border-navy/15">
            {hits
              .filter((h) => !adds.some((a) => a.hit.id === h.id))
              .map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <span className="min-w-0">
                    <span className="block truncate">{h.name}</span>
                    <span className="block truncate font-mono text-[11px] opacity-60">
                      {h.sku} · {describeOptions(h.optionValues) || "—"} · {formatPrice(h.price)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAdds((s) => [...s, { hit: h, qty: "1" }]);
                      setQ("");
                    }}
                    className="h-9 flex-none rounded-md border border-navy/35 px-3 text-[12.5px] font-medium"
                  >
                    Add
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-medium">Note to the customer</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="e.g. The supplier is out of the 12&quot; size until March. We can send the 14&quot; instead."
          className="rounded-lg border border-navy/30 bg-white/70 px-3 py-2 outline-none focus:border-navy"
        />
      </label>

      {remaining === 0 && <p className="text-[13px] text-red-800">That removes everything. Cancel the order instead.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || invalid || !hasChanges || remaining === 0 || !note.trim()}
          onClick={() =>
            run(
              () =>
                proposeChangesAction(
                  orderId,
                  number,
                  {
                    lines: changedLines.map((p) => ({ line_id: p.line.id, qty: p.qty })),
                    add: addParsed.map((a) => ({ variant_id: a.hit.id, qty: a.n })),
                  },
                  note,
                ),
              () => setOpen(false),
            )
          }
          className="h-10 rounded-lg bg-navy px-5 font-semibold text-cream-2 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send to customer for approval"}
        </button>
        {invalid && <span className="text-[13px] text-red-800">Quantities must be whole numbers (0–999; added items 1–999).</span>}
        <ActionMessage message={message} />
      </div>
    </div>
  );
}
