-- WhatsApp inbound: message direction, customer lookup, opt-in management

alter table public.whatsapp_message_logs
  add column if not exists direction text not null default 'outbound'
    check (direction in ('inbound', 'outbound'));

create index if not exists idx_whatsapp_logs_org_created
  on public.whatsapp_message_logs (organization_id, created_at desc);

create index if not exists idx_whatsapp_logs_direction
  on public.whatsapp_message_logs (organization_id, direction, created_at desc);

create or replace function public.normalize_phone_digits(p_phone text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
$$;

create or replace function public.phones_match(p_a text, p_b text)
returns boolean
language sql
immutable
as $$
  select right(public.normalize_phone_digits(p_a), 10) = right(public.normalize_phone_digits(p_b), 10)
    and length(public.normalize_phone_digits(p_a)) >= 10
    and length(public.normalize_phone_digits(p_b)) >= 10;
$$;

create or replace function public.resolve_whatsapp_organization(p_phone_number_id text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select wc.organization_id
  from public.whatsapp_configs wc
  where wc.phone_number_id = p_phone_number_id
    and wc.is_active = true
  limit 1;
$$;

create or replace function public.get_orders_by_customer_phone(
  p_organization_id uuid,
  p_phone text,
  p_limit int default 3
)
returns table (
  id uuid,
  order_number bigint,
  status public.order_status,
  total numeric,
  tracking_token text,
  created_at timestamptz,
  branch_name text,
  branch_slug text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.order_number,
    o.status,
    o.total,
    o.tracking_token,
    o.created_at,
    b.name as branch_name,
    b.slug as branch_slug
  from public.orders o
  join public.branches b on b.id = o.branch_id
  where o.organization_id = p_organization_id
    and public.phones_match(o.customer_phone, p_phone)
  order by o.created_at desc
  limit greatest(p_limit, 1);
$$;

create or replace function public.get_customer_whatsapp_opt_in(
  p_organization_id uuid,
  p_phone text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select c.whatsapp_opt_in
      from public.customers c
      where c.organization_id = p_organization_id
        and public.phones_match(c.phone, p_phone)
      limit 1
    ),
    true
  );
$$;

create or replace function public.set_customer_whatsapp_opt_in(
  p_organization_id uuid,
  p_phone text,
  p_opt_in boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := public.normalize_phone_digits(p_phone);
begin
  update public.customers
  set whatsapp_opt_in = p_opt_in,
      updated_at = now()
  where organization_id = p_organization_id
    and public.phones_match(phone, p_phone);

  if not found then
    insert into public.customers (organization_id, phone, whatsapp_opt_in)
    values (p_organization_id, v_phone, p_opt_in);
  end if;
end;
$$;

grant execute on function public.resolve_whatsapp_organization(text) to service_role;
grant execute on function public.get_orders_by_customer_phone(uuid, text, int) to service_role;
grant execute on function public.get_customer_whatsapp_opt_in(uuid, text) to service_role;
grant execute on function public.set_customer_whatsapp_opt_in(uuid, text, boolean) to service_role;
