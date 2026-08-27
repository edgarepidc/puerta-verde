-- Fix get_profit_summary: do not join order_items when summing order.subtotal
-- (that multiplied revenue by the number of line items).

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
  v_days int := greatest(p_days, 1);
  v_revenue numeric(10, 2);
  v_cogs numeric(10, 2);
  v_orders bigint;
  v_fixed numeric(10, 2) := 0;
  v_variable numeric(10, 2) := 0;
  v_cost record;
begin
  select
    coalesce(sum(greatest(o.subtotal - coalesce(o.discount_amount, 0), 0)), 0),
    count(*)
  into v_revenue, v_orders
  from public.orders o
  where o.branch_id = p_branch_id
    and o.status <> 'cancelled'
    and o.created_at >= now() - (v_days || ' days')::interval;

  select coalesce(sum(oi.quantity * coalesce(oi.unit_cost, 0)), 0)
  into v_cogs
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.branch_id = p_branch_id
    and o.status <> 'cancelled'
    and o.created_at >= now() - (v_days || ' days')::interval;

  for v_cost in
    select c.cost_type, c.period, c.amount
    from public.branch_operating_costs c
    where c.branch_id = p_branch_id
      and c.is_active = true
  loop
    case v_cost.period
      when 'monthly' then
        if v_cost.cost_type = 'fixed' then
          v_fixed := v_fixed + v_cost.amount * (v_days::numeric / 30);
        else
          v_variable := v_variable + v_cost.amount * (v_days::numeric / 30);
        end if;
      when 'daily' then
        if v_cost.cost_type = 'fixed' then
          v_fixed := v_fixed + v_cost.amount * v_days;
        else
          v_variable := v_variable + v_cost.amount * v_days;
        end if;
      when 'per_order' then
        v_variable := v_variable + v_cost.amount * v_orders;
      else
        null;
    end case;
  end loop;

  return query
  select
    v_days,
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

grant execute on function public.get_profit_summary(uuid, int) to authenticated, service_role;
