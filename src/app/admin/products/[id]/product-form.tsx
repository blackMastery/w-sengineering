"use client";

import { saveProductAction } from "../../actions";
import { ActionMessage, useAdminAction } from "../../use-admin-action";
import type { AdminProduct } from "@/lib/admin/data";

const input = "w-full rounded-lg border border-navy/30 bg-white/70 px-3 outline-none focus:border-navy";

export function ProductForm({
  product,
  brands,
  categories,
}: {
  product: AdminProduct;
  brands: { id: string; name: string }[];
  categories: { id: string; name: string; group: string }[];
}) {
  const { pending, message, run } = useAdminAction();
  const groups = [...new Set(categories.map((c) => c.group))];

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const lines = (k: string) =>
      String(f.get(k) ?? "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    run(() =>
      saveProductAction(product.id, {
        name: String(f.get("name")),
        description: String(f.get("description") ?? ""),
        features: lines("features"),
        specs: lines("specs").map((l) => {
          const i = l.indexOf(":");
          return i < 0 ? [l, ""] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        }),
        brand_id: String(f.get("brand_id")),
        category_id: String(f.get("category_id")),
        is_featured: f.get("is_featured") === "on",
        is_new: f.get("is_new") === "on",
        needs_review: f.get("needs_review") === "on",
      }),
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-medium">Name</span>
        <input name="name" defaultValue={product.name} required maxLength={200} className={`${input} h-10 text-[15px]`} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Brand</span>
          <select name="brand_id" defaultValue={product.brand_id} className={`${input} h-10`}>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Category</span>
          <select name="category_id" defaultValue={product.category_id} className={`${input} h-10`}>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {categories
                  .filter((c) => c.group === g)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Description</span>
        <textarea name="description" defaultValue={product.description ?? ""} rows={3} maxLength={4000} className={`${input} py-2`} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Features</span>
        <span className="text-[12.5px] opacity-65">One per line. Shown as bullets.</span>
        <textarea name="features" defaultValue={product.features.join("\n")} rows={4} className={`${input} py-2`} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Specs</span>
        <span className="text-[12.5px] opacity-65">
          One per line as <code>Name: Value</code>. Only specs that are the same for every variant; differences belong in variant options.
        </span>
        <textarea
          name="specs"
          defaultValue={Object.entries(product.specs)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n")}
          rows={3}
          className={`${input} py-2 font-mono text-[13px]`}
        />
      </label>
      <fieldset className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex min-h-10 items-center gap-2">
          <input type="checkbox" name="is_featured" defaultChecked={product.is_featured} className="size-4 accent-navy" />
          Best seller (home page)
        </label>
        <label className="flex min-h-10 items-center gap-2">
          <input type="checkbox" name="is_new" defaultChecked={product.is_new} className="size-4 accent-navy" />
          New arrival (home page)
        </label>
        <label className="flex min-h-10 items-center gap-2">
          <input type="checkbox" name="needs_review" defaultChecked={product.needs_review} className="size-4 accent-navy" />
          Name needs review
        </label>
      </fieldset>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="h-10 rounded-lg bg-navy px-5 font-semibold text-cream-2 disabled:opacity-60">
          {pending ? "Saving…" : "Save details"}
        </button>
        <ActionMessage message={message} />
      </div>
    </form>
  );
}
