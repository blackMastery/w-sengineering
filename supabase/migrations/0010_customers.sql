-- 0010_customers.sql — admin customer pages: blocking, roles, private notes, customer overview
-- (docs/SPEC.md → Customers (admin)). Admin functions are service_role only and audited.

-- blocking ------------------------------------------------------------------------------------
alter table public.profiles
  add column blocked_at timestamptz,
  add column blocked_reason text,
  add column blocked_by uuid references auth.users (id) on delete set null;

create or replace function public.is_blocked(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = p_user and blocked_at is not null);
$$;
revoke execute on function public.is_blocked(uuid) from public, anon, authenticated;

-- A blocked account can't place orders or save a cart, even with a session that hasn't
-- expired yet (Supabase Auth's ban stops new sign-ins; access tokens live up to an hour).
create or replace function public.refuse_blocked_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_blocked(new.user_id) then
    raise exception 'This account is suspended. Contact W&S.' using errcode = 'P0001', hint = 'blocked';
  end if;
  return new;
end $$;
revoke execute on function public.refuse_blocked_user() from public, anon, authenticated;

create trigger orders_refuse_blocked before insert on public.orders
  for each row execute function public.refuse_blocked_user();
create trigger cart_items_refuse_blocked before insert or update on public.cart_items
  for each row execute function public.refuse_blocked_user();

-- phone numbers as digits, without Guyana's 592 country code ("+592 345-6789" → "3456789")
create or replace function public.phone_digits(p text) returns text
language sql immutable set search_path = '' as $$
  select case when length(d) > 7 and d like '592%' then substr(d, 4) else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

-- private notes ---------------------------------------------------------------------------------
create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited boolean not null default false
);
create index customer_notes_customer_idx on public.customer_notes (customer_id, created_at desc);
alter table public.customer_notes enable row level security;   -- no policies: admin (service role) only
revoke all on public.customer_notes from anon, authenticated;
grant select, insert, update, delete on public.customer_notes to service_role;

-- customer overview (reads auth.users, so service_role only) ---------------------------------------
-- open orders = not cancelled or delivered; open estimate = not yet invoiced or cancelled
create or replace view public.admin_customers as
select
  u.id,
  u.email::text as email,
  u.email_confirmed_at,
  u.created_at as signed_up_at,
  u.last_sign_in_at,
  p.full_name,
  p.phone,
  p.role,
  p.blocked_at,
  p.blocked_reason,
  coalesce(o.total_orders, 0)::int as total_orders,
  coalesce(o.open_orders, 0)::int as open_orders,
  coalesce(o.open_estimate, 0)::numeric(12, 2) as open_estimate,
  o.last_order_at,
  -- for search: profile + every name/phone used on orders
  concat_ws(' ', lower(p.full_name), lower(u.email::text), o.names) as search_text,
  concat_ws(' ', public.phone_digits(p.phone), o.phones) as phone_search
from auth.users u
left join public.profiles p on p.id = u.id
left join lateral (
  select
    count(*) as total_orders,
    count(*) filter (where status not in ('cancelled', 'delivered')) as open_orders,
    sum(estimate_total) filter (where status in ('pending', 'confirmed', 'ordered_from_supplier', 'awaiting_approval', 'received')) as open_estimate,
    max(created_at) as last_order_at,
    string_agg(distinct lower(contact_name), ' ') as names,
    string_agg(distinct public.phone_digits(contact_phone), ' ') as phones
  from public.orders where user_id = u.id
) o on true;

revoke all on public.admin_customers from public, anon, authenticated;
grant select on public.admin_customers to service_role;

