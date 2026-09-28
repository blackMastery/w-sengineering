-- 0003_orders.sql — accounts, server-side carts and order requests (build step 4)
-- Change proposals, purchase orders and invoices come in later migrations.

-- Data API grants -------------------------------------------------------------------
-- Newer Supabase projects don't grant table access to anon/authenticated by default. The
-- hosted project already has these grants (no-op there); a fresh or local project needs them.
grant select on public.category_groups, public.categories, public.brands, public.products,
  public.product_options, public.product_images, public.related_products, public.settings
  to anon, authenticated;
grant select on public.profiles to authenticated;

-- profiles ---------------------------------------------------------------------
-- Every auth user gets a profile. The role always starts as 'customer': user metadata is
-- user-editable, so it only ever fills name and phone.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    nullif(left(trim(new.raw_user_meta_data ->> 'full_name'), 120), ''),
    nullif(left(trim(new.raw_user_meta_data ->> 'phone'), 40), '')
  )
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- users who signed up before this migration
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;

-- customers may change their own name and phone, never their role
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- server-side cart (signed-in customers; guests keep theirs in localStorage) ----------
create table public.cart_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  variant_id uuid not null references public.variants (id) on delete cascade,
  qty int not null check (qty between 1 and 999),
  updated_at timestamptz not null default now(),
  primary key (user_id, variant_id)
);

alter table public.cart_items enable row level security;
create policy "own cart" on public.cart_items for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on public.cart_items from anon, authenticated;
grant select, insert, update, delete on public.cart_items to authenticated;

-- orders -------------------------------------------------------------------------
-- Order numbers: WS-1001, WS-1002, …
create sequence public.order_number_seq start with 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('WS-' || nextval('public.order_number_seq')),
  user_id uuid not null references auth.users (id),
  status text not null default 'pending' check (status in (
    'pending', 'confirmed', 'ordered_from_supplier', 'awaiting_approval',
    'received', 'invoiced', 'paid', 'delivered', 'cancelled')),
  fulfillment text not null check (fulfillment in ('pickup', 'delivery')),
  contact_name text not null,
  contact_phone text not null,
  contact_email text,
  address jsonb,                    -- {line1, line2?, city, notes?}; required for delivery
  notes text,
  delivery_fee numeric(12, 2),      -- set by admin at invoice (0 for pickup)
  estimate_total numeric(12, 2) not null default 0,  -- priced lines only
  invoice_total numeric(12, 2),
  payment_method text,
  payment_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_needs_address check (fulfillment = 'pickup' or address is not null)
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);

-- lines snapshot what was ordered, so later catalog edits don't change the order
create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  variant_id uuid references public.variants (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  sku text not null,
  name text not null,
  option_values jsonb not null default '{}',
  qty int not null check (qty between 1 and 999),
  unit_price numeric(12, 2),        -- price at order time; null = Price on request
  sort int not null default 0
);
create index order_lines_order_idx on public.order_lines (order_id);

-- customer-visible status timeline
create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  status text not null,
  actor_id uuid references auth.users (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

-- admin-only history of every status change, line edit and price edit
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  entity text not null,
  entity_id text not null,
  action text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id, created_at desc);

-- Read-only to the API. Every write goes through the functions below.
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.order_events enable row level security;
alter table public.audit_log enable row level security;

create policy "own orders" on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "own order lines" on public.order_lines for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy "own order events" on public.order_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy "admin audit log" on public.audit_log for select to authenticated
  using ((select public.is_admin()));

revoke all on public.orders, public.order_lines, public.order_events, public.audit_log from anon, authenticated;
grant select on public.orders, public.order_lines, public.order_events, public.audit_log to authenticated;
revoke all on sequence public.order_number_seq from anon, authenticated;

-- cart functions (invoker rights: RLS on cart_items applies) ---------------------
-- Items are [{"variant_id": uuid, "qty": int}]. Discontinued variants are dropped.

