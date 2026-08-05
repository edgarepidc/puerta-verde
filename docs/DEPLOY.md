# Despliegue en Vercel + Supabase

## Supabase Cloud

1. Crea proyecto en [supabase.com](https://supabase.com)
2. Enlaza el CLI: `supabase link --project-ref TU_REF`
3. Aplica migraciones: `supabase db push`
4. Ejecuta seed manualmente en SQL Editor si lo necesitas

## GitHub

1. Crea repo `puerta-verde`
2. Push del código local

## Vercel — dos proyectos

### Tienda pública (`apps/web`)

- Root directory: `apps/web`
- Framework: Next.js
- Variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_APP_URL` (URL de la tienda)
  - `WHATSAPP_*`

### Panel admin (`apps/admin`)

- Root directory: `apps/admin`
- Variables similares + `NEXT_PUBLIC_WEB_URL` (URL de la tienda para links de seguimiento)

## Dominios sugeridos

- `puertaverde.app` → tienda
- `admin.puertaverde.app` → panel
- Rutas: `puertaverde.app/{slug-sucursal}`

## Logo

Coloca tu logo en:

- `apps/web/public/brand/logo.png`
- `apps/admin/public/brand/logo.png`

Luego actualiza los `metadata.icons` en los layouts.
