-- Suppliers and purchase documents for raw-material cost comparison

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index suppliers_org_idx on public.suppliers (organization_id);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  purchased_at date not null default (timezone('America/Mexico_City', now()))::date,
  notes text,
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index purchases_branch_idx on public.purchases (branch_id, purchased_at desc);
create index purchases_supplier_idx on public.purchases (supplier_id);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  branch_product_id uuid not null references public.branch_products (id) on delete restrict,
  quantity numeric(10, 3) not null check (quantity > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  line_total numeric(12, 2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now()
);

create index purchase_items_purchase_idx on public.purchase_items (purchase_id);
create index purchase_items_product_idx on public.purchase_items (branch_product_id);

alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

create policy "staff read suppliers" on public.suppliers
  for select to authenticated
  using (public.is_staff_of_org(organization_id));

create policy "staff manage suppliers" on public.suppliers
  for all to authenticated
  using (public.is_staff_of_org(organization_id))
  with check (public.is_staff_of_org(organization_id));

create policy "staff read purchases" on public.purchases
  for select to authenticated
  using (public.is_staff_of_branch(branch_id));

create policy "staff manage purchases" on public.purchases
  for all to authenticated
  using (public.is_staff_of_branch(branch_id))
  with check (public.is_staff_of_branch(branch_id));

create policy "staff read purchase items" on public.purchase_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.purchases p
      where p.id = purchase_id
        and public.is_staff_of_branch(p.branch_id)
    )
  );

create policy "staff manage purchase items" on public.purchase_items
  for all to authenticated
  using (
    exists (
      select 1
      from public.purchases p
      where p.id = purchase_id
        and public.is_staff_of_branch(p.branch_id)
    )
  )
  with check (
    exists (
      select 1
      from public.purchases p
      where p.id = purchase_id
        and public.is_staff_of_branch(p.branch_id)
    )
  );

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

    insert into public.purchase_items (purchase_id, branch_product_id, quantity, unit_price)
    values (v_purchase_id, v_bp_id, v_qty, v_price);

    v_total := v_total + round(v_qty * v_price, 2);

    v_notes := format(
      'Compra a %s%s',
      v_supplier_name,
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
  end loop;

  update public.purchases
  set total_amount = v_total
  where id = v_purchase_id;

  return query select v_purchase_id, v_total;
end;
$$;

grant execute on function public.record_supplier_purchase(uuid, uuid, date, text, jsonb) to authenticated;
grant execute on function public.record_supplier_purchase(uuid, uuid, date, text, jsonb) to service_role;
