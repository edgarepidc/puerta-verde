-- A public mirror of a branch: same catalog and stock, prices raised by a percent
-- so delivery is included. Orders still land on the source branch.

create table public.storefronts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  name text not null,
  slug text not null,
  markup_percent numeric(6, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint storefronts_markup_percent_check check (markup_percent >= 0 and markup_percent <= 200),
  constraint storefronts_slug_unique unique (slug),
  constraint storefronts_branch_unique unique (branch_id),
  constraint storefronts_slug_format check (
    char_length(slug) between 2 and 40
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  )
);

alter table public.orders
  add column if not exists storefront_id uuid references public.storefronts (id) on delete set null;

alter table public.storefronts enable row level security;

create or replace function public.get_public_storefront(target_slug text)
returns table (
  id uuid,
  branch_id uuid,
  name text,
  slug text,
  markup_percent numeric,
  branch_slug text,
  organization_id uuid,
  address text,
  pickup_instructions text,
  minimum_order_amount numeric,
  whatsapp_phone text,
  opening_hours text,
  org_name text,
  org_slug text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    b.id as branch_id,
    s.name,
    s.slug,
    s.markup_percent,
    b.slug as branch_slug,
    b.organization_id,
    b.address,
    b.pickup_instructions,
    b.minimum_order_amount,
    b.whatsapp_phone,
    b.opening_hours,
    o.name as org_name,
    o.slug as org_slug
  from public.storefronts s
  join public.branches b on b.id = s.branch_id
  join public.organizations o on o.id = b.organization_id
  where s.slug = target_slug
    and s.is_active = true
    and b.is_active = true
    and o.subscription_status in ('trialing', 'active');
$$;

grant execute on function public.get_public_storefront(text) to anon, authenticated;

drop function if exists public.place_guest_order(text, text, text, public.fulfillment_type, uuid, text, jsonb);

create or replace function public.place_guest_order(
  p_branch_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_fulfillment_type public.fulfillment_type,
  p_unit_id uuid,
  p_delivery_notes text,
  p_items jsonb,
  p_storefront_slug text default null
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
  v_markup numeric(6, 2) := 0;
  v_storefront_id uuid;
  v_storefront_name text;
  v_sale_note text;
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

  if nullif(btrim(coalesce(p_storefront_slug, '')), '') is not null then
    select s.id, s.markup_percent, s.name
      into v_storefront_id, v_markup, v_storefront_name
    from public.storefronts s
    where s.branch_id = v_branch.id
      and s.slug = lower(btrim(p_storefront_slug))
      and s.is_active = true;

    if not found then
      raise exception 'Tienda no encontrada';
    end if;

    if p_fulfillment_type <> 'delivery' then
      raise exception 'Esta tienda solo entrega a domicilio';
    end if;

    v_delivery_fee := 0;
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
    delivery_fee,
    storefront_id
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
    v_delivery_fee,
    v_storefront_id
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
    if v_markup > 0 then
      v_unit_price := round(v_unit_price * (1 + v_markup / 100), 2);
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

    v_sale_note := case
      when v_weigh then
        'Venta pedido #' || v_order_number::text
          || ' · ' || trim(to_char(v_ordered, 'FM999999990.###')) || ' pieza(s)'
      else
        'Venta pedido #' || v_order_number::text
    end;
    if coalesce(v_storefront_name, '') <> '' then
      v_sale_note := v_sale_note || ' · ' || v_storefront_name;
    end if;

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
      v_sale_note,
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

grant execute on function public.place_guest_order(text, text, text, public.fulfillment_type, uuid, text, jsonb, text) to anon, authenticated, service_role;
