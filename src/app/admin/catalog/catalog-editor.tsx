"use client";

import { useState } from "react";
import type { Taxonomy } from "@/lib/admin/data";
import { ActionMessage, useAdminAction } from "../use-admin-action";
import {
  deleteBrandAction,
  deleteCategoryAction,
  renameGroupAction,
  reorderAction,
  saveBrandAction,
  saveCategoryAction,
} from "./actions";

const btn = "grid size-10 flex-none place-items-center rounded-md border border-navy/25 text-[15px] disabled:opacity-30";
const small = "h-10 flex-none rounded-md border border-navy/30 px-3 text-[13px] font-medium disabled:opacity-40";
const field = "h-10 min-w-0 flex-1 rounded-md border border-navy/30 bg-white/70 px-3 outline-none focus:border-navy";

/** Text that turns into an input with Save/Cancel. */
function Renamable({ value, onSave, pending, label }: { value: string; onSave: (v: string, done: () => void) => void; pending: boolean; label: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 truncate font-medium">{value}</span>
        <button
          type="button"
          className="h-9 flex-none px-1 text-[12.5px] underline opacity-70"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          aria-label={`Rename ${label}`}
        >
          Rename
        </button>
      </span>
    );
  }
  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft, () => setEditing(false));
      }}
    >
      <input value={draft} onChange={(e) => setDraft(e.target.value)} className={field} autoFocus maxLength={80} aria-label={`New name for ${label}`} />
      <button className={small} disabled={pending || !draft.trim() || draft.trim() === value}>
        Save
      </button>
      <button type="button" className="h-10 px-1 text-[12.5px] underline" onClick={() => setEditing(false)}>
        Cancel
      </button>
    </form>
  );
}

/** Delete with a required "move products to" choice when something still uses it. */
function DeleteWithMove({
  label,
  count,
  targets,
  onDelete,
  pending,
}: {
  label: string;
  count: number;
  targets: { id: string; name: string }[];
  onDelete: (moveTo: string | null, done: () => void) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [moveTo, setMoveTo] = useState("");
  if (!open) {
    return (
      <button type="button" className={`${small} text-red-800`} onClick={() => setOpen(true)} aria-label={`Delete ${label}`}>
        Delete
      </button>
    );
  }
  return (
    <div className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-red-50/60 p-2">
      {count > 0 ? (
        <>
          <span className="text-[13px]">
            Move its {count} {count === 1 ? "product" : "products"} to
          </span>
          <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="h-10 rounded-md border border-navy/30 bg-white px-2 text-[13px]" aria-label="Move products to">
            <option value="">Choose…</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </>
      ) : (
        <span className="text-[13px]">Delete {label}?</span>
      )}
      <button
        type="button"
        disabled={pending || (count > 0 && !moveTo)}
        onClick={() => onDelete(moveTo || null, () => setOpen(false))}
        className="h-10 rounded-md bg-red-800 px-3 text-[13px] font-semibold text-white disabled:opacity-40"
      >
        {count > 0 ? "Move and delete" : "Delete"}
      </button>
      <button type="button" className="h-10 px-1 text-[12.5px] underline" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}

function AddRow({ placeholder, onAdd, pending }: { placeholder: string; onAdd: (name: string, done: () => void) => void; pending: boolean }) {
  const [name, setName] = useState("");
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(name, () => setName(""));
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} maxLength={80} className={field} aria-label={placeholder} />
      <button className={small} disabled={pending || !name.trim()}>
        Add
      </button>
    </form>
  );
}

