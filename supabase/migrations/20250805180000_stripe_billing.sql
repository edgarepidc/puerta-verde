-- Stripe billing and online order payments

alter table public.organizations
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists trial_ends_at timestamptz default (now() + interval '14 days');

alter table public.orders
  add column if not exists stripe_checkout_session_id text;

create index if not exists idx_organizations_stripe_customer
  on public.organizations (stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists idx_orders_stripe_checkout
  on public.orders (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
