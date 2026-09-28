"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { buildPurchaseOrdersAction } from "../orders/actions";

export function BuildButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            const res = await buildPurchaseOrdersAction();
            if (!res.ok) return setMessage(res.error);
            if (res.poIds?.length === 1) router.push(`/admin/purchase-orders/${res.poIds[0]}`);
            else {
              setMessage(res.message ?? null);
              router.refresh();
            }
          })
        }
        className="h-10 rounded-lg bg-navy px-4 font-semibold text-cream-2 disabled:opacity-50"
      >
        {pending ? "Building…" : "Add to draft purchase order"}
      </button>
      {message && <span className="text-[13px] opacity-75">{message}</span>}
    </div>
  );
}
