import "server-only";
import { revalidatePath, updateTag } from "next/cache";
import { CATALOG_TAG } from "../catalog";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string; conflict?: boolean };

export const UUID = /^[0-9a-f-]{36}$/i;
export const fail = (error: string): ActionResult => ({ ok: false, error });

/** Storefront caches after a catalog change: nav/showcase data cache and prerendered pages. */
export function refreshStorefront() {
  updateTag(CATALOG_TAG);
  revalidatePath("/", "layout");
}

/**
 * Database errors → admin-facing results. Our functions raise 22023 for validation and
 * P0001 + a hint for rule violations ('conflict' = someone else saved first); both carry
 * messages written for the admin.
 */
export function dbError(error: { code?: string; hint?: string; message: string }): ActionResult {
  if (error.hint === "conflict") return { ok: false, error: error.message, conflict: true };
  if (error.code === "22023" || error.hint) return { ok: false, error: error.message };
  if (error.code === "23505") return { ok: false, error: "That name or SKU is already taken." };
  console.error("admin action failed", error);
  return { ok: false, error: "That didn’t work. Reload the page and try again." };
}
