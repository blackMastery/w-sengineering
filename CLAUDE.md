# W&S Engineering Store

Mobile-first e-commerce store reselling Kraft Tool Co. products. Customers place **order requests** (no online payment); W&S orders from the supplier, then invoices what arrived. Full product decisions: `docs/SPEC.md` — read it before building a feature, and follow it over your own assumptions.

Stack: Next.js (App Router, TypeScript, Tailwind) · Supabase (Postgres, Auth, Storage, RLS) · Resend · Vercel.

## Status

- ✅ Build steps 1–2: catalog schema + RLS (`supabase/migrations/0001_catalog.sql`), storage bucket (`0002_storage.sql`), seed with 955 products / 4,493 variants / 2,031 images (`supabase/seed.sql`), photos in `data/images/`.
- ✅ Photos uploaded to the hosted Storage bucket (`product-images/catalog/`, 1,300 files).
- ✅ Build step 3, storefront (see "Storefront" below).
- ✅ Build step 4 code: auth, cart merge, checkout, order placement, account pages; `supabase/migrations/0003_orders.sql` tested on local Supabase.
- ✅ Build step 5 code: admin (`/admin`: overview, products, bulk GYD prices, price-on-request list) + `supabase/migrations/0004_admin.sql`, tested on local Supabase.
- ✅ Build step 6 code: order workflow (`/admin/orders`, `/admin/purchase-orders`, customer approve/reject) + `supabase/migrations/0005_workflow.sql`, tested on local Supabase. Statuses stop at Received; Invoiced → Paid → Delivered come with invoicing (step 7).
- ✅ Catalog management (products, options, variants, brands, categories): `supabase/migrations/0007_catalog_crud.sql`, tested locally. ⚠️ **0007 is not on the hosted project yet.**
- ✅ Prices are GYD-only (`supabase/migrations/0006_gyd_prices.sql`, tested locally incl. the backfill). ⚠️ **0006 is not on the hosted project yet** (0001–0005 are) — the owner applies it (`supabase db push`) **before deploying this code**: until then the admin product editor and bulk prices error on hosted (they read `variants.price`); the storefront keeps working. Also in the hosted dashboard: Authentication → URL Configuration (Site URL + redirect URLs incl. `/auth/confirm`), and paste `supabase/templates/*.html` into Authentication → Emails (confirm signup, reset password).
- ✅ "Price on request" line pricing on admin orders (`supabase/migrations/0009_price_order_lines.sql`) and admin customers (`0010_customers.sql`, plus `0011_customer_ban_state.sql`), tested locally. 0009 and 0010 are on hosted; ⚠️ **0011 is not yet**: push it before deploying (`/admin/customers` reads `banned_until`).
- ⏭ Next: step 7, PDF invoices + Resend emails (`docs/SPEC.md` → Build order). Needs the owner's invoice number format and Resend domain/sender. Make yourself admin: `update profiles set role = 'admin' where id = '<auth user id>';`
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

- **Prices:** read `variant_prices.price` (Guyanese dollars, GYD, whole units; displayed as "GYD 5,299" by `formatPrice`). `null` → show **"Price on request"**; still orderable. Never compute price in the client.
- **GYD only.** `variants.price` is whole Guyanese dollars, entered by admin (no USD cost, exchange rate or markup — removed in 0006). Admin writes use `SUPABASE_SERVICE_ROLE_KEY` in server code (server-only module; never import into client components); check `is_admin()` / `profiles.role` before using the service client.
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
- Currency: GYD, formatted only in `src/lib/format.ts` (`formatPrice`); admin inputs parse with `parseGyd` (`src/lib/admin/paste.ts`).

## SEO — code map

