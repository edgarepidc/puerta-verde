-- Profit RPCs accept an inclusive Mexico calendar date range (p_start, p_end).

drop function if exists public.get_profit_summary(uuid, int);
drop function if exists public.get_profit_by_category(uuid, int);

create or replace function public.get_profit_summary(
  p_branch_id uuid,
  p_start date,
  p_end date
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
  v_tz text := 'America/Mexico_City';
  v_start date;
  v_end date;
  v_range_start timestamptz;
  v_range_end timestamptz;
  v_period_days int;
  v_month_div numeric;
  v_revenue numeric(10, 2);
  v_cogs numeric(10, 2);
  v_orders bigint;
  v_fixed numeric(10, 2) := 0;
  v_variable numeric(10, 2) := 0;
  v_cost record;
begin
  v_start := least(p_start, p_end);
  v_end := greatest(p_start, p_end);
  v_period_days := greatest((v_end - v_start) + 1, 1);

  v_range_start := (v_start::timestamp at time zone v_tz);
  v_range_end := ((v_end + 1)::timestamp at time zone v_tz);

  if date_trunc('month', v_start::timestamp) = date_trunc('month', v_end::timestamp) then
    v_month_div := extract(
      day from (date_trunc('month', v_start::timestamp) + interval '1 month - 1 day')
    );
  else
    v_month_div := 30;
  end if;

  select
    coalesce(sum(greatest(o.subtotal - coalesce(o.discount_amount, 0), 0)), 0),
    count(*)
  into v_revenue, v_orders
  from public.orders o
  where o.branch_id = p_branch_id
    and o.status <> 'cancelled'
    and o.created_at >= v_range_start
    and o.created_at < v_range_end;

  select coalesce(sum(oi.quantity * coalesce(oi.unit_cost, 0)), 0)
  into v_cogs
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.branch_id = p_branch_id
    and o.status <> 'cancelled'
    and o.created_at >= v_range_start
    and o.created_at < v_range_end;

  for v_cost in
    select c.cost_type, c.period, c.amount
    from public.branch_operating_costs c
    where c.branch_id = p_branch_id
      and c.is_active = true
  loop
    case v_cost.period
      when 'monthly' then
        if v_cost.cost_type = 'fixed' then
          v_fixed := v_fixed + v_cost.amount * (v_period_days::numeric / v_month_div);
        else
          v_variable := v_variable + v_cost.amount * (v_period_days::numeric / v_month_div);
        end if;
      when 'daily' then
        if v_cost.cost_type = 'fixed' then
          v_fixed := v_fixed + v_cost.amount * v_period_days;
        else
          v_variable := v_variable + v_cost.amount * v_period_days;
        end if;
      when 'per_order' then
        v_variable := v_variable + v_cost.amount * v_orders;
      else
        null;
    end case;
  end loop;

  return query
  select
    v_period_days,
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

create or replace function public.get_profit_by_category(
  p_branch_id uuid,
  p_start date,
  p_end date
)
returns table (
  category_name text,
  product_count bigint,
  units_sold numeric,
  revenue numeric,
  cogs numeric,
  gross_profit numeric,
  gross_margin_percent numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text := 'America/Mexico_City';
  v_start date;
  v_end date;
  v_range_start timestamptz;
  v_range_end timestamptz;
begin
  v_start := least(p_start, p_end);
  v_end := greatest(p_start, p_end);
  v_range_start := (v_start::timestamp at time zone v_tz);
  v_range_end := ((v_end + 1)::timestamp at time zone v_tz);

  return query
  with sales as (
    select
      coalesce(pc.name, 'General') as category_name,
      p.id as product_id,
      sum(oi.quantity) as units_sold,
      sum(oi.line_total) as revenue,
      sum(oi.quantity * coalesce(oi.unit_cost, 0)) as cogs
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.branch_products bp on bp.id = oi.branch_product_id
    join public.products p on p.id = bp.product_id
    left join public.product_categories pc on pc.id = p.category_id
    where o.branch_id = p_branch_id
      and o.status <> 'cancelled'
      and o.created_at >= v_range_start
      and o.created_at < v_range_end
    group by coalesce(pc.name, 'General'), p.id
  ),
  aggregated as (
    select
      s.category_name,
      count(distinct s.product_id) as product_count,
      coalesce(sum(s.units_sold), 0) as units_sold,
      coalesce(sum(s.revenue), 0) as revenue,
      coalesce(sum(s.cogs), 0) as cogs
    from sales s
    group by s.category_name
  )
  select
    a.category_name,
    a.product_count,
    round(a.units_sold, 3),
    round(a.revenue, 2),
    round(a.cogs, 2),
    round(a.revenue - a.cogs, 2),
    case
      when a.revenue > 0 then round(((a.revenue - a.cogs) / a.revenue) * 100, 1)
      else 0
    end
  from aggregated a
  order by (a.revenue - a.cogs) desc, a.category_name;
end;
$$;

grant execute on function public.get_profit_summary(uuid, date, date) to authenticated, service_role;
grant execute on function public.get_profit_by_category(uuid, date, date) to authenticated, service_role;
