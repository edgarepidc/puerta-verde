-- Low-stock defaults: most units < 3; chiles (kg) < 0.3 kg (300 g).
alter table public.branch_products
  alter column min_stock set default 3;

update public.branch_products bp
set min_stock = 3
where coalesce(
  (select lower(p.name) from public.products p where p.id = bp.product_id),
  ''
) not like '%chile%';

update public.branch_products bp
set min_stock = 0.3
where exists (
  select 1
  from public.products p
  left join public.product_categories c on c.id = p.category_id
  where p.id = bp.product_id
    and (
      lower(p.name) like '%chile%'
      or lower(coalesce(c.name, '')) like '%chile%'
    )
    and p.unit = 'kg'
);
