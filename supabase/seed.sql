-- Demo seed: verdulería de muestra (datos ficticios, no de producción).
-- Idempotente: se puede volver a correr en la base demo.

-- ---------------------------------------------------------------------------
-- Identidad
-- ---------------------------------------------------------------------------
insert into public.organizations (id, name, slug, subscription_plan, subscription_status)
values (
  'a0000000-0000-4000-8000-000000000001',
  'la Cité',
  'la-cite',
  'pro',
  'active'
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  subscription_plan = excluded.subscription_plan,
  subscription_status = excluded.subscription_status;

insert into public.branches (
  id, organization_id, name, slug, address, pickup_instructions,
  delivery_fee, minimum_order_amount, whatsapp_phone, opening_hours, fulfillment_mode
)
values (
  'b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'la Cité',
  'la-cite',
  'Planta baja, Torre A, Residencial Las Palmas',
  'Pasa por el local en planta baja. Horario: 8am – 8pm.',
  0,
  50,
  '5550001122',
  'Lun–Sáb 8:00–20:00 · Dom 9:00–14:00',
  'both'
)
on conflict (id) do update set
  address = excluded.address,
  pickup_instructions = excluded.pickup_instructions,
  whatsapp_phone = excluded.whatsapp_phone,
  opening_hours = excluded.opening_hours,
  fulfillment_mode = excluded.fulfillment_mode;

insert into public.buildings (id, branch_id, name)
values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Torre A'),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Torre B')
on conflict (id) do nothing;

insert into public.units (building_id, identifier)
select 'c0000000-0000-4000-8000-000000000001'::uuid, lpad(n::text, 3, '0')
from generate_series(101, 120) as n
on conflict (building_id, identifier) do nothing;

insert into public.units (building_id, identifier)
select 'c0000000-0000-4000-8000-000000000002'::uuid, lpad(n::text, 3, '0')
from generate_series(201, 215) as n
on conflict (building_id, identifier) do nothing;

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------
insert into public.product_categories (id, organization_id, name, sort_order)
values
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Frutas', 1),
  ('d0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Verduras', 2),
  ('d0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Semillas y granos', 3),
  ('d0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Hierbas', 4),
  ('d0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'Chiles', 5)
on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order;

insert into public.products (
  id, organization_id, category_id, name, unit, image_url, sku, shelf_life_days, is_active
)
values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Aguacate Hass', 'kg',
   'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=800&q=80', 'FR-AGU', 5, true),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Plátano dominico', 'kg',
   'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=800&q=80', 'FR-PLA', 6, true),
  ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'Jitomate saladette', 'kg',
   'https://images.unsplash.com/photo-1546470427-22782101795e?auto=format&fit=crop&w=800&q=80', 'VE-JIT', 7, true),
  ('e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'Lechuga romana', 'piece',
   'https://images.unsplash.com/photo-1622205313162-be1cf8d08da3?auto=format&fit=crop&w=800&q=80', 'VE-LEC', 4, true),
  ('e0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'Chía orgánica', 'bag',
   'https://images.unsplash.com/photo-1505576399279-565b52d4ac71?auto=format&fit=crop&w=800&q=80', 'SE-CHI', 180, true),
  ('e0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 'Avena integral', 'bag',
   'https://images.unsplash.com/photo-1517673132405-a56a62b18be5?auto=format&fit=crop&w=800&q=80', 'SE-AVE', 180, true),
  ('e0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Mango Ataulfo', 'kg',
   'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=800&q=80', 'FR-MAN', 5, true),
  ('e0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Fresa', 'kg',
   'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?auto=format&fit=crop&w=800&q=80', 'FR-FRE', 3, true),
  ('e0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Manzana Golden', 'kg',
   'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=800&q=80', 'FR-MAZ', 14, true),
  ('e0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Limón persa', 'kg',
   'https://images.unsplash.com/photo-1582284540020-8acbe03f4924?auto=format&fit=crop&w=800&q=80', 'FR-LIM', 12, true),
  ('e0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Naranja valencia', 'kg',
   'https://images.unsplash.com/photo-1547514701-42782101795e?auto=format&fit=crop&w=800&q=80', 'FR-NAR', 10, true),
  ('e0000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Papaya maradol', 'kg',
   'https://images.unsplash.com/photo-1617112848923-cc2234396a8d?auto=format&fit=crop&w=800&q=80', 'FR-PAP', 5, true),
  ('e0000000-0000-4000-8000-00000000000d', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'Cebolla blanca', 'kg',
   'https://images.unsplash.com/photo-1508741708256-c6b9d2bb0c1b?auto=format&fit=crop&w=800&q=80', 'VE-CEB', 20, true),
  ('e0000000-0000-4000-8000-00000000000e', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'Pepino', 'kg',
   'https://images.unsplash.com/photo-1449300079323-02e209d335d4?auto=format&fit=crop&w=800&q=80', 'VE-PEP', 8, true),
  ('e0000000-0000-4000-8000-00000000000f', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'Zanahoria', 'kg',
   'https://images.unsplash.com/photo-1447175008436-054170c2e197?auto=format&fit=crop&w=800&q=80', 'VE-ZAN', 14, true),
  ('e0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'Brócoli', 'piece',
   'https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?auto=format&fit=crop&w=800&q=80', 'VE-BRO', 5, true),
  ('e0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', 'Cilantro', 'bunch',
   'https://images.unsplash.com/photo-1607305387299-d4daeac075e1?auto=format&fit=crop&w=800&q=80', 'HI-CIL', 3, true),
  ('e0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', 'Perejil', 'bunch',
   'https://images.unsplash.com/photo-1606923829579-0cb981a83e2e?auto=format&fit=crop&w=800&q=80', 'HI-PER', 4, true),
  ('e0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000005', 'Chile jalapeño', 'kg',
   'https://images.unsplash.com/photo-1526346698789-22fd84314424?auto=format&fit=crop&w=800&q=80', 'CH-JAL', 8, true),
  ('e0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000005', 'Chile de árbol', 'kg',
   'https://images.unsplash.com/photo-1583119022894-71912e081cd1?auto=format&fit=crop&w=800&q=80', 'CH-ARB', 30, true)
