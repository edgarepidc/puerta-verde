-- Inverse of a cash deposit: take money from the bank account into the till
-- (e.g. cash for the central market). Existing rows stay "to the account".

alter table public.cash_withdrawals
  add column destination public.money_pocket not null default 'account';

comment on column public.cash_withdrawals.destination is
  'Pocket that receives the money. account = cash deposited at the bank; cash = taken from the account for the till.';
