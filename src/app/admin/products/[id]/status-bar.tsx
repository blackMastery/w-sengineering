"use client";

import { useState } from "react";
import type { ProductStatus } from "@/lib/admin/data";
import { deleteProductAction, duplicateProductAction, setProductStatusAction } from "../actions";
import { ActionMessage, useAdminAction } from "../../use-admin-action";

const TONE: Record<ProductStatus, string> = {
  draft: "bg-gold-light/60 text-navy",
  published: "bg-navy text-cream-2",
  archived: "bg-navy/10 text-navy/70",
};
const LABEL: Record<ProductStatus, string> = { draft: "Draft", published: "Published", archived: "Archived" };
const primary = "h-10 rounded-lg bg-navy px-4 font-semibold text-cream-2 disabled:opacity-40";
const secondary = "h-10 rounded-lg border border-navy/35 px-4 font-medium disabled:opacity-40";

export function StatusPillProduct({ status }: { status: ProductStatus }) {
  return <span className={`rounded-full px-2.5 py-1 font-mono text-[11.5px] font-medium ${TONE[status]}`}>{LABEL[status]}</span>;
}

/** Status, publish checklist, and lifecycle actions for one product. */
export function StatusBar({
  productId,
  status,
  problems,
  hasHistory,
}: {
  productId: string;
  status: ProductStatus;
  problems: string[];
  hasHistory: boolean;
}) {
  const { pending, message, run } = useAdminAction();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const setStatus = (s: ProductStatus) => run(() => setProductStatusAction([productId], s));

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-navy/12 p-3">
      {status === "draft" && (
        <div>
          <p className="font-medium">{problems.length ? "Before you can publish:" : "Ready to publish."}</p>
          {problems.length > 0 && (
            <ul className="mt-1 flex flex-col gap-0.5 text-[13.5px]">
              {problems.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <span aria-hidden className="text-gold">○</span>
                  {p}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[12.5px] opacity-60">Drafts are hidden from the store. Variants without a price show “Price on request”.</p>
        </div>
      )}
      {status === "archived" && (
        <p className="text-[13.5px] opacity-80">Archived: hidden from the store and from the default product list. Customers with an old link see “No longer available”.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {status === "draft" && (
          <button type="button" className={primary} disabled={pending || problems.length > 0} onClick={() => setStatus("published")}>
            Publish
          </button>
        )}
        {status === "published" && (
          <button type="button" className={secondary} disabled={pending} onClick={() => setStatus("draft")}>
            Unpublish (back to draft)
          </button>
        )}
        {status !== "archived" && (
          <button
            type="button"
            className={secondary}
            disabled={pending}
            onClick={() => {
              if (confirm("Archive this product? It disappears from the store; you can restore it later.")) setStatus("archived");
            }}
          >
            Archive
          </button>
        )}
        {status === "archived" && (
          <button type="button" className={primary} disabled={pending} onClick={() => setStatus("draft")}>
            Restore as draft
          </button>
        )}
        <button type="button" className={secondary} disabled={pending} onClick={() => run(() => duplicateProductAction(productId))}>
          Duplicate
        </button>
        {!(status === "archived" && hasHistory) && (
          <button type="button" className={`${secondary} text-red-800`} disabled={pending} onClick={() => setConfirmDelete(true)}>
            Delete…
          </button>
        )}
      </div>

      {confirmDelete && (
        <div role="alertdialog" aria-label="Delete product" className="flex flex-col gap-2 rounded-lg border border-red-800/30 bg-red-50/60 p-3">
          <p className="text-[14px]">
            {hasHistory
              ? "This product has been ordered, so it can’t be deleted. It will be archived instead (hidden, restorable, order history kept)."
              : "Delete this product permanently? Its variants and the photos you uploaded for it are removed. This can’t be undone."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => deleteProductAction(productId), () => setConfirmDelete(false))}
              className="h-10 rounded-lg bg-red-800 px-4 font-semibold text-white disabled:opacity-50"
            >
              {hasHistory ? "Archive it" : "Delete permanently"}
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="h-10 px-3 underline">
              Keep it
            </button>
          </div>
        </div>
      )}
      <ActionMessage message={message} />
    </div>
  );
}
