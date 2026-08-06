-- Profit report grouped by product category

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
language sql
stable
security definer
set search_path = public
as $$
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
      and o.created_at >= now() - (greatest(p_days, 1) || ' days')::interval
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
$$;

grant execute on function public.get_profit_by_category(uuid, int) to authenticated, service_role;
