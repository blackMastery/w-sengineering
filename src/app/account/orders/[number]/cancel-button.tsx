"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError } from "@/components/form";
import { cancelOrderAction } from "@/app/checkout/actions";

export function CancelOrderButton({ orderId, number }: { orderId: string; number: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="h-11 self-start rounded-lg border border-navy/35 px-4 text-sm font-medium">
        Cancel order request
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-navy/20 p-4">
      <p className="text-[14px]">Cancel {number}? This can’t be undone. You can place a new request any time.</p>
      <FormError>{error}</FormError>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            const res = await cancelOrderAction(orderId, number);
            setPending(false);
            if (!res.ok) setError(res.error ?? "Couldn’t cancel.");
            else setConfirming(false);
            router.refresh();
          }}
          className="h-11 rounded-lg bg-navy px-4 text-sm font-semibold text-cream-2 disabled:opacity-60"
        >
          {pending ? "Cancelling…" : "Yes, cancel it"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="h-11 rounded-lg px-4 text-sm underline">
          Keep it
        </button>
      </div>
    </div>
  );
}
