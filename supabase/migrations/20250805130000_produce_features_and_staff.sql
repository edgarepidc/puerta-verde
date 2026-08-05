-- Produce-specific features: expiry tracking, discount promos, staff admin policies

alter table public.products
  add column if not exists shelf_life_days int check (shelf_life_days is null or shelf_life_days > 0);

alter table public.promotions
  add column if not exists discount_percent numeric(5, 2)
    check (discount_percent is null or (discount_percent > 0 and discount_percent <= 100));

alter table public.inventory_movements
  add column if not exists expires_at timestamptz;

create or replace function public.is_org_admin(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_memberships sm
    where sm.user_id = auth.uid()
      and sm.organization_id = target_org_id
      and sm.status = 'active'
      and sm.role in ('owner', 'org_admin')
  );
$$;

create policy "org admins manage memberships" on public.staff_memberships
  for all to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy "org admins insert profiles" on public.profiles
  for insert to authenticated
  with check (public.is_org_admin(
    (select sm.organization_id from public.staff_memberships sm where sm.user_id = auth.uid() and sm.status = 'active' limit 1)
  ));

grant execute on function public.is_org_admin(uuid) to authenticated;

create or replace function public.get_branch_discount_percent(p_branch_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(p.discount_percent), 0)
  from public.promotions p
  where p.branch_id = p_branch_id
    and p.is_active = true
    and p.kind = 'discount'
    and p.discount_percent is not null
    and (p.starts_at is null or p.starts_at <= now())
    and (p.ends_at is null or p.ends_at >= now());
$$;

grant execute on function public.get_branch_discount_percent(uuid) to anon, authenticated, service_role;

create or replace function public.record_inventory_movement(
  p_branch_product_id uuid,
  p_movement_type public.inventory_movement_type,
  p_quantity numeric,
  p_notes text default null,
  p_expires_at timestamptz default null
)
returns table (
  new_stock numeric
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

  select * into v_product from public.products where id = v_bp.product_id;

  case p_movement_type
    when 'purchase' then
      if p_quantity <= 0 then
        raise exception 'La cantidad debe ser positiva';
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
    expires_at
  )
  values (
    v_bp.branch_id,
    p_branch_product_id,
    p_movement_type,
    abs(p_quantity),
    nullif(trim(coalesce(p_notes, '')), ''),
    v_expires_at
  );

  return query
  select bp.stock
  from public.branch_products bp
  where bp.id = p_branch_product_id;
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
    );

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

grant execute on function public.record_inventory_movement(uuid, public.inventory_movement_type, numeric, text, timestamptz) to anon, authenticated, service_role;
