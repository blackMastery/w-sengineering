-- 0005_workflow.sql — order workflow: admin status changes, supplier-shortage change
-- proposals with customer approval, purchase orders (build step 6). Invoicing is step 7.
--
-- Admin functions are service_role only (called after the app's admin check, like 0004)
-- and take p_actor for the audit log. respond_to_changes is the customer's own call.
-- Every transition is a single guarded UPDATE on the order row, so concurrent actions
-- (customer approving while admin withdraws, admin confirming while customer cancels)
-- can't both win.

-- change proposals -------------------------------------------------------------------
create table public.order_changes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  -- {"lines": [{"line_id", "sku", "name", "option_values", "unit_price", "qty_before", "qty"}],
  --  "add":   [{"variant_id", "sku", "name", "option_values", "unit_price", "qty"}]}
  proposed jsonb not null,
  note text,
  resume_status text not null check (resume_status in ('confirmed', 'ordered_from_supplier')),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'withdrawn')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  reminded_at timestamptz   -- set by the reminder email job (step 7)
);
create unique index order_changes_one_open on public.order_changes (order_id) where status = 'proposed';

alter table public.order_changes enable row level security;
create policy "own order changes" on public.order_changes for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
revoke all on public.order_changes from anon, authenticated;
grant select on public.order_changes to authenticated;

-- purchase orders --------------------------------------------------------------------
create sequence if not exists public.po_number_seq start with 1001;

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('PO-' || nextval('public.po_number_seq')),
  supplier_id uuid not null references public.suppliers (id),
  status text not null default 'draft' check (status in ('draft', 'sent', 'received')),
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  received_at timestamptz
);
create unique index purchase_orders_one_draft on public.purchase_orders (supplier_id) where status = 'draft';

-- one row per SKU on a PO, with the order lines it covers
create table public.po_lines (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  variant_id uuid references public.variants (id) on delete set null,
  sku text not null,
  name text not null,
  option_values jsonb not null default '{}',
  qty int not null check (qty > 0),
  order_line_ids uuid[] not null default '{}'
);
create index po_lines_po_idx on public.po_lines (po_id);

alter table public.order_lines add column po_id uuid references public.purchase_orders (id) on delete set null;
create index order_lines_po_idx on public.order_lines (po_id);

-- admin only (service role); customers never see purchase orders
alter table public.purchase_orders enable row level security;
alter table public.po_lines enable row level security;
revoke all on public.purchase_orders, public.po_lines from anon, authenticated;
revoke all on sequence public.po_number_seq from anon, authenticated;
grant select, insert, update, delete on public.order_changes, public.purchase_orders, public.po_lines to service_role;
grant usage, select on sequence public.po_number_seq to service_role;

-- helpers (internal) --------------------------------------------------------------------
create or replace function public.log_order_event(p_order uuid, p_status text, p_actor uuid, p_note text,
                                                  p_before jsonb, p_after jsonb, p_action text default 'status')
returns void language sql security definer set search_path = '' as $$
  insert into public.order_events (order_id, status, actor_id, note) values (p_order, p_status, p_actor, p_note);
  insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
  values (p_actor, 'order', p_order::text, p_action, p_before, p_after);
$$;

-- Regroup a draft PO's lines by SKU (cancelled orders excluded). Sent POs are frozen.
create or replace function public.rebuild_po_lines(p_po uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.purchase_orders where id = p_po and status = 'draft') then return; end if;
  delete from public.po_lines where po_id = p_po;
  insert into public.po_lines (po_id, variant_id, sku, name, option_values, qty, order_line_ids)
  select p_po, l.variant_id, l.sku, min(l.name), (array_agg(l.option_values))[1], sum(l.qty), array_agg(l.id order by l.id)
  from public.order_lines l
  join public.orders o on o.id = l.order_id
  where l.po_id = p_po and o.status <> 'cancelled'
  group by l.variant_id, l.sku;
end $$;

