"use client";

import Link from "next/link";
import { useState } from "react";
import { ProductImage } from "@/components/product-image";
import type { AdminProductRow, ProductStatus, Taxonomy } from "@/lib/admin/data";
import { bulkUpdateProductsAction, setProductStatusAction, type BulkFields, type StatusResult } from "./actions";
import { ActionMessage, useAdminAction } from "../use-admin-action";
import { StatusPillProduct } from "./[id]/status-bar";

const FLAG_ACTIONS: { label: string; fields: BulkFields }[] = [
  { label: "Mark best seller", fields: { is_featured: true } },
  { label: "Remove best seller", fields: { is_featured: false } },
  { label: "Mark new arrival", fields: { is_new: true } },
  { label: "Remove new arrival", fields: { is_new: false } },
  { label: "Flag name for review", fields: { needs_review: true } },
  { label: "Clear review flag", fields: { needs_review: false } },
];

const control = "h-10 rounded-lg border border-navy/30 bg-white/80 px-2 text-[13.5px]";

/** Product rows with selection and bulk actions (publish, archive, move, flags). */
export function ProductList({
  rows,
  taxonomy,
  tab,
}: {
  rows: AdminProductRow[];
  taxonomy: Pick<Taxonomy, "brands" | "groups" | "categories">;
  tab: ProductStatus | "active";
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<StatusResult["failed"]>([]);
  const { pending, message, run } = useAdminAction();
  const ids = [...selected];
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const after = () => setSelected(new Set());
  const status = (s: ProductStatus) =>
    run(
      () => setProductStatusAction(ids, s),
      (res) => {
        setFailed(res.failed ?? []);
        after();
      },
    );
  const bulk = (fields: BulkFields) => run(() => bulkUpdateProductsAction(ids, fields), after);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 px-1">
        <label className="flex h-10 items-center gap-2 text-[13.5px]">
          <input
            type="checkbox"
            className="size-5 accent-navy"
            checked={allOnPage}
            onChange={() => setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)))}
          />
          Select all on this page
        </label>
        {selected.size > 0 && <span className="text-[13px] opacity-70">{selected.size} selected</span>}
      </div>

      <ul className="flex flex-col divide-y divide-navy/8 rounded-xl border border-navy/12">
        {rows.map((p) => (
          <li key={p.id} className={`flex items-start gap-3 px-3 py-2.5 ${selected.has(p.id) ? "bg-sand/60" : ""}`}>
            <input
              type="checkbox"
              className="mt-3 size-5 flex-none accent-navy"
              checked={selected.has(p.id)}
              onChange={() => toggle(p.id)}
              aria-label={`Select ${p.name}`}
            />
            <Link href={`/admin/products/${p.id}`} className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <ProductImage path={p.image} alt="" sizes="44px" className="size-11 flex-none overflow-hidden rounded-md" />
                <span className="min-w-0">
                  <span className="block leading-snug font-medium hover:underline">{p.name}</span>
                  <span className="block truncate font-mono text-[11px] opacity-55">
                    {p.brand} · {p.category}
                    {p.skus ? ` · ${p.skus.split(" ").slice(0, 3).join(" ")}${p.skus.split(" ").length > 3 ? " …" : ""}` : ""}
                  </span>
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5 pl-14 font-mono text-[10.5px] sm:justify-end sm:pl-0">
                <StatusPillProduct status={p.status} />
                <span className="rounded bg-navy/5 px-1.5 py-0.5">
                  {p.orderable_count}/{p.variant_count} var
                </span>
                {p.unpriced_count > 0 && <span className="rounded bg-gold-light/50 px-1.5 py-0.5">{p.unpriced_count} unpriced</span>}
                {p.image_count === 0 && <span className="rounded bg-gold-light/50 px-1.5 py-0.5">no photo</span>}
                {p.needs_review && <span className="rounded bg-gold-light/60 px-1.5 py-0.5">REVIEW</span>}
                {p.is_featured && <span className="rounded bg-gold px-1.5 py-0.5 text-navy-deep">BEST</span>}
                {p.is_new && <span className="rounded bg-navy px-1.5 py-0.5 text-cream-2">NEW</span>}
              </span>
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="px-3 py-8 text-center opacity-70">No products match.</li>}
      </ul>

      {failed && failed.length > 0 && (
        <div className="rounded-xl border border-gold/50 bg-gold-light/20 p-3 text-[13.5px]">
          <p className="font-medium">Not published yet:</p>
          <ul className="mt-1 flex flex-col gap-1">
            {failed.map((f) => (
              <li key={f.id}>
                <Link href={`/admin/products/${f.id}`} className="underline">
                  {f.name}
                </Link>
                : {f.problems.join("; ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(selected.size > 0 || message) && (
        <div className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-xl bg-navy p-3 text-cream-2 shadow-[0_10px_30px_rgba(12,22,54,.3)]">
          {selected.size > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[13.5px] font-medium">{selected.size} selected</span>
                {tab === "archived" ? (
                  <button type="button" disabled={pending} onClick={() => status("draft")} className="h-10 rounded-lg bg-cream-2 px-3 text-[13.5px] font-semibold text-navy">
                    Restore as draft
                  </button>
                ) : (
                  <>
                    <button type="button" disabled={pending} onClick={() => status("published")} className="h-10 rounded-lg bg-cream-2 px-3 text-[13.5px] font-semibold text-navy">
                      Publish
                    </button>
                    <button type="button" disabled={pending} onClick={() => status("draft")} className="h-10 rounded-lg border border-cream-2/40 px-3 text-[13.5px]">
                      Unpublish
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => confirm(`Archive ${selected.size} products? They disappear from the store.`) && status("archived")}
                      className="h-10 rounded-lg border border-cream-2/40 px-3 text-[13.5px]"
                    >
                      Archive
                    </button>
                  </>
                )}
                <button type="button" disabled={pending} onClick={() => setSelected(new Set())} className="h-10 px-2 text-[13px] underline">
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-navy">
                <select
                  aria-label="Move to category"
                  className={control}
                  value=""
                  disabled={pending}
                  onChange={(e) => e.target.value && bulk({ category_id: e.target.value })}
                >
                  <option value="">Move to category…</option>
                  {taxonomy.groups.map((g) => (
                    <optgroup key={g.id} label={g.name}>
                      {taxonomy.categories
                        .filter((c) => c.group_id === g.id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
                <select aria-label="Set brand" className={control} value="" disabled={pending} onChange={(e) => e.target.value && bulk({ brand_id: e.target.value })}>
                  <option value="">Set brand…</option>
                  {taxonomy.brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Flags"
                  className={control}
                  value=""
                  disabled={pending}
                  onChange={(e) => {
                    const a = FLAG_ACTIONS[Number(e.target.value)];
                    if (a) bulk(a.fields);
                  }}
                >
                  <option value="">Flags…</option>
                  {FLAG_ACTIONS.map((a, i) => (
                    <option key={a.label} value={i}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div className="[&_span]:text-cream-2! [&_button]:text-cream-2!">
            <ActionMessage message={message} />
          </div>
        </div>
      )}
    </div>
  );
}
