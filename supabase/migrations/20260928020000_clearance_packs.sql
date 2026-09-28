-- Last-minute mixed produce bags: convert ingredient stock into POS-only bags.

alter table public.products
  add column if not exists pos_only boolean not null default false;

create table public.clearance_packs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  branch_product_id uuid not null references public.branch_products (id) on delete restrict,
  promotion_id uuid references public.promotions (id) on delete set null,
  title text not null,
  price numeric(10, 2) not null check (price > 0),
  quantity_made numeric(10, 3) not null check (quantity_made > 0),
  quantity_remaining numeric(10, 3) not null check (quantity_remaining >= 0),
  status text not null default 'active' check (status in ('active', 'sold_out', 'wasted')),
  assembled_at timestamptz not null default now(),
  assembled_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clearance_pack_items (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.clearance_packs (id) on delete cascade,
  branch_product_id uuid not null references public.branch_products (id) on delete restrict,
  product_name text not null,
  unit public.product_unit not null,
  quantity numeric(10, 3) not null check (quantity > 0),
  unit_cost numeric(10, 2),
  created_at timestamptz not null default now()
);

create index clearance_packs_branch_status_idx
  on public.clearance_packs (branch_id, status, assembled_at desc);

create index clearance_pack_items_pack_idx
  on public.clearance_pack_items (pack_id);

alter table public.clearance_packs enable row level security;
alter table public.clearance_pack_items enable row level security;

create policy "staff manage clearance packs" on public.clearance_packs
  for all to authenticated
  using (public.is_staff_of_branch(branch_id))
  with check (public.is_staff_of_branch(branch_id));

create policy "staff manage clearance pack items" on public.clearance_pack_items
  for all to authenticated
  using (
    exists (
      select 1 from public.clearance_packs p
      where p.id = pack_id and public.is_staff_of_branch(p.branch_id)
    )
  )
  with check (
    exists (
      select 1 from public.clearance_packs p
      where p.id = pack_id and public.is_staff_of_branch(p.branch_id)
    )
  );

create or replace function public.sync_clearance_pack_from_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack public.clearance_packs%rowtype;
begin
  select * into v_pack
  from public.clearance_packs
  where branch_product_id = new.id
    and status in ('active', 'sold_out')
  order by assembled_at desc
  limit 1;

  if not found then
    return new;
  end if;

  update public.clearance_packs
  set
    quantity_remaining = greatest(0, new.stock),
    status = case
      when new.stock <= 0 then 'sold_out'
      else 'active'
    end,
    updated_at = now()
  where id = v_pack.id;

  if new.stock <= 0 and v_pack.promotion_id is not null then
    update public.promotions
    set is_active = false
    where id = v_pack.promotion_id;
  elsif new.stock > 0 and v_pack.promotion_id is not null then
    update public.promotions
    set is_active = true
    where id = v_pack.promotion_id;
  end if;

  return new;
end;
$$;

drop trigger if exists clearance_pack_stock_sync on public.branch_products;
create trigger clearance_pack_stock_sync
after update of stock on public.branch_products
for each row
when (old.stock is distinct from new.stock)
execute function public.sync_clearance_pack_from_stock();