-- Take a cancelled order's lines off any draft PO (lines on sent POs stay: they were ordered).
create or replace function public.release_from_draft_pos(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_po uuid;
begin
  for v_po in
    select distinct l.po_id from public.order_lines l
    join public.purchase_orders po on po.id = l.po_id
    where l.order_id = p_order and po.status = 'draft'
  loop
    update public.order_lines set po_id = null where order_id = p_order and po_id = v_po;
    perform public.rebuild_po_lines(v_po);
  end loop;
end $$;

-- Move orders forward once every line is on a sent (→ ordered) or received (→ received) PO.
create or replace function public.advance_orders(p_po uuid, p_actor uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  moved int := 0;
begin
  for r in
    select distinct o.id, o.status from public.orders o
    join public.order_lines l on l.order_id = o.id
    where l.po_id = p_po and o.status in ('confirmed', 'ordered_from_supplier')
  loop
    if r.status = 'confirmed' and not exists (
      select 1 from public.order_lines l left join public.purchase_orders po on po.id = l.po_id
      where l.order_id = r.id and (po.id is null or po.status = 'draft')
    ) then
      update public.orders set status = 'ordered_from_supplier', updated_at = now() where id = r.id and status = 'confirmed';
      perform public.log_order_event(r.id, 'ordered_from_supplier', p_actor, null,
        '{"status": "confirmed"}', '{"status": "ordered_from_supplier"}');
      moved := moved + 1;
    elsif r.status = 'ordered_from_supplier' and not exists (
      select 1 from public.order_lines l left join public.purchase_orders po on po.id = l.po_id
      where l.order_id = r.id and (po.id is null or po.status <> 'received')
    ) then
      update public.orders set status = 'received', updated_at = now() where id = r.id and status = 'ordered_from_supplier';
      perform public.log_order_event(r.id, 'received', p_actor, null,
        '{"status": "ordered_from_supplier"}', '{"status": "received"}');
      moved := moved + 1;
    end if;
  end loop;
  return moved;
end $$;

-- admin: order status ---------------------------------------------------------------------
-- confirm: pending → confirmed
-- cancel:  any status before paid → cancelled (withdraws an open proposal, frees draft PO lines)
-- receive: ordered_from_supplier → received (manual, e.g. an item bought outside a PO)
create or replace function public.admin_set_order_status(p_actor uuid, p_order uuid, p_to text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_from text;
  v_note text := nullif(left(trim(p_note), 500), '');
begin
  perform public.assert_admin(p_actor);
  select status into v_from from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found' using errcode = '22023'; end if;

  if not (
    (p_to = 'confirmed' and v_from = 'pending') or
    (p_to = 'received' and v_from = 'ordered_from_supplier') or
    (p_to = 'cancelled' and v_from in ('pending', 'confirmed', 'ordered_from_supplier', 'awaiting_approval', 'received', 'invoiced'))
  ) then
    raise exception 'Can''t change an order from % to %', replace(v_from, '_', ' '), replace(p_to, '_', ' ')
      using errcode = 'P0001', hint = 'bad_transition';
  end if;

  update public.orders set status = p_to, updated_at = now() where id = p_order and status = v_from;

  if p_to = 'cancelled' then
    update public.order_changes set status = 'withdrawn', decided_at = now() where order_id = p_order and status = 'proposed';
    perform public.release_from_draft_pos(p_order);
  end if;

  perform public.log_order_event(p_order, p_to, p_actor, v_note,
    jsonb_build_object('status', v_from), jsonb_build_object('status', p_to, 'note', v_note));
end $$;

-- admin: propose changes when the supplier is short -------------------------------------
-- p_changes: {"lines": [{"line_id": uuid, "qty": int}], "add": [{"variant_id": uuid, "qty": int}]}
-- qty 0 removes a line; lines not mentioned stay as they are.
create or replace function public.admin_propose_changes(p_actor uuid, p_order uuid, p_changes jsonb, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_lines jsonb;
  v_add jsonb;
  v_changed boolean;
  v_remaining int;
  v_id uuid;
  v_note text := nullif(left(trim(p_note), 1000), '');
begin
  perform public.assert_admin(p_actor);
  select status into v_status from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found' using errcode = '22023'; end if;
  if v_status not in ('confirmed', 'ordered_from_supplier') then
    raise exception 'Changes can only be proposed on confirmed or ordered orders' using errcode = 'P0001', hint = 'bad_transition';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_changes -> 'lines', '[]')) c
    where not exists (select 1 from public.order_lines l where l.id = (c ->> 'line_id')::uuid and l.order_id = p_order)
       or (c ->> 'qty')::int not between 0 and 999
  ) then
    raise exception 'Line changes must be for this order, with qty 0–999' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_changes -> 'add', '[]')) a
    left join public.variant_prices vp on vp.id = (a ->> 'variant_id')::uuid
    where vp.id is null or not vp.is_orderable or (a ->> 'qty')::int not between 1 and 999
  ) then
    raise exception 'Added items must be orderable, with qty 1–999' using errcode = '22023';
  end if;

  -- every current line with its before/after qty, so the customer sees the whole order
  select jsonb_agg(jsonb_build_object(
           'line_id', l.id, 'sku', l.sku, 'name', l.name, 'option_values', l.option_values,
           'unit_price', l.unit_price, 'qty_before', l.qty,
           'qty', coalesce((select (c ->> 'qty')::int from jsonb_array_elements(coalesce(p_changes -> 'lines', '[]')) c
                            where (c ->> 'line_id')::uuid = l.id limit 1), l.qty))
         order by l.sort, l.id)
    into v_lines
  from public.order_lines l where l.order_id = p_order;

  select coalesce(jsonb_agg(jsonb_build_object(
           'variant_id', vp.id, 'sku', vp.sku, 'name', p.name, 'option_values', vp.option_values,
           'unit_price', vp.price, 'qty', (a ->> 'qty')::int)), '[]')
    into v_add
  from jsonb_array_elements(coalesce(p_changes -> 'add', '[]')) a
  join public.variant_prices vp on vp.id = (a ->> 'variant_id')::uuid
  join public.products p on p.id = vp.product_id;

  select exists (select 1 from jsonb_array_elements(v_lines) x where (x ->> 'qty')::int <> (x ->> 'qty_before')::int)
         or jsonb_array_length(v_add) > 0,
         (select count(*) from jsonb_array_elements(v_lines) x where (x ->> 'qty')::int > 0) + jsonb_array_length(v_add)
    into v_changed, v_remaining;
  if not v_changed then raise exception 'Nothing to change' using errcode = '22023'; end if;
  if v_remaining = 0 then
    raise exception 'That removes every item. Cancel the order instead.' using errcode = '22023';
  end if;

  insert into public.order_changes (order_id, proposed, note, resume_status, created_by)
  values (p_order, jsonb_build_object('lines', v_lines, 'add', v_add), v_note, v_status, p_actor)
  returning id into v_id;

  update public.orders set status = 'awaiting_approval', updated_at = now() where id = p_order and status = v_status;
  perform public.log_order_event(p_order, 'awaiting_approval', p_actor, v_note,
    jsonb_build_object('status', v_status), jsonb_build_object('status', 'awaiting_approval', 'proposal', v_id), 'changes_proposed');
  return v_id;
