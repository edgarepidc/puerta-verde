-- Merge one branch_product into another (for duplicate catalog cleanup),
-- then delete the source branch_product (and its product if unused).

create or replace function public.merge_branch_products(
  p_from_branch_product_id uuid,
  p_into_branch_product_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from public.branch_products%rowtype;
  v_into public.branch_products%rowtype;
  v_from_product_id uuid;
  v_remaining int;
begin
  if p_from_branch_product_id is null or p_into_branch_product_id is null then
    raise exception 'Faltan productos a unir';
  end if;

  if p_from_branch_product_id = p_into_branch_product_id then
    raise exception 'No se puede unir un producto consigo mismo';
  end if;

  select * into v_from
  from public.branch_products
  where id = p_from_branch_product_id
  for update;

  if not found then
    raise exception 'Producto origen no encontrado';
  end if;

  select * into v_into
  from public.branch_products
  where id = p_into_branch_product_id
  for update;

  if not found then
    raise exception 'Producto destino no encontrado';
  end if;

  if v_from.branch_id <> v_into.branch_id then
    raise exception 'Solo se pueden unir productos de la misma sucursal';
  end if;

  v_from_product_id := v_from.product_id;

  update public.purchase_items
  set branch_product_id = p_into_branch_product_id
  where branch_product_id = p_from_branch_product_id;

  update public.order_items
  set branch_product_id = p_into_branch_product_id
  where branch_product_id = p_from_branch_product_id;

  update public.inventory_movements
  set branch_product_id = p_into_branch_product_id
  where branch_product_id = p_from_branch_product_id;

  update public.product_lots
  set branch_product_id = p_into_branch_product_id
  where branch_product_id = p_from_branch_product_id;

  update public.branch_products
  set
    stock = coalesce(stock, 0) + coalesce(v_from.stock, 0),
    piece_stock = coalesce(piece_stock, 0) + coalesce(v_from.piece_stock, 0),
    avg_unit_cost = case
      when coalesce(stock, 0) + coalesce(v_from.stock, 0) <= 0 then avg_unit_cost
      else round(
        (
          coalesce(avg_unit_cost, 0) * coalesce(stock, 0)
          + coalesce(v_from.avg_unit_cost, 0) * coalesce(v_from.stock, 0)
        ) / nullif(coalesce(stock, 0) + coalesce(v_from.stock, 0), 0),
        4
      )
    end,
    last_unit_cost = coalesce(v_from.last_unit_cost, last_unit_cost),
    updated_at = now()
  where id = p_into_branch_product_id;

  delete from public.branch_products
  where id = p_from_branch_product_id;

  select count(*)::int into v_remaining
  from public.branch_products
  where product_id = v_from_product_id;

  if v_remaining = 0 then
    -- Detach promotions / other soft refs if present
    begin
      update public.promotions
      set product_id = null
      where product_id = v_from_product_id;
    exception
      when undefined_table then null;
      when undefined_column then null;
    end;

    delete from public.products
    where id = v_from_product_id;
  end if;
end;
$$;

grant execute on function public.merge_branch_products(uuid, uuid) to service_role;
grant execute on function public.merge_branch_products(uuid, uuid) to authenticated;
