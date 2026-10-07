import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { adminDb } from "./supabase/admin";
import { publicDb } from "./supabase/public";
import type { Group, ProductCard, ProductDetail, SearchResult, CartLineInfo, Variant } from "./types";

// All catalog reads for the storefront. Prices come from the variant_prices view only.

const CARD_SELECT =
  "id, slug, name, category_id, is_featured, is_new, brands(name, slug), " +
  "variant_prices(id, sku, price, is_orderable), product_images(storage_path, sort)";

type CardRow = {
  id: string;
  slug: string;
  name: string;
  category_id: string;
  is_featured: boolean;
  is_new: boolean;
  brands: { name: string; slug: string };
  variant_prices: { id: string; sku: string; price: number | null; is_orderable: boolean }[];
  product_images: { storage_path: string; sort: number }[];
};

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Catalog query failed: ${res.error.message}`);
  return res.data as T;
}

/** Card for a product tile, or null when every variant is discontinued. */
function toCard(row: CardRow): (ProductCard & { brandSlug: string; categoryId: string }) | null {
  const orderable = row.variant_prices.filter((v) => v.is_orderable);
  if (orderable.length === 0) return null;
  const priced = orderable.map((v) => v.price).filter((p): p is number => p != null);
  const distinct = new Set(orderable.map((v) => v.price));
  const image = [...row.product_images].sort((a, b) => a.sort - b.sort)[0]?.storage_path ?? null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brands.name,
    brandSlug: row.brands.slug,
    categoryId: row.category_id,
    image,
    price: priced.length ? Math.min(...priced) : null,
    hasFrom: distinct.size > 1,
    variantCount: orderable.length,
    quickAdd: orderable.length === 1 ? { variantId: orderable[0].id, sku: orderable[0].sku } : null,
    isFeatured: row.is_featured,
    isNew: row.is_new,
  };
}

function toCards(rows: CardRow[]) {
  return rows.map(toCard).filter((c) => c !== null);
}

// ---------------------------------------------------------------------------------------
// Navigation: groups → subcategories, with counts and a tile photo per group

// Navigation data is read on every page (header menu), so it is cached across requests.
// Admin saves (step 5) should call revalidateTag(CATALOG_TAG).
export const CATALOG_TAG = "catalog";
const SHARED_CACHE = { revalidate: 300, tags: [CATALOG_TAG] };

const SHOWCASE_PER_CATEGORY = 4;

/** A few photographed, well-named products per subcategory, for tiles and home-page fallbacks. */
const getShowcase = unstable_cache(
  async (categoryIds: string[]): Promise<Record<string, ProductCard[]>> => {
    const lists = await Promise.all(
      categoryIds.map(async (id) =>
        toCards(
          check(
            await publicDb
              .from("products")
              .select(CARD_SELECT.replace("product_images(", "product_images!inner("))
              .eq("category_id", id)
              .eq("needs_review", false)
              .order("catalog_page")
              .limit(SHOWCASE_PER_CATEGORY),
          ) as unknown as CardRow[],
        ),
      ),
    );
    return Object.fromEntries(categoryIds.map((id, i) => [id, lists[i]]));
  },
  ["catalog-showcase"],
  SHARED_CACHE,
);

const getGroupsCached = unstable_cache(
  async (): Promise<Group[]> => {
    type GroupRow = {
      id: string;
      name: string;
      slug: string;
      categories: { id: string; name: string; slug: string; products: { count: number }[] }[];
    };
    const groups = check(
      await publicDb
        .from("category_groups")
        .select("id, name, slug, sort, categories(id, name, slug, sort, products(count))")
        .order("sort")
        .order("sort", { referencedTable: "categories" }),
    ) as unknown as GroupRow[];

    const shaped = groups.map((g) => {
      const categories = g.categories
        .map((c) => ({ id: c.id, name: c.name, slug: c.slug, count: c.products[0]?.count ?? 0 }))
        .filter((c) => c.count > 0);
      return { id: g.id, name: g.name, slug: g.slug, categories, count: categories.reduce((n, c) => n + c.count, 0) };
    });

    const showcase = await getShowcase(shaped.flatMap((g) => g.categories.map((c) => c.id)));
    return shaped.map((g) => ({
      ...g,
      image: g.categories.map((c) => showcase[c.id]?.[0]?.image).find(Boolean) ?? null,
    }));
  },
  ["catalog-groups"],
  SHARED_CACHE,
);

export const getGroups = cache(() => getGroupsCached());

// ---------------------------------------------------------------------------------------
// Category listing

export type SortKey = "name" | "price-asc" | "price-desc";
export const PAGE_SIZE = 24;

export type Listing = {
  items: ProductCard[];
  total: number;
  page: number;
  pageCount: number;
  brands: { slug: string; name: string; count: number }[];
};

export async function getListing(opts: {
  categoryIds: string[];
  brand?: string;
  sort: SortKey;
  page: number;
}): Promise<Listing> {
  // A group has at most a few hundred products, so filter/sort/paginate in memory:
  // "from" price sorting needs the min over variants, which PostgREST can't order by.
  const rows = check(
    await publicDb
      .from("products")
      .select(CARD_SELECT)
      .in("category_id", opts.categoryIds)
      .order("name")
      .limit(1000),
  ) as unknown as CardRow[];
  const all = toCards(rows);

  const brandCounts = new Map<string, { slug: string; name: string; count: number }>();
  for (const c of all) {
    const b = brandCounts.get(c.brandSlug) ?? { slug: c.brandSlug, name: c.brand, count: 0 };
    b.count++;
    brandCounts.set(c.brandSlug, b);
  }

  let items = opts.brand ? all.filter((c) => c.brandSlug === opts.brand) : all;
  if (opts.sort === "name") {
    // Ignore leading quotes/brackets from extracted names, so '"Big John" Pry Bars' files under B
    const key = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, "");
    items = [...items].sort((a, b) => key(a.name).localeCompare(key(b.name), "en", { numeric: true }));
  } else {
    const dir = opts.sort === "price-asc" ? 1 : -1;
    // Unpriced products go last in either direction
    items = [...items].sort((a, b) =>
      a.price == null ? (b.price == null ? 0 : 1) : b.price == null ? -1 : (a.price - b.price) * dir,
    );
  }

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, opts.page), pageCount);
  return {
    items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total: items.length,
    page,
    pageCount,
    brands: [...brandCounts.values()].sort((a, b) => b.count - a.count),
  };
}

// ---------------------------------------------------------------------------------------
// Home page lists

export const getHomeLists = cache(async (): Promise<{ bestSellers: ProductCard[]; newArrivals: ProductCard[] }> => {
  const [featuredRes, newRes] = await Promise.all([
    publicDb.from("products").select(CARD_SELECT).eq("is_featured", true).order("name").limit(8),
    publicDb.from("products").select(CARD_SELECT).eq("is_new", true).order("updated_at", { ascending: false }).limit(8),
  ]);
  let bestSellers: ProductCard[] = toCards(check(featuredRes) as unknown as CardRow[]);
  let newArrivals: ProductCard[] = toCards(check(newRes) as unknown as CardRow[]);

  // Until an admin flags products, show photographed products spread across categories,
  // one per subcategory in catalog order (Best sellers) and a different one for New arrivals.
  if (bestSellers.length === 0 || newArrivals.length === 0) {
    const groups = await getGroups();
    const showcase = await getShowcase(groups.flatMap((g) => g.categories.map((c) => c.id)));
    const lists = Object.values(showcase);
    const nth = (n: number) => lists.map((list) => list[n]).filter(Boolean);
    if (bestSellers.length === 0) bestSellers = nth(0).slice(0, 8);
    if (newArrivals.length === 0) newArrivals = [...nth(1), ...nth(2)].slice(0, 8);
  }
  return { bestSellers, newArrivals };
});

// ---------------------------------------------------------------------------------------
// Product page

export const getProduct = cache(async (slug: string): Promise<ProductDetail | null> => {
  const row = check(
    await publicDb
      .from("products")
      .select(
        "id, slug, name, description, features, specs, brands(name, slug), " +
          "categories(id, name, slug, category_groups(name, slug)), product_options(name, sort, values), " +
          "variant_prices(id, sku, option_values, price, is_orderable, sort), " +
          "product_images(id, storage_path, sort, variant_id)",
      )
      .eq("slug", slug)
      .order("sort", { referencedTable: "product_options" })
      .order("sort", { referencedTable: "variant_prices" })
      .order("sort", { referencedTable: "product_images" })
      .maybeSingle(),
  ) as unknown as {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    features: string[];
    specs: Record<string, string>;
    brands: { name: string; slug: string };
    categories: { id: string; name: string; slug: string; category_groups: { name: string; slug: string } };
    product_options: { name: string; values: string[] }[];
    variant_prices: { id: string; sku: string; option_values: Record<string, string>; price: number | null; is_orderable: boolean; sort: number }[];
    product_images: { id: string; storage_path: string; variant_id: string | null }[];
  } | null;
  if (!row) return null;

  const variants: Variant[] = row.variant_prices
    .filter((v) => v.is_orderable)
    .map((v) => ({ id: v.id, sku: v.sku, optionValues: v.option_values, price: v.price, sort: v.sort }));
  if (variants.length === 0) return null; // fully discontinued products are hidden

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    features: row.features ?? [],
    specs: row.specs ?? {},
    brand: row.brands,
    category: { id: row.categories.id, name: row.categories.name, slug: row.categories.slug },
    group: row.categories.category_groups,
    options: row.product_options.map((o) => ({ name: o.name, values: o.values })),
    variants,
    images: row.product_images.map((i) => ({ id: i.id, path: i.storage_path, variantId: i.variant_id })),
  };
});

/** Every live product for sitemap.xml: published (RLS) with at least one orderable variant. */
export async function getSitemapProducts(): Promise<{ slug: string; updatedAt: string; images: string[] }[]> {
  type Row = {
    slug: string;
    updated_at: string;
    variant_prices: { is_orderable: boolean }[];
    product_images: { storage_path: string; sort: number }[];
  };
  const rows: Row[] = [];
  // PostgREST caps responses at 1,000 rows, so page through.
  for (let from = 0; ; from += 1000) {
    const page = check(
      await publicDb
        .from("products")
        .select("slug, updated_at, variant_prices(is_orderable), product_images(storage_path, sort)")
        .order("slug")
        .range(from, from + 999),
    ) as unknown as Row[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows
    .filter((r) => r.variant_prices.some((v) => v.is_orderable))
    .map((r) => ({
      slug: r.slug,
      updatedAt: r.updated_at,
      images: [...r.product_images].sort((a, b) => a.sort - b.sort).map((i) => i.storage_path),
    }));
}

/** Admin-picked related products ("Often bought together"), else same-subcategory neighbours. */
export async function getRelated(product: ProductDetail, limit = 4): Promise<{ products: ProductCard[]; curated: boolean }> {
  const links = check(
    await publicDb.from("related_products").select("related_id").eq("product_id", product.id),
  ) as { related_id: string }[];

  if (links.length > 0) {
    const rows = check(
      await publicDb.from("products").select(CARD_SELECT).in("id", links.map((l) => l.related_id)),
    ) as unknown as CardRow[];
    const products = toCards(rows).slice(0, limit);
    if (products.length > 0) return { products, curated: true };
  }

  // No manual picks yet: neighbours from the same subcategory.
  return { products: await getCategoryNeighbours(product.category.id, product.id, limit), curated: false };
}

/** Other live products in a subcategory, preferring ones with photos. */
export async function getCategoryNeighbours(categoryId: string, excludeId: string, limit = 4): Promise<ProductCard[]> {
  const rows = check(
    await publicDb.from("products").select(CARD_SELECT).eq("category_id", categoryId).neq("id", excludeId).limit(24),
  ) as unknown as CardRow[];
  const cards = toCards(rows);
  return [...cards.filter((c) => c.image), ...cards.filter((c) => !c.image)].slice(0, limit);
}

// ---------------------------------------------------------------------------------------
// Slugs that don't resolve to a live product or category

export type UnavailableProduct = {
  id: string;
  name: string;
  image: string | null;
  category: { id: string; name: string; slug: string };
  group: { name: string; slug: string };
};

/**
 * A product slug with no live product behind it. Returns where it moved (renamed), a "no longer
 * available" page (archived, or published with every variant discontinued), or null (404).
 * Drafts — new or unpublished — are work in progress and stay invisible.
 */
export async function resolveMissingProduct(slug: string): Promise<{ redirectTo: string } | { unavailable: UnavailableProduct } | null> {
  const db = adminDb(); // reads non-published products; returns only public-safe fields
  const { data: redirect } = await db.from("slug_redirects").select("target_id").eq("kind", "product").eq("old_slug", slug).maybeSingle();
  const query = db
    .from("products")
    .select("id, slug, name, status, published_at, categories(id, name, slug, category_groups(name, slug)), product_images(storage_path, sort), variants(is_orderable)")
    .order("sort", { referencedTable: "product_images" })
    .limit(1, { referencedTable: "product_images" });
  const { data } = redirect ? await query.eq("id", redirect.target_id).maybeSingle() : await query.eq("slug", slug).maybeSingle();
  const p = data as unknown as {
    id: string;
    slug: string;
    name: string;
    status: string;
    published_at: string | null;
    categories: { id: string; name: string; slug: string; category_groups: { name: string; slug: string } };
    product_images: { storage_path: string }[];
    variants: { is_orderable: boolean }[];
  } | null;
  if (!p) return null;

  const live = p.status === "published" && p.variants.some((v) => v.is_orderable);
  if (live && p.slug !== slug) return { redirectTo: p.slug };
  if (!p.published_at || p.status === "draft") return null;
  return {
    unavailable: {
      id: p.id,
      name: p.name,
      image: p.product_images[0]?.storage_path ?? null,
      category: { id: p.categories.id, name: p.categories.name, slug: p.categories.slug },
      group: p.categories.category_groups,
    },
  };
}

/** Current path for an old or moved /c/{group}[/{category}] URL, or null if there's none. */
export async function resolveCategoryPath(groupSlug: string, categorySlug?: string): Promise<string | null> {
  const groups = await getGroups();
  const lookup = async (kind: "group" | "category", slug: string) =>
    (await publicDb.from("slug_redirects").select("target_id").eq("kind", kind).eq("old_slug", slug).maybeSingle()).data?.target_id as
      | string
      | undefined;

  if (categorySlug) {
    let hit = groups.flatMap((g) => g.categories.map((c) => ({ g, c }))).find((x) => x.c.slug === categorySlug);
    if (!hit) {
      const id = await lookup("category", categorySlug);
      hit = id ? groups.flatMap((g) => g.categories.map((c) => ({ g, c }))).find((x) => x.c.id === id) : undefined;
    }
    return hit ? `/c/${hit.g.slug}/${hit.c.slug}` : null;
  }

  const id = await lookup("group", groupSlug);
  const g = id ? groups.find((x) => x.id === id) : undefined;
  return g ? `/c/${g.slug}` : null;
}

// ---------------------------------------------------------------------------------------
// Search: product names (every word must match) plus SKUs

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export async function searchCatalog(query: string, limit = 48): Promise<SearchResult> {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return { products: [], categories: [] };

  const words = q.split(/\s+/).filter(Boolean);
  let nameQuery = publicDb.from("products").select(CARD_SELECT).order("name").limit(limit);
  for (const w of words) nameQuery = nameQuery.ilike("name", `%${escapeLike(w)}%`);

  const skuTerm = escapeLike(q.replace(/\s+/g, ""));
  const [nameRes, skuRes, groups] = await Promise.all([
    nameQuery,
    publicDb
      .from("variant_prices")
      .select("product_id, sku")
      .eq("is_orderable", true)
      .ilike("sku", `%${skuTerm}%`)
      .order("sku")
      .limit(limit),
    getGroups(),
  ]);

  const skuRows = check(skuRes) as { product_id: string; sku: string }[];
  // Prefer SKUs that start with the query, e.g. "CF2" → CF201C before XCF2...
  const upper = q.replace(/\s+/g, "").toUpperCase();
  skuRows.sort((a, b) => Number(!a.sku.toUpperCase().startsWith(upper)) - Number(!b.sku.toUpperCase().startsWith(upper)));
  const skuByProduct = new Map<string, string>();
  for (const r of skuRows) if (!skuByProduct.has(r.product_id)) skuByProduct.set(r.product_id, r.sku);

  const nameCards = toCards(check(nameRes) as unknown as CardRow[]);
  const missing = [...skuByProduct.keys()].filter((id) => !nameCards.some((c) => c.id === id));
  const skuCards = missing.length
    ? toCards(check(await publicDb.from("products").select(CARD_SELECT).in("id", missing)) as unknown as CardRow[])
    : [];

  const skuFirst = [...skuByProduct.keys()]
    .map((id) => skuCards.find((c) => c.id === id) ?? nameCards.find((c) => c.id === id))
    .filter((c) => c !== undefined);
  const products = [...skuFirst, ...nameCards.filter((c) => !skuByProduct.has(c.id))]
    .slice(0, limit)
    .map((c) => ({ ...c, matchedSku: skuByProduct.get(c.id) ?? null }));

  const lower = q.toLowerCase();
  const categories = groups.flatMap((g) => [
    ...(g.name.toLowerCase().includes(lower) ? [{ name: g.name, href: `/c/${g.slug}`, count: g.count }] : []),
    ...g.categories
      .filter((c) => c.name.toLowerCase().includes(lower))
      .map((c) => ({ name: c.name, href: `/c/${g.slug}/${c.slug}`, count: c.count })),
  ]);

  return { products, categories };
}

// ---------------------------------------------------------------------------------------
// Cart: current details for the variants in a guest cart. Discontinued or unknown ids are dropped.

export async function getCartLineInfo(variantIds: string[]): Promise<CartLineInfo[]> {
  const ids = [...new Set(variantIds)].filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 200);
  if (ids.length === 0) return [];
  const rows = check(
    await publicDb
      .from("variant_prices")
      .select("id, sku, price, option_values, is_orderable, products(slug, name, product_images(storage_path, sort, variant_id))")
      .in("id", ids)
      .eq("is_orderable", true),
  ) as unknown as {
    id: string;
    sku: string;
    price: number | null;
    option_values: Record<string, string>;
    products: { slug: string; name: string; product_images: { storage_path: string; sort: number; variant_id: string | null }[] };
  }[];

  return rows.map((r) => {
    const imgs = [...r.products.product_images].sort((a, b) => a.sort - b.sort);
    const img = imgs.find((i) => i.variant_id === r.id) ?? imgs[0];
    return {
      variantId: r.id,
      sku: r.sku,
      price: r.price,
      optionValues: r.option_values,
      productSlug: r.products.slug,
      productName: r.products.name,
      image: img?.storage_path ?? null,
    };
  });
}
