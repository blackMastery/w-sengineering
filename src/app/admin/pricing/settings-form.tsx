"use client";

import { saveSettingsAction } from "../actions";
import { ActionMessage, useAdminAction } from "../use-admin-action";

export function SettingsForm({ exchangeRate, markupPct }: { exchangeRate: number | null; markupPct: number | null }) {
  const { pending, message, run } = useAdminAction();
  const input = "h-10 w-36 rounded-lg border border-navy/30 bg-white/70 px-3 text-right tabular-nums outline-none focus:border-navy";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const rate = Number(String(f.get("rate")).replace(/,/g, ""));
        const markup = Number(String(f.get("markup")).replace(/[%,]/g, ""));
        if (!confirm("This reprices every variant that has a USD cost and no override. Continue?")) return;
        run(() => saveSettingsAction(rate, markup));
      }}
    >
      <div className="flex flex-wrap gap-6">
        <label className="flex flex-col gap-1">
          <span className="font-medium">Exchange rate</span>
          <span className="text-[12.5px] opacity-65">GYD per 1 US dollar</span>
          <input name="rate" inputMode="decimal" required defaultValue={exchangeRate ?? ""} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium">Markup %</span>
          <span className="text-[12.5px] opacity-65">Added on top of converted cost</span>
          <input name="markup" inputMode="decimal" required defaultValue={markupPct ?? ""} className={input} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="h-10 rounded-lg bg-navy px-5 font-semibold text-cream-2 disabled:opacity-60">
          {pending ? "Saving…" : "Save pricing"}
        </button>
        <ActionMessage message={message} />
      </div>
    </form>
  );
}
