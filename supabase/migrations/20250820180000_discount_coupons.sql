-- Discount coupons (code-based % or fixed amount) + order-level discount fields.

create type public.coupon_discount_type as enum ('percent', 'fixed');

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  code text not null,
  description text,
  discount_type public.coupon_discount_type not null,
  discount_value numeric(10, 2) not null check (discount_value > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  max_uses int check (max_uses is null or max_uses > 0),
  times_used int not null default 0 check (times_used >= 0),
  min_order_amount numeric(10, 2) check (min_order_amount is null or min_order_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_code_nonempty check (length(trim(code)) > 0),
  constraint coupons_percent_range check (
    discount_type <> 'percent' or (discount_value > 0 and discount_value <= 100)
  ),
  constraint coupons_dates_ok check (
    starts_at is null or ends_at is null or ends_at >= starts_at
  )
);

create unique index coupons_branch_code_uidx
  on public.coupons (branch_id, lower(trim(code)));

create index coupons_branch_active_idx
  on public.coupons (branch_id, is_active);

alter table public.orders
  add column if not exists coupon_id uuid references public.coupons (id) on delete set null,
  add column if not exists coupon_code text,
  add column if not exists discount_amount numeric(10, 2) not null default 0
    check (discount_amount >= 0);

create index orders_coupon_id_idx on public.orders (coupon_id)
  where coupon_id is not null;

alter table public.coupons enable row level security;

create policy "staff read coupons" on public.coupons
  for select to authenticated
  using (public.is_staff_of_branch(branch_id));

create policy "staff manage coupons" on public.coupons
  for all to authenticated
  using (public.is_staff_of_branch(branch_id))
  with check (public.is_staff_of_branch(branch_id));
