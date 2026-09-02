-- Hide a branch product from the store when stock hits zero.
-- Show it again only when stock comes back from empty (a restock).
-- Manual hide while there is still stock is left alone.

create or replace function public.sync_availability_from_stock()
returns trigger
language plpgsql
as $$
begin
  if new.stock <= 0 then
    new.is_available := false;
  elsif tg_op = 'UPDATE' and old.stock <= 0 and new.stock > 0 then
    new.is_available := true;
    update public.products
      set is_active = true
      where id = new.product_id
        and is_active is distinct from true;
  end if;
  return new;
end;
$$;

drop trigger if exists branch_products_availability_from_stock on public.branch_products;

create trigger branch_products_availability_from_stock
before insert or update of stock, is_available on public.branch_products
for each row execute function public.sync_availability_from_stock();

update public.branch_products
set is_available = false
where stock <= 0
  and is_available = true;
