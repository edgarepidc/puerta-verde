# Puerta Verde

Plataforma SaaS multi-sucursal para verdulerías — inventario, finanzas, pedidos y WhatsApp.

## Estructura

```
puerta-verde/
├── apps/
│   ├── web/        # Next.js — tienda pública (clientes vecinos)
│   └── admin/      # Next.js — panel de sucursal y organización
├── packages/
│   ├── shared/     # Tipos, constantes y validaciones
│   ├── supabase/   # Cliente Supabase tipado
│   └── whatsapp/   # Plantillas y envío WhatsApp
└── supabase/
    ├── migrations/ # Esquema Postgres + RLS multi-tenant
    └── seed.sql    # Datos demo
```

## Requisitos

- Node.js 20+
- Docker Desktop (Supabase local)
- Cuentas en [Supabase](https://supabase.com), [Vercel](https://vercel.com) y [GitHub](https://github.com)

## Inicio rápido

### 1. Instalar dependencias

```bash
npm install
```

### 2. Variables de entorno

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
```

### 3. Supabase local

```bash
npm run db:start
npm run db:reset
```

Copia las credenciales de `supabase start` en tus archivos `.env`.

### 4. Desarrollo

```bash
# Tienda pública — http://localhost:3001
npm run dev:web

# Panel admin — http://localhost:3000
npm run dev:admin
```

Demo: tienda en [http://localhost:3001/la-cite](http://localhost:3001/la-cite)

## Módulos

| Módulo | Web | Admin | Estado |
|--------|-----|-------|--------|
| Catálogo público | ✅ | ✅ productos | MVP |
| Pedidos guest | ✅ | ✅ kanban | MVP |
| Entrega / recoger | ✅ | ✅ | MVP |
| WhatsApp | ✅ webhook | ✅ config | MVP |
| Inventario | — | 🔜 | Sprint 4 |
| Finanzas | — | 🔜 | Sprint 4 |
| Onboarding SaaS | — | 🔜 | Sprint 5 |

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [Configuración WhatsApp](docs/WHATSAPP_SETUP.md)
- [Despliegue Vercel](docs/DEPLOY.md)

## Base de datos

- Multi-tenant: `organizations` → `branches` → `buildings` → `units`
- Pedidos sin registro: clientes por teléfono + token de seguimiento
- RLS en todas las tablas
