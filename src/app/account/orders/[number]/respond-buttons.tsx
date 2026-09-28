"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError } from "@/components/form";
import { respondToChangesAction } from "@/app/checkout/actions";

export function RespondButtons({ orderId, number }: { orderId: string; number: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(approve: boolean) {
    setPending(approve ? "approve" : "reject");
    setError(null);
    const res = await respondToChangesAction(orderId, number, approve);
    setPending(null);
    if (!res.ok) setError(res.error ?? "That didn’t work.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <FormError>{error}</FormError>
      {confirmReject ? (
        <div className="flex flex-col gap-2 rounded-xl border border-navy/20 bg-white/60 p-3">
          <p className="text-[14px]">Rejecting cancels the whole order request. You can place a new one any time.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!!pending}
              onClick={() => answer(false)}
              className="h-11 rounded-lg bg-navy px-4 text-sm font-semibold text-cream-2 disabled:opacity-60"
            >
              {pending === "reject" ? "Cancelling…" : "Yes, reject and cancel"}
            </button>
            <button type="button" onClick={() => setConfirmReject(false)} className="h-11 px-3 text-sm underline">
              Go back
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!pending}
            onClick={() => answer(true)}
            className="h-12 flex-1 rounded-lg bg-navy px-5 text-[15px] font-semibold text-cream-2 disabled:opacity-60 sm:flex-none"
          >
            {pending === "approve" ? "Approving…" : "Approve changes"}
          </button>
          <button
            type="button"
            disabled={!!pending}
            onClick={() => setConfirmReject(true)}
            className="h-12 flex-1 rounded-lg border border-navy/35 px-5 text-[15px] font-medium disabled:opacity-60 sm:flex-none"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
