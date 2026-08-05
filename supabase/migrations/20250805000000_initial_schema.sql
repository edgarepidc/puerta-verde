-- Puerta Verde: initial multi-tenant schema for grocery retail SaaS

create extension if not exists "pgcrypto" with schema extensions;

-- Enums
create type public.staff_role as enum ('owner', 'org_admin', 'branch_manager', 'staff');
create type public.membership_status as enum ('active', 'inactive');
create type public.subscription_plan as enum ('basic', 'pro', 'enterprise');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled');
create type public.product_unit as enum ('kg', 'piece', 'bunch', 'bag', 'liter');
create type public.fulfillment_type as enum ('delivery', 'pickup');
create type public.order_status as enum (
  'pending',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'cancelled'
);
create type public.payment_method as enum ('cash', 'card_terminal', 'transfer', 'online');
create type public.payment_status as enum ('pending', 'paid', 'refunded');
create type public.inventory_movement_type as enum ('purchase', 'sale', 'waste', 'adjustment');
create type public.promotion_kind as enum ('banner', 'discount', 'bundle');

-- Core tenant tables
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  subscription_plan public.subscription_plan not null default 'basic',
  subscription_status public.subscription_status not null default 'trialing',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  slug text not null,
  address text,
  timezone text not null default 'America/Mexico_City',
  is_active boolean not null default true,
  pickup_instructions text,
  delivery_fee numeric(10, 2) not null default 0 check (delivery_fee >= 0),
  minimum_order_amount numeric(10, 2) not null default 0 check (minimum_order_amount >= 0),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (branch_id, name)
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete cascade,
  identifier text not null,
  created_at timestamptz not null default now(),
  unique (building_id, identifier)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete cascade,
  role public.staff_role not null default 'staff',
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (user_id, organization_id, branch_id)
);

-- Catalog
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category_id uuid references public.product_categories (id) on delete set null,
  name text not null,
  description text,
  unit public.product_unit not null default 'kg',
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.branch_products (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  price numeric(10, 2) not null check (price >= 0),
  stock numeric(10, 3) not null default 0 check (stock >= 0),
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, product_id)
);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  title text not null,
  body text,
  kind public.promotion_kind not null default 'banner',
  image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Customers (phone-based, no auth required)
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  phone text not null,
  full_name text,
  default_unit_id uuid references public.units (id) on delete set null,
  whatsapp_opt_in boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, phone)
);

