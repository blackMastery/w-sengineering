"use client";

import { useState } from "react";
import type { OrderStatus } from "@/lib/order-status";
import { ActionMessage, useAdminAction } from "../../use-admin-action";
import { setOrderStatusAction, withdrawChangesAction } from "../actions";

const primary = "h-10 rounded-lg bg-navy px-4 font-semibold text-cream-2 disabled:opacity-50";
const secondary = "h-10 rounded-lg border border-navy/35 px-4 font-medium disabled:opacity-50";

export function OrderActions({ orderId, number, status }: { orderId: string; number: string; status: OrderStatus }) {
  const { pending, message, run } = useAdminAction();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const canCancel = ["pending", "confirmed", "ordered_from_supplier", "awaiting_approval", "received", "invoiced"].includes(status);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {status === "pending" && (
          <button type="button" disabled={pending} className={primary} onClick={() => run(() => setOrderStatusAction(orderId, number, "confirmed"))}>
            Confirm order
          </button>
        )}
        {status === "ordered_from_supplier" && (
          <button
            type="button"
            disabled={pending}
            className={secondary}
            onClick={() => {
              if (confirm("Mark this order as arrived without receiving a purchase order?")) run(() => setOrderStatusAction(orderId, number, "received"));
            }}
          >
            Mark arrived
          </button>
        )}
        {status === "awaiting_approval" && (
          <button type="button" disabled={pending} className={secondary} onClick={() => run(() => withdrawChangesAction(orderId, number))}>
            Withdraw proposed changes
          </button>
        )}
        {canCancel && !cancelling && (
          <button type="button" disabled={pending} className={`${secondary} text-red-800`} onClick={() => setCancelling(true)}>
            Cancel order…
          </button>
        )}
      </div>

      {cancelling && (
        <div className="flex flex-col gap-2 rounded-xl border border-red-800/25 bg-red-50/50 p-3">
          <label htmlFor="cancel-reason" className="font-medium">
            Reason (shown to the customer)
          </label>
          <textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="e.g. Discontinued by the supplier"
            className="rounded-lg border border-navy/30 bg-white px-3 py-2 outline-none focus:border-navy"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || !reason.trim()}
              className="h-10 rounded-lg bg-red-800 px-4 font-semibold text-white disabled:opacity-50"
              onClick={() => run(() => setOrderStatusAction(orderId, number, "cancelled", reason), () => setCancelling(false))}
            >
              {pending ? "Cancelling…" : "Cancel order"}
            </button>
            <button type="button" className="h-10 px-3 underline" onClick={() => setCancelling(false)}>
              Keep it
            </button>
          </div>
        </div>
      )}
      <ActionMessage message={message} />
    </div>
  );
}
