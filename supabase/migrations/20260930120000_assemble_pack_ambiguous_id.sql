-- RETURNS TABLE exposes branch_product_id as an output variable, so
-- unqualified "where branch_product_id = …" is ambiguous vs the table column.

create or replace function public.assemble_clearance_pack(
  p_branch_id uuid,
  p_title text,
  p_price numeric,
  p_bag_count numeric,
  p_items jsonb
)
returns table (
  pack_id uuid,
  branch_product_id uuid,
  product_id uuid,
  quantity_made numeric,
  quantity_remaining numeric,
  price numeric,
  title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch public.branches%rowtype;
  v_title text;
  v_bags numeric(10, 3);
  v_item jsonb;
  v_bp public.branch_products%rowtype;
  v_product public.products%rowtype;
  v_qty numeric(10, 3);
  v_pieces numeric(10, 3);
  v_weigh boolean;
  v_total_cost numeric(12, 4) := 0;
  v_bag_cost numeric(10, 2);
  v_pack_product_id uuid;
  v_pack_bp_id uuid;
  v_pack_id uuid;
  v_existing public.clearance_packs%rowtype;
  v_stock_before numeric(10, 3);
  v_notes text;
  v_item_notes text;
begin
  select * into v_branch
  from public.branches
  where id = p_branch_id
  for share;

  if not found then
    raise exception 'Sucursal no encontrada';
  end if;

  v_title := nullif(trim(coalesce(p_title, '')), '');
  if v_title is null then
    v_title := 'Paquete de último momento';
  end if;

  if p_price is null or p_price <= 0 then
    raise exception 'Indica el precio de la bolsa';
  end if;

  v_bags := round(p_bag_count, 0);
  if v_bags < 1 or abs(v_bags - p_bag_count) > 0.001 then
    raise exception 'Indica cuántas bolsas armas';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un producto al paquete';
  end if;

  select bp.id, p.id
  into v_pack_bp_id, v_pack_product_id
  from public.branch_products bp
  join public.products p on p.id = bp.product_id
  where bp.branch_id = p_branch_id
    and p.pos_only = true
    and p.unit = 'bag'
  order by bp.created_at
  limit 1;

  if v_pack_product_id is null then
    insert into public.products (
      organization_id,
      name,
      unit,
      sku,
      is_active,
      pos_only,
      weigh_at_fulfillment
    )
    values (
      v_branch.organization_id,
      v_title,
      'bag',
      'pv-clearance-pack',
      true,
      true,
      false
    )
    returning id into v_pack_product_id;

    insert into public.branch_products (
      branch_id,
      product_id,
      price,
      stock,
      min_stock,
      avg_unit_cost,
      is_available
    )
    values (
      p_branch_id,
      v_pack_product_id,
      p_price,
      0,
      0,
      0,
      false
    )
    returning id into v_pack_bp_id;
  else
    update public.products
    set name = v_title
    where id = v_pack_product_id;
  end if;

  select * into v_existing
  from public.clearance_packs cp
  where cp.branch_product_id = v_pack_bp_id
    and cp.status = 'active'
  order by assembled_at desc
  limit 1
  for update;

  if found then
    update public.clearance_packs
    set
      title = v_title,
      price = p_price,
      quantity_made = quantity_made + v_bags,
      updated_at = now(),
      assembled_by = coalesce(auth.uid(), assembled_by)
    where id = v_existing.id
    returning id into v_pack_id;
  else
    insert into public.clearance_packs (
      branch_id,
      branch_product_id,
      title,
      price,
      quantity_made,
      quantity_remaining,
      status,
      assembled_by
    )
    values (
      p_branch_id,
      v_pack_bp_id,
      v_title,
      p_price,
      v_bags,
      v_bags,
      'active',
      auth.uid()
    )
    returning id into v_pack_id;
  end if;

  v_notes := 'Paquete ' || v_pack_id::text;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := round(coalesce((v_item->>'quantity')::numeric, 0), 3);
    if v_qty <= 0 then
      raise exception 'Cada producto necesita cantidad mayor a cero';
    end if;

    select bp.* into v_bp
    from public.branch_products bp
    where bp.id = (v_item->>'branch_product_id')::uuid
      and bp.branch_id = p_branch_id
    for update;

    if not found then
      raise exception 'Producto no encontrado en esta sucursal';
    end if;

    if v_bp.id = v_pack_bp_id then
      raise exception 'No puedes meter el paquete dentro de sí mismo';
    end if;

    select p.* into v_product from public.products p where p.id = v_bp.product_id;

    if coalesce(v_product.pos_only, false) then
      raise exception 'Ese producto ya es un paquete de mostrador';
    end if;

    v_pieces := null;
    if v_item ? 'pieces'
      and nullif(trim(coalesce(v_item->>'pieces', '')), '') is not null then
      v_pieces := round((v_item->>'pieces')::numeric, 3);
    end if;

    v_weigh := coalesce(v_product.weigh_at_fulfillment, false)
      and v_product.unit = 'kg';

    if v_weigh then
      if v_pieces is null or v_pieces <= 0 then
        raise exception 'Indica las piezas de %', v_product.name;
      end if;
      if coalesce(v_bp.piece_stock, 0) > 0 and v_bp.piece_stock < v_pieces then
        raise exception 'Solo quedan % pieza(s) de %',
          trim(to_char(coalesce(v_bp.piece_stock, 0), 'FM999999990.###')),
          v_product.name;
      end if;
    end if;

    if v_bp.stock < v_qty then
      raise exception 'Stock insuficiente para %', v_product.name;
    end if;

    v_total_cost := v_total_cost + (v_qty * coalesce(v_bp.avg_unit_cost, 0));

    update public.branch_products
    set
      stock = stock - v_qty,
      piece_stock = case
        when v_weigh then greatest(0, coalesce(piece_stock, 0) - coalesce(v_pieces, 0))
        when stock - v_qty <= 0 then 0
        else piece_stock
      end
    where id = v_bp.id;

    v_item_notes := v_notes;
    if v_weigh then
      v_item_notes := v_notes
        || ' · '
        || trim(to_char(v_pieces, 'FM999999990.###'))
        || ' pieza(s)';
    end if;

    insert into public.inventory_movements (
      branch_id,
      branch_product_id,
      movement_type,
      quantity,
      notes,
      unit_cost
    )
    values (
      p_branch_id,
      v_bp.id,
      'pack',
      v_qty,
      v_item_notes,
      v_bp.avg_unit_cost
    );

    insert into public.clearance_pack_items (
      pack_id,
      branch_product_id,
      product_name,
      unit,
      quantity,
      pieces,
      unit_cost
    )
    values (
      v_pack_id,
      v_bp.id,
      v_product.name,
      v_product.unit,
      v_qty,
      v_pieces,
      v_bp.avg_unit_cost
    );
  end loop;

  v_bag_cost := round(v_total_cost / v_bags, 2);

  select stock into v_stock_before
  from public.branch_products
  where id = v_pack_bp_id
  for update;

  perform public.apply_purchase_unit_cost(v_pack_bp_id, v_bags, v_bag_cost, v_stock_before);

  update public.branch_products
  set
    stock = stock + v_bags,
    price = p_price
  where id = v_pack_bp_id;

  insert into public.inventory_movements (
    branch_id,
    branch_product_id,
    movement_type,
    quantity,
    notes,
    unit_cost
  )
  values (
    p_branch_id,
    v_pack_bp_id,
    'pack',
    v_bags,
    v_notes,
    v_bag_cost
  );

  return query
  select
    v_pack_id,
    v_pack_bp_id,
    v_pack_product_id,
    v_bags,
    (select stock from public.branch_products where id = v_pack_bp_id),
    p_price,
    v_title;
end;
$$;
