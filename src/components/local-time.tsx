"use client";

import { useHydrated } from "./cart/cart-provider";

/** Formats in the viewer's timezone once hydrated; server render shows the UTC date only. */
export function LocalTime({ iso, withTime = false }: { iso: string; withTime?: boolean }) {
  const hydrated = useHydrated();
  const date = new Date(iso);
  const text = hydrated
    ? date.toLocaleString("en-US", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" })
    : date.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
  return <time dateTime={iso}>{text}</time>;
}
