# Puerta Verde

Turborepo monorepo (npm workspaces, Node 20+). Two Next.js apps and a local Supabase (Postgres) backend.

- `apps/web` — public storefront (`@puertaverde/web`), dev on **http://localhost:3001**
- `apps/admin` — operations/admin panel (`@puertaverde/admin`), dev on **http://localhost:3000**
- `packages/*` — `shared`, `supabase` (typed client), `whatsapp`
- `supabase/` — Postgres migrations + `seed.sql` (demo org/branch `tienda-citte`, 6 products)

Standard setup/run commands live in `README.md` and root `package.json` scripts (`dev:web`, `dev:admin`, `db:start`, `db:reset`, `test`, `typecheck`). The notes below only cover non-obvious things.

## Cursor Cloud specific instructions

Dependencies (`npm install`, Docker engine, Supabase CLI) are already installed by the environment update script / VM snapshot. This section covers how to actually start and use the stack, plus gotchas discovered during setup.

### Starting services (order matters)

1. **Docker daemon** — there is no systemd in this VM, so Docker is not auto-started. Start it once per boot and make the socket usable by the `ubuntu` user:
   - `sudo dockerd` (run in the background, e.g. a tmux session)
   - `sudo chmod 666 /var/run/docker.sock`
2. **Supabase local stack** — `npm run db:start` (wraps `supabase start`; pulls/starts Postgres, Auth, Storage, Studio). Ports: API `54321`, DB `54322`, Studio `54323`. `npm run db:reset` re-applies migrations + `seed.sql`.
3. **Apply DB grants (REQUIRED after every `db:start`/`db:reset`)** — see gotcha below.
4. **Dev servers** — `npm run dev:web` (3001) and `npm run dev:admin` (3000), or `npm run dev` for both via turbo.

### Gotcha: local DB is unreadable by the app roles until you GRANT

The migrations create tables as the `postgres` role and never issue table-level `GRANT`s; they only define RLS policies + `GRANT EXECUTE` on functions. On current Supabase CLI, the `postgres` role's default privileges do **not** grant `SELECT`/`INSERT`/etc to `anon`, `authenticated`, or `service_role`. Result out-of-the-box: the storefront catalog is empty and the admin/API report `permission denied` / `Sucursal no encontrada`, because the apps read via the anon key (`createServerClient`) and service-role key (`createAdminClient`).

Fix (run after every reset; RLS still protects rows for anon/authenticated, service_role bypasses RLS as usual):

```bash
docker exec -i supabase_db_puerta-verde psql -U postgres -d postgres <<'SQL'
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;
SQL
```

### Env files (git-ignored; recreate if missing)

`README.md` step 2 copies the `.env.example` files. The Supabase local keys are the standard fixed demo keys (identical on every local install), printed by `supabase status -o env`. Needed:
- root `.env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `apps/web/.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL=http://localhost:3001`
- `apps/admin/.env.local`: same Supabase vars + `NEXT_PUBLIC_APP_URL=http://localhost:3000`, `NEXT_PUBLIC_WEB_URL=http://localhost:3001`, `PLATFORM_ADMIN_EMAILS=<admin email>`

WhatsApp, Stripe, and OpenAI vars are optional and degrade gracefully (no-op when unset).

### Admin panel login

The admin panel requires a Supabase Auth user; the seed does not create one. Bootstrap one (uses root `.env` for the service key):

```bash
set -a; . ./.env; set +a
ADMIN_EMAIL=admin@puertaverde.dev ADMIN_PASSWORD='PuertaVerde123!' ADMIN_NAME='Admin Demo' node scripts/create-admin-user.mjs
```

The email must be in `apps/admin/.env.local` `PLATFORM_ADMIN_EMAILS` to access `/plataforma`.

### Quality gates

- `npm run typecheck` and `npm run test` (`test:shared`) pass; these are what CI (`.github/workflows/ci.yml`) runs.
- `npm run lint` currently **fails**: no `eslint.config.js` exists in either app (ESLint 9 flat-config missing). This is pre-existing and not run in CI.

### Known pre-existing app bugs (not environment issues)

Storefront **guest checkout is broken** even with the grants applied:
- `place_guest_order` raises `column reference "order_number" is ambiguous`, so `POST /api/orders` fails for any payload.
- Separately, `apps/web/src/components/Storefront.tsx` sends order items as `branchProductId` (camelCase) but `place_guest_order` reads `branch_product_id` (snake_case).

These are code/migration bugs on this branch; do not treat them as setup problems. Verified-working core flows for smoke testing: storefront catalog browsing, and the admin panel (login + product create/edit persists to the DB).
