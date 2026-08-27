-- Category-level low-stock thresholds (applied to branch_products.min_stock).
alter table public.product_categories
  add column if not exists low_stock_threshold numeric(10, 3) not null default 3
    check (low_stock_threshold >= 0);

-- Seed: chiles → 0.3 kg; resto → 3
update public.product_categories
set low_stock_threshold = 0.3
where lower(name) like '%chile%';

update public.product_categories
set low_stock_threshold = 3
where lower(name) not like '%chile%';