-- Snapshot merma cost so leftover bags (and regular waste) count in Números.
create or replace function public.record_inventory_movement(
  p_branch_product_id uuid,
  p_movement_type public.inventory_movement_type,
  p_quantity numeric,
  p_notes text default null,
  p_expires_at timestamptz default null,
  p_unit_cost numeric default null
)
returns table (
  new_stock numeric,
  new_avg_unit_cost numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bp public.branch_products%rowtype;
  v_product public.products%rowtype;
  v_delta numeric(10, 3);
  v_expires_at timestamptz;
  v_stock_before numeric(10, 3);
begin
  if p_movement_type = 'sale' then
    raise exception 'Las ventas se registran automáticamente con pedidos';
  end if;

  if p_movement_type = 'pack' then
    raise exception 'Los paquetes se arman desde Caja, no como un movimiento suelto';
  end if;

  select * into v_bp
  from public.branch_products
  where id = p_branch_product_id
  for update;

  if not found then
    raise exception 'Producto de sucursal no encontrado';
  end if;

  v_stock_before := v_bp.stock;
  select * into v_product from public.products where id = v_bp.product_id;

  case p_movement_type
    when 'purchase' then
      if p_quantity <= 0 then
        raise exception 'La cantidad debe ser positiva';
      end if;
      if p_unit_cost is null or p_unit_cost < 0 then
        raise exception 'El costo unitario de compra es obligatorio';
      end if;
      v_delta := p_quantity;
      v_expires_at := coalesce(
        p_expires_at,
        case
          when v_product.shelf_life_days is not null
          then now() + (v_product.shelf_life_days || ' days')::interval
          else null
        end
      );
      perform public.apply_purchase_unit_cost(p_branch_product_id, p_quantity, p_unit_cost, v_stock_before);
    when 'waste' then
      if p_quantity <= 0 then
        raise exception 'La cantidad debe ser positiva';
      end if;
      v_delta := -p_quantity;
      v_expires_at := null;
    when 'adjustment' then
      if p_quantity = 0 then
        raise exception 'El ajuste no puede ser cero';
      end if;
      v_delta := p_quantity;
      v_expires_at := null;
    else
      raise exception 'Tipo de movimiento inválido';
  end case;

  if v_bp.stock + v_delta < 0 then
    if p_movement_type in ('waste', 'adjustment') and v_delta < 0 then
      v_delta := -v_bp.stock;
    else
      raise exception 'Stock insuficiente';
    end if;
  end if;

  if v_delta = 0 then
    raise exception 'Ya no hay stock que dar de baja';
  end if;

  update public.branch_products
  set
    stock = stock + v_delta,
    piece_stock = case when stock + v_delta <= 0 then 0 else piece_stock end
  where id = p_branch_product_id;

  insert into public.inventory_movements (
    branch_id,
    branch_product_id,
    movement_type,
    quantity,
    notes,
    expires_at,
    unit_cost
  )
  values (
    v_bp.branch_id,
    p_branch_product_id,
    p_movement_type,
    abs(v_delta),
    nullif(trim(coalesce(p_notes, '')), ''),
    v_expires_at,
    case
      when p_movement_type = 'purchase' then p_unit_cost
      when p_movement_type = 'waste' then coalesce(p_unit_cost, v_bp.avg_unit_cost)
      else null
    end
  );

  return query
  select bp.stock, bp.avg_unit_cost
  from public.branch_products bp
  where bp.id = p_branch_product_id;
end;
$$;

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
  v_total_cost numeric(12, 4) := 0;
  v_bag_cost numeric(10, 2);
  v_pack_product_id uuid;
  v_pack_bp_id uuid;
  v_pack_id uuid;
  v_existing public.clearance_packs%rowtype;
  v_stock_before numeric(10, 3);
  v_notes text;
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
  if v_bags < 1 or v_bags <> p_bag_count then
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
      'Paquete de último momento',
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
  end if;

  select * into v_existing
  from public.clearance_packs
  where branch_product_id = v_pack_bp_id
    and status = 'active'
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

    if v_bp.stock < v_qty then
      raise exception 'Stock insuficiente para %', v_product.name;
    end if;

    v_total_cost := v_total_cost + (v_qty * coalesce(v_bp.avg_unit_cost, 0));

    update public.branch_products
    set
      stock = stock - v_qty,
      piece_stock = case when stock - v_qty <= 0 then 0 else piece_stock end
    where id = v_bp.id;

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
      v_notes,
      v_bp.avg_unit_cost
    );

    insert into public.clearance_pack_items (
      pack_id,
      branch_product_id,
      product_name,
      unit,
      quantity,
      unit_cost
    )
    values (
      v_pack_id,
      v_bp.id,
      v_product.name,
      v_product.unit,
      v_qty,
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
  v_tracking text;
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
  v_missing_name text;
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
  returning public.customers.id into v_customer_id;

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
  returning public.orders.id, public.orders.order_number, public.orders.tracking_token
  into v_order_id, v_order_number, v_tracking;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select bp.* into v_bp
    from public.branch_products bp
    where bp.id = (v_item->>'branch_product_id')::uuid
      and bp.branch_id = v_branch.id
      and bp.is_available = true
    for update;

    if not found then
      select p.name into v_missing_name
      from public.branch_products bp
      join public.products p on p.id = bp.product_id
      where bp.id = (v_item->>'branch_product_id')::uuid;

      if coalesce(v_missing_name, '') <> '' then
        raise exception 'Producto no disponible: %', v_missing_name;
      else
        raise exception 'Producto no disponible';
      end if;
    end if;

    select p.* into v_product from public.products p where p.id = v_bp.product_id;

    if coalesce(v_product.pos_only, false)
      and position('[mostrador]' in coalesce(p_delivery_notes, '')) = 0 then
      raise exception 'El paquete de último momento se vende en mostrador';
    end if;

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

    if coalesce(v_product.pos_only, false) then
      v_unit_price := v_bp.price;
    else
      v_unit_price := round(v_bp.price * (1 - v_discount_pct / 100), 2);
    end if;
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
    returning public.order_items.id into v_order_item_id;

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
  where public.orders.id = v_order_id;

  order_id := v_order_id;
  order_number := v_order_number;
  tracking_token := v_tracking;
  total := v_subtotal + v_delivery_fee;
  return next;
end;
$$;

drop function if exists public.get_restock_forecast(uuid, int);

create or replace function public.get_restock_forecast(
  p_branch_id uuid,
  p_horizon_days int default 7
)
returns table (
  branch_product_id uuid,
  product_name text,
  unit public.product_unit,
  current_stock numeric,
  min_stock numeric,
  avg_daily_sales numeric,
  forecast_demand numeric,
  suggested_reorder numeric,
  days_until_stockout numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with sales as (
    select
      oi.branch_product_id,
      sum(oi.quantity) filter (
        where o.created_at >= now() - interval '14 days'
      ) / 14.0 as avg_daily
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.branch_id = p_branch_id
      and o.status <> 'cancelled'
    group by oi.branch_product_id
  )
  select
    bp.id,
    p.name,
    p.unit,
    bp.stock,
    bp.min_stock,
    coalesce(s.avg_daily, 0),
    coalesce(s.avg_daily, 0) * greatest(p_horizon_days, 1),
    greatest(
      coalesce(s.avg_daily, 0) * greatest(p_horizon_days, 1) - bp.stock,
      bp.min_stock - bp.stock,
      0
    ),
    case
      when bp.stock < bp.min_stock then 0
      when coalesce(s.avg_daily, 0) <= 0 then null
      else round(bp.stock / s.avg_daily, 1)
    end
  from public.branch_products bp
  join public.products p on p.id = bp.product_id
  left join sales s on s.branch_product_id = bp.id
  where bp.branch_id = p_branch_id
    and bp.is_available = true
    and p.is_active = true
    and coalesce(p.pos_only, false) = false
  order by
    greatest(
      coalesce(s.avg_daily, 0) * greatest(p_horizon_days, 1) - bp.stock,
      bp.min_stock - bp.stock,
      0
    ) desc,
    p.name;
$$;

grant execute on function public.assemble_clearance_pack(uuid, text, numeric, numeric, jsonb)
  to authenticated, service_role;
grant execute on function public.get_restock_forecast(uuid, int) to authenticated, service_role;
grant execute on function public.record_inventory_movement(uuid, public.inventory_movement_type, numeric, text, timestamptz, numeric)
  to anon, authenticated, service_role;
