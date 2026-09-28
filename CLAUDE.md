# W&S Engineering Store

Mobile-first e-commerce store reselling Kraft Tool Co. products. Customers place **order requests** (no online payment); W&S orders from the supplier, then invoices what arrived. Full product decisions: `docs/SPEC.md` — read it before building a feature, and follow it over your own assumptions.

Stack: Next.js (App Router, TypeScript, Tailwind) · Supabase (Postgres, Auth, Storage, RLS) · Resend · Vercel.

## Status

- ✅ Build steps 1–2: catalog schema + RLS (`supabase/migrations/0001_catalog.sql`), storage bucket (`0002_storage.sql`), seed with 955 products / 4,493 variants / 2,031 images (`supabase/seed.sql`), photos in `data/images/`.
- ✅ Photos uploaded to the hosted Storage bucket (`product-images/catalog/`, 1,300 files).
- ✅ Build step 3, storefront (see "Storefront" below).
- ✅ Build step 4 code: auth, cart merge, checkout, order placement, account pages; `supabase/migrations/0003_orders.sql` tested on local Supabase.
- ⚠️ **0003 is not on the hosted project yet** — the owner applies it (`supabase db push`). Until then hosted checkout/account pages fail. Also in the hosted dashboard: Authentication → URL Configuration (Site URL + redirect URLs incl. `/auth/confirm`), and paste `supabase/templates/*.html` into Authentication → Emails (confirm signup, reset password).
- ⏭ Next: step 5, admin (`docs/SPEC.md` → Build order).
- **Node 22+ required** (`.nvmrc`): supabase-js needs native WebSocket, and Node 20 throws on client creation.

## Repo map

```
CLAUDE.md                     this file
docs/SPEC.md                  product spec (source of truth)
docs/design/wireframes.html   brand wireframes — open in a browser (self-contained bundle)
docs/catalog/                 put the source PDF here to re-run extraction (gitignored)
supabase/migrations/          0001_catalog.sql, 0002_storage.sql
supabase/seed.sql             generated — do not hand-edit; regenerate via scripts/catalog/run.sh
scripts/catalog/              PDF → products.json → images → seed.sql pipeline (Python)
scripts/upload-images.mjs     uploads data/images/*.webp to Storage bucket product-images/catalog/
data/products.json            extracted catalog
data/images/                  1,300 product photos (webp, transparent)
data/images.json              product slug → image files
data/variants_review.csv      every SKU, for human review of names/options
```

## Setup

```bash
# 1. scaffold Next.js — create-next-app refuses non-empty dirs, so scaffold aside and move in
npx create-next-app@latest /tmp/ws-app --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
rsync -a --ignore-existing /tmp/ws-app/ ./ && rm -rf /tmp/ws-app
npm i @supabase/supabase-js @supabase/ssr

# 2. local Supabase (keeps the existing migrations and seed)
supabase init            # creates supabase/config.toml; answer no to overwriting anything
supabase start
supabase db reset        # applies migrations, then seed.sql
cp .env.example .env.local   # fill from `supabase status`

# 3. photos into local Storage
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... node scripts/upload-images.mjs data/images

# make yourself admin after signing up
# update profiles set role = 'admin' where id = '<auth user id>';
```

