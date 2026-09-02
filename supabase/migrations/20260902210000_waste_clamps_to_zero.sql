-- Merma / ajuste al conteo 0 was failing with "Stock insuficiente" when the
-- catalog showed 2 decimals (6.14 kg) but storage is numeric(10, 3) (6.137).
-- Write-offs clamp to the remaining stock instead of going negative.

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
    case when p_movement_type = 'purchase' then p_unit_cost else null end
  );

  return query
  select bp.stock, bp.avg_unit_cost
  from public.branch_products bp
  where bp.id = p_branch_product_id;
end;
$$;
