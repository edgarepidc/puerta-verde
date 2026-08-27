-- Collapse unused kanban states into preparing. Enum values stay for old rows/clients.
update public.orders
set status = 'preparing',
    updated_at = now()
where status in ('ready', 'out_for_delivery');
