-- Track whether a purchase or expense left cash or the bank account.

create type public.money_pocket as enum ('cash', 'account');

alter table public.purchases
  add column paid_from public.money_pocket not null default 'cash';

alter table public.expenses
  add column paid_from public.money_pocket not null default 'cash';

alter table public.branch_operating_costs
  add column paid_from public.money_pocket not null default 'account';

comment on column public.purchases.paid_from is
  'Whether this purchase left the cash box or the bank account.';
comment on column public.expenses.paid_from is
  'Whether this visit expense left the cash box or the bank account.';
comment on column public.branch_operating_costs.paid_from is
  'Whether this recurring cost leaves the cash box or the bank account.';

drop function if exists public.record_supplier_purchase(uuid, uuid, date, text, jsonb);

create function public.record_supplier_purchase(
  p_branch_id uuid,
  p_supplier_id uuid,
  p_purchased_at date,
  p_notes text,
  p_items jsonb,
  p_paid_from public.money_pocket default 'cash'
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
  v_paid_from public.money_pocket;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un producto a la compra';
  end if;

  v_paid_from := coalesce(p_paid_from, 'cash');

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

  insert into public.purchases (branch_id, supplier_id, purchased_at, notes, total_amount, paid_from)
  values (
    p_branch_id,
    p_supplier_id,
    coalesce(p_purchased_at, (timezone('America/Mexico_City', now()))::date),
    nullif(trim(coalesce(p_notes, '')), ''),
    0,
    v_paid_from
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

grant execute on function public.record_supplier_purchase(uuid, uuid, date, text, jsonb, public.money_pocket) to authenticated;
grant execute on function public.record_supplier_purchase(uuid, uuid, date, text, jsonb, public.money_pocket) to service_role;
