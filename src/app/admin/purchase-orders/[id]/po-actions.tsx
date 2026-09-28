"use client";

import { useRouter } from "next/navigation";
import { ActionMessage, useAdminAction } from "../../use-admin-action";
import { setPoStatusAction } from "../../orders/actions";

export function PoActions({ poId, status }: { poId: string; status: "draft" | "sent" | "received" }) {
  const router = useRouter();
  const { pending, message, run } = useAdminAction();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <a href={`/admin/purchase-orders/${poId}/csv`} className="flex h-10 items-center rounded-lg border border-navy/35 px-4 font-medium" download>
          Export CSV
        </a>
        {status === "draft" && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm("Mark this purchase order as sent to the supplier? Its orders move to “Ordered from supplier” and the PO can no longer change.")) {
                  run(() => setPoStatusAction(poId, "sent"));
                }
              }}
              className="h-10 rounded-lg bg-navy px-4 font-semibold text-cream-2 disabled:opacity-50"
            >
              Mark sent
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm("Delete this draft? Its orders go back to “Ready to order”.")) {
                  run(() => setPoStatusAction(poId, "deleted"), () => router.push("/admin/purchase-orders"));
                }
              }}
              className="h-10 rounded-lg border border-navy/35 px-4 font-medium text-red-800 disabled:opacity-50"
            >
              Delete draft
            </button>
          </>
        )}
        {status === "sent" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm("Mark everything on this purchase order as received?")) run(() => setPoStatusAction(poId, "received"));
            }}
            className="h-10 rounded-lg bg-navy px-4 font-semibold text-cream-2 disabled:opacity-50"
          >
            Mark received
          </button>
        )}
      </div>
      <ActionMessage message={message} />
    </div>
  );
}
