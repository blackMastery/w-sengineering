-- 0011_customer_ban_state.sql — expose Supabase Auth's ban on admin_customers so the customer
-- page can spot a block/unblock whose Auth call failed and offer Retry. Same view as 0010
-- plus banned_until (added last, so create or replace keeps the existing columns).

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
  concat_ws(' ', public.phone_digits(p.phone), o.phones) as phone_search,
  -- Supabase Auth's ban (set by the block action); compared with blocked_at to catch a failed ban
  u.banned_until
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
