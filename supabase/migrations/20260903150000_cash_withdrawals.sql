-- Cash withdrawals: physical cash taken from the register and deposited into the bank account.
-- Each withdrawal moves money from the cash pocket to the account pocket.

create table public.cash_withdrawals (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  withdrawn_at timestamptz not null default now(),
  withdrawal_date date not null default (timezone('America/Mexico_City', now()))::date,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index cash_withdrawals_branch_idx
  on public.cash_withdrawals (branch_id, withdrawal_date desc);

alter table public.cash_withdrawals enable row level security;

create policy "staff manage cash withdrawals" on public.cash_withdrawals
  for all to authenticated
  using (public.is_staff_of_branch(branch_id))
  with check (public.is_staff_of_branch(branch_id));
