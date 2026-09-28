-- 0004_admin.sql — admin pricing and catalog tools (build step 5)
--
-- Admin code runs on the server with the service-role key, after the app has checked the
-- caller is an admin (see src/lib/admin/auth.ts). These functions are executable by
-- service_role only; p_actor is the admin's user id and is re-checked and audited here.

-- service role --------------------------------------------------------------------------
-- Server-side admin code uses the service-role key. Hosted projects grant it everything by
-- default; newer/local projects don't, so grant explicitly (no-op on hosted).
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

-- settings stay private ----------------------------------------------------------------
-- With the exchange rate and markup public, anyone could back usd_cost out of a price.
-- The storefront reads prices from variant_prices, which runs with owner rights, so it
-- doesn't need access to settings.
drop policy if exists "public read" on public.settings;
revoke select on public.settings from anon, authenticated;

create or replace function public.assert_admin(p_actor uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_actor is null or not exists (select 1 from public.profiles where id = p_actor and role = 'admin') then
    raise exception 'Not an admin' using errcode = '42501';
  end if;
end $$;

-- variant pricing and availability ---------------------------------------------------------
-- p_changes: [{"id": uuid, "usd_cost"?: number|null, "price_override"?: number|null,
--              "is_orderable"?: boolean}]. A key that is present is set (null clears it);
-- a missing key is left alone. All-or-nothing; returns the number of variants changed.
create or replace function public.admin_update_variants(p_actor uuid, p_changes jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  c jsonb;
  v public.variants;
  new_cost numeric;
  new_override numeric;
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

    new_cost := case when c ? 'usd_cost' then (c ->> 'usd_cost')::numeric(10, 2) else v.usd_cost end;
    new_override := case when c ? 'price_override' then (c ->> 'price_override')::numeric(12, 2) else v.price_override end;
    new_orderable := case when c ? 'is_orderable' then (c ->> 'is_orderable')::boolean else v.is_orderable end;

    if new_cost < 0 or new_override < 0 then
      raise exception '% : prices can''t be negative', v.sku using errcode = '22023';
    end if;
    if new_orderable is null then
      raise exception '% : orderable must be true or false', v.sku using errcode = '22023';
    end if;

    if new_cost is not distinct from v.usd_cost
       and new_override is not distinct from v.price_override
       and new_orderable = v.is_orderable then
      continue;
    end if;

    update public.variants
    set usd_cost = new_cost, price_override = new_override, is_orderable = new_orderable
    where id = v.id;

    insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
    values (p_actor, 'variant', v.id::text, 'pricing',
            jsonb_build_object('sku', v.sku, 'usd_cost', v.usd_cost, 'price_override', v.price_override,
                               'is_orderable', v.is_orderable),
            jsonb_build_object('sku', v.sku, 'usd_cost', new_cost, 'price_override', new_override,
                               'is_orderable', new_orderable));
    changed := changed + 1;
  end loop;

  return changed;
end $$;

-- exchange rate and markup -------------------------------------------------------------
create or replace function public.admin_update_settings(p_actor uuid, p_exchange_rate numeric, p_markup_pct numeric)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.settings;
begin
  perform public.assert_admin(p_actor);
  if p_exchange_rate is null or p_exchange_rate <= 0 or p_exchange_rate > 100000 then
    raise exception 'Exchange rate must be greater than 0' using errcode = '22023';
  end if;
  if p_markup_pct is null or p_markup_pct < 0 or p_markup_pct > 1000 then
    raise exception 'Markup must be between 0 and 1000%%' using errcode = '22023';
  end if;

  select * into s from public.settings where id = 1 for update;
  if s.exchange_rate is not distinct from p_exchange_rate and s.markup_pct is not distinct from p_markup_pct then
    return;
  end if;

  update public.settings set exchange_rate = p_exchange_rate, markup_pct = p_markup_pct where id = 1;
  insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
  values (p_actor, 'settings', '1', 'pricing',
          jsonb_build_object('exchange_rate', s.exchange_rate, 'markup_pct', s.markup_pct),
          jsonb_build_object('exchange_rate', p_exchange_rate, 'markup_pct', p_markup_pct));
end $$;

revoke execute on function public.assert_admin(uuid) from public, anon, authenticated;
revoke execute on function public.admin_update_variants(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_update_settings(uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function public.assert_admin(uuid) to service_role;
grant execute on function public.admin_update_variants(uuid, jsonb) to service_role;
grant execute on function public.admin_update_settings(uuid, numeric, numeric) to service_role;

-- product overview for the admin list ------------------------------------------------------
-- One row per product with the counts the admin list filters on; skus is for SKU search.
create or replace view public.admin_products as
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
  (select count(*) from public.variant_prices vp
    where vp.product_id = p.id and vp.is_orderable and vp.price is null)::int as unpriced_count,
  (select count(*) from public.product_images i where i.product_id = p.id)::int as image_count,
  (select i.storage_path from public.product_images i where i.product_id = p.id order by i.sort limit 1) as image,
  (select string_agg(v.sku, ' ' order by v.sort) from public.variants v where v.product_id = p.id) as skus
from public.products p
join public.brands b on b.id = p.brand_id
join public.categories c on c.id = p.category_id
join public.category_groups g on g.id = c.group_id;

revoke all on public.admin_products from public, anon, authenticated;
grant select on public.admin_products to service_role;
