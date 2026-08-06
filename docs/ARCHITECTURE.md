# Puerta Verde — Arquitectura

## Visión

SaaS multi-sucursal para verdulerías con pedidos guest, WhatsApp y panel operativo.

## Capas

| Capa | Tecnología | Responsabilidad |
|------|------------|-----------------|
| Tienda pública | `apps/web` (Next.js) | Catálogo, checkout sin registro, seguimiento |
| Panel admin | `apps/admin` (Next.js) | Pedidos, inventario, finanzas, configuración |
| API / webhooks | Route handlers en Next.js | Pedidos, WhatsApp, pagos |
| Datos | Supabase Postgres + RLS | Multi-tenant, RPCs seguras |
| Mensajería | Meta WhatsApp Cloud API | Confirmaciones y estados |

## Modelo multi-tenant

```
organizations (tenant)
  └── branches (sucursales)
        ├── buildings → units (entrega en edificio)
        ├── products → branch_products (precio/stock)
        ├── promotions (avisos públicos)
        ├── orders → order_items
        └── staff_memberships
```

## Pedidos sin registro

1. Cliente llena formulario en tienda pública.
2. `place_guest_order()` valida sucursal, productos y mínimo.
3. Se crea/actualiza `customers` por teléfono.
4. Se devuelve `tracking_token` para seguimiento.
5. WhatsApp confirma el pedido.

## Seguridad

- RLS por organización/sucursal para staff autenticado.
- Lectura pública limitada a catálogo y RPCs (`get_public_branch`, `get_order_by_tracking_token`).
- Escritura de pedidos solo vía RPC `place_guest_order` (service role en API route).

## Próximos sprints

- Super admin de plataforma crea verdulerías desde `/plataforma` (sin registro público)
- Stripe / planes SaaS opcionales por organización
