import { describeOptions, formatPrice } from "@/lib/format";

export type ProposalData = {
  lines: { line_id: string; sku: string; name: string; option_values: Record<string, string>; unit_price: number | null; qty_before: number; qty: number }[];
  add: { variant_id: string; sku: string; name: string; option_values: Record<string, string>; unit_price: number | null; qty: number }[];
};

/** Before → after for a supplier-shortage proposal, plus the new estimate. */
export function ProposalView({ proposed }: { proposed: ProposalData }) {
  const rows = [
    ...proposed.lines.map((l) => ({ key: l.line_id, ...l, kind: l.qty === 0 ? "removed" : l.qty !== l.qty_before ? "changed" : "same" })),
    ...proposed.add.map((a) => ({ key: a.variant_id, ...a, qty_before: 0, kind: "added" as const })),
  ];
  const estimate = rows.reduce((sum, r) => sum + (r.unit_price == null ? 0 : Number(r.unit_price) * r.qty), 0);
  const unpriced = rows.filter((r) => r.qty > 0 && r.unit_price == null).length;
  const tag: Record<string, string> = {
    removed: "bg-red-800/10 text-red-900",
    changed: "bg-gold-light/60 text-navy",
    added: "bg-navy text-cream-2",
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className="divide-y divide-navy/10 border-y border-navy/12">
        {rows.map((r) => (
          <li key={r.key} className={`flex justify-between gap-3 py-2.5 ${r.kind === "removed" ? "opacity-60" : ""}`}>
            <div className="min-w-0">
              <div className={`text-[14px] font-medium ${r.kind === "removed" ? "line-through" : ""}`}>{r.name}</div>
              <div className="font-mono text-[11.5px] opacity-60">
                {r.sku}
                {Object.keys(r.option_values ?? {}).length > 0 && <span className="font-sans"> · {describeOptions(r.option_values)}</span>}
              </div>
            </div>
            <div className="flex flex-none flex-col items-end gap-1 text-right text-[13px]">
              {r.kind !== "same" && (
                <span className={`rounded px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase ${tag[r.kind]}`}>{r.kind}</span>
              )}
              <span className="tabular-nums">
                {r.kind === "changed" ? (
                  <>
                    Qty <s className="opacity-60">{r.qty_before}</s> → <b className="font-semibold">{r.qty}</b>
                  </>
                ) : r.kind === "removed" ? (
                  <>Qty {r.qty_before} → 0</>
                ) : (
                  <>Qty {r.qty}</>
                )}
              </span>
              {r.qty > 0 && <span className="opacity-70">{formatPrice(r.unit_price == null ? null : Number(r.unit_price) * r.qty)}</span>}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex justify-between text-[14px]">
        <span>New estimated total</span>
        <span className="font-serif text-lg font-medium">{formatPrice(estimate)}</span>
      </div>
      {unpriced > 0 && <p className="text-[12.5px] text-gold">Plus {unpriced} “Price on request” {unpriced === 1 ? "item" : "items"}, priced on the invoice.</p>}
    </div>
  );
}
