"use server";

import { type ActionResult, dbError, fail, refreshStorefront, UUID } from "@/lib/admin/action-helpers";
import { adminActor } from "@/lib/admin/auth";
import type { ProductStatus } from "@/lib/admin/data";
import { adminDb } from "@/lib/supabase/admin";

// Product lifecycle, options and variants. Each call is one audited, all-or-nothing database
// function (0007); these wrappers check the admin role and validate shapes.

const ids = (list: unknown): string[] => (Array.isArray(list) ? list.filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 500) : []);

// ---------------------------------------------------------------------------------------
// create / status / delete / duplicate

export type NavResult = ActionResult & { goTo?: string };

export async function createProductAction(input: { name: string; brandId: string; categoryId: string }): Promise<NavResult> {
  const actor = await adminActor();
  const { data, error } = await adminDb().rpc("admin_create_product", {
    p_actor: actor,
    p_name: String(input?.name ?? ""),
    p_brand: UUID.test(input?.brandId) ? input.brandId : null,
    p_category: UUID.test(input?.categoryId) ? input.categoryId : null,
  });
  if (error) return dbError(error);
  return { ok: true, goTo: `/admin/products/${data as string}?created=1` };
}

export type StatusResult = ActionResult & {
  changed?: number;
  failed?: { id: string; name: string; problems: string[] }[];
  openOrders?: string[];
};

export async function setProductStatusAction(productIds: string[], status: ProductStatus): Promise<StatusResult> {
  const actor = await adminActor();
  const list = ids(productIds);
  if (!list.length || !["draft", "published", "archived"].includes(status)) return fail("Nothing selected.");
  const { data, error } = await adminDb().rpc("admin_set_product_status", { p_actor: actor, p_ids: list, p_status: status });
  if (error) return dbError(error);
  refreshStorefront();
  const r = data as { changed: number; failed: { id: string; name: string; problems: string[] }[]; open_orders: string[] };
  const verb = status === "published" ? "Published" : status === "archived" ? "Archived" : "Moved to draft";
  const parts = [r.changed ? `${verb} ${r.changed} ${r.changed === 1 ? "product" : "products"}.` : "Nothing changed."];
  if (r.failed.length) parts.push(`${r.failed.length} couldn’t be published yet.`);
  if (r.open_orders.length) parts.push(`Still on open orders: ${r.open_orders.join(", ")} (those orders are unaffected).`);
  return { ok: true, message: parts.join(" "), changed: r.changed, failed: r.failed, openOrders: r.open_orders };
}

/** Never-ordered → deleted (with its uploaded photos); otherwise archived. */
export async function deleteProductAction(productId: string): Promise<NavResult> {
  const actor = await adminActor();
  if (!UUID.test(productId)) return fail("Unknown product.");
  const db = adminDb();
  const { data, error } = await db.rpc("admin_delete_product", { p_actor: actor, p_id: productId });
  if (error) return dbError(error);
  const r = data as { deleted: boolean; uploads?: string[]; open_orders?: string[] };
  if (r.deleted && r.uploads?.length) await db.storage.from("product-images").remove(r.uploads);
  refreshStorefront();
  if (r.deleted) return { ok: true, goTo: "/admin/products?deleted=1" };
  return {
    ok: true,
    message: `This product has order history, so it was archived instead of deleted.${r.open_orders?.length ? ` Open orders: ${r.open_orders.join(", ")}.` : ""}`,
  };
}

export async function duplicateProductAction(productId: string): Promise<NavResult> {
  const actor = await adminActor();
  if (!UUID.test(productId)) return fail("Unknown product.");
  const { data, error } = await adminDb().rpc("admin_duplicate_product", { p_actor: actor, p_id: productId });
  if (error) return dbError(error);
  return { ok: true, goTo: `/admin/products/${data as string}?duplicated=1` };
}

// ---------------------------------------------------------------------------------------
// bulk edits from the product list

export type BulkFields = Partial<{ category_id: string; brand_id: string; is_featured: boolean; is_new: boolean; needs_review: boolean }>;