on conflict (id) do update set
  name = excluded.name,
  category_id = excluded.category_id,
  unit = excluded.unit,
  image_url = excluded.image_url,
  sku = excluded.sku,
  shelf_life_days = excluded.shelf_life_days,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.branch_products (id, branch_id, product_id, price, stock, min_stock, is_available)
values
  ('f0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 89.00, 18.4, 3, true),
  ('f0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 28.00, 32.0, 3, true),
  ('f0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', 35.00, 22.5, 3, true),
  ('f0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000004', 18.00, 1, 3, true),
  ('f0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000005', 65.00, 15, 3, true),
  ('f0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000006', 42.00, 12, 3, true),
  ('f0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000007', 42.00, 14.2, 3, true),
  ('f0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000008', 78.00, 6.3, 3, true),
  ('f0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000009', 39.00, 20.0, 3, true),
  ('f0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000a', 32.00, 11.8, 3, true),
  ('f0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000b', 24.00, 16.5, 3, true),
  ('f0000000-0000-4000-8000-00000000000c', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000c', 29.00, 9.1, 3, true),
  ('f0000000-0000-4000-8000-00000000000d', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000d', 22.00, 25.0, 3, true),
  ('f0000000-0000-4000-8000-00000000000e', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000e', 18.00, 13.4, 3, true),
  ('f0000000-0000-4000-8000-00000000000f', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000f', 20.00, 17.7, 3, true),
  ('f0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000010', 26.00, 8, 3, true),
  ('f0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000011', 12.00, 2, 3, true),
  ('f0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000012', 12.00, 9, 3, true),
  ('f0000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000013', 48.00, 0.18, 0.3, true),
  ('f0000000-0000-4000-8000-000000000014', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000014', 95.00, 1.2, 0.3, true)
on conflict (id) do update set
  price = excluded.price,
  stock = excluded.stock,
  min_stock = excluded.min_stock,
  is_available = excluded.is_available,
  updated_at = now();

insert into public.promotions (id, branch_id, title, body, kind, is_active, product_id)
values
  (
    '19000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    '2x1 en aguacate este viernes',
    'Lleva 2 kg de aguacate Hass al precio de 1. Solo para vecinos del edificio.',
    'banner',
    true,
    'e0000000-0000-4000-8000-000000000001'
  ),
  (
    '19000000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000001',
    'Miércoles de jitomate',
    'Jitomate saladette a $28/kg todo el miércoles. Ideal para salsa.',
    'banner',
    true,
    'e0000000-0000-4000-8000-000000000003'
  )
on conflict (id) do update set
  title = excluded.title,
  body = excluded.body,
  is_active = excluded.is_active,
  product_id = excluded.product_id;

delete from public.promotions
where branch_id = 'b0000000-0000-4000-8000-000000000001'
  and id not in (
    '19000000-0000-4000-8000-000000000001',
    '19000000-0000-4000-8000-000000000002'
  );

-- ---------------------------------------------------------------------------
-- Clientes ficticios
-- ---------------------------------------------------------------------------
insert into public.customers (id, organization_id, phone, full_name, default_unit_id, whatsapp_opt_in)
select
  c.id,
  'a0000000-0000-4000-8000-000000000001'::uuid,
  c.phone,
  c.full_name,
  u.id,
  true
from (
  values
    ('11000000-0000-4000-8000-000000000001'::uuid, '5550100101', 'Ana Pérez', '101'),
    ('11000000-0000-4000-8000-000000000002'::uuid, '5550100102', 'Luis Mora', '108'),
    ('11000000-0000-4000-8000-000000000003'::uuid, '5550100103', 'Sofía Rey', '204'),
    ('11000000-0000-4000-8000-000000000004'::uuid, '5550100104', 'Diego Lara', '115'),
    ('11000000-0000-4000-8000-000000000005'::uuid, '5550100105', 'Mariana Sol', '201'),
    ('11000000-0000-4000-8000-000000000006'::uuid, '5550100106', 'Pablo Núñez', '210')
) as c(id, phone, full_name, unit_identifier)
join public.units u on u.identifier = c.unit_identifier
join public.buildings b on b.id = u.building_id and b.branch_id = 'b0000000-0000-4000-8000-000000000001'
on conflict (id) do update set
  full_name = excluded.full_name,
  default_unit_id = excluded.default_unit_id;

-- ---------------------------------------------------------------------------
-- Pedidos (kanban + historial)
-- ---------------------------------------------------------------------------
insert into public.orders (
  id, branch_id, organization_id, customer_id, order_number, customer_name, customer_phone,
  fulfillment_type, unit_id, delivery_notes, status, subtotal, delivery_fee, total,
  payment_method, payment_status, paid_at, source, created_at
)
select
  o.id,
  'b0000000-0000-4000-8000-000000000001'::uuid,
  'a0000000-0000-4000-8000-000000000001'::uuid,
  o.customer_id,
  o.order_number,
  o.customer_name,
  o.customer_phone,
  o.fulfillment_type::public.fulfillment_type,
  u.id,
  o.delivery_notes,
  o.status::public.order_status,
  o.subtotal,
  0,
  o.total,
  o.payment_method::public.payment_method,
  o.payment_status::public.payment_status,
  o.paid_at,
  o.source,
  o.created_at
from (
  values
    -- Hoy, vivos en el tablero
    ('12000000-0000-4000-8000-000000000001'::uuid, '11000000-0000-4000-8000-000000000001'::uuid, 1011, 'Ana Pérez', '5550100101',
     'delivery', '101', 'Dejar con el velador si no hay nadie', 'pending', 170.00, 170.00, 'transfer', 'pending',
     null::timestamptz, 'web', timezone('America/Mexico_City', now()) - interval '25 minutes'),
    ('12000000-0000-4000-8000-000000000002'::uuid, '11000000-0000-4000-8000-000000000002'::uuid, 1012, 'Luis Mora', '5550100102',
     'pickup', '108', null, 'preparing', 98.00, 98.00, 'cash', 'pending',
     null, 'web', timezone('America/Mexico_City', now()) - interval '50 minutes'),
    ('12000000-0000-4000-8000-000000000003'::uuid, '11000000-0000-4000-8000-000000000003'::uuid, 1013, 'Sofía Rey', '5550100103',
     'delivery', '204', 'Torre B, dejar en recepción', 'preparing', 127.00, 127.00, 'card_terminal', 'paid',
     timezone('America/Mexico_City', now()) - interval '10 minutes', 'web', timezone('America/Mexico_City', now()) - interval '80 minutes'),
    ('12000000-0000-4000-8000-000000000004'::uuid, '11000000-0000-4000-8000-000000000004'::uuid, 1014, 'Diego Lara', '5550100104',
     'delivery', '115', null, 'delivered', 177.50, 177.50, 'transfer', 'paid',
     timezone('America/Mexico_City', now()) - interval '30 minutes', 'web', timezone('America/Mexico_City', now()) - interval '2 hours'),
    -- Mostrador de hoy (ya cobrados)
    ('12000000-0000-4000-8000-000000000005'::uuid, '11000000-0000-4000-8000-000000000005'::uuid, 1015, 'Mariana Sol', '5550100105',
     'pickup', '201', null, 'delivered', 89.00, 89.00, 'cash', 'paid',
     timezone('America/Mexico_City', now()) - interval '3 hours', 'pos', timezone('America/Mexico_City', now()) - interval '3 hours'),
    ('12000000-0000-4000-8000-000000000006'::uuid, '11000000-0000-4000-8000-000000000006'::uuid, 1016, 'Pablo Núñez', '5550100106',
     'pickup', '210', null, 'delivered', 64.00, 64.00, 'card_terminal', 'paid',
     timezone('America/Mexico_City', now()) - interval '4 hours', 'pos', timezone('America/Mexico_City', now()) - interval '4 hours'),
    -- Ayer
    ('12000000-0000-4000-8000-000000000007'::uuid, '11000000-0000-4000-8000-000000000001'::uuid, 1008, 'Ana Pérez', '5550100101',
     'delivery', '101', null, 'delivered', 156.00, 156.00, 'transfer', 'paid',
     timezone('America/Mexico_City', now()) - interval '20 hours', 'web', timezone('America/Mexico_City', now()) - interval '22 hours'),
    ('12000000-0000-4000-8000-000000000008'::uuid, '11000000-0000-4000-8000-000000000002'::uuid, 1009, 'Luis Mora', '5550100102',
     'pickup', '108', null, 'delivered', 120.00, 120.00, 'cash', 'paid',
     timezone('America/Mexico_City', now()) - interval '26 hours', 'pos', timezone('America/Mexico_City', now()) - interval '26 hours'),
    ('12000000-0000-4000-8000-000000000009'::uuid, '11000000-0000-4000-8000-000000000003'::uuid, 1010, 'Sofía Rey', '5550100103',
     'delivery', '204', null, 'cancelled', 78.00, 78.00, 'transfer', 'pending',
     null, 'web', timezone('America/Mexico_City', now()) - interval '18 hours')
) as o(id, customer_id, order_number, customer_name, customer_phone, fulfillment_type, unit_identifier, delivery_notes, status, subtotal, total, payment_method, payment_status, paid_at, source, created_at)
join public.units u on u.identifier = o.unit_identifier
join public.buildings b on b.id = u.building_id and b.branch_id = 'b0000000-0000-4000-8000-000000000001'
on conflict (id) do update set
  status = excluded.status,
  payment_status = excluded.payment_status,
  paid_at = excluded.paid_at,
  source = excluded.source,
  total = excluded.total,
  updated_at = now();

select setval('public.order_number_seq', greatest(1016, (select coalesce(max(order_number), 1000) from public.orders)));

insert into public.order_items (id, order_id, branch_product_id, product_name, unit, quantity, unit_price, line_total)
values
  ('13000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'Aguacate Hass', 'kg', 1.00, 89.00, 89.00),
  ('13000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000003', 'Jitomate saladette', 'kg', 1.00, 35.00, 35.00),
  ('13000000-0000-4000-8000-000000000003', '12000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-00000000000d', 'Cebolla blanca', 'kg', 1.00, 22.00, 22.00),
  ('13000000-0000-4000-8000-000000000004', '12000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011', 'Cilantro', 'bunch', 2, 12.00, 24.00),
  ('13000000-0000-4000-8000-000000000005', '12000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002', 'Plátano dominico', 'kg', 2.00, 28.00, 56.00),
  ('13000000-0000-4000-8000-000000000006', '12000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000007', 'Mango Ataulfo', 'kg', 1.00, 42.00, 42.00),
  ('13000000-0000-4000-8000-000000000007', '12000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000008', 'Fresa', 'kg', 0.50, 78.00, 39.00),
  ('13000000-0000-4000-8000-000000000008', '12000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000004', 'Lechuga romana', 'piece', 2, 18.00, 36.00),
  ('13000000-0000-4000-8000-000000000009', '12000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000010', 'Brócoli', 'piece', 2, 26.00, 52.00),
  ('13000000-0000-4000-8000-00000000000a', '12000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000001', 'Aguacate Hass', 'kg', 1.50, 89.00, 133.50),
  ('13000000-0000-4000-8000-00000000000b', '12000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-00000000000a', 'Limón persa', 'kg', 1.00, 32.00, 32.00),
  ('13000000-0000-4000-8000-00000000000c', '12000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000013', 'Chile jalapeño', 'kg', 0.25, 48.00, 12.00),
  ('13000000-0000-4000-8000-00000000000d', '12000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000001', 'Aguacate Hass', 'kg', 1.00, 89.00, 89.00),
  ('13000000-0000-4000-8000-00000000000e', '12000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-00000000000b', 'Naranja valencia', 'kg', 2.00, 24.00, 48.00),
  ('13000000-0000-4000-8000-00000000000f', '12000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-00000000000a', 'Limón persa', 'kg', 0.50, 32.00, 16.00),
  ('13000000-0000-4000-8000-000000000010', '12000000-0000-4000-8000-000000000007', 'f0000000-0000-4000-8000-000000000009', 'Manzana Golden', 'kg', 2.00, 39.00, 78.00),
  ('13000000-0000-4000-8000-000000000011', '12000000-0000-4000-8000-000000000007', 'f0000000-0000-4000-8000-000000000008', 'Fresa', 'kg', 1.00, 78.00, 78.00),
  ('13000000-0000-4000-8000-000000000012', '12000000-0000-4000-8000-000000000008', 'f0000000-0000-4000-8000-000000000003', 'Jitomate saladette', 'kg', 2.00, 35.00, 70.00),
  ('13000000-0000-4000-8000-000000000013', '12000000-0000-4000-8000-000000000008', 'f0000000-0000-4000-8000-00000000000e', 'Pepino', 'kg', 1.00, 18.00, 18.00),
  ('13000000-0000-4000-8000-000000000014', '12000000-0000-4000-8000-000000000008', 'f0000000-0000-4000-8000-00000000000f', 'Zanahoria', 'kg', 1.60, 20.00, 32.00),
  ('13000000-0000-4000-8000-000000000015', '12000000-0000-4000-8000-000000000009', 'f0000000-0000-4000-8000-000000000008', 'Fresa', 'kg', 1.00, 78.00, 78.00)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Proveedores y compras
-- ---------------------------------------------------------------------------
insert into public.suppliers (id, organization_id, name, phone, notes, is_active)
values
  ('14000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Central de Abasto', '5550200201', 'Nave A, pasillo 12. Mejor ir temprano.', true),
  ('14000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Productores Mixquic', '5550200202', 'Hierbas y chile de milpa.', true)
on conflict (id) do update set name = excluded.name, notes = excluded.notes;

insert into public.purchases (id, branch_id, supplier_id, purchased_at, notes, total_amount)
values
  ('15000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000001',
   (timezone('America/Mexico_City', now()))::date - 1, 'Carga de frutas de temporada', 2480.00),
  ('15000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', '14000000-0000-4000-8000-000000000002',
   (timezone('America/Mexico_City', now()))::date, 'Hierbas y chile', 420.00)
on conflict (id) do update set
  purchased_at = excluded.purchased_at,
  notes = excluded.notes,
  total_amount = excluded.total_amount;

insert into public.purchase_items (id, purchase_id, branch_product_id, quantity, unit_price, quality)
values
  ('16000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 20, 52.00, 'premium'),
  ('16000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 25, 12.00, 'normal'),
  ('16000000-0000-4000-8000-000000000003', '15000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000003', 20, 16.00, 'normal'),
  ('16000000-0000-4000-8000-000000000004', '15000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000007', 12, 22.00, 'premium'),
  ('16000000-0000-4000-8000-000000000005', '15000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000008', 8, 45.00, 'normal'),
  ('16000000-0000-4000-8000-000000000006', '15000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000011', 20, 6.00, 'normal'),
  ('16000000-0000-4000-8000-000000000007', '15000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000013', 3, 28.00, 'saldo')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Gastos y corte de caja de ayer
-- ---------------------------------------------------------------------------
insert into public.expenses (id, branch_id, organization_id, concept, amount, expense_date, notes)
values
  ('17000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'Gasolina', 350.00, (timezone('America/Mexico_City', now()))::date, 'Ida a central'),
  ('17000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'Bolsas plásticas', 180.00, (timezone('America/Mexico_City', now()))::date - 1, 'Paquete de 1 kg'),
  ('17000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'Estacionamiento', 40.00, (timezone('America/Mexico_City', now()))::date - 1, null),
  ('17000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
   'Empaque / cajas', 95.00, (timezone('America/Mexico_City', now()))::date - 2, null)
on conflict (id) do update set
  amount = excluded.amount,
  expense_date = excluded.expense_date,
  notes = excluded.notes;

insert into public.daily_cash_closings (
  id, branch_id, closing_date, cash_total, card_terminal_total, transfer_total,
  opening_float, counted_cash, notes
)
values (
  '18000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  (timezone('America/Mexico_City', now()))::date - 1,
  1840.00,
  420.00,
  156.00,
  500.00,
  1845.00,
  'Sobra $5. Cierre de muestra.'
)
on conflict (id) do update set
  cash_total = excluded.cash_total,
  card_terminal_total = excluded.card_terminal_total,
  transfer_total = excluded.transfer_total,
  opening_float = excluded.opening_float,
  counted_cash = excluded.counted_cash,
  notes = excluded.notes;
