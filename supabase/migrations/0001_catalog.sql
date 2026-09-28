-- 0001_catalog.sql — catalog schema for the W&S Engineering store
-- Order, cart, PO and invoice tables come in a later migration.

create extension if not exists pgcrypto;

-- profiles + admin check -----------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- catalog ----------------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists public.category_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  sort int not null default 0
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.category_groups (id),
  name text not null unique,
  slug text not null unique,
  sort int not null default 0,
  catalog_pages text
);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category_id uuid not null references public.categories (id),
  brand_id uuid not null references public.brands (id),
  supplier_id uuid not null references public.suppliers (id),
  description text,
  features jsonb not null default '[]',
  specs jsonb not null default '{}',
  catalog_page int,
  is_featured boolean not null default false,
  is_new boolean not null default false,
  needs_review boolean not null default false,   -- extraction flagged the name
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_search_idx on public.products
  using gin (to_tsvector('simple', name || ' ' || coalesce(description, '')));

-- option names and their allowed values, e.g. Handle: [ProForm, Wood, Leather, Cork]
create table if not exists public.product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null,
  sort int not null default 0,
  "values" text[] not null default '{}',
  unique (product_id, name)
);

create table if not exists public.variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  sku text not null unique,
  option_values jsonb not null default '{}',     -- {"Handle": "Cork", "Size": "14\"x4\""}
  usd_cost numeric(10, 2),                        -- supplier cost; null = Price on request
  price_override numeric(12, 2),                  -- local currency, wins over computed price
  is_orderable boolean not null default true,     -- false = discontinued
  sort int not null default 0
);
create index if not exists variants_product_idx on public.variants (product_id);
create index if not exists variants_sku_trgm_idx on public.variants (upper(sku) text_pattern_ops);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid references public.variants (id) on delete set null,
  storage_path text not null,
  sort int not null default 0
);

create table if not exists public.related_products (
  product_id uuid references public.products (id) on delete cascade,
  related_id uuid references public.products (id) on delete cascade,
  primary key (product_id, related_id)
);

create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  exchange_rate numeric(12, 4),   -- local currency per 1 USD
  markup_pct numeric(6, 2)        -- e.g. 35.00
);

-- pricing: round up to the next price ending in 99 whole units ---------------
create or replace function public.round99(x numeric) returns numeric
language sql immutable as $$
  select case when x is null then null
              else ceil((x + 1) / 100) * 100 - 1 end;
$$;

-- runs with owner rights so the public never needs usd_cost itself
create or replace view public.variant_prices as
select v.id, v.product_id, v.sku, v.option_values, v.is_orderable, v.sort,
       coalesce(v.price_override,
                public.round99(v.usd_cost * s.exchange_rate * (1 + s.markup_pct / 100))) as price
from public.variants v
cross join public.settings s;

-- row-level security -----------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.suppliers enable row level security;
alter table public.category_groups enable row level security;
alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.product_options enable row level security;
alter table public.variants enable row level security;
alter table public.product_images enable row level security;
alter table public.related_products enable row level security;
alter table public.settings enable row level security;

create policy "own profile" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "update own profile" on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
create policy "admin profiles" on public.profiles for all using (public.is_admin());

do $$
declare t text;
begin
  foreach t in array array['category_groups','categories','brands','products','product_options',
                           'variants','product_images','related_products','settings'] loop
    execute format('create policy "public read" on public.%I for select using (true)', t);
    execute format('create policy "admin write" on public.%I for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;
create policy "admin suppliers" on public.suppliers for all using (public.is_admin()) with check (public.is_admin());

-- usd_cost is supplier-confidential: the public API reads prices via variant_prices.
-- Admin reads/writes usd_cost from server code using the service-role key.
revoke select on public.variants from anon, authenticated;
grant select (id, product_id, sku, option_values, price_override, is_orderable, sort)
  on public.variants to anon, authenticated;
grant select on public.variant_prices to anon, authenticated;
