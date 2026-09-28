import "server-only";
import { adminDb } from "../supabase/admin";

// Admin reads, with the service-role client. Callers must have passed requireAdmin().

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Admin query failed: ${res.error.message}`);
  return res.data as T;
}

/** Strip characters that have meaning inside a PostgREST or() filter. */
export function cleanSearch(q: string | undefined): string {
  return (q ?? "").replace(/[,()*%\\:"']/g, " ").trim().slice(0, 60);
}

// ---------------------------------------------------------------------------------------
// Product list

export const PRODUCT_FLAGS = {
  needs_review: "Needs review",
  unpriced: "Has unpriced variants",
  no_image: "No photo",
  featured: "Best seller",
  new: "New arrival",
  discontinued: "Fully discontinued",
} as const;
export type ProductFlag = keyof typeof PRODUCT_FLAGS;

export type AdminProductRow = {
  id: string;
  slug: string;
  name: string;
  needs_review: boolean;
  is_featured: boolean;
  is_new: boolean;
  brand: string;
  category: string;
  group_name: string;
  variant_count: number;
  orderable_count: number;
  unpriced_count: number;
  image_count: number;
  image: string | null;
  skus: string | null;
};

export const ADMIN_PAGE_SIZE = 50;

export async function listAdminProducts(opts: { q?: string; categoryId?: string; flag?: ProductFlag; page: number }) {
  let query = adminDb()
    .from("admin_products")
    .select(
      "id, slug, name, needs_review, is_featured, is_new, brand, category, group_name, variant_count, orderable_count, unpriced_count, image_count, image, skus",
      { count: "exact" },
    );
  const q = cleanSearch(opts.q);
  if (q) query = query.or(`name.ilike.*${q}*,skus.ilike.*${q}*`);
  if (opts.categoryId) query = query.eq("category_id", opts.categoryId);
  switch (opts.flag) {
    case "needs_review":
      query = query.eq("needs_review", true);
      break;
    case "unpriced":
      query = query.gt("unpriced_count", 0);
      break;
    case "no_image":
      query = query.eq("image_count", 0);
      break;
    case "featured":
      query = query.eq("is_featured", true);
      break;
    case "new":
      query = query.eq("is_new", true);
      break;
    case "discontinued":
      query = query.eq("orderable_count", 0);
      break;
  }
  const from = (opts.page - 1) * ADMIN_PAGE_SIZE;
  const res = await query.order("name").range(from, from + ADMIN_PAGE_SIZE - 1);
  return { rows: check(res) as AdminProductRow[], total: res.count ?? 0 };
}

export async function searchAdminProducts(q: string, excludeId?: string) {
  const term = cleanSearch(q);
  if (term.length < 2) return [];
  let query = adminDb()
    .from("admin_products")
    .select("id, slug, name, brand, image, skus")
    .or(`name.ilike.*${term}*,skus.ilike.*${term}*`)
    .order("name")
    .limit(10);
  if (excludeId) query = query.neq("id", excludeId);
  return check(await query) as { id: string; slug: string; name: string; brand: string; image: string | null; skus: string | null }[];
}

// ---------------------------------------------------------------------------------------
// Product editor

export type AdminVariant = {
  id: string;
  sku: string;
  option_values: Record<string, string>;
  usd_cost: number | null;
  price_override: number | null;
  is_orderable: boolean;
  sort: number;
  price: number | null; // computed by variant_prices
};

export type AdminProduct = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  features: string[];
  specs: Record<string, string>;
  brand_id: string;
  category_id: string;
  is_featured: boolean;
  is_new: boolean;
  needs_review: boolean;
  catalog_page: number | null;
  updated_at: string;
  variants: AdminVariant[];
  images: { id: string; storage_path: string; sort: number; variant_id: string | null }[];
  related: { id: string; slug: string; name: string; image: string | null }[];
};

export async function getAdminProduct(id: string): Promise<AdminProduct | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = adminDb();
  const [productRes, pricesRes, relatedRes] = await Promise.all([
    db
      .from("products")
      .select(
        "id, slug, name, description, features, specs, brand_id, category_id, is_featured, is_new, needs_review, catalog_page, updated_at, " +
          "variants(id, sku, option_values, usd_cost, price_override, is_orderable, sort), " +
          "product_images(id, storage_path, sort, variant_id)",
      )
      .eq("id", id)
      .order("sort", { referencedTable: "variants" })
      .order("sort", { referencedTable: "product_images" })
      .maybeSingle(),
    db.from("variant_prices").select("id, price").eq("product_id", id),
    db.from("related_products").select("related_id").eq("product_id", id),
  ]);
  const p = check(productRes) as unknown as (Omit<AdminProduct, "variants" | "images" | "related"> & {
    variants: Omit<AdminVariant, "price">[];
    product_images: AdminProduct["images"];
  }) | null;
  if (!p) return null;

  const priceById = new Map((check(pricesRes) as { id: string; price: number | null }[]).map((r) => [r.id, r.price]));
  const relatedIds = (check(relatedRes) as { related_id: string }[]).map((r) => r.related_id);
  const related = relatedIds.length
    ? (check(
        await db.from("admin_products").select("id, slug, name, image").in("id", relatedIds).order("name"),
      ) as AdminProduct["related"])
    : [];

  return {
    ...p,
    features: p.features ?? [],
    specs: p.specs ?? {},
    variants: p.variants.map((v) => ({ ...v, price: priceById.get(v.id) ?? null })),
    images: p.product_images,
    related,
  };
}

export async function getTaxonomy() {
  const db = adminDb();
  const [brands, categories] = await Promise.all([
    db.from("brands").select("id, name").order("name"),
    db.from("categories").select("id, name, sort, category_groups(name, sort)").order("sort"),
  ]);
  return {
    brands: check(brands) as { id: string; name: string }[],
    categories: (check(categories) as unknown as { id: string; name: string; category_groups: { name: string } }[]).map((c) => ({
      id: c.id,
      name: c.name,
      group: c.category_groups.name,
    })),
  };
}

// ---------------------------------------------------------------------------------------
// Pricing

export async function getSettings() {
  const row = check(await adminDb().from("settings").select("exchange_rate, markup_pct").eq("id", 1).maybeSingle()) as {
    exchange_rate: number | null;
    markup_pct: number | null;
  } | null;
  return { exchangeRate: row?.exchange_rate ?? null, markupPct: row?.markup_pct ?? null };
}

export type PricingRow = {
  id: string;
  sku: string;
  option_values: Record<string, string>;
  usd_cost: number | null;
  price_override: number | null;
  is_orderable: boolean;
  product: { id: string; name: string; slug: string };
  price: number | null;
};

const PRICING_LIMIT = 500;

/** Variants whose SKU starts with a prefix, for bulk cost entry (at most 500). */
export async function variantsByPrefix(prefix: string): Promise<{ rows: PricingRow[]; truncated: boolean }> {
  const p = prefix.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  if (!p) return { rows: [], truncated: false };
  const db = adminDb();
  const res = await db
    .from("variants")
    .select("id, sku, option_values, usd_cost, price_override, is_orderable, products(id, name, slug)", { count: "exact" })
    .ilike("sku", `${p}%`)
    .order("sku")
    .limit(PRICING_LIMIT);
  const rows = check(res) as unknown as (Omit<PricingRow, "price" | "product"> & { products: PricingRow["product"] })[];
  // Same prefix filter rather than an id list: 500 ids would overflow the request URL.
  const prices = rows.length
    ? (check(
        await db.from("variant_prices").select("id, price").ilike("sku", `${p}%`).order("sku").limit(PRICING_LIMIT),
      ) as { id: string; price: number | null }[])
    : [];
  const priceById = new Map(prices.map((r) => [r.id, r.price]));
  return {
    rows: rows.map(({ products, ...r }) => ({ ...r, product: products, price: priceById.get(r.id) ?? null })),
    truncated: (res.count ?? 0) > PRICING_LIMIT,
  };
}

/** Orderable variants still showing "Price on request", with SKU-prefix counts. */
export async function missingPrices(page: number, prefix?: string) {
  const db = adminDb();
  const size = 100;
  let query = db
    .from("variant_prices")
    .select("id, sku, option_values, products(id, name)", { count: "exact" })
    .eq("is_orderable", true)
    .is("price", null);
  const p = (prefix ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  if (p) query = query.ilike("sku", `${p}%`);
  const res = await query.order("sku").range((page - 1) * size, page * size - 1);
  return {
    rows: check(res) as unknown as { id: string; sku: string; option_values: Record<string, string>; products: { id: string; name: string } }[],
    total: res.count ?? 0,
    pageCount: Math.max(1, Math.ceil((res.count ?? 0) / size)),
  };
}

export async function getOverviewStats() {
  const db = adminDb();
  const count = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
    const r = await q;
    if (r.error) throw new Error(r.error.message);
    return r.count ?? 0;
  };
  const [products, needsReview, noImage, orderable, unpriced, pendingOrders] = await Promise.all([
    count(db.from("products").select("id", { count: "exact", head: true })),
    count(db.from("products").select("id", { count: "exact", head: true }).eq("needs_review", true)),
    count(db.from("admin_products").select("id", { count: "exact", head: true }).eq("image_count", 0)),
    count(db.from("variant_prices").select("id", { count: "exact", head: true }).eq("is_orderable", true)),
    count(db.from("variant_prices").select("id", { count: "exact", head: true }).eq("is_orderable", true).is("price", null)),
    count(db.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending")),
  ]);
  return { products, needsReview, noImage, orderable, unpriced, pendingOrders };
}

export async function recentAudit(limit = 15) {
  return check(
    await adminDb()
      .from("audit_log")
      .select("id, entity, entity_id, action, before, after, created_at, actor_id")
      .order("id", { ascending: false })
      .limit(limit),
  ) as { id: number; entity: string; entity_id: string; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; created_at: string; actor_id: string | null }[];
}