end $$;

-- Apply an approved proposal to the order lines (internal).
create or replace function public.apply_order_changes(p_change uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.order_changes;
  x jsonb;
  v_pos int;
  v_po uuid;
  v_pos_touched uuid[];
begin
  select * into c from public.order_changes where id = p_change;
  select array_agg(distinct po_id) into v_pos_touched from public.order_lines where order_id = c.order_id and po_id is not null;

  for x in select value from jsonb_array_elements(c.proposed -> 'lines') loop
    if (x ->> 'qty')::int = 0 then
      delete from public.order_lines where id = (x ->> 'line_id')::uuid and order_id = c.order_id;
    elsif (x ->> 'qty')::int <> (x ->> 'qty_before')::int then
      update public.order_lines set qty = (x ->> 'qty')::int where id = (x ->> 'line_id')::uuid and order_id = c.order_id;
    end if;
  end loop;

  select coalesce(max(sort), 0) into v_pos from public.order_lines where order_id = c.order_id;
  for x in select value from jsonb_array_elements(c.proposed -> 'add') loop
    v_pos := v_pos + 1;
    insert into public.order_lines (order_id, variant_id, product_id, sku, name, option_values, qty, unit_price, sort)
    select c.order_id, v.id, v.product_id, x ->> 'sku', x ->> 'name', coalesce(x -> 'option_values', '{}'),
           (x ->> 'qty')::int, (x ->> 'unit_price')::numeric, v_pos
    from public.variants v where v.id = (x ->> 'variant_id')::uuid;
  end loop;

  update public.orders set estimate_total = coalesce((
    select sum(unit_price * qty) from public.order_lines where order_id = c.order_id and unit_price is not null), 0)
  where id = c.order_id;

  foreach v_po in array coalesce(v_pos_touched, '{}') loop
    perform public.rebuild_po_lines(v_po);
  end loop;
end $$;

-- admin: withdraw a proposal (order goes back to where it was) ------------------------
create or replace function public.admin_withdraw_changes(p_actor uuid, p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.order_changes;
begin
  perform public.assert_admin(p_actor);
  perform 1 from public.orders where id = p_order and status = 'awaiting_approval' for update;
  if not found then raise exception 'This order has no open proposal' using errcode = 'P0001', hint = 'bad_transition'; end if;
  select * into c from public.order_changes where order_id = p_order and status = 'proposed';

  update public.order_changes set status = 'withdrawn', decided_at = now() where id = c.id;
  update public.orders set status = c.resume_status, updated_at = now() where id = p_order and status = 'awaiting_approval';
  perform public.log_order_event(p_order, c.resume_status, p_actor, 'Proposed changes withdrawn',
    '{"status": "awaiting_approval"}', jsonb_build_object('status', c.resume_status, 'proposal', c.id), 'changes_withdrawn');
end $$;

-- customer: approve or reject proposed changes ------------------------------------------
create or replace function public.respond_to_changes(p_order uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  c public.order_changes;
begin
  if v_user is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  perform 1 from public.orders where id = p_order and user_id = v_user and status = 'awaiting_approval' for update;
  if not found then
    raise exception 'These changes are no longer waiting for your answer.' using errcode = 'P0001', hint = 'not_awaiting';
  end if;
  select * into c from public.order_changes where order_id = p_order and status = 'proposed';

  if p_approve then
    perform public.apply_order_changes(c.id);
    update public.order_changes set status = 'approved', decided_at = now() where id = c.id;
    update public.orders set status = c.resume_status, updated_at = now() where id = p_order;
    perform public.log_order_event(p_order, c.resume_status, v_user, 'Changes approved by customer',
      '{"status": "awaiting_approval"}', jsonb_build_object('status', c.resume_status, 'proposal', c.id), 'changes_approved');
  else
    update public.order_changes set status = 'rejected', decided_at = now() where id = c.id;
    update public.orders set status = 'cancelled', updated_at = now() where id = p_order;
    perform public.release_from_draft_pos(p_order);
    perform public.log_order_event(p_order, 'cancelled', v_user, 'Changes rejected by customer',
      '{"status": "awaiting_approval"}', jsonb_build_object('status', 'cancelled', 'proposal', c.id), 'changes_rejected');
  end if;
end $$;

-- admin: purchase orders ------------------------------------------------------------------
-- Put every line of confirmed (and, for replacements, ordered) orders that isn't on a PO yet
-- onto that supplier's draft PO. Returns the draft POs touched.
create or replace function public.admin_build_purchase_orders(p_actor uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_supplier uuid;
  v_po uuid;
  v_touched jsonb := '[]';
begin
  perform public.assert_admin(p_actor);
  for v_supplier in
    select distinct p.supplier_id
    from public.order_lines l
    join public.orders o on o.id = l.order_id
    join public.products p on p.id = l.product_id
    where l.po_id is null and o.status in ('confirmed', 'ordered_from_supplier')
  loop
    select id into v_po from public.purchase_orders where supplier_id = v_supplier and status = 'draft' for update;
    if not found then
      insert into public.purchase_orders (supplier_id, created_by) values (v_supplier, p_actor) returning id into v_po;
    end if;

    update public.order_lines l set po_id = v_po
    from public.orders o, public.products p
    where o.id = l.order_id and p.id = l.product_id
      and l.po_id is null and o.status in ('confirmed', 'ordered_from_supplier') and p.supplier_id = v_supplier;

    perform public.rebuild_po_lines(v_po);
    insert into public.audit_log (actor_id, entity, entity_id, action, after)
    values (p_actor, 'purchase_order', v_po::text, 'built',
            (select jsonb_build_object('number', number, 'lines', (select count(*) from public.po_lines where po_id = v_po))
             from public.purchase_orders where id = v_po));
    v_touched := v_touched || to_jsonb(v_po);
  end loop;
  return v_touched;
end $$;

-- draft → sent, sent → received, or draft → deleted (releases its lines)
create or replace function public.admin_set_po_status(p_actor uuid, p_po uuid, p_to text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_from text;
  v_number text;
  moved int := 0;
begin
  perform public.assert_admin(p_actor);
  select status, number into v_from, v_number from public.purchase_orders where id = p_po for update;
  if not found then raise exception 'Purchase order not found' using errcode = '22023'; end if;

  if p_to = 'sent' and v_from = 'draft' then
    if not exists (select 1 from public.po_lines where po_id = p_po) then
      raise exception 'This purchase order has no lines' using errcode = '22023';
    end if;
    update public.purchase_orders set status = 'sent', sent_at = now() where id = p_po;
    moved := public.advance_orders(p_po, p_actor);
  elsif p_to = 'received' and v_from = 'sent' then
    update public.purchase_orders set status = 'received', received_at = now() where id = p_po;
    moved := public.advance_orders(p_po, p_actor);
  elsif p_to = 'deleted' and v_from = 'draft' then
    update public.order_lines set po_id = null where po_id = p_po;
    delete from public.purchase_orders where id = p_po;
  else
    raise exception 'Can''t change a % purchase order to %', v_from, p_to using errcode = 'P0001', hint = 'bad_transition';
  end if;

  insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
  values (p_actor, 'purchase_order', p_po::text, 'status',
          jsonb_build_object('status', v_from, 'number', v_number),
          jsonb_build_object('status', p_to, 'number', v_number, 'orders_moved', moved));
  return moved;
end $$;

-- execute rights -----------------------------------------------------------------------------
revoke execute on function public.log_order_event(uuid, text, uuid, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function public.rebuild_po_lines(uuid) from public, anon, authenticated;
revoke execute on function public.release_from_draft_pos(uuid) from public, anon, authenticated;
revoke execute on function public.advance_orders(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.apply_order_changes(uuid) from public, anon, authenticated;
revoke execute on function public.admin_set_order_status(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.admin_propose_changes(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke execute on function public.admin_withdraw_changes(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.admin_build_purchase_orders(uuid) from public, anon, authenticated;
revoke execute on function public.admin_set_po_status(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.respond_to_changes(uuid, boolean) from public, anon;

grant execute on function public.admin_set_order_status(uuid, uuid, text, text) to service_role;
grant execute on function public.admin_propose_changes(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.admin_withdraw_changes(uuid, uuid) to service_role;
grant execute on function public.admin_build_purchase_orders(uuid) to service_role;
grant execute on function public.admin_set_po_status(uuid, uuid, text) to service_role;
grant execute on function public.respond_to_changes(uuid, boolean) to authenticated;
