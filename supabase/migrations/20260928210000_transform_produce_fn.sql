-- RPC: consume leftover produce and add stock to pulp/paletas/etc.

create or replace function public.transform_produce(
  p_source_branch_product_id uuid,
  p_source_quantity numeric,
  p_dest_branch_product_id uuid,
  p_dest_quantity numeric,
  p_notes text default null
)
returns table (
  source_stock numeric,
  dest_stock numeric,
  dest_avg_unit_cost numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.branch_products%rowtype;
  v_dest public.branch_products%rowtype;
  v_source_product public.products%rowtype;
  v_dest_product public.products%rowtype;
  v_consume numeric(10, 3);
  v_make numeric(10, 3);
  v_total_cost numeric(12, 4);
  v_dest_unit_cost numeric(10, 2);
  v_note text;
  v_source_notes text;
  v_dest_notes text;
  v_piece_units text[] := array['piece', 'bunch', 'bag', 'box'];
  v_first uuid;
  v_second uuid;
begin
  if p_source_branch_product_id = p_dest_branch_product_id then
    raise exception 'Elige un producto distinto al que estás pesando';
  end if;

  v_consume := round(coalesce(p_source_quantity, 0), 3);
  v_make := round(coalesce(p_dest_quantity, 0), 3);
  if v_consume <= 0 then
    raise exception 'Anota cuánto de la materia prima vas a convertir';
  end if;
  if v_make <= 0 then
    raise exception 'Indica cuánto salió (paletas, kg de pulpa…)';
  end if;

  -- Lock in id order to avoid deadlocks.
  if p_source_branch_product_id < p_dest_branch_product_id then
    v_first := p_source_branch_product_id;
    v_second := p_dest_branch_product_id;
  else
    v_first := p_dest_branch_product_id;
    v_second := p_source_branch_product_id;
  end if;

  perform 1 from public.branch_products where id = v_first for update;
  perform 1 from public.branch_products where id = v_second for update;

  select * into v_source from public.branch_products where id = p_source_branch_product_id;
  if not found then
    raise exception 'Producto de sucursal no encontrado';
  end if;
  select * into v_dest from public.branch_products where id = p_dest_branch_product_id;
  if not found then
    raise exception 'Producto de sucursal no encontrado';
  end if;
  if v_source.branch_id <> v_dest.branch_id then
    raise exception 'Los dos productos tienen que ser de la misma sucursal';
  end if;

  select * into v_source_product from public.products where id = v_source.product_id;
  select * into v_dest_product from public.products where id = v_dest.product_id;

  if coalesce(v_dest_product.pos_only, false) then
    raise exception 'Ese producto es un paquete de mostrador. Ármalo desde Caja.';
  end if;

  if v_dest_product.unit = any (v_piece_units) and v_make <> round(v_make, 0) then
    raise exception 'Indica piezas enteras';
  end if;

  if v_source.stock <= 0 then
    raise exception 'Ya no hay stock que convertir';
  end if;
  if v_consume > v_source.stock then
    v_consume := v_source.stock;
  end if;

  v_total_cost := coalesce(v_source.avg_unit_cost, 0) * v_consume;
  v_dest_unit_cost := round(v_total_cost / v_make, 2);
  v_note := nullif(trim(coalesce(p_notes, '')), '');
  v_source_notes := 'Convierte a ' || v_dest_product.name;
  v_dest_notes := 'Hecho con ' || v_source_product.name
    || ' · '
    || trim(to_char(v_consume, 'FM999999990.###'))
    || ' '
    || v_source_product.unit;
  if v_note is not null then
    v_source_notes := v_source_notes || ' · ' || v_note;
    v_dest_notes := v_dest_notes || ' · ' || v_note;
  end if;

  update public.branch_products
  set
    stock = stock - v_consume,
    piece_stock = case
      when stock - v_consume <= 0 then 0
      when v_source_product.unit = any (v_piece_units)
        then greatest(0, coalesce(piece_stock, 0) - v_consume)
      else piece_stock
    end
  where id = v_source.id;

  insert into public.inventory_movements (
    branch_id,
    branch_product_id,
    movement_type,
    quantity,
    notes,
    unit_cost
  )
  values (
    v_source.branch_id,
    v_source.id,
    'transform',
    v_consume,
    v_source_notes,
    v_source.avg_unit_cost
  );

  perform public.apply_purchase_unit_cost(
    v_dest.id,
    v_make,
    v_dest_unit_cost,
    v_dest.stock
  );

  update public.branch_products
  set
    stock = stock + v_make,
    piece_stock = case
      when v_dest_product.unit = any (v_piece_units)
        then coalesce(piece_stock, 0) + v_make
      else piece_stock
    end,
    is_available = true
  where id = v_dest.id;

  insert into public.inventory_movements (
    branch_id,
    branch_product_id,
    movement_type,
    quantity,
    notes,
    unit_cost
  )
  values (
    v_dest.branch_id,
    v_dest.id,
    'transform',
    v_make,
    v_dest_notes,
    v_dest_unit_cost
  );

  return query
  select
    src.stock,
    dst.stock,
    dst.avg_unit_cost
  from public.branch_products src
  join public.branch_products dst on dst.id = v_dest.id
  where src.id = v_source.id;
end;
$$;

grant execute on function public.transform_produce(uuid, numeric, uuid, numeric, text)
  to authenticated, service_role;