-- account actions -------------------------------------------------------------------------------
-- Block: reason required (admin-only), admins can't be blocked. Returns open order numbers so
-- the admin can decide about them; orders themselves are left untouched.
create or replace function public.admin_block_customer(p_actor uuid, p_user uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  v_reason text := nullif(left(trim(p_reason), 500), '');
begin
  perform public.assert_admin(p_actor);
  if v_reason is null then raise exception 'Give a reason for blocking (only admins see it)' using errcode = '22023'; end if;
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'Customer not found' using errcode = '22023'; end if;
  if p.role = 'admin' then
    raise exception 'Admins can’t be blocked. Remove their admin role first.' using errcode = 'P0001', hint = 'bad_transition';
  end if;
  if p.blocked_at is not null then raise exception 'This account is already blocked' using errcode = 'P0001', hint = 'conflict'; end if;

  update public.profiles set blocked_at = now(), blocked_reason = v_reason, blocked_by = p_actor where id = p_user;
  delete from public.cart_items where user_id = p_user;
  insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
  values (p_actor, 'customer', p_user::text, 'blocked', null, jsonb_build_object('reason', v_reason));

  return jsonb_build_object('open_orders', coalesce((
    select jsonb_agg(number order by created_at) from public.orders
    where user_id = p_user and status not in ('cancelled', 'delivered', 'paid')), '[]'));
end $$;

create or replace function public.admin_unblock_customer(p_actor uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
begin
  perform public.assert_admin(p_actor);
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'Customer not found' using errcode = '22023'; end if;
  if p.blocked_at is null then raise exception 'This account isn’t blocked' using errcode = 'P0001', hint = 'conflict'; end if;
  update public.profiles set blocked_at = null, blocked_reason = null, blocked_by = null where id = p_user;
  insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
  values (p_actor, 'customer', p_user::text, 'unblocked', jsonb_build_object('reason', p.blocked_reason), null);
end $$;

-- Role change. Making someone admin needs their email typed as confirmation. You can't remove
-- your own admin role, and there is always at least one admin. Blocked accounts can't be admins.
create or replace function public.admin_set_role(p_actor uuid, p_user uuid, p_role text, p_confirm_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  v_email text;
  v_admins int;
begin
  perform public.assert_admin(p_actor);
  if p_role not in ('customer', 'admin') then raise exception 'Unknown role' using errcode = '22023'; end if;
  -- lock every admin row so two demotions can't both pass the "last admin" check
  perform 1 from public.profiles where role = 'admin' for update;
  select * into p from public.profiles where id = p_user for update;
  if not found then raise exception 'Customer not found' using errcode = '22023'; end if;
  if p.role = p_role then return; end if;

  if p_role = 'admin' then
    select email into v_email from auth.users where id = p_user;
    if v_email is null or lower(trim(coalesce(p_confirm_email, ''))) <> lower(v_email) then
      raise exception 'Type the customer’s email exactly to confirm' using errcode = '22023';
    end if;
    if p.blocked_at is not null then
      raise exception 'Unblock this account before making it an admin' using errcode = 'P0001', hint = 'bad_transition';
    end if;
  else
    if p_user = p_actor then
      raise exception 'You can’t remove your own admin role. Ask another admin.' using errcode = 'P0001', hint = 'bad_transition';
    end if;
    select count(*) into v_admins from public.profiles where role = 'admin';
    if v_admins <= 1 then
      raise exception 'The store needs at least one admin' using errcode = 'P0001', hint = 'bad_transition';
    end if;
  end if;

  update public.profiles set role = p_role where id = p_user;
  insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
  values (p_actor, 'customer', p_user::text, 'role', jsonb_build_object('role', p.role), jsonb_build_object('role', p_role));
end $$;

-- notes: any admin adds; only the author edits or deletes
create or replace function public.admin_add_note(p_actor uuid, p_customer uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_body text := nullif(trim(p_body), '');
begin
  perform public.assert_admin(p_actor);
  if v_body is null or length(v_body) > 2000 then raise exception 'Notes are 1–2,000 characters' using errcode = '22023'; end if;
  if not exists (select 1 from auth.users where id = p_customer) then raise exception 'Customer not found' using errcode = '22023'; end if;
  insert into public.customer_notes (customer_id, author_id, body) values (p_customer, p_actor, v_body) returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_edit_note(p_actor uuid, p_note uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n public.customer_notes;
  v_body text := nullif(trim(p_body), '');
begin
  perform public.assert_admin(p_actor);
  if v_body is null or length(v_body) > 2000 then raise exception 'Notes are 1–2,000 characters' using errcode = '22023'; end if;
  select * into n from public.customer_notes where id = p_note for update;
  if not found then raise exception 'That note no longer exists' using errcode = 'P0001', hint = 'conflict'; end if;
  if n.author_id is distinct from p_actor then
    raise exception 'Only the person who wrote a note can change it' using errcode = 'P0001', hint = 'bad_transition';
  end if;
  if n.body = v_body then return; end if;
  update public.customer_notes set body = v_body, edited = true, updated_at = now() where id = p_note;
end $$;

create or replace function public.admin_delete_note(p_actor uuid, p_note uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n public.customer_notes;
begin
  perform public.assert_admin(p_actor);
  select * into n from public.customer_notes where id = p_note for update;
  if not found then return; end if;
  if n.author_id is distinct from p_actor then
    raise exception 'Only the person who wrote a note can delete it' using errcode = 'P0001', hint = 'bad_transition';
  end if;
  delete from public.customer_notes where id = p_note;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.admin_block_customer(uuid, uuid, text)', 'public.admin_unblock_customer(uuid, uuid)',
    'public.admin_set_role(uuid, uuid, text, text)', 'public.admin_add_note(uuid, uuid, text)',
    'public.admin_edit_note(uuid, uuid, text)', 'public.admin_delete_note(uuid, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
