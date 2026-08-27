-- Phase A: order by piece count, charge by weighed kg at prep time.
-- products.weigh_at_fulfillment: catalog flag (price/stock stay in kg).
-- order_items.ordered_quantity: pieces the customer asked for.
-- order_items.weigh_at_fulfillment: snapshot so prep UI works without joining products.

alter table public.products
  add column if not exists weigh_at_fulfillment boolean not null default false;

alter table public.order_items
  add column if not exists ordered_quantity numeric(10, 3)
    check (ordered_quantity is null or ordered_quantity > 0);

alter table public.order_items
  add column if not exists weigh_at_fulfillment boolean not null default false;

comment on column public.products.weigh_at_fulfillment is
  'Customer orders by piece; staff weighs kg at fulfillment. Price and stock remain in kg.';

comment on column public.order_items.ordered_quantity is
  'Piece count requested when weigh_at_fulfillment; quantity holds weighed kg.';

comment on column public.order_items.weigh_at_fulfillment is
  'Snapshot of products.weigh_at_fulfillment at line creation.';
