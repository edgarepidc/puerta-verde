-- Free-text delivery department label for guest checkout autofill

alter table public.customers
  add column if not exists default_delivery_label text;

alter table public.orders
  add column if not exists delivery_unit_label text;

comment on column public.customers.default_delivery_label is
  'Last free-text department/unit label used by the customer';
comment on column public.orders.delivery_unit_label is
  'Free-text department/unit label captured at checkout';
