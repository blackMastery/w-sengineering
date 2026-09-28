"use client";

import { useRef, useState } from "react";
import { ProductImage } from "@/components/product-image";
import type { AdminProduct } from "@/lib/admin/data";
import {
  moveImageAction,
  reassignImageAction,
  removeImageAction,
  setImageVariantAction,
  uploadImageAction,
} from "../../actions";
import { ActionMessage, useAdminAction } from "../../use-admin-action";
import { ProductPicker } from "./product-picker";

const btn = "h-9 rounded-md border border-navy/30 px-2.5 text-[12.5px] font-medium disabled:opacity-40";

export function ImagesEditor({ product }: { product: AdminProduct }) {
  const { pending, message, run } = useAdminAction();
  const [moving, setMoving] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-4">
      {product.images.length === 0 && <p className="opacity-70">No photos. The store shows a placeholder.</p>}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {product.images.map((img, i) => (
          <li key={img.id} className="flex min-w-0 flex-col gap-2 rounded-xl border border-navy/12 p-2.5">
            <div className="relative">
              <ProductImage path={img.storage_path} alt="" sizes="300px" className="aspect-4/3 overflow-hidden rounded-lg" />
              {i === 0 && (
                <span className="absolute top-1.5 left-1.5 rounded bg-navy px-1.5 py-0.5 font-mono text-[10px] text-cream-2">MAIN</span>
              )}
            </div>
            <span className="truncate font-mono text-[11px] opacity-55">{img.storage_path}</span>
            <label className="flex items-center gap-2 text-[12.5px]">
              <span className="flex-none opacity-70">Shows for</span>
              <select
                value={img.variant_id ?? ""}
                disabled={pending}
                onChange={(e) => run(() => setImageVariantAction(img.id, e.target.value || null))}
                className="h-9 min-w-0 flex-1 rounded-md border border-navy/30 bg-white/70 px-1.5"
              >
                <option value="">All variants</option>
                {product.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.sku}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={btn} disabled={pending || i === 0} onClick={() => run(() => moveImageAction(img.id, -1))} aria-label="Move earlier">
                ←
              </button>
              <button
                type="button"
                className={btn}
                disabled={pending || i === product.images.length - 1}
                onClick={() => run(() => moveImageAction(img.id, 1))}
                aria-label="Move later"
              >
                →
              </button>
              <button type="button" className={btn} disabled={pending} onClick={() => setMoving(moving === img.id ? null : img.id)}>
                Wrong product?
              </button>
              <button
                type="button"
                className={`${btn} text-red-800`}
                disabled={pending}
                onClick={() => {
                  if (confirm("Remove this photo from the product? (The file is kept in storage.)")) run(() => removeImageAction(img.id));
                }}
              >
                Remove
              </button>
            </div>
            {moving === img.id && (
              <div className="rounded-lg bg-sand/60 p-2">
                <p className="mb-1.5 text-[12.5px]">Move this photo to:</p>
                <ProductPicker
                  excludeId={product.id}
                  placeholder="Search name or SKU"
                  actionLabel="Move here"
                  disabled={pending}
                  onPick={(h) => run(() => reassignImageAction(img.id, h.id), () => setMoving(null))}
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          run(() => uploadImageAction(product.id, form), () => {
            if (fileRef.current) fileRef.current.value = "";
          });
        }}
      >
        <input ref={fileRef} type="file" name="file" accept="image/webp,image/png,image/jpeg" required className="max-w-full text-[13px]" />
        <button disabled={pending} className="h-10 rounded-lg bg-navy px-4 font-semibold text-cream-2 disabled:opacity-60">
          {pending ? "Working…" : "Upload photo"}
        </button>
        <span className="text-[12.5px] opacity-60">WebP, PNG or JPEG up to 5 MB. Transparent backgrounds look best.</span>
      </form>
      <ActionMessage message={message} />
    </div>
  );
}
