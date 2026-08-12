-- Distinguish counter (POS) vs web storefront orders for cash closing

alter table public.orders
  add column if not exists source text not null default 'web'
  check (source in ('web', 'pos'));

create index if not exists orders_branch_source_idx
  on public.orders (branch_id, source, paid_at);
