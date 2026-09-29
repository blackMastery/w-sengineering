"use server";

import { revalidatePath, updateTag } from "next/cache";
import { adminActor } from "@/lib/admin/auth";
import { searchAdminProducts } from "@/lib/admin/data";
import { CATALOG_TAG } from "@/lib/catalog";
import { adminDb } from "@/lib/supabase/admin";

// Every action re-checks the admin role: server actions are public endpoints.

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const UUID = /^[0-9a-f-]{36}$/i;
const fail = (error: string): ActionResult => ({ ok: false, error });

/** Storefront caches: the nav/showcase data cache and prerendered pages. */
function refreshStorefront() {
  updateTag(CATALOG_TAG);
  revalidatePath("/", "layout");
}

async function audit(actor: string, entity: string, entityId: string, action: string, before: unknown, after: unknown) {
  await adminDb().from("audit_log").insert({ actor_id: actor, entity, entity_id: entityId, action, before, after });
}

// ---------------------------------------------------------------------------------------
// Product details

export type ProductInput = {
  name: string;
  description: string;
  features: string[];
  specs: [string, string][];
  brand_id: string;
  category_id: string;
  is_featured: boolean;
  is_new: boolean;
  needs_review: boolean;
};

export async function saveProductAction(id: string, input: ProductInput): Promise<ActionResult> {
  const actor = await adminActor();
  if (!UUID.test(id)) return fail("Unknown product.");

  const name = String(input.name ?? "").trim().slice(0, 200);
  if (!name) return fail("Name is required.");
  if (!UUID.test(input.brand_id) || !UUID.test(input.category_id)) return fail("Choose a brand and category.");
  const features = (Array.isArray(input.features) ? input.features : [])
    .map((f) => String(f).trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 30);
  const specs: Record<string, string> = {};
  for (const pair of Array.isArray(input.specs) ? input.specs : []) {
    const k = String(pair?.[0] ?? "").trim().slice(0, 60);
    const v = String(pair?.[1] ?? "").trim().slice(0, 200);
    if (k && v) specs[k] = v;
  }
  const next = {
    name,
    description: String(input.description ?? "").trim().slice(0, 4000) || null,
    features,
    specs,
    brand_id: input.brand_id,
    category_id: input.category_id,
    is_featured: !!input.is_featured,
    is_new: !!input.is_new,
    needs_review: !!input.needs_review,
  };

  const db = adminDb();
  const { data: before, error: readError } = await db
    .from("products")
    .select("slug, name, description, features, specs, brand_id, category_id, is_featured, is_new, needs_review")
    .eq("id", id)
    .maybeSingle();
  if (readError || !before) return fail("Product not found.");

  const changed = Object.fromEntries(
    Object.entries(next).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k as keyof typeof before])),
  );
  if (Object.keys(changed).length === 0) return { ok: true, message: "No changes." };

  const { error } = await db.from("products").update({ ...changed, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return fail(`Couldn't save: ${error.message}`);
  await audit(
    actor,
    "product",
    id,
    "edit",
    Object.fromEntries(Object.keys(changed).map((k) => [k, before[k as keyof typeof before]])),
    changed,
  );
  refreshStorefront();
  return { ok: true, message: "Saved." };
}

// ---------------------------------------------------------------------------------------
// Variant GYD price and availability (also used by bulk price entry)

export type VariantChange = { id: string; price?: number | null; is_orderable?: boolean };

export async function saveVariantsAction(changes: VariantChange[]): Promise<ActionResult> {
  const actor = await adminActor();
  if (!Array.isArray(changes) || changes.length === 0) return { ok: true, message: "No changes." };
  if (changes.length > 2000) return fail("Too many rows at once (max 2000).");

  const clean: VariantChange[] = [];
  for (const c of changes) {
    if (!UUID.test(c?.id)) return fail("Unknown variant.");
    const row: VariantChange = { id: c.id };
    if ("price" in c) {
      if (c.price === null) row.price = null;
      else if (Number.isSafeInteger(c.price) && c.price! >= 0 && c.price! < 1e9) row.price = c.price;
      else return fail("Prices must be whole GYD amounts.");
    }
    if ("is_orderable" in c) row.is_orderable = !!c.is_orderable;
    clean.push(row);
  }

  // One atomic call: validates, updates and writes an audit row per changed variant.
  const { data, error } = await adminDb().rpc("admin_update_variants", { p_actor: actor, p_changes: clean });
  if (error) return fail(error.code === "22023" ? error.message : `Couldn't save: ${error.message}`);
  refreshStorefront();
  const n = data as number;
  return { ok: true, message: n === 0 ? "No changes." : `Saved ${n} ${n === 1 ? "variant" : "variants"}.` };
}

// ---------------------------------------------------------------------------------------
// Images

async function imageRow(imageId: string) {
  if (!UUID.test(imageId)) return null;
  const { data } = await adminDb().from("product_images").select("id, product_id, storage_path, sort, variant_id").eq("id", imageId).maybeSingle();
  return data as { id: string; product_id: string; storage_path: string; sort: number; variant_id: string | null } | null;
}

/** Renumber a product's images 0..n in the given order. */
async function resort(productId: string, orderedIds: string[]) {
  const db = adminDb();
  await Promise.all(orderedIds.map((id, i) => db.from("product_images").update({ sort: i }).eq("id", id).eq("product_id", productId)));
}

export async function moveImageAction(imageId: string, direction: -1 | 1): Promise<ActionResult> {
  await adminActor();
  const img = await imageRow(imageId);
  if (!img) return fail("Image not found.");
  const { data } = await adminDb().from("product_images").select("id").eq("product_id", img.product_id).order("sort").order("id");
  const ids = (data ?? []).map((r) => r.id as string);
  const i = ids.indexOf(imageId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= ids.length) return { ok: true };
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await resort(img.product_id, ids);
  refreshStorefront();
  return { ok: true };
}

export async function setImageVariantAction(imageId: string, variantId: string | null): Promise<ActionResult> {
  const actor = await adminActor();
  const img = await imageRow(imageId);
  if (!img) return fail("Image not found.");
  if (variantId) {
    const { data } = await adminDb().from("variants").select("id").eq("id", variantId).eq("product_id", img.product_id).maybeSingle();
    if (!data) return fail("That variant belongs to another product.");
  }
  const { error } = await adminDb().from("product_images").update({ variant_id: variantId }).eq("id", imageId);
  if (error) return fail(error.message);
  await audit(actor, "product", img.product_id, "image_variant", { image: img.storage_path, variant_id: img.variant_id }, { image: img.storage_path, variant_id: variantId });
  refreshStorefront();
  return { ok: true };
}

/** Move a wrongly matched photo to the product it belongs to (added last there). */
export async function reassignImageAction(imageId: string, targetProductId: string): Promise<ActionResult> {
  const actor = await adminActor();
  const img = await imageRow(imageId);
  if (!img || !UUID.test(targetProductId)) return fail("Image or product not found.");
  if (targetProductId === img.product_id) return { ok: true };
  const db = adminDb();
  const { data: last } = await db.from("product_images").select("sort").eq("product_id", targetProductId).order("sort", { ascending: false }).limit(1);
  const { error } = await db
    .from("product_images")
    .update({ product_id: targetProductId, variant_id: null, sort: (last?.[0]?.sort ?? -1) + 1 })
    .eq("id", imageId);
  if (error) return fail(error.message);
  await audit(actor, "product", img.product_id, "image_moved", { image: img.storage_path, product_id: img.product_id }, { image: img.storage_path, product_id: targetProductId });
  refreshStorefront();
  return { ok: true, message: "Photo moved." };
}

/** Removes the photo from the product. The file stays in Storage, so this is recoverable. */
export async function removeImageAction(imageId: string): Promise<ActionResult> {
  const actor = await adminActor();
  const img = await imageRow(imageId);
  if (!img) return fail("Image not found.");
  const { error } = await adminDb().from("product_images").delete().eq("id", imageId);
  if (error) return fail(error.message);
  await audit(actor, "product", img.product_id, "image_removed", { image: img.storage_path, sort: img.sort, variant_id: img.variant_id }, null);
  refreshStorefront();
  return { ok: true, message: "Photo removed." };
}

const IMAGE_TYPES: Record<string, string> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function uploadImageAction(productId: string, form: FormData): Promise<ActionResult> {
  const actor = await adminActor();
  if (!UUID.test(productId)) return fail("Unknown product.");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a photo to upload.");
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return fail("Use a WebP, PNG or JPEG photo.");
  if (file.size > MAX_IMAGE_BYTES) return fail("Photos must be 5 MB or smaller.");

  const db = adminDb();
  const path = `uploads/${productId}/${crypto.randomUUID()}.${ext}`;
  const upload = await db.storage
    .from("product-images")
    .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (upload.error) return fail(`Upload failed: ${upload.error.message}`);

  const { data: last } = await db.from("product_images").select("sort").eq("product_id", productId).order("sort", { ascending: false }).limit(1);
  const { error } = await db.from("product_images").insert({ product_id: productId, storage_path: path, sort: (last?.[0]?.sort ?? -1) + 1 });
  if (error) {
    await db.storage.from("product-images").remove([path]);
    return fail(error.message);
  }
  await audit(actor, "product", productId, "image_added", null, { image: path });
  refreshStorefront();
  return { ok: true, message: "Photo added." };
}

// ---------------------------------------------------------------------------------------
// Related products ("Often bought together")

export async function addRelatedAction(productId: string, relatedId: string): Promise<ActionResult> {
  const actor = await adminActor();
  if (!UUID.test(productId) || !UUID.test(relatedId) || productId === relatedId) return fail("Pick a different product.");
  const { error } = await adminDb().from("related_products").upsert({ product_id: productId, related_id: relatedId });
  if (error) return fail(error.message);
  await audit(actor, "product", productId, "related_added", null, { related_id: relatedId });
  refreshStorefront();
  return { ok: true };
}

export async function removeRelatedAction(productId: string, relatedId: string): Promise<ActionResult> {
  const actor = await adminActor();
  if (!UUID.test(productId) || !UUID.test(relatedId)) return fail("Unknown product.");
  const { error } = await adminDb().from("related_products").delete().eq("product_id", productId).eq("related_id", relatedId);
  if (error) return fail(error.message);
  await audit(actor, "product", productId, "related_removed", { related_id: relatedId }, null);
  refreshStorefront();
  return { ok: true };
}

export async function searchProductsAction(q: string, excludeId?: string) {
  await adminActor();
  return searchAdminProducts(String(q ?? ""), excludeId && UUID.test(excludeId) ? excludeId : undefined);
}
