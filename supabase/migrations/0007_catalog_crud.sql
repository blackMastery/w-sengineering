-- 0007_catalog_crud.sql — full catalog management (see docs/SPEC.md → Catalog management)
--
-- * products get a status: draft | published | archived (existing products → published)
-- * the public only sees published products (RLS), and a variant is orderable only when its
--   product is published (variant_prices), so carts/checkout/orders need no other changes
-- * SKUs: trimmed, uppercase, A–Z 0–9 - / only; nullable on drafts (duplicated products)
-- * renamed products, categories and groups keep their old slugs as redirects
-- * admin write functions (service_role only, audited, all-or-nothing) with conflict checks

-- helpers ----------------------------------------------------------------------------
create or replace function public.slugify(p text) returns text
language sql immutable set search_path = '' as $$
  select left(trim(both '-' from regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g')), 80);
$$;

create or replace function public.normalize_sku(p text) returns text
language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(upper(trim(coalesce(p, ''))), '\s+', '-', 'g'), '');
$$;

-- products: status ------------------------------------------------------------------------
alter table public.products
  add column status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  add column published_at timestamptz;   -- first time it went live (drives "no longer available")
create index products_status_idx on public.products (status);

create or replace function public.products_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end $$;
create trigger products_before_write before insert or update on public.products
  for each row execute function public.products_before_write();

update public.products set status = 'published';

-- SKUs ----------------------------------------------------------------------------------------
-- e.g. W. Rose "RO116-9 1/2K" → "RO116-9-1/2K". Drafts may hold variants without a SKU yet.
update public.variants set sku = public.normalize_sku(sku) where sku is distinct from public.normalize_sku(sku);
alter table public.variants alter column sku drop not null;
alter table public.variants add constraint variants_sku_format check (sku ~ '^[A-Z0-9][A-Z0-9/-]*$');

-- slug redirects --------------------------------------------------------------------------
create table public.slug_redirects (
  kind text not null check (kind in ('product', 'category', 'group')),
  old_slug text not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (kind, old_slug)
);
alter table public.slug_redirects enable row level security;
create policy "public read" on public.slug_redirects for select using (true);
revoke all on public.slug_redirects from anon, authenticated;
grant select on public.slug_redirects to anon, authenticated;
grant select, insert, update, delete on public.slug_redirects to service_role;

-- Point an old slug at its target; a slug that's live again stops redirecting.
create or replace function public.record_slug_change(p_kind text, p_old text, p_new text, p_target uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_old is distinct from p_new then
    insert into public.slug_redirects (kind, old_slug, target_id) values (p_kind, p_old, p_target)
    on conflict (kind, old_slug) do update set target_id = excluded.target_id, created_at = now();
  end if;
  delete from public.slug_redirects where kind = p_kind and old_slug = p_new;
end $$;

create or replace function public.unique_slug(p_kind text, p_name text, p_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  base text := coalesce(nullif(public.slugify(p_name), ''), p_kind);
  s text := base;
  n int := 1;
begin
  loop
    exit when not (
      (p_kind = 'product' and exists (select 1 from public.products where slug = s and id is distinct from p_id)) or
      (p_kind = 'category' and exists (select 1 from public.categories where slug = s and id is distinct from p_id)) or
      (p_kind = 'group' and exists (select 1 from public.category_groups where slug = s and id is distinct from p_id)) or
      (p_kind = 'brand' and exists (select 1 from public.brands where slug = s and id is distinct from p_id))
    );
    n := n + 1;
    s := base || '-' || n;
  end loop;
  return s;
end $$;

-- public visibility: published products only ---------------------------------------------
drop policy "public read" on public.products;
create policy "public read" on public.products for select using (status = 'published');

drop policy "public read" on public.variants;
create policy "public read" on public.variants for select
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));
drop policy "public read" on public.product_options;
create policy "public read" on public.product_options for select
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));
drop policy "public read" on public.product_images;
create policy "public read" on public.product_images for select
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'published'));
drop policy "public read" on public.related_products;
create policy "public read" on public.related_products for select
  using (exists (select 1 from public.products p where p.id = related_id and p.status = 'published'));

-- A variant is orderable only if its product is published. Everything that sells reads this.
drop view if exists public.variant_prices;
create view public.variant_prices with (security_invoker = true) as
select v.id, v.product_id, v.sku, v.option_values, (v.is_orderable and p.status = 'published') as is_orderable, v.sort, v.price
from public.variants v
join public.products p on p.id = v.product_id;
grant select on public.variant_prices to anon, authenticated, service_role;
grant select (id, status) on public.products to anon, authenticated;

