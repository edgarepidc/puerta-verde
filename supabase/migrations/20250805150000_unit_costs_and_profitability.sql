-- Unit costs, weighted average cost, margins, and operating cost profitability

create type public.operating_cost_type as enum ('fixed', 'variable');
create type public.operating_cost_period as enum ('monthly', 'daily', 'per_order');

alter table public.branch_products
  add column if not exists avg_unit_cost numeric(10, 2) not null default 0 check (avg_unit_cost >= 0),
  add column if not exists last_unit_cost numeric(10, 2) check (last_unit_cost is null or last_unit_cost >= 0);

alter table public.inventory_movements
  add column if not exists unit_cost numeric(10, 2) check (unit_cost is null or unit_cost >= 0);

alter table public.order_items
  add column if not exists unit_cost numeric(10, 2) check (unit_cost is null or unit_cost >= 0);

create table public.branch_operating_costs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  name text not null,
  cost_type public.operating_cost_type not null,
  period public.operating_cost_period not null default 'monthly',
  amount numeric(10, 2) not null check (amount >= 0),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index branch_operating_costs_branch_idx on public.branch_operating_costs (branch_id);

alter table public.branch_operating_costs enable row level security;

create policy "staff read operating costs" on public.branch_operating_costs
  for select to authenticated
  using (public.is_staff_of_branch(branch_id));

create policy "staff manage operating costs" on public.branch_operating_costs
  for all to authenticated
  using (public.is_staff_of_branch(branch_id))
  with check (public.is_staff_of_branch(branch_id));

create or replace function public.apply_purchase_unit_cost(
  p_branch_product_id uuid,
  p_quantity numeric,
  p_unit_cost numeric,
  p_stock_before numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_stock numeric(10, 3);
  v_new_avg numeric(10, 2);
begin
  if p_unit_cost is null or p_unit_cost < 0 then
    return;
  end if;

  v_new_stock := p_stock_before + p_quantity;
  if v_new_stock <= 0 then
    v_new_avg := p_unit_cost;
  else
    select round(
      (
        coalesce(bp.avg_unit_cost, 0) * p_stock_before
        + p_unit_cost * p_quantity
      ) / v_new_stock,
      2
    )
    into v_new_avg
    from public.branch_products bp
    where bp.id = p_branch_product_id;
  end if;

  update public.branch_products
  set avg_unit_cost = coalesce(v_new_avg, p_unit_cost),
      last_unit_cost = p_unit_cost
  where id = p_branch_product_id;
end;
$$;

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
    raise exception 'Stock insuficiente';
  end if;

  update public.branch_products
  set stock = stock + v_delta
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
    abs(p_quantity),
    nullif(trim(coalesce(p_notes, '')), ''),
    v_expires_at,
    case when p_movement_type = 'purchase' then p_unit_cost else null end
  );

  return query
  select bp.stock, bp.avg_unit_cost
  from public.branch_products bp
  where bp.id = p_branch_product_id;
end;
$$;

