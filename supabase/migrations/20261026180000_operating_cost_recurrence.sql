-- A gasto is monthly (Totalplay) or a single date (an adjustment).
alter table public.branch_operating_costs
  add column if not exists recurrence text not null default 'monthly';

alter table public.branch_operating_costs
  drop constraint if exists branch_operating_costs_recurrence_ok;

alter table public.branch_operating_costs
  add constraint branch_operating_costs_recurrence_ok
    check (recurrence in ('monthly', 'once'));