- `src/lib/site.ts`: `SITE_URL` (production `https://www.wsengineeringgy.com`, override with `NEXT_PUBLIC_SITE_URL`), `openGraph()` defaults (a page's `openGraph` replaces the layout's whole object, so always build from it), `metaDescription`, `breadcrumbJsonLd`. Root layout sets `metadataBase`.
- Every indexable page sets `alternates.canonical` (never in the layout: it would cascade). Listings: `listingMetadata` in `src/lib/seo-listing.ts` keeps `?page=N`, noindexes `?brand`/`?sort`. Private pages are `robots: { index: false }` and disallowed in `src/app/robots.ts`.
- `src/app/sitemap.ts` (hourly): home, groups, categories, live products + images (`getSitemapProducts`). JSON-LD via `components/json-ld.tsx`: Organization + WebSite on home, Product (GYD offers for priced variants, no availability — no stock) + BreadcrumbList on product and category pages.

## Accounts & orders (build step 4) — code map

- `src/proxy.ts` refreshes the Supabase session cookie (`getClaims()`); `src/lib/auth.ts` `getUser()/requireUser()` for server pages.
- Sign in/up, sign out, reset run in the **browser** client (`/login`, `/signup`, `/forgot-password`, `/account/password`) so `components/auth/session-provider.tsx` sees auth events. Email links land on `src/app/auth/confirm/route.ts` (token-hash links from our templates, or default `?code=` links).
- `components/cart/cart-sync.tsx`: first sign-in on a device → `merge_cart` (higher qty wins); later visits → account cart wins; signed-in edits → `set_cart` (debounced); sign-out clears the device cart. `localStorage` `ws-cart-owner` records whose cart it is.
- Checkout: `src/app/checkout/` → server action → `place_order()` (re-validates lines, snapshots prices, empties cart). Order pages: `/account`, `/account/orders/[number]` (timeline, cancel while Pending via `cancel_order()`).
- Order numbers `WS-1001…` from `order_number_seq` (owner decision). Statuses in `src/lib/order-status.ts` match the DB check constraint.
- supabase-js builders are lazy: always `await` an `.rpc()`/query or it never runs.

## Admin (build step 5) — code map

