-- Restock forecast: also respect min_stock (low-stock threshold), not only sales velocity.

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
    -- Cover forecast demand OR lift stock back to min_stock (whichever needs more).
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
  order by
    greatest(
      coalesce(s.avg_daily, 0) * greatest(p_horizon_days, 1) - bp.stock,
      bp.min_stock - bp.stock,
      0
    ) desc,
    p.name;
$$;

grant execute on function public.get_restock_forecast(uuid, int) to authenticated, service_role;
