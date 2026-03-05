# Migration Guide

This guide covers upgrading OpenPath components (endpoint agents + API/UI) safely.

## Linux Agent Upgrades

### If installed via APT

```bash
sudo apt update
sudo apt upgrade
```

Configuration in `/etc/openpath/` is preserved across upgrades.

### If installed from source

```bash
git pull
cd linux
sudo ./install.sh
```

The installer preserves configuration under `/etc/openpath/`.

### Configuration and State

- Preserved config: `/etc/openpath/`
  - `whitelist-url.conf`
  - `health-api-url.conf`
  - `health-api-secret.conf`
  - `classroom.conf`, `api-url.conf`, `api-secret.conf` (if enrolled)
- Regeneratable state/cache: `/var/lib/openpath/`

If debugging a broken upgrade, a safe first step is to keep `/etc/openpath/` and clear only `/var/lib/openpath/`.

## Windows Agent Upgrades

Follow the Windows agent README and installer scripts in `windows/`.

## API / Web UI Upgrades

The API and SPA are Node/TypeScript workspaces.

From the repo root:

```bash
npm install
npm run build
```

Database migrations are applied via Drizzle:

```bash
npm run db:push --workspace=@openpath/api
```

## Rollback Strategy (Endpoints)

If an endpoint upgrade causes unexpected behavior:

1. Check current status: `openpath status`
2. Run smoke tests: `sudo smoke-test.sh --quick`
3. If you used APT, you can pin/downgrade to a known-good package version.
4. If installed from source, reinstall the previous known-good tag/commit.