create or replace function public.receive_product_lot(
  p_branch_product_id uuid,
  p_lot_code text,
  p_quantity numeric,
  p_gtin text default null,
  p_supplier_name text default null,
  p_pack_date date default null,
  p_expires_at timestamptz default null,
  p_pti_label text default null,
  p_notes text default null,
  p_unit_cost numeric default null
)
returns table (
  lot_id uuid,
  new_stock numeric,
  new_avg_unit_cost numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot_id uuid;
  v_stock numeric;
  v_avg numeric;
begin
  if p_quantity <= 0 then
    raise exception 'La cantidad debe ser positiva';
  end if;

  insert into public.product_lots (
    branch_id,
    branch_product_id,
    lot_code,
    gtin,
    supplier_name,
    pack_date,
    expires_at,
    quantity_received,
    quantity_remaining,
    pti_label,
    notes
  )
  select
    bp.branch_id,
    bp.id,
    trim(p_lot_code),
    nullif(trim(coalesce(p_gtin, '')), ''),
    nullif(trim(coalesce(p_supplier_name, '')), ''),
    p_pack_date,
    p_expires_at,
    p_quantity,
    p_quantity,
    nullif(trim(coalesce(p_pti_label, '')), ''),
    nullif(trim(coalesce(p_notes, '')), '')
  from public.branch_products bp
  where bp.id = p_branch_product_id
  returning id into v_lot_id;

  if v_lot_id is null then
    raise exception 'Producto de sucursal no encontrado';
  end if;

  select r.new_stock, r.new_avg_unit_cost
  into v_stock, v_avg
  from public.record_inventory_movement(
    p_branch_product_id,
    'purchase',
    p_quantity,
    coalesce(p_notes, 'Lote ' || trim(p_lot_code)),
    p_expires_at,
    p_unit_cost
  ) r;

  update public.inventory_movements im
  set lot_id = v_lot_id
  where im.id = (
    select id
    from public.inventory_movements
    where branch_product_id = p_branch_product_id
      and movement_type = 'purchase'
      and lot_id is null
    order by created_at desc
    limit 1
  );

  return query select v_lot_id, v_stock, v_avg;
end;
$$;

create or replace function public.get_product_margins(p_branch_id uuid)
returns table (
  branch_product_id uuid,
  product_name text,
  unit public.product_unit,
  sale_price numeric,
  avg_unit_cost numeric,
  last_unit_cost numeric,
  margin_amount numeric,
  margin_percent numeric,
  stock numeric,
  inventory_value_cost numeric,
  inventory_value_sale numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    bp.id,
    p.name,
    p.unit,
    bp.price,
    bp.avg_unit_cost,
    bp.last_unit_cost,
    round(bp.price - bp.avg_unit_cost, 2),
    case
      when bp.price > 0 then round(((bp.price - bp.avg_unit_cost) / bp.price) * 100, 1)
      else 0
    end,
    bp.stock,
    round(bp.stock * bp.avg_unit_cost, 2),
    round(bp.stock * bp.price, 2)
  from public.branch_products bp
  join public.products p on p.id = bp.product_id
  where bp.branch_id = p_branch_id
    and bp.is_available = true
    and p.is_active = true
  order by
    case when bp.price > 0 then ((bp.price - bp.avg_unit_cost) / bp.price) else 0 end desc,
    p.name;
$$;

create or replace function public.get_profit_summary(
  p_branch_id uuid,
  p_days int default 30
)
returns table (
  period_days int,
  revenue numeric,
  cogs numeric,
  gross_profit numeric,
  gross_margin_percent numeric,
  fixed_costs numeric,
  variable_costs numeric,
  operating_costs_total numeric,
  estimated_net_profit numeric,
  order_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int := greatest(p_days, 1);
  v_revenue numeric(10, 2);
  v_cogs numeric(10, 2);
  v_orders bigint;
  v_fixed numeric(10, 2) := 0;
  v_variable numeric(10, 2) := 0;
  v_cost record;
begin
  select
    coalesce(sum(o.subtotal), 0),
    coalesce(sum(oi.quantity * coalesce(oi.unit_cost, 0)), 0),
    count(distinct o.id)
  into v_revenue, v_cogs, v_orders
  from public.orders o
  join public.order_items oi on oi.order_id = o.id
  where o.branch_id = p_branch_id
    and o.status <> 'cancelled'
    and o.created_at >= now() - (v_days || ' days')::interval;

  for v_cost in
    select c.cost_type, c.period, c.amount
    from public.branch_operating_costs c
    where c.branch_id = p_branch_id
      and c.is_active = true
  loop
    case v_cost.period
      when 'monthly' then
        if v_cost.cost_type = 'fixed' then
          v_fixed := v_fixed + v_cost.amount * (v_days::numeric / 30);
        else
          v_variable := v_variable + v_cost.amount * (v_days::numeric / 30);
        end if;
      when 'daily' then
        if v_cost.cost_type = 'fixed' then
          v_fixed := v_fixed + v_cost.amount * v_days;
        else
          v_variable := v_variable + v_cost.amount * v_days;
        end if;
      when 'per_order' then
        v_variable := v_variable + v_cost.amount * v_orders;
      else
        null;
    end case;
  end loop;

  return query
  select
    v_days,
    v_revenue,
    round(v_cogs, 2),
    round(v_revenue - v_cogs, 2),
    case when v_revenue > 0 then round(((v_revenue - v_cogs) / v_revenue) * 100, 1) else 0 end,
    round(v_fixed, 2),
    round(v_variable, 2),
    round(v_fixed + v_variable, 2),
    round(v_revenue - v_cogs - v_fixed - v_variable, 2),
    v_orders;
end;
$$;

-- Snapshot unit cost on guest orders
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
  returning id, order_number into v_order_id, v_order_number;

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

    if v_bp.stock < v_qty then
      raise exception 'Stock insuficiente para %', v_product.name;
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
      v_unit_price,
      v_line_total,
      v_bp.avg_unit_cost
    )
    returning id into v_order_item_id;

    perform public.allocate_lots_for_sale(v_order_item_id, v_bp.id, v_qty);

    update public.branch_products
    set stock = stock - v_qty
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
      'Venta pedido #' || v_order_number::text,
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

grant execute on function public.apply_purchase_unit_cost(uuid, numeric, numeric, numeric) to authenticated, service_role;
grant execute on function public.get_product_margins(uuid) to authenticated, service_role;
grant execute on function public.get_profit_summary(uuid, int) to authenticated, service_role;
grant execute on function public.record_inventory_movement(uuid, public.inventory_movement_type, numeric, text, timestamptz, numeric) to anon, authenticated, service_role;
grant execute on function public.receive_product_lot(uuid, text, numeric, text, text, date, timestamptz, text, text, numeric) to anon, authenticated, service_role;
