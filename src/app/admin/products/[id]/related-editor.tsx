"use client";

import Link from "next/link";
import { ProductImage } from "@/components/product-image";
import type { AdminProduct } from "@/lib/admin/data";
import { addRelatedAction, removeRelatedAction } from "../../actions";
import { ActionMessage, useAdminAction } from "../../use-admin-action";
import { ProductPicker } from "./product-picker";

export function RelatedEditor({ product }: { product: AdminProduct }) {
  const { pending, message, run } = useAdminAction();
  return (
    <div className="flex flex-col gap-3">
      {product.related.length === 0 ? (
        <p className="opacity-70">None picked. The store shows other products from the same subcategory instead.</p>
      ) : (
        <ul className="divide-y divide-navy/8 rounded-xl border border-navy/12">
          {product.related.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-2.5 py-2">
              <ProductImage path={r.image} alt="" sizes="36px" className="size-9 flex-none overflow-hidden rounded" />
              <Link href={`/admin/products/${r.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                {r.name}
              </Link>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => removeRelatedAction(product.id, r.id))}
                className="h-9 rounded-md border border-navy/30 px-3 text-[12.5px] disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <ProductPicker
        excludeId={product.id}
        placeholder="Add a product: search name or SKU"
        actionLabel="Add"
        disabled={pending}
        onPick={(h) => run(() => addRelatedAction(product.id, h.id))}
      />
      <ActionMessage message={message} />
    </div>
  );
}
