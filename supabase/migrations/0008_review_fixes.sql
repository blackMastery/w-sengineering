-- 0008_review_fixes.sql — fixes from the code review
--
-- 1. An order that resumes after a change proposal (customer approves, or admin withdraws)
--    could land back in "confirmed" although every line was already on a sent (or received)
--    purchase order — sending a PO skips orders awaiting approval — and nothing would move it
--    forward again. Resuming now re-runs the same forward checks the POs use.
-- 2. Deleting a product removed its uploaded photos even when a duplicated product still
--    used the same files. Files still referenced by another product are now kept.

-- Move one order forward if its POs allow it (confirmed → ordered → received). Same rules as
-- advance_orders(p_po), applied to a single order; returns the resulting status.
create or replace function public.advance_order(p_order uuid, p_actor uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
begin
  select status into v_status from public.orders where id = p_order;

  if v_status = 'confirmed'
     and exists (select 1 from public.order_lines where order_id = p_order)
     and not exists (
       select 1 from public.order_lines l left join public.purchase_orders po on po.id = l.po_id
       where l.order_id = p_order and (po.id is null or po.status = 'draft')) then
    update public.orders set status = 'ordered_from_supplier', updated_at = now() where id = p_order and status = 'confirmed';
    perform public.log_order_event(p_order, 'ordered_from_supplier', p_actor, null,
      '{"status": "confirmed"}', '{"status": "ordered_from_supplier"}');
    v_status := 'ordered_from_supplier';
  end if;

  if v_status = 'ordered_from_supplier'
     and exists (select 1 from public.order_lines where order_id = p_order)
     and not exists (
       select 1 from public.order_lines l left join public.purchase_orders po on po.id = l.po_id
       where l.order_id = p_order and (po.id is null or po.status <> 'received')) then
    update public.orders set status = 'received', updated_at = now() where id = p_order and status = 'ordered_from_supplier';
    perform public.log_order_event(p_order, 'received', p_actor, null,
      '{"status": "ordered_from_supplier"}', '{"status": "received"}');
    v_status := 'received';
  end if;

  return v_status;
end $$;
revoke execute on function public.advance_order(uuid, uuid) from public, anon, authenticated;

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
  -- POs may have been sent or received while the proposal was open
  perform public.advance_order(p_order, p_actor);
end $$;

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
    -- POs may have been sent or received while the customer was deciding
    perform public.advance_order(p_order, v_user);
  else
    update public.order_changes set status = 'rejected', decided_at = now() where id = c.id;
    update public.orders set status = 'cancelled', updated_at = now() where id = p_order;
    perform public.release_from_draft_pos(p_order);
    perform public.log_order_event(p_order, 'cancelled', v_user, 'Changes rejected by customer',
      '{"status": "awaiting_approval"}', jsonb_build_object('status', 'cancelled', 'proposal', c.id), 'changes_rejected');
  end if;
end $$;

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

  -- this product's uploads, except files a duplicated product still shows
  select coalesce(array_agg(i.storage_path), '{}') into uploads
  from public.product_images i
  where i.product_id = p_id
    and i.storage_path like 'uploads/' || p_id::text || '/%'
    and not exists (select 1 from public.product_images o where o.storage_path = i.storage_path and o.product_id <> p_id);

  delete from public.slug_redirects where kind = 'product' and target_id = p_id;
  delete from public.products where id = p_id;
  insert into public.audit_log (actor_id, entity, entity_id, action, before)
  values (p_actor, 'product', p_id::text, 'deleted', jsonb_build_object('name', p.name, 'slug', p.slug, 'status', p.status));
  return jsonb_build_object('deleted', true, 'archived', false, 'uploads', to_jsonb(uploads));
end $$;

-- create or replace keeps existing grants; restate them so this file stands on its own
revoke execute on function public.admin_withdraw_changes(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_withdraw_changes(uuid, uuid) to service_role;
revoke execute on function public.respond_to_changes(uuid, boolean) from public, anon;
grant execute on function public.respond_to_changes(uuid, boolean) to authenticated;
revoke execute on function public.admin_delete_product(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_product(uuid, uuid) to service_role;
