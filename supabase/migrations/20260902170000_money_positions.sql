-- Declared cash-in-hand vs bank (TPV / transfers) at a date.
-- Used to correct the first months when payment methods were mixed up.

create table public.branch_money_positions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  as_of_date date not null,
  cash_amount numeric(10, 2) not null check (cash_amount >= 0),
  account_amount numeric(10, 2) not null check (account_amount >= 0),
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, as_of_date)
);

create index branch_money_positions_branch_idx
  on public.branch_money_positions (branch_id, as_of_date desc);

alter table public.branch_money_positions enable row level security;

create policy "staff manage money positions" on public.branch_money_positions
  for all to authenticated
  using (public.is_staff_of_branch(branch_id))
  with check (public.is_staff_of_branch(branch_id));
