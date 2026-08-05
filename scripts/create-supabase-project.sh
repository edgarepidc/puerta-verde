#!/usr/bin/env bash
# Crea el proyecto Supabase de Puerta Verde y configura variables locales.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT_NAME="${PV_SUPABASE_PROJECT_NAME:-puerta-verde-prod}"
REGION="${PV_SUPABASE_REGION:-us-east-1}"

echo "==> Puerta Verde — Crear proyecto Supabase"
echo ""

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  if [ -f "$HOME/.supabase/access-token" ]; then
    export SUPABASE_ACCESS_TOKEN="$(cat "$HOME/.supabase/access-token")"
    echo "✓ Token encontrado en ~/.supabase/access-token"
  else
    echo "Autentícate en Supabase primero:"
    echo "  npx supabase login"
    echo ""
    echo "O exporta un token:"
    echo "  export SUPABASE_ACCESS_TOKEN='...'  # https://supabase.com/dashboard/account/tokens"
    exit 1
  fi
fi

echo "→ Listando organizaciones..."
ORGS_JSON="$(npx supabase orgs list -o json 2>/dev/null || npx supabase orgs list --output json)"
ORG_ID="$(echo "$ORGS_JSON" | node -e "
  const fs = require('fs');
  const input = fs.readFileSync(0, 'utf8');
  const data = JSON.parse(input);
  const orgs = Array.isArray(data) ? data : data.organizations ?? [];
  if (!orgs.length) process.exit(2);
  console.log(orgs[0].id);
")" || {
  echo "No se encontró organización en Supabase."
  exit 1
}

if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
  SUPABASE_DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
  echo "→ Contraseña de BD generada (guárdala)"
fi

echo "→ Creando proyecto '$PROJECT_NAME'..."
CREATE_OUT="$(npx supabase projects create "$PROJECT_NAME" \
  --org-id "$ORG_ID" \
  --db-password "$SUPABASE_DB_PASSWORD" \
  --region "$REGION" \
  -o json 2>&1)" || true

PROJECT_REF="$(echo "$CREATE_OUT" | node -e "
  const fs = require('fs');
  const input = fs.readFileSync(0, 'utf8');
  try {
    const data = JSON.parse(input);
    console.log(data.id || data.ref || '');
  } catch {
    const m = input.match(/[a-z]{20}/);
    if (m) console.log(m[0]);
  }
" 2>/dev/null || true)"

if [ -z "$PROJECT_REF" ]; then
  PROJECT_REF="$(npx supabase projects list -o json | node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync(0, 'utf8'));
    const projects = Array.isArray(data) ? data : data.projects ?? [];
    const p = projects.find(x => (x.name || '').includes('puerta-verde')) || projects[0];
    if (p) console.log(p.id || p.ref);
  ")"
fi

echo "✓ Proyecto: $PROJECT_REF"
echo "→ Esperando 45s a que el proyecto esté listo..."
sleep 45

KEYS_JSON="$(npx supabase projects api-keys --project-ref "$PROJECT_REF" -o json)"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
ANON_KEY="$(echo "$KEYS_JSON" | node -e "
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync(0, 'utf8'));
  const keys = Array.isArray(data) ? data : data.api_keys ?? [];
  const anon = keys.find(k => k.name === 'anon' || k.type === 'anon');
  console.log(anon?.api_key || anon?.key || '');
")"
SERVICE_KEY="$(echo "$KEYS_JSON" | node -e "
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync(0, 'utf8'));
  const keys = Array.isArray(data) ? data : data.api_keys ?? [];
  const svc = keys.find(k => k.name === 'service_role' || k.type === 'service_role');
  console.log(svc?.api_key || svc?.key || '');
")"

cat > "$ROOT/.env" <<EOF
SUPABASE_URL=$SUPABASE_URL
SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY
SUPABASE_DB_PASSWORD=$SUPABASE_DB_PASSWORD
SUPABASE_PROJECT_REF=$PROJECT_REF
EOF

cat > "$ROOT/apps/web/.env.local" <<EOF
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3001
WHATSAPP_VERIFY_TOKEN=puerta-verde-dev
EOF

cat > "$ROOT/apps/admin/.env.local" <<EOF
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_WEB_URL=http://localhost:3001
EOF

npx supabase link --project-ref "$PROJECT_REF" --password "$SUPABASE_DB_PASSWORD" --yes
npx supabase db push --yes

echo ""
echo "✅ Supabase listo: https://supabase.com/dashboard/project/$PROJECT_REF"
echo "   Ejecuta: bash scripts/deploy-vercel.sh"
