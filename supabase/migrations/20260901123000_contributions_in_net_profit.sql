-- Capital contributions enter estimated net profit (Te quedó), same as operating income.

drop function if exists public.get_profit_summary(uuid, date, date);

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
  visit_expenses numeric,
  other_income numeric,
  contributions numeric,
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
  v_same_month boolean;
  v_full_month_fixed boolean;
  v_revenue numeric(10, 2);
  v_cogs numeric(10, 2);
  v_orders bigint;
  v_fixed numeric(10, 2) := 0;
  v_variable numeric(10, 2) := 0;
  v_visit numeric(10, 2) := 0;
  v_other_income numeric(10, 2) := 0;
  v_contributions numeric(10, 2) := 0;
  v_cost record;
begin
  v_start := least(p_start, p_end);
  v_end := greatest(p_start, p_end);
  v_period_days := greatest((v_end - v_start) + 1, 1);

  v_range_start := (v_start::timestamp at time zone v_tz);
  v_range_end := ((v_end + 1)::timestamp at time zone v_tz);

  v_same_month := date_trunc('month', v_start::timestamp) = date_trunc('month', v_end::timestamp);
  v_full_month_fixed := v_same_month and extract(day from v_start) = 1;

  if v_same_month then
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
          if v_full_month_fixed then
            v_fixed := v_fixed + v_cost.amount;
          else
            v_fixed := v_fixed + v_cost.amount * (v_period_days::numeric / v_month_div);
          end if;
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

  select coalesce(sum(e.amount), 0)
  into v_visit
  from public.expenses e
  where e.branch_id = p_branch_id
    and e.expense_date >= v_start
    and e.expense_date <= v_end;

  select coalesce(sum(i.amount), 0)
  into v_other_income
  from public.income_entries i
  where i.branch_id = p_branch_id
    and i.entry_type = 'operating'
    and i.entry_date >= v_start
    and i.entry_date <= v_end;

  select coalesce(sum(i.amount), 0)
  into v_contributions
  from public.income_entries i
  where i.branch_id = p_branch_id
    and i.entry_type = 'contribution'
    and i.entry_date >= v_start
    and i.entry_date <= v_end;

  return query
  select
    v_period_days,
    v_revenue,
    round(v_cogs, 2),
    round(v_revenue - v_cogs, 2),
    case when v_revenue > 0 then round(((v_revenue - v_cogs) / v_revenue) * 100, 1) else 0 end,
    round(v_fixed, 2),
    round(v_variable + v_visit, 2),
    round(v_visit, 2),
    round(v_other_income, 2),
    round(v_contributions, 2),
    round(v_fixed + v_variable + v_visit, 2),
    round(v_revenue - v_cogs - v_fixed - v_variable - v_visit + v_other_income + v_contributions, 2),
    v_orders;
end;
$$;

grant execute on function public.get_profit_summary(uuid, date, date) to authenticated, service_role;
