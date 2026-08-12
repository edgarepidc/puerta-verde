-- Real-ops bootstrap: catalog codes, min stock, branch hours, cash float, promo targeting, media buckets.

alter type public.product_unit add value if not exists 'box';

alter table public.products
  add column if not exists sku text;

create unique index if not exists products_org_sku_unique
  on public.products (organization_id, lower(btrim(sku)))
  where sku is not null and btrim(sku) <> '';

alter table public.branch_products
  add column if not exists min_stock numeric(10, 3) not null default 5
    check (min_stock >= 0);

alter table public.branches
  add column if not exists whatsapp_phone text,
  add column if not exists opening_hours text,
  add column if not exists fulfillment_mode text not null default 'both'
    check (fulfillment_mode in ('pickup', 'delivery', 'both'));

alter table public.promotions
  add column if not exists product_id uuid references public.products (id) on delete set null,
  add column if not exists category_id uuid references public.product_categories (id) on delete set null;

alter table public.daily_cash_closings
  add column if not exists opening_float numeric(10, 2),
  add column if not exists counted_cash numeric(10, 2);

drop function if exists public.get_public_branch(text);

create or replace function public.get_public_branch(target_slug text)
returns table (
  id uuid,
  organization_id uuid,
  name text,
  slug text,
  address text,
  pickup_instructions text,
  delivery_fee numeric,
  minimum_order_amount numeric,
  whatsapp_phone text,
  opening_hours text,
  fulfillment_mode text,
  org_name text,
  org_slug text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    b.organization_id,
    b.name,
    b.slug,
    b.address,
    b.pickup_instructions,
    b.delivery_fee,
    b.minimum_order_amount,
    b.whatsapp_phone,
    b.opening_hours,
    b.fulfillment_mode,
    o.name as org_name,
    o.slug as org_slug
  from public.branches b
  join public.organizations o on o.id = b.organization_id
  where b.slug = target_slug
    and b.is_active = true
    and o.subscription_status in ('trialing', 'active');
$$;

grant execute on function public.get_public_branch(text) to anon, authenticated;

insert into storage.buckets (id, name, public)
values
  ('product-media', 'product-media', true),
  ('promo-media', 'promo-media', true)
on conflict (id) do nothing;

drop policy if exists "Public read product media" on storage.objects;
create policy "Public read product media"
on storage.objects for select
using (bucket_id in ('product-media', 'promo-media'));
