# OpenPath API

Express + tRPC API backed by PostgreSQL.

This service provides authentication, whitelist groups/rules, classroom + machine enrollment, schedules, health reports, and the public whitelist export endpoints used by endpoint agents.

## Quick Start (Local Dev)

Prerequisites:

- Node.js >= 20
- Docker (recommended for PostgreSQL)

From the OpenPath repo root:

```bash
npm install

cp api/.env.example api/.env

# Start PostgreSQL (optional helper)
docker compose -f api/docker-compose.yml up -d db

# Apply schema (runs Drizzle push)
npm run db:push --workspace=@openpath/api

# Start API (http://localhost:3000)
npm run dev --workspace=@openpath/api
```

Health check:

```bash
curl -sf http://localhost:3000/health
```

## API Surfaces

- **tRPC**: `/trpc/*` (used by the web UI and other first-party clients)
- **REST** (agents + extension + utilities):
  - Setup: `/api/setup/*`
  - Requests (Firefox extension): `POST /api/requests/submit`, `POST /api/requests/auto`
  - Whitelist exports: `GET /export/:name.txt`, `GET /w/:machineToken/whitelist.txt`
  - Windows agent bootstrap + enrollment helpers: `/api/agent/windows/*`, `/api/enroll/*`
  - Server-Sent Events: `GET /api/machines/events` (reverse proxies must disable buffering)

## Swagger / OpenAPI (Optional)

When enabled, interactive docs are served at:

- `http://localhost:3000/api-docs`
- `http://localhost:3000/api-docs.json`

Swagger is enabled by default in non-production and can be disabled with `ENABLE_SWAGGER=false`.

## Configuration

See `api/.env.example`. Highlights:

- **Database**: `DATABASE_URL` (preferred) or `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`
- **Auth**: `JWT_SECRET` (required in production)
- **Extension / machine proof**: `SHARED_SECRET` (required for `/api/requests/*` proof validation)
- **CORS**: `CORS_ORIGINS` (must be explicit in production)

GitHub integration env vars (`GITHUB_*`) remain for legacy flows but are deprecated.

## Tests

From the OpenPath repo root:

```bash
npm run test --workspace=@openpath/api

# Or targeted suites
npm run test:auth --workspace=@openpath/api
npm run test:setup --workspace=@openpath/api
npm run test:e2e --workspace=@openpath/api
```

For the full local verification workflow, see `../AGENTS.md`.
