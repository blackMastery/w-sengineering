"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "./actions";

/** Runs an admin server action, shows its message, and refreshes server data on success. */
export function useAdminAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (fn: () => Promise<ActionResult>, onOk?: () => void) =>
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.ok) {
          setMessage(res.message ? { ok: true, text: res.message } : null);
          onOk?.();
          router.refresh();
        } else {
          setMessage({ ok: false, text: res.error });
        }
      } catch {
        setMessage({ ok: false, text: "That didn’t work. Your session may have ended; reload and try again." });
      }
    });

  return { pending, message, run, clear: () => setMessage(null) };
}

export function ActionMessage({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <span role={message.ok ? "status" : "alert"} className={`text-[13px] ${message.ok ? "text-navy/70" : "font-medium text-red-800"}`}>
      {message.text}
    </span>
  );
}

/** "" → null; "$1,234.50" → 1234.5; anything else → NaN (invalid). */
export function parseMoney(input: string): number | null {
  const s = input.replace(/[$,\s]/g, "");
  if (s === "") return null;
  return /^\d+(\.\d{1,2})?$/.test(s) ? Number(s) : Number.NaN;
}