export async function bulkUpdateProductsAction(productIds: string[], fields: BulkFields): Promise<ActionResult> {
  const actor = await adminActor();
  const list = ids(productIds);
  if (!list.length) return fail("Nothing selected.");
  const clean: BulkFields = {};
  if (fields.category_id && UUID.test(fields.category_id)) clean.category_id = fields.category_id;
  if (fields.brand_id && UUID.test(fields.brand_id)) clean.brand_id = fields.brand_id;
  for (const k of ["is_featured", "is_new", "needs_review"] as const) if (typeof fields[k] === "boolean") clean[k] = fields[k];
  if (!Object.keys(clean).length) return fail("Nothing to change.");
  const { data, error } = await adminDb().rpc("admin_bulk_update_products", { p_actor: actor, p_ids: list, p_fields: clean });
  if (error) return dbError(error);
  refreshStorefront();
  const n = data as number;
  return { ok: true, message: `Updated ${n} ${n === 1 ? "product" : "products"}.` };
}

// ---------------------------------------------------------------------------------------
// options

export type OptionInput = { name: string; renamed_from?: string; values: { value: string; renamed_from?: string }[] };

export async function saveOptionsAction(
  productId: string,
  options: OptionInput[],
  expected: { name: string; values: string[] }[],
  removeVariants: boolean,
): Promise<ActionResult> {
  const actor = await adminActor();
  if (!UUID.test(productId) || !Array.isArray(options) || options.length > 10) return fail("Invalid options.");
  const { data, error } = await adminDb().rpc("admin_save_options", {
    p_actor: actor,
    p_product: productId,
    p_options: options.map((o) => ({
      name: String(o.name ?? ""),
      ...(o.renamed_from ? { renamed_from: String(o.renamed_from) } : {}),
      values: (o.values ?? []).slice(0, 100).map((v) => ({
        value: String(v.value ?? ""),
        ...(v.renamed_from ? { renamed_from: String(v.renamed_from) } : {}),
      })),
    })),
    p_expected: expected,
    p_remove_variants: !!removeVariants,
  });
  if (error) return dbError(error);
  refreshStorefront();
  const r = data as { discontinued: number; deleted: number };
  const extra = [r.deleted && `${r.deleted} unused variants deleted`, r.discontinued && `${r.discontinued} ordered variants discontinued`].filter(Boolean);
  return { ok: true, message: `Options saved.${extra.length ? ` ${extra.join(", ")}.` : ""}` };
}

// ---------------------------------------------------------------------------------------
// variants

type VariantFields = { sku: string | null; option_values: Record<string, string>; price: number | null; is_orderable: boolean; sort: number };
export type VariantOp =
  | ({ op: "create" } & VariantFields)
  | { op: "update"; id: string; set: Partial<VariantFields>; expect: Partial<VariantFields> }
  | { op: "delete"; id: string };

export type VariantsResult = ActionResult & { duplicates?: string[][] };

export async function saveProductVariantsAction(productId: string, ops: VariantOp[]): Promise<VariantsResult> {
  const actor = await adminActor();
  if (!UUID.test(productId) || !Array.isArray(ops)) return fail("Invalid changes.");
  if (ops.length === 0) return { ok: true, message: "No changes." };
  if (ops.length > 1000) return fail("Too many changes at once.");
  for (const o of ops) {
    if (o.op !== "create" && !UUID.test(o.id)) return fail("Unknown variant.");
    const f = o.op === "create" ? o : o.op === "update" ? o.set : null;
    if (f && "price" in f && f.price !== null && !(Number.isSafeInteger(f.price) && f.price! >= 0 && f.price! < 1e9)) {
      return fail("Prices must be whole GYD amounts.");
    }
  }
  const { data, error } = await adminDb().rpc("admin_save_variants", { p_actor: actor, p_product: productId, p_ops: ops });
  if (error) return dbError(error);
  refreshStorefront();
  const r = data as { created: number; updated: number; deleted: number; discontinued: number; duplicates: string[][] };
  const parts = [
    r.created && `${r.created} added`,
    r.updated && `${r.updated} updated`,
    r.deleted && `${r.deleted} deleted`,
    r.discontinued && `${r.discontinued} discontinued (they have order history)`,
  ].filter(Boolean);
  return { ok: true, message: parts.length ? `Variants saved: ${parts.join(", ")}.` : "No changes.", duplicates: r.duplicates };
}
