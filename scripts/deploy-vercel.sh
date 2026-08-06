#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ Deploying admin (puerta-verde-admin)..."
npx vercel deploy --prod --yes --local-config vercel.admin.json --project puerta-verde-admin

echo "→ Deploying web (puerta-verde-web)..."
npx vercel deploy --prod --yes --local-config vercel.web.json --project puerta-verde-web

echo "Done."
echo "  Admin: https://puerta-verde-admin.vercel.app/login"
echo "  Web:   https://puerta-verde-web.vercel.app"
