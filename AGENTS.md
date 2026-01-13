# AGENTS.md (Repository Instructions for Coding Agents)

This repo is a multi-platform DNS whitelist enforcement system (Linux Bash, Windows PowerShell)
plus a Node.js/TypeScript monorepo (npm workspaces) for API + web tooling.

## ⛔ Dependency Rule (CRITICAL)

**This repository MUST remain completely agnostic of ClassroomPath.**

OpenPath is the standalone OSS core. It must:
- Work independently without any wrapper/distribution
- Never import, reference, or depend on ClassroomPath
- Never contain ClassroomPath-specific code or configurations
- Never mention "ClassroomPath" in source code

If you're asked to add ClassroomPath-specific functionality:
1. **STOP** — This violates the architecture
2. Add it to ClassroomPath instead (it consumes OpenPath, not vice versa)
3. If shared functionality is needed, add it here as a generic feature

The dependency flows ONE direction only: `ClassroomPath → OpenPath`

## Quick Context (Architecture Cheatsheet)
- `linux/`: Bash endpoint agent (dnsmasq/iptables, systemd)
- `windows/`: PowerShell endpoint agent (Acrylic DNS Proxy + Windows Firewall)
- `api/`: Express + tRPC API, PostgreSQL/Drizzle, Winston logging
- `dashboard/`: Node/TS dashboard service (Express)
- `spa/`: static TS SPA + Playwright E2E tests
- `shared/`: shared Zod schemas/types for other packages
- `firefox-extension/`: browser extension

Primary docs:
- `CLAUDE.md` (project overview + ops)
- `CONTRIBUTING.md` (conventions + tests)

## Requirements
- Node.js >= 20 (repo `package.json` engines)
- npm workspaces (install from repo root)
- Bash tests require `bats` installed (see `tests/run-tests.sh`)

## Install / Build
From repo root:
- Install deps: `npm install`
- Build all workspaces (where present): `npm run build --workspaces --if-present`
- Clean: `npm run clean`

Per workspace examples:
- API: `npm run build --workspace=@openpath/api`
- SPA: `npm run build --workspace=@openpath/spa`
- Shared: `npm run build --workspace=@openpath/shared`

## Lint / Typecheck
From repo root:
- ESLint (all): `npm run lint`
- Fix ESLint: `npm run lint:fix`
- Typecheck (all workspaces that define it): `npm run typecheck`
- Full local gate (used by pre-push): `npm run verify`

Shell scripts:
- ShellCheck (subset): `npm run lint:shell`
  - CI runs ShellCheck across `linux/**/*.sh`

Windows scripts (in CI):
- PSScriptAnalyzer runs in `.github/workflows/ci.yml`

## Tests (All)
From repo root:
- All tests: `npm test`
  - Includes `test:shell`, `test:api`, `test:dashboard`, `test:spa`

### Run a Single Test (Cookbook)

#### Bash (BATS)
- All: `cd tests && bats *.bats`
- Single file: `cd tests && bats common.bats`
- Helper script:
  - All: `./tests/run-tests.sh`
  - Single (by basename): `./tests/run-tests.sh common`

#### API (`api/`)
API tests use Node’s test runner + `tsx` loader and require a free `PORT`.
Prefer the existing scripts where possible (ports are pre-chosen):

- One suite (scripted):
  - `npm run test:auth --workspace=@openpath/api`
  - `npm run test:setup --workspace=@openpath/api`
  - `npm run test:e2e --workspace=@openpath/api`
  - `npm run test:security --workspace=@openpath/api`

- One file (direct runner; pick a free port):
  - `cd api && NODE_ENV=test PORT=3001 node --import tsx --test --test-force-exit tests/auth.test.ts`

#### Dashboard (`dashboard/`)
- All: `npm test --workspace=dashboard`
- Single file:
  - `cd dashboard && node --import tsx --test --test-force-exit --test-concurrency=1 tests/api.test.ts`

#### SPA (`spa/`)
Unit tests:
- All: `npm test --workspace=@openpath/spa`
- Single file:
  - `cd spa && npx tsx --test tests/config.test.ts`

