-- 0006_gyd_prices.sql — prices are entered directly in GYD (owner decision, replaces the
-- USD cost × exchange rate × markup model). One price per variant, whole Guyanese dollars;
-- null still means "Price on request".
--
-- Removes: variants.usd_cost, variants.price_override, settings, round99(),
-- admin_update_settings(). Orders keep their snapshotted unit prices.

-- 1. new column, filled with the price customers see today (override, else computed)
alter table public.variants add column price integer check (price >= 0);
update public.variants v
set price = round(vp.price)::integer
from public.variant_prices vp
where vp.id = v.id and vp.price is not null;

-- 2. drop everything built on the old model
drop view if exists public.admin_products;
drop view if exists public.variant_prices;
drop function if exists public.admin_update_settings(uuid, numeric, numeric);
drop function if exists public.round99(numeric);
alter table public.variants drop column usd_cost, drop column price_override;
drop table if exists public.settings;

-- 3. public read surface, unchanged shape (storefront and order functions read this view).
-- Nothing confidential is left, so it runs with the caller's rights like any table read.
grant select (price) on public.variants to anon, authenticated;
create view public.variant_prices with (security_invoker = true) as
select id, product_id, sku, option_values, is_orderable, sort, price
from public.variants;
grant select on public.variant_prices to anon, authenticated, service_role;

-- 4. admin product overview (as in 0004), unpriced = orderable with no price
create view public.admin_products as
select
  p.id,
  p.slug,
  p.name,
  p.needs_review,
  p.is_featured,
  p.is_new,
  p.catalog_page,
  p.updated_at,
  b.name as brand,
  c.id as category_id,
  c.name as category,
  g.name as group_name,
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

-- 5. admin variant updates: GYD price and availability
-- p_changes: [{"id": uuid, "price"?: int|null, "is_orderable"?: boolean}]. A present key is set
-- (null clears the price → "Price on request"); a missing key is left alone. All-or-nothing;
-- returns the number of variants changed, with one audit row each.
create or replace function public.admin_update_variants(p_actor uuid, p_changes jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  c jsonb;
  v public.variants;
  new_price integer;
  new_orderable boolean;
  changed int := 0;
begin
  perform public.assert_admin(p_actor);
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'Expected a list of changes' using errcode = '22023';
  end if;
  if jsonb_array_length(p_changes) > 2000 then
    raise exception 'Too many changes at once (max 2000)' using errcode = '22023';
  end if;

  for c in select value from jsonb_array_elements(p_changes) loop
    select * into v from public.variants where id = (c ->> 'id')::uuid for update;
    if not found then
      raise exception 'Unknown variant %', c ->> 'id' using errcode = '22023';
    end if;

    if c ? 'price' and c ->> 'price' is not null and (c ->> 'price') !~ '^\d{1,9}$' then
      raise exception '% : price must be a whole number of GYD', v.sku using errcode = '22023';
    end if;
    new_price := case when c ? 'price' then (c ->> 'price')::integer else v.price end;
    new_orderable := case when c ? 'is_orderable' then (c ->> 'is_orderable')::boolean else v.is_orderable end;
    if new_orderable is null then
      raise exception '% : orderable must be true or false', v.sku using errcode = '22023';
    end if;

    if new_price is not distinct from v.price and new_orderable = v.is_orderable then
      continue;
    end if;

    update public.variants set price = new_price, is_orderable = new_orderable where id = v.id;
    insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
    values (p_actor, 'variant', v.id::text, 'pricing',
            jsonb_build_object('sku', v.sku, 'price', v.price, 'is_orderable', v.is_orderable),
            jsonb_build_object('sku', v.sku, 'price', new_price, 'is_orderable', new_orderable));
    changed := changed + 1;
  end loop;

  return changed;
end $$;

revoke execute on function public.admin_update_variants(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_update_variants(uuid, jsonb) to service_role;
