-- Profit summary / by-category: calendar month-to-date in America/Mexico_City.
-- p_days is kept for signature compatibility but ignored.

create or replace function public.get_profit_summary(
  p_branch_id uuid,
  p_days int default 30
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
  v_local_now timestamp;
  v_month_start timestamptz;
  v_days_elapsed int;
  v_days_in_month int;
  v_revenue numeric(10, 2);
  v_cogs numeric(10, 2);
  v_orders bigint;
  v_fixed numeric(10, 2) := 0;
  v_variable numeric(10, 2) := 0;
  v_cost record;
begin
  -- Ignore p_days; always use current Mexico calendar month.
  perform p_days;

  v_local_now := timezone(v_tz, now());
  v_month_start := (date_trunc('month', v_local_now) at time zone v_tz);
  v_days_elapsed := greatest(extract(day from v_local_now)::int, 1);
  v_days_in_month := extract(
    day from (date_trunc('month', v_local_now) + interval '1 month - 1 day')
  )::int;

  select
    coalesce(sum(greatest(o.subtotal - coalesce(o.discount_amount, 0), 0)), 0),
    count(*)
  into v_revenue, v_orders
  from public.orders o
  where o.branch_id = p_branch_id
    and o.status <> 'cancelled'
    and o.created_at >= v_month_start;

  select coalesce(sum(oi.quantity * coalesce(oi.unit_cost, 0)), 0)
  into v_cogs
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.branch_id = p_branch_id
    and o.status <> 'cancelled'
    and o.created_at >= v_month_start;

  for v_cost in
    select c.cost_type, c.period, c.amount
    from public.branch_operating_costs c
    where c.branch_id = p_branch_id
      and c.is_active = true
  loop
    case v_cost.period
      when 'monthly' then
        if v_cost.cost_type = 'fixed' then
          v_fixed := v_fixed + v_cost.amount * (v_days_elapsed::numeric / v_days_in_month);
        else
          v_variable := v_variable + v_cost.amount * (v_days_elapsed::numeric / v_days_in_month);
        end if;
      when 'daily' then
        if v_cost.cost_type = 'fixed' then
          v_fixed := v_fixed + v_cost.amount * v_days_elapsed;
        else
          v_variable := v_variable + v_cost.amount * v_days_elapsed;
        end if;
      when 'per_order' then
        v_variable := v_variable + v_cost.amount * v_orders;
      else
        null;
    end case;
  end loop;

  return query
  select
    v_days_elapsed,
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
  p_days int default 30
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
  v_month_start timestamptz;
begin
  perform p_days;
  v_month_start := (
    date_trunc('month', timezone(v_tz, now())) at time zone v_tz
  );

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
      and o.created_at >= v_month_start
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

grant execute on function public.get_profit_summary(uuid, int) to authenticated, service_role;
grant execute on function public.get_profit_by_category(uuid, int) to authenticated, service_role;
