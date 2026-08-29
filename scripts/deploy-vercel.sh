#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ Deploying admin (puerta-verde-admin)..."
npx vercel deploy --prod --yes --local-config vercel.admin.json --project puerta-verde-admin

echo "→ Deploying web (puerta-verde-web)..."
npx vercel deploy --prod --yes --local-config vercel.web.json --project puerta-verde-web

echo "Done."
echo "  Admin: https://admin.puertaverde.com.mx/login"
echo "  Web:   https://puertaverde.com.mx"
echo "  (Demo pausado — no se despliega. Reactívalo en Vercel/Supabase si lo necesitas.)"