Local Supabase: `supabase start` then `supabase db reset` (config in `supabase/config.toml`: email confirmation on, emails land in Mailpit at http://127.0.0.1:54324). To run the app against local, export the local `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` from `supabase status -o env` before `npm run dev`/`build` (shell env beats `.env`; `NEXT_PUBLIC_*` is baked in at build time). Local projects don't auto-grant tables to `anon`/`authenticated` (hosted does), so every migration must `grant` explicitly.

## Data rules (don't break these)

- **Prices:** read `variant_prices.price` (local currency, whole units). `null` → show **"Price on request"**; still orderable. Never compute price in the client.
- **`usd_cost` is confidential.** anon/authenticated have no column grant on it. Admin features read/write it in server code with `SUPABASE_SERVICE_ROLE_KEY` (server-only module; never import into client components). Check `is_admin()` / `profiles.role` before using the service client.
- **No stock.** `variants.is_orderable = false` means discontinued: hide it, block add-to-cart. No "in stock" / "only X left" UI anywhere.
- **Variant picker:** options come from `product_options` (name + ordered `values`); a variant's `option_values` is `{ "Handle": "Cork", "Size": "14\"x4\"" }`. Only offer combinations that exist in `variants` (options are dependent, e.g. Size and Shank). Selecting updates SKU + price.
- **Specs:** `products.specs` holds attributes that are the same for every variant; `products.features` is a bullet list.
- **Images:** `product_images.storage_path` → `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${storage_path}`. Ordered by `sort`. 50 products have none → placeholder. Add the Supabase host to `next.config` `images.remotePatterns`.
- **Categories:** 6 `category_groups` → `categories` (subcategories). Brand is a filter, not a category.
- **`needs_review`** products have weak names from extraction; show them normally, surface them in admin.
- **Orders** (step 4+): order lines snapshot `unit_price` at order time; totals are an *estimate* until invoiced; status changes only through Postgres functions.
- **Schema changes:** new numbered migrations in `supabase/migrations/`. Don't edit 0001/0002 once deployed. If the catalog tables change, update `scripts/catalog/make_seed.py` so the seed still loads.

## Design

Match `docs/design/wireframes.html`. Tokens: navy `#13204a`, cream `#fbf8f1` / `#f6efe0`, gold `#b8894a` / `#dcbf8f`; EB Garamond (headings), IBM Plex Sans (body), IBM Plex Mono (SKUs/labels), Yellowtail (wordmark) via `next/font/google`. Put tokens in the Tailwind theme, not inline hex.

Mobile-first (most customers are on phones): design at 375px first. No hover-only interactions. Mega menu → category sheet; ⌘K palette → full-screen search (keep ⌘K on desktop); cart drawer → bottom sheet; filter pills scroll horizontally; tiles 2 columns on mobile.

Wireframe items to **drop**: promo code field, "Request a trade quote", free-shipping line, stock badges/filters, "built in our own workshop" hero claim (W&S is a reseller). Checkout button text: "Place order request".

## Storefront (build step 3) — code map

- `src/lib/catalog.ts` — every public catalog read (server-only, cookie-less anon client in `lib/supabase/public.ts`). Listings filter/sort/paginate in memory (a group is ≤ ~470 products) because "from" price sorting needs the min over variants.
- Caching: groups + per-subcategory showcase use `unstable_cache` (5 min, tag `catalog`); the root layout has `revalidate = 300`. Admin saves in step 5 must call `revalidateTag("catalog")`. Product/listing pages render per request.
- `src/lib/variant-picker.ts` — hierarchical option picker. Handles messy extraction data: variants missing an option key show as "Standard"; identical option combos fall through to a "Part #" chooser; options with one value are hidden.
- `src/lib/cart-store.ts` + `components/cart/` — guest cart (`localStorage` key `ws-cart-v1`, variant id + qty). Line details come from the `cartLinesAction` server action; discontinued lines drop out.
- `src/app/actions.ts` — server actions for search-as-you-type and cart lines.
- Currency symbol lives in `src/lib/format.ts` (open question).

## Accounts & orders (build step 4) — code map

- `src/proxy.ts` refreshes the Supabase session cookie (`getClaims()`); `src/lib/auth.ts` `getUser()/requireUser()` for server pages.
- Sign in/up, sign out, reset run in the **browser** client (`/login`, `/signup`, `/forgot-password`, `/account/password`) so `components/auth/session-provider.tsx` sees auth events. Email links land on `src/app/auth/confirm/route.ts` (token-hash links from our templates, or default `?code=` links).
- `components/cart/cart-sync.tsx`: first sign-in on a device → `merge_cart` (higher qty wins); later visits → account cart wins; signed-in edits → `set_cart` (debounced); sign-out clears the device cart. `localStorage` `ws-cart-owner` records whose cart it is.
- Checkout: `src/app/checkout/` → server action → `place_order()` (re-validates lines, snapshots prices, empties cart). Order pages: `/account`, `/account/orders/[number]` (timeline, cancel while Pending via `cancel_order()`).
- Order numbers `WS-1001…` from `order_number_seq` (owner decision). Statuses in `src/lib/order-status.ts` match the DB check constraint.
- supabase-js builders are lazy: always `await` an `.rpc()`/query or it never runs.

## First task: storefront (build step 3)

1. Scaffold (Setup above), Tailwind theme + fonts, Supabase server/browser clients (`@supabase/ssr`).
2. Layout: header with wordmark, search, cart; mobile category sheet; footer.
3. Home: hero (reseller copy), 6 category group tiles, Best sellers (`is_featured`), New arrivals (`is_new`). Both lists are empty until an admin flags products — fall back to a few products with images.
4. `/c/[group]` and `/c/[group]/[category]`: grid of products (image, name, brand, "from" price or "Price on request"), subcategory tabs, brand filter, sort (name, price), pagination.
5. `/p/[slug]`: gallery, name, brand, option pickers, SKU, price, qty, add to cart, features, specs table, related products.
6. Search: products by name + variants by SKU (`ilike` on sku is fine at this size; there's a GIN full-text index on products).
7. Guest cart in localStorage (variant id + qty), cart page + bottom sheet/drawer, estimate total with "Price on request" lines called out.

Verify on a 375px viewport and desktop. Use server components for catalog reads.

## Catalog pipeline

`scripts/catalog/run.sh` rebuilds `data/*` and `supabase/seed.sql` from the PDF (deterministic UUIDs, so ids stay stable and the seed is idempotent). Needs Python 3 with `pip install -r scripts/catalog/requirements.txt` and the PDF at `docs/catalog/kraft-catalog-0126.pdf`. Known gaps: pp. 46–47 blade cross-reference, pp. 61/138 layouts, pages 188+ (display fixtures, apparel) excluded.

## Open questions (ask the owner, don't guess)

Store contact details / pickup location & hours · starting exchange rate and markup · invoice number format (orders are WS-1001…) · Resend domain and sender · whether to sell apparel.