export function CatalogEditor({ taxonomy }: { taxonomy: Taxonomy }) {
  const { pending, message, run } = useAdminAction();
  const { groups, categories, brands } = taxonomy;
  const inGroup = (gid: string) => categories.filter((c) => c.group_id === gid);

  // categories are ordered globally; rebuild the full order with one item moved within its group
  const moveCategory = (id: string, d: -1 | 1) => {
    const order = groups.flatMap((g) => inGroup(g.id).map((c) => c.id));
    const gid = categories.find((c) => c.id === id)!.group_id;
    const siblings = inGroup(gid).map((c) => c.id);
    const i = siblings.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= siblings.length) return;
    const a = order.indexOf(siblings[i]);
    const b = order.indexOf(siblings[j]);
    [order[a], order[b]] = [order[b], order[a]];
    run(() => reorderAction("category", order));
  };
  const moveGroup = (i: number, d: -1 | 1) => {
    const order = groups.map((g) => g.id);
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    run(() => reorderAction("group", order));
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="sticky top-16 z-10 min-h-6 md:top-18">
        <ActionMessage message={message} />
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="cats">
        <h2 id="cats" className="font-serif text-2xl font-medium">
          Groups & categories
        </h2>
        <p className="-mt-1 text-[13px] opacity-65">
          The six groups are the store’s main sections. Renaming a group or category changes its web address; old links redirect. Empty categories stay hidden
          in the store.
        </p>
        {groups.map((g, gi) => (
          <div key={g.id} className="flex flex-col gap-2 rounded-xl border border-navy/12 p-3">
            <div className="flex items-center gap-1.5">
              <Renamable value={g.name} label={`group ${g.name}`} pending={pending} onSave={(v, done) => run(() => renameGroupAction(g.id, v), done)} />
              <button type="button" className={btn} disabled={pending || gi === 0} onClick={() => moveGroup(gi, -1)} aria-label={`Move ${g.name} up`}>
                ↑
              </button>
              <button type="button" className={btn} disabled={pending || gi === groups.length - 1} onClick={() => moveGroup(gi, 1)} aria-label={`Move ${g.name} down`}>
                ↓
              </button>
            </div>
            <ul className="flex flex-col gap-1.5 pl-2 sm:pl-4">
              {inGroup(g.id).map((c, ci, list) => (
                <li key={c.id} className="flex flex-wrap items-center gap-1.5 border-t border-navy/8 pt-1.5">
                  <Renamable value={c.name} label={`category ${c.name}`} pending={pending} onSave={(v, done) => run(() => saveCategoryAction(c.id, v, c.group_id), done)} />
                  <span className="font-mono text-[11px] opacity-55">{c.productCount} products</span>
                  <select
                    value={c.group_id}
                    disabled={pending}
                    onChange={(e) => run(() => saveCategoryAction(c.id, c.name, e.target.value))}
                    className="h-10 rounded-md border border-navy/30 bg-white/70 px-1.5 text-[13px]"
                    aria-label={`Group for ${c.name}`}
                  >
                    {groups.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className={btn} disabled={pending || ci === 0} onClick={() => moveCategory(c.id, -1)} aria-label={`Move ${c.name} up`}>
                    ↑
                  </button>
                  <button type="button" className={btn} disabled={pending || ci === list.length - 1} onClick={() => moveCategory(c.id, 1)} aria-label={`Move ${c.name} down`}>
                    ↓
                  </button>
                  <DeleteWithMove
                    label={`category ${c.name}`}
                    count={c.productCount}
                    targets={categories.filter((x) => x.id !== c.id).map((x) => ({ id: x.id, name: `${x.name} (${x.group})` }))}
                    pending={pending}
                    onDelete={(moveTo, done) => run(() => deleteCategoryAction(c.id, moveTo), done)}
                  />
                </li>
              ))}
              <li>
                <AddRow placeholder={`New category in ${g.name}`} pending={pending} onAdd={(name, done) => run(() => saveCategoryAction(null, name, g.id), done)} />
              </li>
            </ul>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="brands">
        <h2 id="brands" className="font-serif text-2xl font-medium">
          Brands
        </h2>
        <ul className="flex flex-col gap-1.5 rounded-xl border border-navy/12 p-3">
          {brands.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-1.5 border-b border-navy/8 pb-1.5 last:border-0">
              <Renamable value={b.name} label={`brand ${b.name}`} pending={pending} onSave={(v, done) => run(() => saveBrandAction(b.id, v), done)} />
              <span className="font-mono text-[11px] opacity-55">{b.productCount} products</span>
              <DeleteWithMove
                label={`brand ${b.name}`}
                count={b.productCount}
                targets={brands.filter((x) => x.id !== b.id)}
                pending={pending}
                onDelete={(moveTo, done) => run(() => deleteBrandAction(b.id, moveTo), done)}
              />
            </li>
          ))}
          <li className="pt-1">
            <AddRow placeholder="New brand" pending={pending} onAdd={(name, done) => run(() => saveBrandAction(null, name), done)} />
          </li>
        </ul>
      </section>
    </div>
  );
}
