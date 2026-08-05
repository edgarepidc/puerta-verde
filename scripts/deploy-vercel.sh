#!/usr/bin/env bash
# Despliega apps/web y apps/admin en Vercel con variables de .env
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f "$ROOT/.env" ]; then
  echo "Falta .env — ejecuta primero: bash scripts/create-supabase-project.sh"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a

WEB_URL=""
ADMIN_URL=""

deploy_app() {
  local app_dir="$1"
  local project_name="$2"
  local app_url_var="$3"

  echo "→ Desplegando $project_name..."
  cd "$ROOT/$app_dir"

  if [ ! -d .vercel ]; then
    npx vercel link --project "$project_name" --yes 2>/dev/null || \
      npx vercel link --yes
  fi

  npx vercel env rm NEXT_PUBLIC_SUPABASE_URL production --yes 2>/dev/null || true
  npx vercel env add NEXT_PUBLIC_SUPABASE_URL production <<< "${SUPABASE_URL}" >/dev/null
  npx vercel env rm NEXT_PUBLIC_SUPABASE_ANON_KEY production --yes 2>/dev/null || true
  npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production <<< "${SUPABASE_ANON_KEY:-$SUPABASE_ANON_KEY}" >/dev/null 2>&1 || \
    npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production <<< "$(grep ANON "$ROOT/.env" | cut -d= -f2-)" >/dev/null

  npx vercel env rm SUPABASE_SERVICE_ROLE_KEY production --yes 2>/dev/null || true
  npx vercel env add SUPABASE_SERVICE_ROLE_KEY production <<< "${SUPABASE_SERVICE_ROLE_KEY}" >/dev/null

  if [ "$app_dir" = "apps/web" ]; then
    npx vercel env rm NEXT_PUBLIC_APP_URL production --yes 2>/dev/null || true
  fi

  DEPLOY_URL="$(npx vercel deploy --prod --yes 2>&1 | tail -1)"
  echo "✓ $project_name: $DEPLOY_URL"
  eval "$app_url_var='$DEPLOY_URL'"
}

# Load anon key from apps/web env if not in root .env
ANON_KEY="${SUPABASE_ANON_KEY:-}"
if [ -z "$ANON_KEY" ] && [ -f "$ROOT/apps/web/.env.local" ]; then
  ANON_KEY="$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY "$ROOT/apps/web/.env.local" | cut -d= -f2-)"
fi
export SUPABASE_ANON_KEY="$ANON_KEY"

deploy_app "apps/web" "puerta-verde-web" WEB_URL
deploy_app "apps/admin" "puerta-verde-admin" ADMIN_URL

# Set cross-app URLs after first deploy
cd "$ROOT/apps/web"
npx vercel env rm NEXT_PUBLIC_APP_URL production --yes 2>/dev/null || true
echo "$WEB_URL" | npx vercel env add NEXT_PUBLIC_APP_URL production >/dev/null
npx vercel deploy --prod --yes >/dev/null

cd "$ROOT/apps/admin"
npx vercel env rm NEXT_PUBLIC_WEB_URL production --yes 2>/dev/null || true
echo "$WEB_URL" | npx vercel env add NEXT_PUBLIC_WEB_URL production >/dev/null
npx vercel deploy --prod --yes >/dev/null

echo ""
echo "=========================================="
echo "✅ Despliegue completo"
echo "Tienda:  $WEB_URL"
echo "Admin:   $ADMIN_URL"
echo "Demo:    $WEB_URL/puerta-verde-demo"
echo "=========================================="
