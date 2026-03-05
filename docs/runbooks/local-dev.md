# Runbook: Local Development (API + SPA)

> Status: maintained
> Applies to: local development
> Last verified: 2026-03-05
> Source of truth: `docs/runbooks/local-dev.md`

## Prerequisites

- Node.js >= 20
- Docker (recommended for PostgreSQL)

## Steps

From the repo root:

```bash
npm install

cp api/.env.example api/.env

docker compose -f api/docker-compose.yml up -d db
npm run db:push --workspace=@openpath/api

# Terminal 1: API
npm run dev --workspace=@openpath/api

# Terminal 2: SPA
npm run dev --workspace=@openpath/react-spa
```

## Checks

```bash
curl -sf http://localhost:3000/health
```

- SPA: `http://localhost:3001` (proxies `/api/*` + `/trpc/*` to `:3000`)

## Common Issues

- Port conflicts: adjust `PORT` in `api/.env` or stop the conflicting process.
- SPA cannot reach API: ensure the API is running on `http://localhost:3000` (see `react-spa/vite.config.ts`).
