"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { parseGyd } from "@/lib/admin/paste";
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

/** Price input: "" → null (Price on request); "5,299" / "GYD 5,299" → 5299; anything else → NaN. */
export function parsePriceInput(input: string): number | null {
  if (input.trim() === "") return null;
  return parseGyd(input) ?? Number.NaN;
}