-- On sign-in: fold the guest cart into the account cart, keeping the higher qty per variant.
create or replace function public.merge_cart(p_items jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  insert into public.cart_items (user_id, variant_id, qty)
  select v_user, r.variant_id, r.qty
  from (
    select (e ->> 'variant_id')::uuid as variant_id, least(max((e ->> 'qty')::int), 999) as qty
    from jsonb_array_elements(coalesce(p_items, '[]')) e
    group by 1
  ) r
  join public.variant_prices vp on vp.id = r.variant_id and vp.is_orderable
  where r.qty >= 1
  on conflict (user_id, variant_id)
    do update set qty = greatest(public.cart_items.qty, excluded.qty), updated_at = now();

  delete from public.cart_items c
  where c.user_id = v_user
    and not exists (select 1 from public.variant_prices vp where vp.id = c.variant_id and vp.is_orderable);

  return coalesce(
    (select jsonb_agg(jsonb_build_object('variant_id', variant_id, 'qty', qty) order by updated_at, variant_id)
     from public.cart_items where user_id = v_user),
    '[]');
end $$;

-- After sign-in, the browser replaces the account cart with its current contents.
create or replace function public.set_cart(p_items jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  delete from public.cart_items where user_id = v_user;
  insert into public.cart_items (user_id, variant_id, qty)
  select v_user, r.variant_id, r.qty
  from (
    select (e ->> 'variant_id')::uuid as variant_id, least(max((e ->> 'qty')::int), 999) as qty
    from jsonb_array_elements(coalesce(p_items, '[]')) e
    group by 1
  ) r
  join public.variant_prices vp on vp.id = r.variant_id and vp.is_orderable
  where r.qty >= 1;
end $$;

-- place an order request ----------------------------------------------------------
-- Re-validates every line against the live catalog, snapshots names and prices, logs the
-- event and empties the account cart. Returns {"id": uuid, "number": text}.
create or replace function public.place_order(
  p_items jsonb,
  p_fulfillment text,
  p_contact jsonb,                  -- {"name", "phone"}
  p_address jsonb default null,     -- {"line1", "line2", "city", "notes"}
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_name text := nullif(trim(p_contact ->> 'name'), '');
  v_phone text := nullif(trim(p_contact ->> 'phone'), '');
  v_notes text := nullif(trim(p_notes), '');
  v_address jsonb;
  v_requested int;
  v_available int;
  v_order_id uuid;
  v_number text;
  v_estimate numeric(12, 2);
  v_lines int;
begin
  if v_user is null then
    raise exception 'Sign in to place an order request' using errcode = '28000';
  end if;
  if p_fulfillment is null or p_fulfillment not in ('pickup', 'delivery') then
    raise exception 'Choose pickup or delivery' using errcode = '22023';
  end if;
  if v_name is null or v_phone is null then
    raise exception 'Name and phone number are required' using errcode = '22023';
  end if;
  if length(v_name) > 120 or length(v_phone) > 40 or length(coalesce(v_notes, '')) > 1000 then
    raise exception 'Some details are too long' using errcode = '22023';
  end if;

  if p_fulfillment = 'delivery' then
    v_address := jsonb_strip_nulls(jsonb_build_object(
      'line1', nullif(left(trim(p_address ->> 'line1'), 200), ''),
      'line2', nullif(left(trim(p_address ->> 'line2'), 200), ''),
      'city', nullif(left(trim(p_address ->> 'city'), 100), ''),
      'notes', nullif(left(trim(p_address ->> 'notes'), 500), '')));
    if v_address ->> 'line1' is null or v_address ->> 'city' is null then
      raise exception 'Delivery needs a street address and town' using errcode = '22023';
    end if;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'Too many lines in one order' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) e where (e ->> 'qty')::int not between 1 and 999) then
    raise exception 'Quantities must be between 1 and 999' using errcode = '22023';
  end if;

  select count(*), count(*) filter (where vp.is_orderable)
    into v_requested, v_available
  from (select distinct (e ->> 'variant_id')::uuid as variant_id from jsonb_array_elements(p_items) e) r
  left join public.variant_prices vp on vp.id = r.variant_id;
  if v_available < v_requested then
    raise exception 'Some items in your cart are no longer available' using errcode = 'P0001', hint = 'unavailable';
  end if;

  insert into public.orders (user_id, fulfillment, contact_name, contact_phone, contact_email, address, notes)
  values (v_user, p_fulfillment, v_name, v_phone, (select email from auth.users where id = v_user), v_address, v_notes)
  returning id, number into v_order_id, v_number;

  insert into public.order_lines (order_id, variant_id, product_id, sku, name, option_values, qty, unit_price, sort)
  select v_order_id, vp.id, vp.product_id, vp.sku, p.name, vp.option_values, r.qty, vp.price, r.pos
  from (
    select (e ->> 'variant_id')::uuid as variant_id,
           least(sum((e ->> 'qty')::int), 999)::int as qty,
           min(t.ord)::int as pos
    from jsonb_array_elements(p_items) with ordinality as t(e, ord)
    group by 1
  ) r
  join public.variant_prices vp on vp.id = r.variant_id
  join public.products p on p.id = vp.product_id;

  select coalesce(sum(l.unit_price * l.qty), 0), count(*)
    into v_estimate, v_lines
  from public.order_lines l where l.order_id = v_order_id;
  update public.orders set estimate_total = v_estimate where id = v_order_id;

  insert into public.order_events (order_id, status, actor_id) values (v_order_id, 'pending', v_user);
  insert into public.audit_log (actor_id, entity, entity_id, action, after)
  values (v_user, 'order', v_order_id::text, 'placed',
          jsonb_build_object('number', v_number, 'lines', v_lines, 'estimate_total', v_estimate));

  delete from public.cart_items where user_id = v_user;

  return jsonb_build_object('id', v_order_id, 'number', v_number);
end $$;

-- customer cancel: only while Pending --------------------------------------------
-- One UPDATE guarded by status = 'pending'. The row lock makes it atomic against an admin
-- confirming the same order: whichever commits first wins, the other matches no row.
create or replace function public.cancel_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  update public.orders set status = 'cancelled', updated_at = now()
  where id = p_order_id and user_id = v_user and status = 'pending';
  if not found then
    raise exception 'This order can no longer be cancelled online. Contact us to change it.'
      using errcode = 'P0001', hint = 'not_cancellable';
  end if;

  insert into public.order_events (order_id, status, actor_id, note)
  values (p_order_id, 'cancelled', v_user, 'Cancelled by customer');
  insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
  values (v_user, 'order', p_order_id::text, 'status',
          '{"status": "pending"}', '{"status": "cancelled"}');
end $$;

revoke execute on function public.merge_cart(jsonb) from public, anon;
revoke execute on function public.set_cart(jsonb) from public, anon;
revoke execute on function public.place_order(jsonb, text, jsonb, jsonb, text) from public, anon;
revoke execute on function public.cancel_order(uuid) from public, anon;
grant execute on function public.merge_cart(jsonb) to authenticated;
grant execute on function public.set_cart(jsonb) to authenticated;
grant execute on function public.place_order(jsonb, text, jsonb, jsonb, text) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
