# Routes and Ports Contract

> Status: maintained
> Applies to: OpenPath API + React SPA + endpoint agents
> Last verified: 2026-03-05
> Source of truth: `docs/contracts/routes-ports.md`

## Local Development Ports (Defaults)

- API: `http://localhost:3000` (`api/`)
- React SPA dev server: `http://localhost:3001` (`react-spa/`)
  - Proxies `/trpc/*` and `/api/*` to `http://localhost:3000`
- PostgreSQL (dev): `localhost:5432` (`api/docker-compose.yml`)

## API HTTP Surfaces (Stable)

Source of truth: `api/src/server.ts`.

- Health: `GET /health`
- tRPC: `/trpc/*` (mounted at `/trpc`)
- Swagger (when enabled):
  - `GET /api-docs`
  - `GET /api-docs.json`
- Whitelist exports (consumed by endpoint agents):
  - `GET /export/:name.txt`
  - `GET /w/:machineToken/whitelist.txt`
- Setup (first admin + registration token):
  - `GET /api/setup/status`
  - `POST /api/setup/first-admin`
  - `GET /api/setup/registration-token`
  - `POST /api/setup/regenerate-token`
  - `POST /api/setup/validate-token`
- Domain request intake (Firefox extension / clients):
  - `POST /api/requests/submit`
  - `POST /api/requests/auto`
- Machines SSE:
  - `GET /api/machines/events` (Server-Sent Events; reverse proxies must disable buffering)

## Notes

- These paths are consumed by endpoint agents and first-party clients. Renaming requires coordinated changes.
