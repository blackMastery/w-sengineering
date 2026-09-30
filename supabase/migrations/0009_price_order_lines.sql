-- 0009_price_order_lines.sql — price "Price on request" lines on an order before invoicing
--
-- Order lines keep the price they had when the customer ordered (price lock). Lines ordered
-- as "Price on request" have no price; the admin fills them in here once the price is known.
-- Only unpriced lines can be set, so a price the customer ordered at never changes. Each call
-- is all-or-nothing, recomputes the estimate, adds a timeline event and one audit row per line.
--
-- p_prices: [{"line_id": uuid, "unit_price": int}]   (whole GYD)

create or replace function public.admin_price_order_lines(p_actor uuid, p_order uuid, p_prices jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  x jsonb;
  l public.order_lines;
  v_price integer;
  n int := 0;
  v_estimate numeric(12, 2);
  v_left int;
begin
  perform public.assert_admin(p_actor);
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found' using errcode = '22023'; end if;
  if o.status = 'awaiting_approval' then
    raise exception 'The customer is reviewing proposed changes. Price the lines after they answer (or withdraw the proposal).'
      using errcode = 'P0001', hint = 'bad_transition';
  end if;
  if o.status not in ('pending', 'confirmed', 'ordered_from_supplier', 'received') then
    raise exception 'Lines can’t be priced on a % order', replace(o.status, '_', ' ') using errcode = 'P0001', hint = 'bad_transition';
  end if;
  if p_prices is null or jsonb_typeof(p_prices) <> 'array' or jsonb_array_length(p_prices) = 0 then
    raise exception 'Enter at least one price' using errcode = '22023';
  end if;

  for x in select value from jsonb_array_elements(p_prices) loop
    select * into l from public.order_lines where id = (x ->> 'line_id')::uuid and order_id = p_order for update;
    if not found then raise exception 'That line isn’t on this order' using errcode = '22023'; end if;
    if l.unit_price is not null then
      raise exception '% already has a price. Reload the page.', l.sku using errcode = 'P0001', hint = 'conflict';
    end if;
    if (x ->> 'unit_price') is null or (x ->> 'unit_price') !~ '^\d{1,9}$' then
      raise exception '% : price must be a whole number of GYD', l.sku using errcode = '22023';
    end if;
    v_price := (x ->> 'unit_price')::integer;

    update public.order_lines set unit_price = v_price where id = l.id;
    insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
    values (p_actor, 'order', p_order::text, 'line_priced',
            jsonb_build_object('line_id', l.id, 'sku', l.sku, 'unit_price', null),
            jsonb_build_object('line_id', l.id, 'sku', l.sku, 'unit_price', v_price, 'qty', l.qty));
    n := n + 1;
  end loop;

  select coalesce(sum(unit_price * qty), 0), count(*) filter (where unit_price is null)
    into v_estimate, v_left
  from public.order_lines where order_id = p_order;
  update public.orders set estimate_total = v_estimate, updated_at = now() where id = p_order;

  -- customer-visible timeline entry (status unchanged)
  insert into public.order_events (order_id, status, actor_id, note)
  values (p_order, o.status, p_actor,
          format('Prices added for %s %s. New estimate: GYD %s%s', n, case when n = 1 then 'item' else 'items' end,
                 to_char(v_estimate, 'FM999,999,999,990'),
                 case when v_left > 0 then format(' (%s still priced at invoice)', v_left) else '' end));

  return jsonb_build_object('priced', n, 'estimate_total', v_estimate, 'unpriced_left', v_left);
end $$;

revoke execute on function public.admin_price_order_lines(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.admin_price_order_lines(uuid, uuid, jsonb) to service_role;
