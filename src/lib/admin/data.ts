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

/** SKU prefix filter: same characters a SKU may contain. */
export const cleanSkuPrefix = (s: string | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9/-]/g, "").slice(0, 20);

// ---------------------------------------------------------------------------------------
// Product list

export type ProductStatus = "draft" | "published" | "archived";
export const STATUS_LABEL: Record<ProductStatus, string> = { draft: "Draft", published: "Published", archived: "Archived" };

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
  status: ProductStatus;
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

/** status "active" = draft + published (the default view; archived is its own tab). */
export async function listAdminProducts(opts: {
  q?: string;
  categoryId?: string;
  flag?: ProductFlag;
  status?: ProductStatus | "active" | "all";
  page: number;
}) {
  let query = adminDb()
    .from("admin_products")
    .select(
      "id, slug, name, status, needs_review, is_featured, is_new, brand, category, group_name, variant_count, orderable_count, unpriced_count, image_count, image, skus",
      { count: "exact" },
    );
  const q = cleanSearch(opts.q);
  if (q) query = query.or(`name.ilike.*${q}*,skus.ilike.*${q}*`);
  if (opts.categoryId) query = query.eq("category_id", opts.categoryId);
  const status = opts.status ?? "active";
  if (status === "active") query = query.in("status", ["draft", "published"]);
  else if (status !== "all") query = query.eq("status", status);
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

export async function productStatusCounts(): Promise<Record<ProductStatus, number>> {
  const db = adminDb();
  const entries = await Promise.all(
    (["draft", "published", "archived"] as const).map(async (s) => {
      const r = await db.from("products").select("id", { count: "exact", head: true }).eq("status", s);
      if (r.error) throw new Error(r.error.message);
      return [s, r.count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<ProductStatus, number>;
}

export async function searchAdminProducts(q: string, excludeId?: string) {
  const term = cleanSearch(q);
  if (term.length < 2) return [];
  let query = adminDb()
    .from("admin_products")
    .select("id, slug, name, brand, image, skus")
    .or(`name.ilike.*${term}*,skus.ilike.*${term}*`)
    .neq("status", "archived")
    .order("name")
    .limit(10);
  if (excludeId) query = query.neq("id", excludeId);
  return check(await query) as { id: string; slug: string; name: string; brand: string; image: string | null; skus: string | null }[];
}

// ---------------------------------------------------------------------------------------
// Product editor

export type AdminVariant = {
  id: string;
  sku: string | null; // drafts (e.g. duplicated products) may not have SKUs yet
  option_values: Record<string, string>;
  price: number | null; // GYD; null = Price on request
  is_orderable: boolean;
  sort: number;
};

export type AdminOption = { name: string; values: string[] };

export type AdminProduct = {
  id: string;
  slug: string;
  name: string;
  status: ProductStatus;
  published_at: string | null;
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
  options: AdminOption[];
  variants: AdminVariant[];
  images: { id: string; storage_path: string; sort: number; variant_id: string | null }[];
  related: { id: string; slug: string; name: string; image: string | null }[];
  publishProblems: string[];
  hasHistory: boolean; // ordered or on a PO: delete archives instead
  orderedVariantIds: string[]; // variants that can only be discontinued, not deleted
};

export async function getAdminProduct(id: string): Promise<AdminProduct | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = adminDb();
  const [productRes, relatedRes, problemsRes, orderedRes, poRes] = await Promise.all([
    db
      .from("products")
      .select(
        "id, slug, name, status, published_at, description, features, specs, brand_id, category_id, is_featured, is_new, needs_review, catalog_page, updated_at, " +
          "product_options(name, sort, values), variants(id, sku, option_values, price, is_orderable, sort), " +
          "product_images(id, storage_path, sort, variant_id)",
      )
      .eq("id", id)
      .order("sort", { referencedTable: "product_options" })
      .order("sort", { referencedTable: "variants" })
      .order("sort", { referencedTable: "product_images" })
      .maybeSingle(),
    db.from("related_products").select("related_id").eq("product_id", id),
    db.rpc("publish_problems", { p_product: id }),
    db.from("order_lines").select("variant_id, variants!inner(product_id)").eq("variants.product_id", id).limit(1000),
    db.from("po_lines").select("variant_id, variants!inner(product_id)").eq("variants.product_id", id).limit(1000),
  ]);
  const p = check(productRes) as unknown as (Omit<AdminProduct, "options" | "variants" | "images" | "related" | "publishProblems" | "hasHistory" | "orderedVariantIds"> & {
    product_options: { name: string; sort: number; values: string[] }[];
    variants: AdminVariant[];
    product_images: AdminProduct["images"];
  }) | null;
  if (!p) return null;

  const relatedIds = (check(relatedRes) as { related_id: string }[]).map((r) => r.related_id);
  const related = relatedIds.length
    ? (check(await db.from("admin_products").select("id, slug, name, image").in("id", relatedIds).order("name")) as AdminProduct["related"])
    : [];
  const ordered = new Set(
    [...(check(orderedRes) as { variant_id: string }[]), ...(check(poRes) as { variant_id: string }[])].map((r) => r.variant_id),
  );
  const { count: productLines } = await db.from("order_lines").select("id", { count: "exact", head: true }).eq("product_id", id);

  const { product_options, product_images, ...rest } = p;
  return {
    ...rest,
    features: p.features ?? [],
    specs: p.specs ?? {},
    options: product_options.map((o) => ({ name: o.name, values: o.values })),
    variants: p.variants,
    images: product_images,
    related,
    publishProblems: (check(problemsRes) as string[] | null) ?? [],
    hasHistory: ordered.size > 0 || (productLines ?? 0) > 0,
    orderedVariantIds: [...ordered],
  };
}

export type Taxonomy = {
  brands: { id: string; name: string; productCount: number }[];
  groups: { id: string; name: string; slug: string; sort: number }[];
  categories: { id: string; name: string; slug: string; sort: number; group_id: string; group: string; productCount: number }[];
};

export async function getTaxonomy(): Promise<Taxonomy> {
  const db = adminDb();
  const [brands, groups, categories] = await Promise.all([
    db.from("brands").select("id, name, products(count)").order("name"),
    db.from("category_groups").select("id, name, slug, sort").order("sort"),
    db.from("categories").select("id, name, slug, sort, group_id, category_groups(name), products(count)").order("sort"),
  ]);
  return {
    brands: (check(brands) as unknown as { id: string; name: string; products: { count: number }[] }[]).map((b) => ({
      id: b.id,
      name: b.name,
      productCount: b.products[0]?.count ?? 0,
    })),
    groups: check(groups) as Taxonomy["groups"],
    categories: (
      check(categories) as unknown as {
        id: string;
        name: string;
        slug: string;
        sort: number;
        group_id: string;
        category_groups: { name: string };
        products: { count: number }[];
      }[]
    ).map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      sort: c.sort,
      group_id: c.group_id,
      group: c.category_groups.name,
      productCount: c.products[0]?.count ?? 0,
    })),
  };
}

// ---------------------------------------------------------------------------------------
// Pricing

export type PricingRow = {
  id: string;
  sku: string;
  option_values: Record<string, string>;
  price: number | null; // GYD
  is_orderable: boolean;
  product: { id: string; name: string; slug: string };
};

const PRICING_LIMIT = 500;

/** Variants whose SKU starts with a prefix, for bulk price entry (at most 500). */
export async function variantsByPrefix(prefix: string): Promise<{ rows: PricingRow[]; truncated: boolean }> {
  const p = cleanSkuPrefix(prefix);
  if (!p) return { rows: [], truncated: false };
  const db = adminDb();
  const res = await db
    .from("variants")
    .select("id, sku, option_values, price, is_orderable, products(id, name, slug)", { count: "exact" })
    .ilike("sku", `${p}%`)
    .order("sku")
    .limit(PRICING_LIMIT);
  const rows = check(res) as unknown as (Omit<PricingRow, "product"> & { products: PricingRow["product"] })[];
  return {
    rows: rows.map(({ products, ...r }) => ({ ...r, product: products })),
    truncated: (res.count ?? 0) > PRICING_LIMIT,
  };
}

/** Orderable variants of live products still showing "Price on request". */
export async function missingPrices(page: number, prefix?: string) {
  const db = adminDb();
  const size = 100;
  let query = db
    .from("variant_prices")
    .select("id, sku, option_values, products(id, name)", { count: "exact" })
    .eq("is_orderable", true)
    .is("price", null);
  const p = cleanSkuPrefix(prefix);
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
  const [products, drafts, needsReview, noImage, orderable, unpriced, pendingOrders] = await Promise.all([
    count(db.from("products").select("id", { count: "exact", head: true }).eq("status", "published")),
    count(db.from("products").select("id", { count: "exact", head: true }).eq("status", "draft")),
    count(db.from("products").select("id", { count: "exact", head: true }).eq("needs_review", true).neq("status", "archived")),
    count(db.from("admin_products").select("id", { count: "exact", head: true }).eq("image_count", 0).neq("status", "archived")),
    count(db.from("variant_prices").select("id", { count: "exact", head: true }).eq("is_orderable", true)),
    count(db.from("variant_prices").select("id", { count: "exact", head: true }).eq("is_orderable", true).is("price", null)),
    count(db.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending")),
  ]);
  return { products, drafts, needsReview, noImage, orderable, unpriced, pendingOrders };
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
