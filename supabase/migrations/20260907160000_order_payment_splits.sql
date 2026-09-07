-- Mixed POS payments: cash + TPV (or transfer) on the same ticket.
-- payment_method stays as the primary (largest) method for older queries.

alter table public.orders
  add column if not exists payment_splits jsonb;

comment on column public.orders.payment_splits is
  'Optional list of {method, amount} when a ticket is paid with more than one method.';