- Guard: `src/lib/admin/auth.ts` — `requireAdmin()` in every admin page (layouts don't re-run on client navigation), `adminActor()` at the top of every admin server action (actions are public endpoints). Role is read from `profiles` with the service client.
- `src/lib/supabase/admin.ts` service-role client (server-only); `src/lib/admin/data.ts` admin reads; `src/app/admin/actions.ts` writes.
- Price writes go through `admin_update_variants` (0006 version: GYD `price` + `is_orderable`; service_role-only, atomic, one audit row per change). Product/photo/related edits write `audit_log` from the action.
- 0004 grants `service_role` table access explicitly (local projects don't by default).
- After any catalog edit call `refreshStorefront()` (`updateTag("catalog")` + `revalidatePath("/", "layout")`).
- Bulk paste parser: `src/lib/admin/paste.ts` (SKU+cost lines, or a single column applied in row order).
- Photo uploads go to `product-images/uploads/<product id>/…` (5 MB max; `serverActions.bodySizeLimit` is 6 MB). Removing a photo deletes the row only; the file stays in Storage.
- Avoid `.in("id", hugeList)`: ~500 UUIDs overflow the PostgREST URL.

## Catalog management — code map (spec: docs/SPEC.md → Catalog management)

- 0007: `products.status` draft/published/archived (+ `published_at`, set by trigger). RLS: the public reads **published products only** (also their variants/options/images/related). `variant_prices.is_orderable` = variant orderable **and** product published, so carts, checkout, `place_order`, `merge_cart` and search drop unpublished products with no other code.
- SKUs: `normalize_sku()` (trim, upper, spaces → `-`), check `^[A-Z0-9][A-Z0-9/-]*$`, nullable only for drafts (duplicates). make_seed.py normalises too but keeps variant ids from the original SKU.
- Renames keep old slugs in `slug_redirects` (product/category/group); `resolveMissingProduct` / `resolveCategoryPath` in `src/lib/catalog.ts` redirect or show "No longer available" (archived, or all variants discontinued; drafts — new or unpublished — 404).
- Write functions (service_role, audited, all-or-nothing): `admin_create_product`, `admin_update_product` (expected-values conflict check), `admin_bulk_update_products`, `admin_set_product_status` (publish checklist = `publish_problems()`), `admin_delete_product` (archives if ordered/on a PO; returns uploaded photo paths to delete), `admin_duplicate_product`, `admin_save_options` (renames propagate; removed in-use values need the flag), `admin_save_variants` (create/update/delete ops with `expect`), `admin_save_brand` / `admin_delete_brand`, `admin_save_category` / `admin_delete_category`, `admin_rename_group`, `admin_reorder`.
- UI: `src/app/admin/products/` (list + bulk bar, `new/`, `[id]/` editor: status bar, details, options, variants, photos, related), `src/app/admin/catalog/` (groups, categories, brands). Shared: `useAdminAction` (goTo, conflict → Reload), `useUnsavedGuard`.
- Editors reset drafts only when the saved data changes (content signature), so saving one section never wipes another's unsaved edits.

## Order workflow (build step 6) — code map

- 0005 functions (service_role only unless noted, all audited + add an `order_events` row):
  `admin_set_order_status` (confirm pending; cancel anything before paid, reason required in the app; manual "arrived"),
  `admin_propose_changes` / `admin_withdraw_changes` (supplier short: qty change, remove with qty 0, add replacements; snapshot price at proposal),
  `respond_to_changes` (customer, authenticated: approve applies + resumes; reject cancels),
  `admin_build_purchase_orders` (lines not on a PO from confirmed/ordered orders → one draft per supplier, grouped by SKU),
  `admin_set_po_status` (draft→sent→received, or delete draft). Orders advance automatically once *every* line is on a sent/received PO, so approved replacements need their own PO.
- Cancelling takes an order's lines off draft POs; lines on sent POs stay (they were ordered).
- UI: `src/app/admin/orders/`, `src/app/admin/purchase-orders/` (CSV at `/admin/purchase-orders/[id]/csv`, formula-safe), shared diff `components/account/proposal-view.tsx`. Admin wording for statuses: `ADMIN_STATUS_LABEL`.
- Pricing "Price on request" lines: `admin_price_order_lines` (0009; service_role, audited) sets `unit_price` on **unpriced lines only** (snapshots never change), recomputes `estimate_total`, adds a timeline note. UI: `src/app/admin/orders/[number]/price-lines.tsx` (pre-filled from the variant's current catalog price). Allowed pending → received, not while awaiting approval.
- PO numbers `PO-1001…` (internal). Reminder email after 3 days (`order_changes.reminded_at`) is step 7.
- Cart sync keeps a `ws-cart-dirty` flag so a signed-in change made just before a reload/tab close is pushed, not overwritten.

## Customers (admin) — code map (spec: docs/SPEC.md → Customers (admin))

- 0010: view `admin_customers` (auth.users + profiles + order stats + `search_text`/`phone_search`; service_role only), `phone_digits()` (digits, leading 592 dropped; `phoneDigits` in `src/lib/admin/customers.ts` mirrors it), `customer_notes` (service_role only), `profiles.blocked_at/blocked_reason/blocked_by`.
- Blocking: `admin_block_customer` (reason required, not admins, empties cart, returns open order numbers) / `admin_unblock_customer`; the action also sets a Supabase Auth ban (`ban_duration`, `'none'` to lift). If that Auth call fails the DB change stands; the customer page compares `admin_customers.banned_until` (0011) with `blocked_at` and offers Retry (`syncSignInAction`). Triggers on `orders` and `cart_items` refuse blocked users (hint `blocked`) for sessions that haven't expired yet. Auth error `user_banned` → "This account is suspended. Contact W&S."
- Roles: `admin_set_role` (promote needs the email typed; no self-demote; at least one admin; blocked can't be promoted). Notes: `admin_add_note` / `admin_edit_note` / `admin_delete_note` (author only).
- UI: `src/app/admin/customers/` (list, `[id]/` detail: account actions, orders, notes); the admin order sidebar shows the latest 3 notes (`getOrderCustomerContext`).

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

Store contact details / pickup location & hours · invoice number format (orders are WS-1001…) · Resend domain and sender · whether to sell apparel.