-- admin overview gets status
drop view if exists public.admin_products;
create view public.admin_products as
select
  p.id, p.slug, p.name, p.status, p.published_at, p.needs_review, p.is_featured, p.is_new, p.catalog_page, p.updated_at,
  b.id as brand_id, b.name as brand, c.id as category_id, c.name as category, g.name as group_name,
  (select count(*) from public.variants v where v.product_id = p.id)::int as variant_count,
  (select count(*) from public.variants v where v.product_id = p.id and v.is_orderable)::int as orderable_count,
  (select count(*) from public.variants v where v.product_id = p.id and v.is_orderable and v.price is null)::int as unpriced_count,
  (select count(*) from public.product_images i where i.product_id = p.id)::int as image_count,
  (select i.storage_path from public.product_images i where i.product_id = p.id order by i.sort limit 1) as image,
  (select string_agg(v.sku, ' ' order by v.sort) from public.variants v where v.product_id = p.id) as skus
from public.products p
join public.brands b on b.id = p.brand_id
join public.categories c on c.id = p.category_id
join public.category_groups g on g.id = c.group_id;
revoke all on public.admin_products from public, anon, authenticated;
grant select on public.admin_products to service_role;

-- internal checks ---------------------------------------------------------------------------
create or replace function public.product_has_history(p_product uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.order_lines where product_id = p_product)
      or exists (select 1 from public.order_lines l join public.variants v on v.id = l.variant_id where v.product_id = p_product)
      or exists (select 1 from public.po_lines pl join public.variants v on v.id = pl.variant_id where v.product_id = p_product);
$$;

create or replace function public.variant_has_history(p_variant uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.order_lines where variant_id = p_variant)
      or exists (select 1 from public.po_lines where variant_id = p_variant);
$$;

-- Why a product can't be published yet (empty array = ready).
create or replace function public.publish_problems(p_product uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select array_remove(array[
    case when not exists (select 1 from public.variants where product_id = p_product and is_orderable)
         then 'Add at least one orderable variant' end,
    case when exists (select 1 from public.variants where product_id = p_product and is_orderable and sku is null)
         then 'Every orderable variant needs a SKU' end,
    case when not exists (select 1 from public.product_images where product_id = p_product)
         then 'Add a photo' end,
    case when (select name ~* '^(untitled|copy of)\y' or length(trim(name)) < 3 from public.products where id = p_product)
         then 'Give it a real name' end
  ], null);
$$;

-- open orders (not yet paid/cancelled/delivered) that contain a product
create or replace function public.open_orders_with(p_products uuid[]) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct o.number order by o.number), '{}')
  from public.orders o join public.order_lines l on l.order_id = o.id
  left join public.variants v on v.id = l.variant_id
  where (l.product_id = any (p_products) or v.product_id = any (p_products))
    and o.status in ('pending', 'confirmed', 'ordered_from_supplier', 'awaiting_approval', 'received', 'invoiced');
$$;

