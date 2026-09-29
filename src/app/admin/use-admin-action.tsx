"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { parseGyd } from "@/lib/admin/paste";
import type { ActionResult } from "@/lib/admin/action-helpers";

type Message = { ok: boolean; text: string; conflict?: boolean } | null;

/**
 * Runs an admin server action and shows its message. On success it refreshes server data (or
 * navigates if the action returns `goTo`); a conflict error gets a Reload button.
 */
export function useAdminAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);

  const run = <T extends ActionResult & { goTo?: string }>(fn: () => Promise<T>, onOk?: (res: T) => void) =>
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.ok) {
          setMessage(res.message ? { ok: true, text: res.message } : null);
          onOk?.(res);
          if (res.goTo) router.push(res.goTo);
          else router.refresh();
        } else {
          setMessage({ ok: false, text: res.error, conflict: res.conflict });
        }
      } catch {
        setMessage({ ok: false, text: "That didn’t work. Your session may have ended; reload and try again." });
      }
    });

  return { pending, message, run, clear: () => setMessage(null) };
}

export function ActionMessage({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <span role={message.ok ? "status" : "alert"} className={`text-[13px] ${message.ok ? "text-navy/70" : "font-medium text-red-800"}`}>
      {message.text}
      {message.conflict && (
        <button type="button" onClick={() => window.location.reload()} className="ml-2 underline">
          Reload
        </button>
      )}
    </span>
  );
}

/**
 * Warn before leaving with unsaved edits: closing/reloading the tab (beforeunload) and clicking
 * a link inside the app (capture-phase click, so it runs before Next's Link navigates).
 */
export function useUnsavedGuard(dirty: boolean, what = "changes") {
  useEffect(() => {
    if (!dirty) return;
    const message = `You have unsaved ${what}. Leave without saving?`;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download") || e.metaKey || e.ctrlKey) return;
      if (new URL(a.href, location.href).origin !== location.origin) return;
      if (!confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, what]);
}

/** Price input: "" → null (Price on request); "5,299" / "GYD 5,299" → 5299; anything else → NaN. */
export function parsePriceInput(input: string): number | null {
  if (input.trim() === "") return null;
  return parseGyd(input) ?? Number.NaN;
}
