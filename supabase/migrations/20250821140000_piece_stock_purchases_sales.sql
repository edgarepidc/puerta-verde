-- Piece inventory for weigh-at-fulfillment products.
-- Purchases can record piece_count + kg; sales by piece decrement both stock (kg) and piece_stock.

alter table public.branch_products
  add column if not exists piece_stock numeric(10, 3) not null default 0
    check (piece_stock >= 0);

alter table public.purchase_items
  add column if not exists piece_count numeric(10, 3)
    check (piece_count is null or piece_count > 0);

comment on column public.branch_products.piece_stock is
  'Pieces remaining for weigh_at_fulfillment products (kg stock remains primary).';

comment on column public.purchase_items.piece_count is
  'Pieces received in this purchase line (quantity is kg).';

create or replace function public.record_supplier_purchase(
  p_branch_id uuid,
  p_supplier_id uuid,
  p_purchased_at date,
  p_notes text,
  p_items jsonb
)
returns table (
  purchase_id uuid,
  total_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_supplier_org uuid;
  v_purchase_id uuid;
  v_total numeric(12, 2) := 0;
  v_item jsonb;
  v_bp_id uuid;
  v_qty numeric(10, 3);
  v_price numeric(10, 2);
  v_quality text;
  v_pieces numeric(10, 3);
  v_weigh boolean;
  v_supplier_name text;
  v_notes text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un producto a la compra';
  end if;

  select organization_id into v_org_id
  from public.branches
  where id = p_branch_id;

  if v_org_id is null then
    raise exception 'Sucursal no encontrada';
  end if;

  select s.organization_id, s.name
  into v_supplier_org, v_supplier_name
  from public.suppliers s
  where s.id = p_supplier_id
    and s.is_active = true;

  if v_supplier_org is null then
    raise exception 'Proveedor no encontrado o inactivo';
  end if;

  if v_supplier_org <> v_org_id then
    raise exception 'El proveedor no pertenece a esta organización';
  end if;

  insert into public.purchases (branch_id, supplier_id, purchased_at, notes, total_amount)
  values (
    p_branch_id,
    p_supplier_id,
    coalesce(p_purchased_at, (timezone('America/Mexico_City', now()))::date),
    nullif(trim(coalesce(p_notes, '')), ''),
    0
  )
  returning id into v_purchase_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_bp_id := (v_item->>'branch_product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;
    v_quality := lower(trim(coalesce(v_item->>'quality', 'normal')));
    v_pieces := null;

    if v_quality not in ('premium', 'normal', 'saldo') then
      v_quality := 'normal';
    end if;

    if v_bp_id is null or v_qty is null or v_qty <= 0 or v_price is null or v_price < 0 then
      raise exception 'Cada partida necesita producto, cantidad > 0 y precio >= 0';
    end if;

    if not exists (
      select 1
      from public.branch_products bp
      where bp.id = v_bp_id
        and bp.branch_id = p_branch_id
    ) then
      raise exception 'Producto no encontrado en esta sucursal';
    end if;

    select coalesce(p.weigh_at_fulfillment, false)
    into v_weigh
    from public.branch_products bp
    join public.products p on p.id = bp.product_id
    where bp.id = v_bp_id;

    if v_item ? 'piece_count'
      and nullif(trim(coalesce(v_item->>'piece_count', '')), '') is not null then
      v_pieces := (v_item->>'piece_count')::numeric;
      if v_pieces is null or v_pieces <= 0 then
        raise exception 'Las piezas deben ser mayores a cero';
      end if;
    end if;

    if not v_weigh then
      v_pieces := null;
    end if;

    insert into public.purchase_items (
      purchase_id, branch_product_id, quantity, unit_price, quality, piece_count
    )
    values (v_purchase_id, v_bp_id, v_qty, v_price, v_quality, v_pieces);

    v_total := v_total + round(v_qty * v_price, 2);

    v_notes := format(
      'Compra a %s · %s%s%s',
      v_supplier_name,
      v_quality,
      case
        when v_pieces is null then ''
        else ' · ' || trim(to_char(v_pieces, 'FM999999990.###')) || ' pieza(s)'
      end,
      case
        when nullif(trim(coalesce(p_notes, '')), '') is null then ''
        else ' · ' || trim(p_notes)
      end
    );

    perform public.record_inventory_movement(
      v_bp_id,
      'purchase',
      v_qty,
      v_notes,
      null,
      v_price
    );

    if v_pieces is not null then
      update public.branch_products
      set piece_stock = piece_stock + v_pieces
      where id = v_bp_id;
    end if;
  end loop;

  update public.purchases
  set total_amount = v_total
  where id = v_purchase_id;

  return query select v_purchase_id, v_total;
end;
$$;

-- Update place_guest_order to decrement piece_stock when selling by piece.
create or replace function public.place_guest_order(
  p_branch_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_fulfillment_type public.fulfillment_type,
  p_unit_id uuid,
  p_delivery_notes text,
  p_items jsonb
)
returns table (
  order_id uuid,
  order_number bigint,
  tracking_token text,
  total numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch public.branches%rowtype;
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number bigint;
  v_subtotal numeric(10, 2) := 0;
  v_delivery_fee numeric(10, 2) := 0;
  v_item jsonb;
  v_bp public.branch_products%rowtype;
  v_product public.products%rowtype;
  v_qty numeric(10, 3);
  v_ordered numeric(10, 3);
  v_weigh boolean;
  v_line_total numeric(10, 2);
  v_unit_price numeric(10, 2);
  v_phone text;
  v_discount_pct numeric(5, 2);
  v_order_item_id uuid;
begin
  select b.* into v_branch
  from public.branches b
  join public.organizations o on o.id = b.organization_id
  where b.slug = p_branch_slug
    and b.is_active = true
    and o.subscription_status in ('trialing', 'active');

  if not found then
    raise exception 'Sucursal no encontrada o inactiva';
  end if;

  if p_fulfillment_type = 'delivery' and p_unit_id is null then
    raise exception 'Se requiere departamento para entrega';
  end if;

  v_discount_pct := public.get_branch_discount_percent(v_branch.id);

  v_phone := regexp_replace(p_customer_phone, '\D', '', 'g');
  if length(v_phone) = 10 then
    v_phone := '52' || v_phone;
  end if;

  insert into public.customers (organization_id, phone, full_name, default_unit_id)
  values (v_branch.organization_id, v_phone, p_customer_name, p_unit_id)
  on conflict (organization_id, phone) do update
    set full_name = excluded.full_name,
        default_unit_id = coalesce(excluded.default_unit_id, public.customers.default_unit_id),
        updated_at = now()
  returning id into v_customer_id;

  if p_fulfillment_type = 'delivery' then
    v_delivery_fee := v_branch.delivery_fee;
  end if;

  insert into public.orders (
    branch_id,
    organization_id,
    customer_id,
    customer_name,
    customer_phone,
    fulfillment_type,
    unit_id,
    delivery_notes,
    delivery_fee
  )
  values (
    v_branch.id,
    v_branch.organization_id,
    v_customer_id,
    trim(p_customer_name),
    v_phone,
    p_fulfillment_type,
    p_unit_id,
    nullif(trim(coalesce(p_delivery_notes, '')), ''),
    v_delivery_fee
  )
  returning public.orders.id, public.orders.order_number into v_order_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select bp.* into v_bp
    from public.branch_products bp
    where bp.id = (v_item->>'branch_product_id')::uuid
      and bp.branch_id = v_branch.id
      and bp.is_available = true
    for update;

    if not found then
      raise exception 'Producto no disponible';
    end if;

    select p.* into v_product from public.products p where p.id = v_bp.product_id;

    v_qty := (v_item->>'quantity')::numeric;
    if v_qty <= 0 then
      raise exception 'Cantidad inválida';
    end if;

    v_ordered := null;
    if v_item ? 'ordered_quantity'
      and nullif(trim(coalesce(v_item->>'ordered_quantity', '')), '') is not null then
      v_ordered := (v_item->>'ordered_quantity')::numeric;
      if v_ordered is null or v_ordered <= 0 then
        raise exception 'Piezas inválidas para %', v_product.name;
      end if;
    end if;

    v_weigh := coalesce(v_product.weigh_at_fulfillment, false)
      and v_ordered is not null;

    if v_weigh and v_product.unit <> 'kg' then
      raise exception 'El producto % no admite pedido por pieza', v_product.name;
    end if;

    if v_bp.stock < v_qty then
      raise exception 'Stock insuficiente para %', v_product.name;
    end if;

    if v_weigh
      and coalesce(v_bp.piece_stock, 0) > 0
      and v_bp.piece_stock < v_ordered then
      raise exception 'Solo quedan % pieza(s) de %',
        trim(to_char(coalesce(v_bp.piece_stock, 0), 'FM999999990.###')),
        v_product.name;
    end if;

    v_unit_price := round(v_bp.price * (1 - v_discount_pct / 100), 2);
    v_line_total := round(v_unit_price * v_qty, 2);
    v_subtotal := v_subtotal + v_line_total;

    insert into public.order_items (
      order_id,
      branch_product_id,
      product_name,
      unit,
      quantity,
      ordered_quantity,
      weigh_at_fulfillment,
      unit_price,
      line_total,
      unit_cost
    )
    values (
      v_order_id,
      v_bp.id,
      v_product.name,
      v_product.unit,
      v_qty,
      v_ordered,
      v_weigh,
      v_unit_price,
      v_line_total,
      v_bp.avg_unit_cost
    )
    returning id into v_order_item_id;

    perform public.allocate_lots_for_sale(v_order_item_id, v_bp.id, v_qty);

    update public.branch_products
    set stock = stock - v_qty,
        piece_stock = case
          when v_weigh then greatest(0, coalesce(piece_stock, 0) - v_ordered)
          else piece_stock
        end
    where id = v_bp.id;

    insert into public.inventory_movements (
      branch_id,
      branch_product_id,
      movement_type,
      quantity,
      order_id,
      notes,
      unit_cost
    )
    values (
      v_branch.id,
      v_bp.id,
      'sale',
      v_qty,
      v_order_id,
      case
        when v_weigh then
          'Venta pedido #' || v_order_number::text
            || ' · ' || trim(to_char(v_ordered, 'FM999999990.###')) || ' pieza(s)'
        else
          'Venta pedido #' || v_order_number::text
      end,
      v_bp.avg_unit_cost
    );
  end loop;

  if v_subtotal < v_branch.minimum_order_amount then
    raise exception 'El pedido no alcanza el mínimo de %', v_branch.minimum_order_amount;
  end if;

  update public.orders
  set subtotal = v_subtotal,
      total = v_subtotal + v_delivery_fee
  where id = v_order_id;

  return query
  select o.id, o.order_number, o.tracking_token, o.total
  from public.orders o
  where o.id = v_order_id;
end;
$$;
