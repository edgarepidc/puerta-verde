-- Lots, PTI traceability, FIFO allocation on sales, demand forecast RPC

create table public.product_lots (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  branch_product_id uuid not null references public.branch_products (id) on delete cascade,
  lot_code text not null,
  gtin text,
  supplier_name text,
  pack_date date,
  expires_at timestamptz,
  quantity_received numeric(10, 3) not null check (quantity_received > 0),
  quantity_remaining numeric(10, 3) not null check (quantity_remaining >= 0),
  pti_label text,
  notes text,
  created_at timestamptz not null default now(),
  unique (branch_id, lot_code)
);

create index product_lots_branch_product_idx on public.product_lots (branch_product_id);
create index product_lots_expires_idx on public.product_lots (expires_at) where quantity_remaining > 0;

alter table public.inventory_movements
  add column if not exists lot_id uuid references public.product_lots (id) on delete set null;

create table public.order_item_lots (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  lot_id uuid not null references public.product_lots (id) on delete restrict,
  quantity numeric(10, 3) not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create index order_item_lots_lot_idx on public.order_item_lots (lot_id);

alter table public.product_lots enable row level security;
alter table public.order_item_lots enable row level security;

create policy "staff read lots" on public.product_lots
  for select to authenticated
  using (public.is_staff_of_branch(branch_id));

create policy "staff manage lots" on public.product_lots
  for all to authenticated
  using (public.is_staff_of_branch(branch_id))
  with check (public.is_staff_of_branch(branch_id));

create policy "staff read order item lots" on public.order_item_lots
  for select to authenticated
  using (
    exists (
      select 1
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_id
        and public.is_staff_of_branch(o.branch_id)
    )
  );

create or replace function public.receive_product_lot(
  p_branch_product_id uuid,
  p_lot_code text,
  p_quantity numeric,
  p_gtin text default null,
  p_supplier_name text default null,
  p_pack_date date default null,
  p_expires_at timestamptz default null,
  p_pti_label text default null,
  p_notes text default null
)
returns table (
  lot_id uuid,
  new_stock numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot_id uuid;
  v_stock numeric;
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

  select new_stock into v_stock
  from public.record_inventory_movement(
    p_branch_product_id,
    'purchase',
    p_quantity,
    coalesce(p_notes, 'Lote ' || trim(p_lot_code)),
    p_expires_at
  );

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

  return query select v_lot_id, v_stock;
end;
$$;

create or replace function public.allocate_lots_for_sale(
  p_order_item_id uuid,
  p_branch_product_id uuid,
  p_quantity numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining numeric(10, 3) := p_quantity;
  v_lot record;
  v_take numeric(10, 3);
begin
  for v_lot in
    select pl.id, pl.quantity_remaining
    from public.product_lots pl
    where pl.branch_product_id = p_branch_product_id
      and pl.quantity_remaining > 0
    order by pl.expires_at nulls last, pl.created_at
    for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, v_lot.quantity_remaining);

    update public.product_lots
    set quantity_remaining = quantity_remaining - v_take
    where id = v_lot.id;

    insert into public.order_item_lots (order_item_id, lot_id, quantity)
    values (p_order_item_id, v_lot.id, v_take);

    v_remaining := v_remaining - v_take;
  end loop;
end;
$$;

create or replace function public.get_lot_traceability(p_lot_code text, p_branch_id uuid default null)
returns table (
  lot_id uuid,
  lot_code text,
  product_name text,
  gtin text,
  supplier_name text,
  pack_date date,
  expires_at timestamptz,
  quantity_received numeric,
  quantity_remaining numeric,
  pti_label text,
  movements jsonb,
  order_allocations jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with target as (
    select pl.*
    from public.product_lots pl
    where pl.lot_code = trim(p_lot_code)
      and (p_branch_id is null or pl.branch_id = p_branch_id)
    limit 1
  )
  select
    t.id,
    t.lot_code,
    p.name,
    t.gtin,
    t.supplier_name,
    t.pack_date,
    t.expires_at,
    t.quantity_received,
    t.quantity_remaining,
    t.pti_label,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', im.movement_type,
        'quantity', im.quantity,
        'notes', im.notes,
        'created_at', im.created_at
      ) order by im.created_at)
      from public.inventory_movements im
      where im.lot_id = t.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'order_number', o.order_number,
        'customer_name', o.customer_name,
        'quantity', oil.quantity,
        'created_at', o.created_at
      ) order by o.created_at)
      from public.order_item_lots oil
      join public.order_items oi on oi.id = oil.order_item_id
      join public.orders o on o.id = oi.order_id
      where oil.lot_id = t.id
    ), '[]'::jsonb)
  from target t
  join public.branch_products bp on bp.id = t.branch_product_id
  join public.products p on p.id = bp.product_id;
end;
$$;

create or replace function public.get_restock_forecast(
  p_branch_id uuid,
  p_horizon_days int default 7
)
returns table (
  branch_product_id uuid,
  product_name text,
  unit public.product_unit,
  current_stock numeric,
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
      and o.status not in ('cancelled')
    group by oi.branch_product_id
  )
  select
    bp.id,
    p.name,
    p.unit,
    bp.stock,
    coalesce(s.avg_daily, 0),
    coalesce(s.avg_daily, 0) * greatest(p_horizon_days, 1),
    greatest(coalesce(s.avg_daily, 0) * greatest(p_horizon_days, 1) - bp.stock, 0),
    case
      when coalesce(s.avg_daily, 0) <= 0 then null
      else round(bp.stock / s.avg_daily, 1)
    end
  from public.branch_products bp
  join public.products p on p.id = bp.product_id
  left join sales s on s.branch_product_id = bp.id
  where bp.branch_id = p_branch_id
    and bp.is_available = true
    and p.is_active = true
  order by greatest(coalesce(s.avg_daily, 0) * greatest(p_horizon_days, 1) - bp.stock, 0) desc, p.name;
$$;

-- Update place_guest_order to allocate lots after each order item
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
      line_total
    )
    values (
      v_order_id,
      v_bp.id,
      v_product.name,
      v_product.unit,
      v_qty,
      v_unit_price,
      v_line_total
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
      notes
    )
    values (
      v_branch.id,
      v_bp.id,
      'sale',
      v_qty,
      v_order_id,
      'Venta pedido #' || v_order_number::text
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

grant execute on function public.receive_product_lot(uuid, text, numeric, text, text, date, timestamptz, text, text) to anon, authenticated, service_role;
grant execute on function public.get_lot_traceability(text, uuid) to authenticated, service_role;
grant execute on function public.get_restock_forecast(uuid, int) to authenticated, service_role;