-- Orders
create sequence public.order_number_seq start 1000;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  customer_id uuid references public.customers (id) on delete set null,
  order_number bigint not null default nextval('public.order_number_seq'),
  tracking_token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  customer_name text not null,
  customer_phone text not null,
  fulfillment_type public.fulfillment_type not null,
  unit_id uuid references public.units (id) on delete set null,
  delivery_notes text,
  status public.order_status not null default 'pending',
  subtotal numeric(10, 2) not null default 0 check (subtotal >= 0),
  delivery_fee numeric(10, 2) not null default 0 check (delivery_fee >= 0),
  total numeric(10, 2) not null default 0 check (total >= 0),
  payment_method public.payment_method,
  payment_status public.payment_status not null default 'pending',
  paid_at timestamptz,
  paid_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  branch_product_id uuid not null references public.branch_products (id) on delete restrict,
  product_name text not null,
  unit public.product_unit not null,
  quantity numeric(10, 3) not null check (quantity > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  line_total numeric(10, 2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

-- Inventory
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  branch_product_id uuid not null references public.branch_products (id) on delete cascade,
  movement_type public.inventory_movement_type not null,
  quantity numeric(10, 3) not null,
  notes text,
  order_id uuid references public.orders (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Finance
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  concept text not null,
  amount numeric(10, 2) not null check (amount > 0),
  expense_date date not null default current_date,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.daily_cash_closings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  closing_date date not null,
  cash_total numeric(10, 2) not null default 0,
  card_terminal_total numeric(10, 2) not null default 0,
  transfer_total numeric(10, 2) not null default 0,
  notes text,
  closed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (branch_id, closing_date)
);

-- WhatsApp
create table public.whatsapp_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade unique,
  phone_number_id text not null,
  business_account_id text,
  access_token_secret_name text not null default 'whatsapp_access_token',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.whatsapp_message_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  recipient_phone text not null,
  template_key text,
  body text not null,
  external_message_id text,
  status text not null default 'sent',
  error_message text,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_branches_org on public.branches (organization_id);
create index idx_branches_slug on public.branches (slug);
create index idx_branch_products_branch on public.branch_products (branch_id);
create index idx_orders_branch_status on public.orders (branch_id, status, created_at desc);
create index idx_orders_tracking on public.orders (tracking_token);
create index idx_customers_org_phone on public.customers (organization_id, phone);

-- Updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger branches_updated_at before update on public.branches
  for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger branch_products_updated_at before update on public.branch_products
  for each row execute function public.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
create trigger whatsapp_configs_updated_at before update on public.whatsapp_configs
  for each row execute function public.set_updated_at();

-- Auth helpers
create or replace function public.is_staff_of_org(target_org_id uuid)
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
  );
$$;

create or replace function public.is_staff_of_branch(target_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_memberships sm
    join public.branches b on b.id = target_branch_id
    where sm.user_id = auth.uid()
      and sm.status = 'active'
      and (
        (sm.branch_id = target_branch_id)
        or (sm.branch_id is null and sm.organization_id = b.organization_id)
      )
  );
$$;

-- Public storefront helpers
create or replace function public.get_public_branch(target_slug text)
returns table (
  id uuid,
  organization_id uuid,
  name text,
  slug text,
  address text,
  pickup_instructions text,
  delivery_fee numeric,
  minimum_order_amount numeric,
  org_name text,
  org_slug text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    b.organization_id,
    b.name,
    b.slug,
    b.address,
    b.pickup_instructions,
    b.delivery_fee,
    b.minimum_order_amount,
    o.name as org_name,
    o.slug as org_slug
  from public.branches b
  join public.organizations o on o.id = b.organization_id
  where b.slug = target_slug
    and b.is_active = true
    and o.subscription_status in ('trialing', 'active');
$$;

-- Guest order placement
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
  v_subtotal numeric(10, 2) := 0;
  v_delivery_fee numeric(10, 2) := 0;
  v_item jsonb;
  v_bp public.branch_products%rowtype;
  v_product public.products%rowtype;
  v_qty numeric(10, 3);
  v_line_total numeric(10, 2);
  v_phone text;
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
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select bp.* into v_bp
    from public.branch_products bp
    where bp.id = (v_item->>'branch_product_id')::uuid
      and bp.branch_id = v_branch.id
      and bp.is_available = true;

    if not found then
      raise exception 'Producto no disponible';
    end if;

    select p.* into v_product from public.products p where p.id = v_bp.product_id;

    v_qty := (v_item->>'quantity')::numeric;
    if v_qty <= 0 then
      raise exception 'Cantidad inválida';
    end if;

    v_line_total := round(v_bp.price * v_qty, 2);
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
      v_bp.price,
      v_line_total
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

-- RLS
alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.buildings enable row level security;
alter table public.units enable row level security;
alter table public.profiles enable row level security;
alter table public.staff_memberships enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.branch_products enable row level security;
alter table public.promotions enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.expenses enable row level security;
alter table public.daily_cash_closings enable row level security;
alter table public.whatsapp_configs enable row level security;
alter table public.whatsapp_message_logs enable row level security;

-- Staff policies
create policy "staff read organizations" on public.organizations
  for select to authenticated
  using (public.is_staff_of_org(id));

create policy "staff manage organizations" on public.organizations
  for all to authenticated
  using (public.is_staff_of_org(id))
  with check (public.is_staff_of_org(id));

create policy "staff read branches" on public.branches
  for select to authenticated
  using (public.is_staff_of_org(organization_id));

create policy "staff manage branches" on public.branches
  for all to authenticated
  using (public.is_staff_of_org(organization_id))
  with check (public.is_staff_of_org(organization_id));

create policy "public read active branches" on public.branches
  for select to anon, authenticated
  using (is_active = true);

create policy "staff read buildings" on public.buildings
  for select to authenticated
  using (public.is_staff_of_branch(branch_id));

create policy "staff manage buildings" on public.buildings
  for all to authenticated
  using (public.is_staff_of_branch(branch_id))
  with check (public.is_staff_of_branch(branch_id));

create policy "public read buildings" on public.buildings
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.branches b
      where b.id = branch_id and b.is_active = true
    )
  );

create policy "staff read units" on public.units
  for select to authenticated
  using (
    exists (
      select 1 from public.buildings bg
      where bg.id = building_id and public.is_staff_of_branch(bg.branch_id)
    )
  );

create policy "public read units" on public.units
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.buildings bg
      join public.branches b on b.id = bg.branch_id
      where bg.id = building_id and b.is_active = true
    )
  );

