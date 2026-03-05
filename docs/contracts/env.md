# Environment Variables Contract

> Status: maintained
> Applies to: OpenPath API (`api/`) and developer tooling
> Last verified: 2026-03-05
> Source of truth: `docs/contracts/env.md`

## OpenPath API (`api/`)

Source of truth:

- `api/src/config.ts`
- `api/.env.example`

### Database (Required)

Use one of:

- `DATABASE_URL=postgresql://...`
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

Optional:

- `DB_POOL_MAX`

### Server

- `PORT` (default `3000`)
- `HOST` (default `0.0.0.0`)
- `NODE_ENV` (`development`, `test`, `production`)
- `PUBLIC_URL` (recommended in production; used for absolute URL generation)
- `TRUST_PROXY` (set when running behind a reverse proxy)

### Auth

- `JWT_SECRET` (required in production)
- `JWT_ACCESS_EXPIRY`, `JWT_REFRESH_EXPIRY` (optional)
- `ADMIN_TOKEN` (legacy/backwards compatibility)

### Requests / Machine Proof

- `SHARED_SECRET` (required for proof validation in `/api/requests/*` flows)

### CORS

- `CORS_ORIGINS` (comma-separated; must be explicit in production)

### Swagger

- `ENABLE_SWAGGER=false` disables Swagger in non-production environments

### Optional Integrations

- Google OAuth: `GOOGLE_CLIENT_ID`
- Web push: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- Logging: `LOG_LEVEL`
- Redis: `REDIS_URL`

## React SPA (`react-spa/`)

Source of truth: `react-spa/vite.config.ts`.

- Dev server port: `PORT` (default `3001`)
- No runtime `VITE_*` environment contract; dev API access is via the Vite proxy.