-- products ---------------------------------------------------------------------------------------
create or replace function public.admin_create_product(p_actor uuid, p_name text, p_brand uuid, p_category uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_name text := nullif(left(trim(p_name), 200), '');
  v_id uuid;
begin
  perform public.assert_admin(p_actor);
  if v_name is null then raise exception 'Enter a product name' using errcode = '22023'; end if;
  if not exists (select 1 from public.brands where id = p_brand) then raise exception 'Choose a brand' using errcode = '22023'; end if;
  if not exists (select 1 from public.categories where id = p_category) then raise exception 'Choose a category' using errcode = '22023'; end if;

  insert into public.products (slug, name, category_id, brand_id, supplier_id, status)
  values (public.unique_slug('product', v_name, null), v_name, p_category, p_brand,
          (select id from public.suppliers order by name limit 1), 'draft')
  returning id into v_id;

  insert into public.audit_log (actor_id, entity, entity_id, action, after)
  values (p_actor, 'product', v_id::text, 'created', jsonb_build_object('name', v_name, 'status', 'draft'));
  return v_id;
end $$;

-- p_fields: any of name, description, features, specs, brand_id, category_id, is_featured,
-- is_new, needs_review. p_expected: the same keys with the values the editor loaded; if the
-- product has changed since, nothing is saved (hint 'conflict').
create or replace function public.admin_update_product(p_actor uuid, p_id uuid, p_fields jsonb, p_expected jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.products;
  cur jsonb;
  k text;
  changed text[] := '{}';
  v_name text;
  v_slug text;
  allowed text[] := array['name', 'description', 'features', 'specs', 'brand_id', 'category_id', 'is_featured', 'is_new', 'needs_review'];
begin
  perform public.assert_admin(p_actor);
  select * into p from public.products where id = p_id for update;
  if not found then raise exception 'Product not found' using errcode = '22023'; end if;
  cur := to_jsonb(p);

  for k in select jsonb_object_keys(coalesce(p_expected, '{}')) loop
    if k = any (allowed) and cur -> k is distinct from p_expected -> k then changed := changed || k; end if;
  end loop;
  if cardinality(changed) > 0 then
    raise exception 'Someone else changed % since you opened this page. Reload to see their version.', array_to_string(changed, ', ')
      using errcode = 'P0001', hint = 'conflict';
  end if;
  if exists (select 1 from jsonb_object_keys(p_fields) k2 where k2 <> all (allowed)) then
    raise exception 'Unknown field' using errcode = '22023';
  end if;

  v_name := case when p_fields ? 'name' then nullif(left(trim(p_fields ->> 'name'), 200), '') else p.name end;
  if v_name is null then raise exception 'Enter a product name' using errcode = '22023'; end if;
  if p_fields ? 'features' and jsonb_typeof(p_fields -> 'features') <> 'array' then raise exception 'Features must be a list' using errcode = '22023'; end if;
  if p_fields ? 'specs' and jsonb_typeof(p_fields -> 'specs') <> 'object' then raise exception 'Specs must be name/value pairs' using errcode = '22023'; end if;
  if p_fields ? 'brand_id' and not exists (select 1 from public.brands where id = (p_fields ->> 'brand_id')::uuid) then raise exception 'Choose a brand' using errcode = '22023'; end if;
  if p_fields ? 'category_id' and not exists (select 1 from public.categories where id = (p_fields ->> 'category_id')::uuid) then raise exception 'Choose a category' using errcode = '22023'; end if;

  v_slug := case when v_name <> p.name then public.unique_slug('product', v_name, p.id) else p.slug end;

  update public.products set
    name = v_name,
    slug = v_slug,
    description = case when p_fields ? 'description' then nullif(left(trim(p_fields ->> 'description'), 4000), '') else description end,
    features = case when p_fields ? 'features' then p_fields -> 'features' else features end,
    specs = case when p_fields ? 'specs' then p_fields -> 'specs' else specs end,
    brand_id = case when p_fields ? 'brand_id' then (p_fields ->> 'brand_id')::uuid else brand_id end,
    category_id = case when p_fields ? 'category_id' then (p_fields ->> 'category_id')::uuid else category_id end,
    is_featured = case when p_fields ? 'is_featured' then (p_fields ->> 'is_featured')::boolean else is_featured end,
    is_new = case when p_fields ? 'is_new' then (p_fields ->> 'is_new')::boolean else is_new end,
    needs_review = case when p_fields ? 'needs_review' then (p_fields ->> 'needs_review')::boolean else needs_review end,
    updated_at = now()
  where id = p.id;

  perform public.record_slug_change('product', p.slug, v_slug, p.id);

  insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
  select p_actor, 'product', p.id::text, 'edit',
         (select jsonb_object_agg(key, cur -> key) from jsonb_object_keys(p_fields) key),
         (select jsonb_object_agg(key, value) from jsonb_each(to_jsonb(np)) where key = any (array(select jsonb_object_keys(p_fields))) or (key = 'slug' and v_slug <> p.slug))
  from public.products np where np.id = p.id;

  return jsonb_build_object('slug', v_slug);
end $$;

-- Bulk: category_id, brand_id, is_featured, is_new, needs_review for many products.
create or replace function public.admin_bulk_update_products(p_actor uuid, p_ids uuid[], p_fields jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  perform public.assert_admin(p_actor);
  if exists (select 1 from jsonb_object_keys(p_fields) k where k <> all (array['category_id', 'brand_id', 'is_featured', 'is_new', 'needs_review'])) then
    raise exception 'Unknown field' using errcode = '22023';
  end if;
  if p_fields ? 'brand_id' and not exists (select 1 from public.brands where id = (p_fields ->> 'brand_id')::uuid) then raise exception 'Choose a brand' using errcode = '22023'; end if;
  if p_fields ? 'category_id' and not exists (select 1 from public.categories where id = (p_fields ->> 'category_id')::uuid) then raise exception 'Choose a category' using errcode = '22023'; end if;

  insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
  select p_actor, 'product', p.id::text, 'bulk_edit',
         (select jsonb_object_agg(key, to_jsonb(p) -> key) from jsonb_object_keys(p_fields) key), p_fields
  from public.products p where p.id = any (p_ids);

  update public.products set
    brand_id = case when p_fields ? 'brand_id' then (p_fields ->> 'brand_id')::uuid else brand_id end,
    category_id = case when p_fields ? 'category_id' then (p_fields ->> 'category_id')::uuid else category_id end,
    is_featured = case when p_fields ? 'is_featured' then (p_fields ->> 'is_featured')::boolean else is_featured end,
    is_new = case when p_fields ? 'is_new' then (p_fields ->> 'is_new')::boolean else is_new end,
    needs_review = case when p_fields ? 'needs_review' then (p_fields ->> 'needs_review')::boolean else needs_review end,
    updated_at = now()
  where id = any (p_ids);
  get diagnostics n = row_count;
  return n;
end $$;

-- Publish / unpublish (draft) / archive / restore (→ draft) for one or many products.
-- Products that can't be published are skipped and reported. Returns
-- {"changed": n, "failed": [{"id", "name", "problems": [...]}], "open_orders": ["WS-…"]}.
create or replace function public.admin_set_product_status(p_actor uuid, p_ids uuid[], p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p record;
  problems text[];
  failed jsonb := '[]';
  moved uuid[] := '{}';
begin
  perform public.assert_admin(p_actor);
  if p_status not in ('draft', 'published', 'archived') then raise exception 'Unknown status' using errcode = '22023'; end if;

  for p in select id, name, status from public.products where id = any (p_ids) order by name for update loop
    continue when p.status = p_status;
    if p_status = 'published' then
      problems := public.publish_problems(p.id);
      if cardinality(problems) > 0 then
        failed := failed || jsonb_build_object('id', p.id, 'name', p.name, 'problems', to_jsonb(problems));
        continue;
      end if;
    end if;
    update public.products set status = p_status, updated_at = now() where id = p.id;
    insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
    values (p_actor, 'product', p.id::text, 'status', jsonb_build_object('status', p.status), jsonb_build_object('status', p_status));
    moved := moved || p.id;
  end loop;

  return jsonb_build_object(
    'changed', cardinality(moved),
    'failed', failed,
    'open_orders', case when p_status <> 'published' then to_jsonb(public.open_orders_with(moved)) else '[]'::jsonb end);
end $$;

-- Delete a never-ordered product (returns the admin-uploaded photo paths to remove from
-- Storage); a product with order or PO history is archived instead.
create or replace function public.admin_delete_product(p_actor uuid, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.products;
  uploads text[];
begin
  perform public.assert_admin(p_actor);
  select * into p from public.products where id = p_id for update;
  if not found then raise exception 'Product not found' using errcode = '22023'; end if;

  if public.product_has_history(p_id) then
    if p.status <> 'archived' then
      update public.products set status = 'archived', updated_at = now() where id = p_id;
    end if;
    insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
    values (p_actor, 'product', p_id::text, 'status', jsonb_build_object('status', p.status), '{"status": "archived", "reason": "delete requested; has order history"}');
    return jsonb_build_object('deleted', false, 'archived', true, 'open_orders', to_jsonb(public.open_orders_with(array[p_id])));
  end if;

  select coalesce(array_agg(storage_path), '{}') into uploads
  from public.product_images where product_id = p_id and storage_path like 'uploads/' || p_id::text || '/%';

  delete from public.slug_redirects where kind = 'product' and target_id = p_id;
  delete from public.products where id = p_id;
  insert into public.audit_log (actor_id, entity, entity_id, action, before)
  values (p_actor, 'product', p_id::text, 'deleted', jsonb_build_object('name', p.name, 'slug', p.slug, 'status', p.status));
  return jsonb_build_object('deleted', true, 'archived', false, 'uploads', to_jsonb(uploads));
end $$;

-- Copy details, options, variants (without SKUs) and photos into a new draft.
create or replace function public.admin_duplicate_product(p_actor uuid, p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.products;
  v_id uuid;
  v_name text;
begin
  perform public.assert_admin(p_actor);
  select * into p from public.products where id = p_id;
  if not found then raise exception 'Product not found' using errcode = '22023'; end if;
  v_name := left('Copy of ' || p.name, 200);

  insert into public.products (slug, name, category_id, brand_id, supplier_id, description, features, specs, status)
  values (public.unique_slug('product', v_name, null), v_name, p.category_id, p.brand_id, p.supplier_id,
          p.description, p.features, p.specs, 'draft')
  returning id into v_id;

  insert into public.product_options (product_id, name, sort, "values")
  select v_id, name, sort, "values" from public.product_options where product_id = p_id;
  insert into public.variants (product_id, sku, option_values, price, is_orderable, sort)
  select v_id, null, option_values, price, is_orderable, sort from public.variants where product_id = p_id;
  insert into public.product_images (product_id, storage_path, sort)
  select v_id, storage_path, sort from public.product_images where product_id = p_id;
  insert into public.related_products (product_id, related_id)
  select v_id, related_id from public.related_products where product_id = p_id;

  insert into public.audit_log (actor_id, entity, entity_id, action, after)
  values (p_actor, 'product', v_id::text, 'duplicated', jsonb_build_object('from', p_id, 'name', v_name));
  return v_id;
end $$;

-- options ---------------------------------------------------------------------------------------
-- p_options: the full new list, in order:
--   [{"name": "Handle", "renamed_from"?: "Grip", "values": [{"value": "Cork", "renamed_from"?: "cork"}]}]
-- p_expected: the options as the editor loaded them ([{"name", "values": [text]}]); on mismatch
-- nothing is saved (hint 'conflict'). Renames update every variant of the product. Removed
-- options are dropped from variants. Variants using a removed value are discontinued (or
-- deleted if never ordered) only when p_remove_variants is true; otherwise it's an error.
create or replace function public.admin_save_options(p_actor uuid, p_product uuid, p_options jsonb, p_expected jsonb, p_remove_variants boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  cur jsonb;
  o jsonb;
  val jsonb;
  old_name text;
  new_name text;
  old_values text[];
  new_values text[];
  removed text;
  v record;
  n_disc int := 0;
  n_del int := 0;
  i int := 0;
begin
  perform public.assert_admin(p_actor);
  perform 1 from public.products where id = p_product for update;
  if not found then raise exception 'Product not found' using errcode = '22023'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'values', to_jsonb("values")) order by sort, name), '[]')
    into cur from public.product_options where product_id = p_product;
  if cur is distinct from coalesce(p_expected, '[]') then
    raise exception 'Someone else changed the options since you opened this page. Reload to see their version.'
      using errcode = 'P0001', hint = 'conflict';
  end if;

  -- validate the new list
  if jsonb_typeof(p_options) <> 'array' then raise exception 'Expected a list of options' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_options) x where nullif(trim(x ->> 'name'), '') is null or length(x ->> 'name') > 60) then
    raise exception 'Every option needs a name (up to 60 characters)' using errcode = '22023';
  end if;
  if (select count(*) <> count(distinct lower(trim(x ->> 'name'))) from jsonb_array_elements(p_options) x) then
    raise exception 'Two options have the same name' using errcode = '22023';
  end if;
  for o in select value from jsonb_array_elements(p_options) loop
    if exists (select 1 from jsonb_array_elements(coalesce(o -> 'values', '[]')) y where nullif(trim(y ->> 'value'), '') is null or length(y ->> 'value') > 80) then
      raise exception 'Option "%" has an empty value', o ->> 'name' using errcode = '22023';
    end if;
    if (select count(*) <> count(distinct trim(y ->> 'value')) from jsonb_array_elements(coalesce(o -> 'values', '[]')) y) then
      raise exception 'Option "%" lists the same value twice', o ->> 'name' using errcode = '22023';
    end if;
  end loop;

  -- options removed entirely: drop the key from variants
  for old_name in
    select x ->> 'name' from jsonb_array_elements(cur) x
    where not exists (select 1 from jsonb_array_elements(p_options) n
                      where trim(n ->> 'name') = x ->> 'name' or n ->> 'renamed_from' = x ->> 'name')
  loop
    update public.variants set option_values = option_values - old_name where product_id = p_product and option_values ? old_name;
  end loop;

  for o in select value from jsonb_array_elements(p_options) loop
    new_name := trim(o ->> 'name');
    old_name := coalesce(nullif(o ->> 'renamed_from', ''), new_name);

    -- option renamed: move the key
    if old_name <> new_name then
      update public.variants
      set option_values = (option_values - old_name) || jsonb_build_object(new_name, option_values -> old_name)
      where product_id = p_product and option_values ? old_name;
    end if;

    select coalesce(array_agg(x), '{}') into old_values
    from public.product_options po, unnest(po."values") x where po.product_id = p_product and po.name = old_name;

    -- values renamed
    for val in select value from jsonb_array_elements(coalesce(o -> 'values', '[]')) loop
      if nullif(val ->> 'renamed_from', '') is not null and val ->> 'renamed_from' <> trim(val ->> 'value') then
        update public.variants set option_values = jsonb_set(option_values, array[new_name], to_jsonb(trim(val ->> 'value')))
        where product_id = p_product and option_values ->> new_name = val ->> 'renamed_from';
      end if;
    end loop;

    select coalesce(array_agg(trim(y ->> 'value') order by ord), '{}') into new_values
    from jsonb_array_elements(coalesce(o -> 'values', '[]')) with ordinality as t(y, ord);

    -- values removed: variants that use them
    foreach removed in array old_values loop
      continue when removed = any (new_values)
        or exists (select 1 from jsonb_array_elements(coalesce(o -> 'values', '[]')) y where y ->> 'renamed_from' = removed);
      for v in select id, sku from public.variants where product_id = p_product and option_values ->> new_name = removed loop
        if not p_remove_variants then
          raise exception '%: % is still used by variants', new_name, removed using errcode = 'P0001', hint = 'values_in_use';
        end if;
        if public.variant_has_history(v.id) then
          update public.variants set is_orderable = false where id = v.id and is_orderable;
          n_disc := n_disc + 1;
        else
          delete from public.variants where id = v.id;
          n_del := n_del + 1;
        end if;
      end loop;
    end loop;
  end loop;

  delete from public.product_options where product_id = p_product;
  for o in select value from jsonb_array_elements(p_options) loop
    insert into public.product_options (product_id, name, sort, "values")
    values (p_product, trim(o ->> 'name'), i,
            (select coalesce(array_agg(trim(y ->> 'value') order by ord), '{}')
             from jsonb_array_elements(coalesce(o -> 'values', '[]')) with ordinality as t(y, ord)));
    i := i + 1;
  end loop;

  update public.products set updated_at = now() where id = p_product;
  insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
  values (p_actor, 'product', p_product::text, 'options', jsonb_build_object('options', cur),
          jsonb_build_object('options', p_options, 'variants_discontinued', n_disc, 'variants_deleted', n_del));
  return jsonb_build_object('discontinued', n_disc, 'deleted', n_del);
end $$;

-- variants ----------------------------------------------------------------------------------------
-- p_ops, applied as one unit (deletes, then updates, then creates):
--   {"op": "create", "sku", "option_values", "price", "is_orderable", "sort"}
--   {"op": "update", "id", "set": {sku?, option_values?, price?, is_orderable?, sort?}, "expect": {…same keys as loaded}}
--   {"op": "delete", "id"}   (never-ordered → deleted; otherwise discontinued)
-- Returns counts and "duplicates": groups of orderable SKUs sharing identical options (a warning).
create or replace function public.admin_save_variants(p_actor uuid, p_product uuid, p_ops jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  prod public.products;
  x jsonb;
  s jsonb;
  cur public.variants;
  k text;
  v_sku text;
  v_opts jsonb;
  v_price integer;
  v_orderable boolean;
  v_sort int;
  names text[];
  n_created int := 0;
  n_updated int := 0;
  n_deleted int := 0;
  n_disc int := 0;
  dupes jsonb;
begin
  perform public.assert_admin(p_actor);
  select * into prod from public.products where id = p_product for update;
  if not found then raise exception 'Product not found' using errcode = '22023'; end if;
  if jsonb_typeof(p_ops) <> 'array' then raise exception 'Expected a list of changes' using errcode = '22023'; end if;
  select coalesce(array_agg(name), '{}') into names from public.product_options where product_id = p_product;

  -- deletes
  for x in select value from jsonb_array_elements(p_ops) where value ->> 'op' = 'delete' loop
    select * into cur from public.variants where id = (x ->> 'id')::uuid and product_id = p_product for update;
    if not found then
      raise exception 'A variant you removed no longer exists. Reload the page.' using errcode = 'P0001', hint = 'conflict';
    end if;
    if public.variant_has_history(cur.id) then
      update public.variants set is_orderable = false where id = cur.id;
      n_disc := n_disc + 1;
    else
      delete from public.variants where id = cur.id;
      n_deleted := n_deleted + 1;
    end if;
    insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
    values (p_actor, 'variant', cur.id::text, case when public.variant_has_history(cur.id) then 'discontinued' else 'deleted' end,
            jsonb_build_object('sku', cur.sku, 'product_id', p_product), null);
  end loop;

  -- updates + creates share validation
  for x in select value from jsonb_array_elements(p_ops) where value ->> 'op' in ('update', 'create') order by (value ->> 'op') desc loop
    if x ->> 'op' = 'update' then
      select * into cur from public.variants where id = (x ->> 'id')::uuid and product_id = p_product for update;
      if not found then
        raise exception 'A variant you edited no longer exists. Reload the page.' using errcode = 'P0001', hint = 'conflict';
      end if;
      for k in select jsonb_object_keys(coalesce(x -> 'expect', '{}')) loop
        if to_jsonb(cur) -> k is distinct from x -> 'expect' -> k then
          raise exception 'Someone else changed % since you opened this page. Reload to see their version.', coalesce(cur.sku, 'a variant')
            using errcode = 'P0001', hint = 'conflict';
        end if;
      end loop;
      s := coalesce(x -> 'set', '{}');
    else
      cur := null;
      s := x;
    end if;

    v_sku := case when s ? 'sku' then public.normalize_sku(s ->> 'sku') else cur.sku end;
    v_opts := case when s ? 'option_values' then coalesce(s -> 'option_values', '{}') else coalesce(cur.option_values, '{}') end;
    v_price := case when s ? 'price' then (s ->> 'price')::integer else cur.price end;
    v_orderable := case when s ? 'is_orderable' then (s ->> 'is_orderable')::boolean else coalesce(cur.is_orderable, true) end;
    v_sort := case when s ? 'sort' then (s ->> 'sort')::int else coalesce(cur.sort, (select coalesce(max(sort), -1) + 1 from public.variants where product_id = p_product)) end;

    if v_sku is not null and v_sku !~ '^[A-Z0-9][A-Z0-9/-]*$' then
      raise exception 'SKU "%" can only use letters, numbers, - and /', v_sku using errcode = '22023';
    end if;
    if v_sku is null and v_orderable and prod.status = 'published' then
      raise exception 'Every orderable variant of a published product needs a SKU' using errcode = '22023';
    end if;
    if v_sku is not null and exists (select 1 from public.variants w where w.sku = v_sku and w.id is distinct from cur.id) then
      raise exception 'SKU % is already used by "%"', v_sku,
        (select p.name from public.variants w join public.products p on p.id = w.product_id where w.sku = v_sku limit 1)
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_opts) <> 'object' then raise exception 'Invalid options' using errcode = '22023'; end if;
    v_opts := (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(v_opts) where nullif(trim(value #>> '{}'), '') is not null);
    if exists (select 1 from jsonb_each_text(v_opts) e
               where not exists (select 1 from public.product_options po
                                 where po.product_id = p_product and po.name = e.key and e.value = any (po."values"))) then
      raise exception '% uses an option value this product doesn''t have', coalesce(v_sku, 'A variant') using errcode = '22023';
    end if;
    if v_price is not null and (v_price < 0 or v_price > 999999999) then
      raise exception 'Prices must be whole GYD amounts' using errcode = '22023';
    end if;

    if x ->> 'op' = 'update' then
      update public.variants set sku = v_sku, option_values = v_opts, price = v_price, is_orderable = v_orderable, sort = v_sort where id = cur.id;
      insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
      values (p_actor, 'variant', cur.id::text, 'edit',
              jsonb_build_object('sku', cur.sku, 'option_values', cur.option_values, 'price', cur.price, 'is_orderable', cur.is_orderable),
              jsonb_build_object('sku', v_sku, 'option_values', v_opts, 'price', v_price, 'is_orderable', v_orderable));
      n_updated := n_updated + 1;
    else
      insert into public.variants (product_id, sku, option_values, price, is_orderable, sort)
      values (p_product, v_sku, v_opts, v_price, v_orderable, v_sort)
      returning * into cur;
      insert into public.audit_log (actor_id, entity, entity_id, action, after)
      values (p_actor, 'variant', cur.id::text, 'created',
              jsonb_build_object('sku', v_sku, 'option_values', v_opts, 'price', v_price, 'product_id', p_product));
      n_created := n_created + 1;
    end if;
  end loop;

  update public.products set updated_at = now() where id = p_product;

  select coalesce(jsonb_agg(skus), '[]') into dupes from (
    select jsonb_agg(coalesce(sku, '(no SKU)') order by sort) as skus
    from public.variants where product_id = p_product and is_orderable
    group by option_values having count(*) > 1) d;

  return jsonb_build_object('created', n_created, 'updated', n_updated, 'deleted', n_deleted,
                            'discontinued', n_disc, 'duplicates', dupes);
end $$;

-- taxonomy ------------------------------------------------------------------------------------------
create or replace function public.admin_save_brand(p_actor uuid, p_id uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := nullif(left(trim(p_name), 80), '');
  v_id uuid := p_id;
  old public.brands;
begin
  perform public.assert_admin(p_actor);
  if v_name is null then raise exception 'Enter a brand name' using errcode = '22023'; end if;
  if exists (select 1 from public.brands where lower(name) = lower(v_name) and id is distinct from p_id) then
    raise exception 'A brand called "%" already exists', v_name using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.brands (name, slug) values (v_name, public.unique_slug('brand', v_name, null)) returning id into v_id;
    insert into public.audit_log (actor_id, entity, entity_id, action, after) values (p_actor, 'brand', v_id::text, 'created', jsonb_build_object('name', v_name));
  else
    select * into old from public.brands where id = p_id for update;
    if not found then raise exception 'Brand not found' using errcode = '22023'; end if;
    update public.brands set name = v_name, slug = public.unique_slug('brand', v_name, p_id) where id = p_id;
    insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
    values (p_actor, 'brand', p_id::text, 'renamed', jsonb_build_object('name', old.name), jsonb_build_object('name', v_name));
  end if;
  return v_id;
end $$;

create or replace function public.admin_delete_brand(p_actor uuid, p_id uuid, p_move_to uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  old public.brands;
  n int;
begin
  perform public.assert_admin(p_actor);
  select * into old from public.brands where id = p_id for update;
  if not found then raise exception 'Brand not found' using errcode = '22023'; end if;
  select count(*) into n from public.products where brand_id = p_id;
  if n > 0 then
    if p_move_to is null or p_move_to = p_id or not exists (select 1 from public.brands where id = p_move_to) then
      raise exception '% products use this brand. Choose a brand to move them to.', n using errcode = 'P0001', hint = 'in_use';
    end if;
    update public.products set brand_id = p_move_to, updated_at = now() where brand_id = p_id;
  end if;
  delete from public.brands where id = p_id;
  insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
  values (p_actor, 'brand', p_id::text, 'deleted', jsonb_build_object('name', old.name), jsonb_build_object('moved_products', n, 'to', p_move_to));
  return n;
end $$;

create or replace function public.admin_save_category(p_actor uuid, p_id uuid, p_name text, p_group uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := nullif(left(trim(p_name), 80), '');
  v_id uuid := p_id;
  v_slug text;
  old public.categories;
begin
  perform public.assert_admin(p_actor);
  if v_name is null then raise exception 'Enter a category name' using errcode = '22023'; end if;
  if not exists (select 1 from public.category_groups where id = p_group) then raise exception 'Choose a group' using errcode = '22023'; end if;
  if exists (select 1 from public.categories where lower(name) = lower(v_name) and id is distinct from p_id) then
    raise exception 'A category called "%" already exists', v_name using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.categories (group_id, name, slug, sort)
    values (p_group, v_name, public.unique_slug('category', v_name, null),
            (select coalesce(max(sort), -1) + 1 from public.categories))
    returning id into v_id;
    insert into public.audit_log (actor_id, entity, entity_id, action, after) values (p_actor, 'category', v_id::text, 'created', jsonb_build_object('name', v_name));
  else
    select * into old from public.categories where id = p_id for update;
    if not found then raise exception 'Category not found' using errcode = '22023'; end if;
    v_slug := case when v_name <> old.name then public.unique_slug('category', v_name, p_id) else old.slug end;
    update public.categories set name = v_name, slug = v_slug, group_id = p_group where id = p_id;
    perform public.record_slug_change('category', old.slug, v_slug, p_id);
    insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
    values (p_actor, 'category', p_id::text, 'edit', jsonb_build_object('name', old.name, 'group_id', old.group_id),
            jsonb_build_object('name', v_name, 'group_id', p_group));
  end if;
  return v_id;
end $$;

create or replace function public.admin_delete_category(p_actor uuid, p_id uuid, p_move_to uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  old public.categories;
  n int;
begin
  perform public.assert_admin(p_actor);
  select * into old from public.categories where id = p_id for update;
  if not found then raise exception 'Category not found' using errcode = '22023'; end if;
  select count(*) into n from public.products where category_id = p_id;
  if n > 0 then
    if p_move_to is null or p_move_to = p_id or not exists (select 1 from public.categories where id = p_move_to) then
      raise exception '% products are in this category. Choose a category to move them to.', n using errcode = 'P0001', hint = 'in_use';
    end if;
    update public.products set category_id = p_move_to, updated_at = now() where category_id = p_id;
  end if;
  delete from public.categories where id = p_id;
  -- old links to this category land on the one its products moved to
  if p_move_to is not null then
    perform public.record_slug_change('category', old.slug, null, p_move_to);
    update public.slug_redirects set target_id = p_move_to where kind = 'category' and target_id = p_id;
  else
    delete from public.slug_redirects where kind = 'category' and target_id = p_id;
  end if;
  insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
  values (p_actor, 'category', p_id::text, 'deleted', jsonb_build_object('name', old.name), jsonb_build_object('moved_products', n, 'to', p_move_to));
  return n;
end $$;

create or replace function public.admin_rename_group(p_actor uuid, p_id uuid, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := nullif(left(trim(p_name), 60), '');
  old public.category_groups;
  v_slug text;
begin
  perform public.assert_admin(p_actor);
  if v_name is null then raise exception 'Enter a group name' using errcode = '22023'; end if;
  select * into old from public.category_groups where id = p_id for update;
  if not found then raise exception 'Group not found' using errcode = '22023'; end if;
  if exists (select 1 from public.category_groups where lower(name) = lower(v_name) and id <> p_id) then
    raise exception 'A group called "%" already exists', v_name using errcode = '22023';
  end if;
  v_slug := case when v_name <> old.name then public.unique_slug('group', v_name, p_id) else old.slug end;
  update public.category_groups set name = v_name, slug = v_slug where id = p_id;
  perform public.record_slug_change('group', old.slug, v_slug, p_id);
  insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
  values (p_actor, 'group', p_id::text, 'renamed', jsonb_build_object('name', old.name), jsonb_build_object('name', v_name));
end $$;

-- p_kind 'group' | 'category'; p_ids in the new order (categories are ordered globally,
-- the store shows them within their group in this order).
create or replace function public.admin_reorder(p_actor uuid, p_kind text, p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_admin(p_actor);
  if p_kind = 'group' then
    update public.category_groups g set sort = t.ord - 1 from unnest(p_ids) with ordinality as t(id, ord) where g.id = t.id;
  elsif p_kind = 'category' then
    update public.categories c set sort = t.ord - 1 from unnest(p_ids) with ordinality as t(id, ord) where c.id = t.id;
  else
    raise exception 'Unknown kind' using errcode = '22023';
  end if;
  insert into public.audit_log (actor_id, entity, entity_id, action, after)
  values (p_actor, p_kind, 'all', 'reordered', jsonb_build_object('order', to_jsonb(p_ids)));
end $$;

-- execute rights --------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public.record_slug_change(text, text, text, uuid)', 'public.unique_slug(text, text, uuid)',
    'public.product_has_history(uuid)', 'public.variant_has_history(uuid)', 'public.publish_problems(uuid)',
    'public.open_orders_with(uuid[])', 'public.products_before_write()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.admin_create_product(uuid, text, uuid, uuid)', 'public.admin_update_product(uuid, uuid, jsonb, jsonb)',
    'public.admin_bulk_update_products(uuid, uuid[], jsonb)', 'public.admin_set_product_status(uuid, uuid[], text)',
    'public.admin_delete_product(uuid, uuid)', 'public.admin_duplicate_product(uuid, uuid)',
    'public.admin_save_options(uuid, uuid, jsonb, jsonb, boolean)', 'public.admin_save_variants(uuid, uuid, jsonb)',
    'public.admin_save_brand(uuid, uuid, text)', 'public.admin_delete_brand(uuid, uuid, uuid)',
    'public.admin_save_category(uuid, uuid, text, uuid)', 'public.admin_delete_category(uuid, uuid, uuid)',
    'public.admin_rename_group(uuid, uuid, text)', 'public.admin_reorder(uuid, text, uuid[])'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
grant execute on function public.publish_problems(uuid) to service_role;
