-- Other income and contributions land in cash or the bank account.

alter table public.income_entries
  add column paid_from public.money_pocket not null default 'account';

update public.income_entries
  set paid_from = 'cash'
  where entry_type = 'operating';

comment on column public.income_entries.paid_from is
  'Pocket that receives this inflow: cash (efectivo) or account (cuenta).';