create policy "users read own profile" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "users update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "staff read memberships" on public.staff_memberships
  for select to authenticated
  using (public.is_staff_of_org(organization_id));

create policy "staff read categories" on public.product_categories
  for select to authenticated
  using (public.is_staff_of_org(organization_id));

create policy "staff manage categories" on public.product_categories
  for all to authenticated
  using (public.is_staff_of_org(organization_id))
  with check (public.is_staff_of_org(organization_id));

create policy "public read categories" on public.product_categories
  for select to anon, authenticated
  using (true);

create policy "staff read products" on public.products
  for select to authenticated
  using (public.is_staff_of_org(organization_id));

create policy "staff manage products" on public.products
  for all to authenticated
  using (public.is_staff_of_org(organization_id))
  with check (public.is_staff_of_org(organization_id));

create policy "public read active products" on public.products
  for select to anon, authenticated
  using (is_active = true);

create policy "staff read branch products" on public.branch_products
  for select to authenticated
  using (public.is_staff_of_branch(branch_id));

create policy "staff manage branch products" on public.branch_products
  for all to authenticated
  using (public.is_staff_of_branch(branch_id))
  with check (public.is_staff_of_branch(branch_id));

create policy "public read available branch products" on public.branch_products
  for select to anon, authenticated
  using (is_available = true);

create policy "staff read promotions" on public.promotions
  for select to authenticated
  using (public.is_staff_of_branch(branch_id));

create policy "staff manage promotions" on public.promotions
  for all to authenticated
  using (public.is_staff_of_branch(branch_id))
  with check (public.is_staff_of_branch(branch_id));

create policy "public read active promotions" on public.promotions
  for select to anon, authenticated
  using (
    is_active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

create policy "staff read customers" on public.customers
  for select to authenticated
  using (public.is_staff_of_org(organization_id));

create policy "staff read orders" on public.orders
  for select to authenticated
  using (public.is_staff_of_branch(branch_id));

create policy "staff manage orders" on public.orders
  for all to authenticated
  using (public.is_staff_of_branch(branch_id))
  with check (public.is_staff_of_branch(branch_id));

create policy "staff read order items" on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id and public.is_staff_of_branch(o.branch_id)
    )
  );

create policy "staff manage inventory" on public.inventory_movements
  for all to authenticated
  using (public.is_staff_of_branch(branch_id))
  with check (public.is_staff_of_branch(branch_id));

create policy "staff manage expenses" on public.expenses
  for all to authenticated
  using (public.is_staff_of_branch(branch_id))
  with check (public.is_staff_of_branch(branch_id));

create policy "staff manage cash closings" on public.daily_cash_closings
  for all to authenticated
  using (public.is_staff_of_branch(branch_id))
  with check (public.is_staff_of_branch(branch_id));

create policy "staff manage whatsapp config" on public.whatsapp_configs
  for all to authenticated
  using (public.is_staff_of_org(organization_id))
  with check (public.is_staff_of_org(organization_id));

create policy "staff read whatsapp logs" on public.whatsapp_message_logs
  for select to authenticated
  using (public.is_staff_of_org(organization_id));

-- Grants for RPCs
create or replace function public.get_order_by_tracking_token(p_token text)
returns table (
  id uuid,
  order_number bigint,
  customer_name text,
  status public.order_status,
  fulfillment_type public.fulfillment_type,
  subtotal numeric,
  delivery_fee numeric,
  total numeric,
  payment_status public.payment_status,
  created_at timestamptz,
  branch_name text,
  items jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.order_number,
    o.customer_name,
    o.status,
    o.fulfillment_type,
    o.subtotal,
    o.delivery_fee,
    o.total,
    o.payment_status,
    o.created_at,
    b.name as branch_name,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'product_name', oi.product_name,
          'quantity', oi.quantity,
          'unit', oi.unit,
          'line_total', oi.line_total
        )
        order by oi.created_at
      ) filter (where oi.id is not null),
      '[]'::jsonb
    ) as items
  from public.orders o
  join public.branches b on b.id = o.branch_id
  left join public.order_items oi on oi.order_id = o.id
  where o.tracking_token = p_token
  group by o.id, b.name;
$$;

grant execute on function public.get_public_branch(text) to anon, authenticated;
grant execute on function public.place_guest_order(text, text, text, public.fulfillment_type, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.get_order_by_tracking_token(text) to anon, authenticated;
grant execute on function public.is_staff_of_org(uuid) to authenticated;
grant execute on function public.is_staff_of_branch(uuid) to authenticated;
