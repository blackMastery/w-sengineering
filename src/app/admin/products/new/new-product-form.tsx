"use client";

import type { Taxonomy } from "@/lib/admin/data";
import { createProductAction } from "../actions";
import { ActionMessage, useAdminAction } from "../../use-admin-action";

const field = "h-11 w-full rounded-lg border border-navy/30 bg-white/70 px-3 text-[15px] outline-none focus:border-navy";

/** Name, brand, category → creates a draft and opens the full editor. */
export function NewProductForm({ brands, groups, categories }: Pick<Taxonomy, "brands" | "groups" | "categories">) {
  const { pending, message, run } = useAdminAction();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(() => createProductAction({ name: String(f.get("name")), brandId: String(f.get("brand")), categoryId: String(f.get("category")) }));
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="font-medium">Name</span>
        <input name="name" required maxLength={200} placeholder="e.g. Magnesium Bull Float" className={field} autoFocus />
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Brand</span>
        <select name="brand" required defaultValue={brands.find((b) => b.name === "Kraft Tool")?.id} className={field}>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="font-medium">Category</span>
        <select name="category" required defaultValue="" className={field}>
          <option value="" disabled>
            Choose…
          </option>
          {groups.map((g) => (
            <optgroup key={g.id} label={g.name}>
              {categories
                .filter((c) => c.group_id === g.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="h-11 rounded-lg bg-navy px-5 font-semibold text-cream-2 disabled:opacity-60">
          {pending ? "Creating…" : "Create draft"}
        </button>
        <ActionMessage message={message} />
      </div>
      <p className="text-[13px] opacity-65">It starts as a draft, hidden from the store. Next you add options, variants, prices and photos.</p>
    </form>
  );
}
