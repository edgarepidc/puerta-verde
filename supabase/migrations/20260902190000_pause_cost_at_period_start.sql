-- Pausar a cost whose term starts on this period's first day closes it
-- the day before (end_date = start_date − 1). That marker lets Te quedó
-- add the amount back on a closed month without deleting the term.

alter table public.branch_operating_cost_terms
  drop constraint branch_operating_cost_terms_range_ok;

alter table public.branch_operating_cost_terms
  add constraint branch_operating_cost_terms_range_ok
  check (end_date is null or end_date >= (start_date - 1));