Playwright E2E (split into smoke/comprehensive):
- Smoke only (14 tests, fast CI):
  - `cd spa && npx playwright test --grep @smoke --project=chromium`
- All tests (279+ tests):
  - `cd spa && npm run test:e2e`
- Single test by name:
  - `cd spa && npx playwright test --grep "blocked-domain"`
- Single spec:
  - `cd spa && npx playwright test e2e/blocked-domain.spec.ts`

CI runs `@smoke` tests on every PR. Full suite runs on main/nightly/`e2e` label.

#### Linux Agent E2E (`tests/e2e/`)
- All: `bats tests/e2e/agent-integration.bats`
- Runs in `e2e-comprehensive.yml` workflow

#### Firefox Extension (`firefox-extension/`)
- All: `npm test --workspace=openpath-firefox-extension`
- Single file:
  - `cd firefox-extension && npx tsx --test tests/background.test.ts`

## Git Hooks (Do not bypass)
- pre-commit: `.husky/pre-commit` runs `npx lint-staged`
- pre-push: `.husky/pre-push` runs `npm run verify`
Avoid `--no-verify` unless explicitly requested by humans.

## Code Style (TypeScript)
Keep changes consistent with ESLint + tsconfig settings.

### Formatting
- Semicolons required.
- Single quotes required.
- Let ESLint do formatting: run `npm run lint:fix` when applicable.

### Imports
Preferred order (match existing code where possible):
1) Node built-ins (`node:*`)
2) External packages
3) Internal modules (relative or workspace packages like `@openpath/*`)

Rules:
- Use `import type { ... }` for type-only imports.
- Keep ESM style consistent; NodeNext packages commonly use `.js` specifiers
  in TS source imports (do not “fix” to extensionless).

### Types / Safety
- `any` is forbidden by ESLint in most packages.
  - Exception: `spa/src/**/*.ts` relaxes some unsafe rules; still prefer strict types.
- No non-null assertions (`!`)—handle null/undefined explicitly.
- Prefer `unknown` over `any`, then narrow with Zod/type guards.
- Use `_` prefix for intentionally unused parameters (allowed by ESLint).

### Naming
- Types/interfaces: `PascalCase`
- Functions/variables: `camelCase`
- Constants/env vars: `SCREAMING_SNAKE_CASE`
- Filenames: match existing directory conventions; avoid gratuitous renames.

### Errors & Logging
- API (`api/`):
  - Prefer `TRPCError` in tRPC routers for client-facing errors.
  - Prefer structured errors (`APIError` and subclasses) for Express middleware paths.
  - Use Winston logger (`api/src/lib/logger.ts`), not `console.*`, in production code.
- Browser/extension (`spa/`, `firefox-extension/`):
  - Prefer local logger wrappers over raw `console.*` when available.

### Validation
- Prefer Zod schemas (from `shared/`) at boundaries (API inputs, config, parsing).
- Never trust client input; validate and return a typed error.

## Shell Script Style (Linux)
- Keep scripts ShellCheck-clean (CI enforces).
- Quote variables (`"$var"`), prefer `[[ ... ]]`.
- Avoid bashisms unless file is explicitly bash; use `#!/bin/bash` consistently.

## PowerShell Style (Windows)
- Use approved verbs (`Get-`, `Set-`, `New-`, `Remove-`, etc.).
- PascalCase for functions/parameters.
- Keep scripts compliant with PSScriptAnalyzer (CI).

## Stable Directory Contracts

These directories are **stable API surfaces** consumed by downstream distributions:

| Directory | Contract | Breaking Change Policy |
|-----------|----------|------------------------|
| `api/` | Dockerfile builds from this path | Coordinate with downstream before renaming |
| `spa/` | Static files served by nginx | Coordinate with downstream before renaming |
| `shared/` | Shared types/schemas | Coordinate with downstream before renaming |

Renaming these directories requires updating downstream Dockerfiles and compose files.

## Repo-specific Rules Files
- Cursor rules: none present.
- Copilot instructions: none present.
