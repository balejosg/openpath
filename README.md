# OpenPath

[![CI](https://github.com/balejosg/openpath/actions/workflows/ci.yml/badge.svg)](https://github.com/balejosg/openpath/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/balejosg/openpath/branch/main/graph/badge.svg)](https://codecov.io/gh/balejosg/openpath)

Strict internet access control for classrooms, labs, and shared environments.

OpenPath is a "default-deny" system: if a domain isn't explicitly allowed, it effectively doesn't exist for clients.

## What You Get

- Endpoint enforcement (Linux Bash agent + Windows PowerShell agent)
- Multi-layer filtering: DNS sinkhole + firewall + browser policies
- Central control plane: Express + tRPC API backed by PostgreSQL
- Web dashboard: Vite + React SPA
- Whitelist distribution as a plain text format fetched over HTTP
- Optional Firefox extension for blocked-domain detection and request submission

## Repository Layout

- `linux/` - Linux endpoint agent (dnsmasq + firewall + systemd)
- `windows/` - Windows endpoint agent (Acrylic DNS Proxy + firewall)
- `api/` - Express + tRPC API (PostgreSQL/Drizzle)
- `react-spa/` - Web UI (Vite + React)
- `shared/` - Shared schemas/types
- `firefox-extension/` - Firefox extension
- `dashboard/` - Legacy REST proxy service (tRPC client)

## Quick Start (Local Dev)

Prerequisites:

- Node.js >= 20
- Docker (recommended for PostgreSQL)

From the repo root:

```bash
npm install

cp api/.env.example api/.env
docker compose -f api/docker-compose.yml up -d db
npm run db:push --workspace=@openpath/api

# Terminal 1
npm run dev --workspace=@openpath/api

# Terminal 2
npm run dev --workspace=@openpath/react-spa
```

- API health: `http://localhost:3000/health`
- SPA dev server: `http://localhost:3001` (proxies `/trpc` + `/api` to `:3000`)

## Deploying Endpoints

### Linux (Recommended: APT bootstrap)

```bash
curl -fsSL https://balejosg.github.io/openpath/apt/apt-bootstrap.sh | sudo bash
```

### Linux (Manual / Source)

```bash
git clone https://github.com/balejosg/openpath.git
cd openpath/linux

# Point the agent at any URL that serves the whitelist format
sudo ./install.sh --whitelist-url "https://your-server.example/export/group.txt"
```

### Linux (Classroom enrollment)

```bash
cd openpath/linux
sudo ./install.sh \
  --classroom "Aula101" \
  --api-url "https://your-server.example" \
  --registration-token "YOUR_REGISTRATION_TOKEN"
```

### Windows

See `OpenPath/windows/README.md`.

## Whitelist Format

The agents consume a simple, readable text format:

```ini
## WHITELIST
google.com
github.com

## BLOCKED-SUBDOMAINS
ads.example.com

## BLOCKED-PATHS
*/tracking/*
```

## Emergency Disable (Fail-Open)

Add `#DESACTIVADO` to the start of the remote whitelist file. Endpoints will switch to permissive mode automatically.

## Docs

- `OpenPath/api/README.md`
- `OpenPath/react-spa/README.md`
- `OpenPath/linux/README.md`
- `OpenPath/windows/README.md`
- `OpenPath/firefox-extension/README.md`

**License**: [AGPL-3.0](LICENSE) (Open Source). See `OpenPath/LICENSING.md` for details.
