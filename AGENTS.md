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

## 🚫 PROHIBICIONES ABSOLUTAS - VIOLACIÓN = SESIÓN TERMINADA

**Estas reglas NO tienen excepciones. El incumplimiento termina la sesión inmediatamente.**

### Commits Sin Verificación (PROHIBIDO)

| ❌ PROHIBIDO                                    | ⚠️ CONSECUENCIA      |
| ----------------------------------------------- | -------------------- |
| `git commit --no-verify` o `-n`                 | **SESIÓN TERMINADA** |
| `HUSKY=0 git commit`                            | **SESIÓN TERMINADA** |
| Commit sin ejecutar `npm run verify:full`       | **SESIÓN TERMINADA** |
| Saltar tests porque "tardan mucho"              | **SESIÓN TERMINADA** |
| Comentar tests que fallan                       | **SESIÓN TERMINADA** |
| Usar `@ts-ignore` o `eslint-disable` para pasar | **SESIÓN TERMINADA** |

### Proceso Obligatorio Antes de CUALQUIER Commit

```bash
# 1. EJECUTAR VERIFICACIÓN COMPLETA (SIN ATAJOS)
npm run verify:full

# 2. SI FALLA CUALQUIER TEST:
#    - NO hacer commit
#    - ARREGLAR el problema
#    - VOLVER a ejecutar verify:full
#    - REPETIR hasta que TODO PASE

# 3. SOLO después de que TODO PASE:
git add <files>
git commit -m "mensaje"
```

### ¿Por Qué Esta Política Existe?

Un agente hizo commit sin ejecutar tests, causando:

- Código roto en producción
- Tiempo perdido debuggeando
- Pérdida de confianza en el proceso

**NO HAY EXCUSAS. NO HAY ATAJOS. ARREGLA EL PROBLEMA.**

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
- React SPA: `npm run build --workspace=@openpath/react-spa`
- Shared: `npm run build --workspace=@openpath/shared`
- Extension: `npm run build --workspace=@openpath/firefox-extension`

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

- All: `npm test --workspace=@openpath/firefox-extension`
- Single file:
  - `cd firefox-extension && npx tsx --test tests/background.test.ts`

## ⛔ MANDATORY LOCAL VERIFICATION (CRITICAL - READ THIS)

**All agents MUST run full verification locally before ANY commit.**

### Verification Layers (Use the Right Level)

For **fast feedback during development**, use the layered verification system:

| Command                   | Time    | What It Runs                              | When to Use                           |
| ------------------------- | ------- | ----------------------------------------- | ------------------------------------- |
| `npm run verify:agent`    | ~5-30s  | Auto-detects changes, runs minimal checks | **Default for iterative development** |
| `npm run verify:quick`    | ~15-30s | Typecheck + ESLint + Prettier             | After code changes, before deep dive  |
| `npm run verify:affected` | ~30-60s | Quick + tests for affected workspaces     | After changing tests or shared/       |
| `npm run verify:full`     | ~3-5min | **COMPLETE suite (MANDATORY for commit)** | **Before ANY commit**                 |

#### verify:agent (Recommended for Agents)

Automatically chooses the fastest verification based on what changed:

- Docs only → `format:check` (~2s)
- Code changes → `verify:quick` (~15s)
- Test/shared changes → `verify:affected` (~30s)

```bash
# During iterative development:
npm run verify:agent

# Before commit (MANDATORY):
npm run verify:full
```

#### Watch Mode (Continuous Feedback)

For continuous feedback while coding:

```bash
npm run test:watch:spa    # Vitest watch for react-spa
```

#### E2E Smoke Tests (Quick Sanity Check)

```bash
npm run test:e2e:smoke    # Only @smoke tagged tests (~20s vs ~2min)
```

### The Rule

```bash
# BEFORE committing ANY changes:
npm run verify:full
```

This command runs:

1. `npm run verify` - Typecheck + ESLint (all workspaces)
2. `npm run lint:shell` - Shellcheck for bash scripts
3. `npm run format:check` - Prettier format validation
4. `npm run test:local` - All unit tests (API, SPA, shared, extension, dashboard)
5. `npm run test:e2e` - Full Playwright E2E test suite
6. `npm run security:audit` - npm audit (high severity)
7. `npm run security:secrets` - Secretlint for leaked credentials
8. `npm run size:check` - Bundle size limits

### E2E Prerequisites

E2E tests require backend services running:

```bash
# Start API + PostgreSQL (via Docker Compose or locally)
docker compose up -d  # Or: npm run dev --workspace=@openpath/api

# Then run E2E
npm run test:e2e
```

If E2E fails with "login failed" or similar, ensure API is accessible.

### What CI Runs

GitHub Actions CI is **minimal by design**. It only runs tests requiring specific OS:

- **Linux dnsmasq tests** - Require Ubuntu with dnsmasq/systemd installed
- **Windows agent tests** - Require Windows with Pester

Everything else (lint, typecheck, unit tests, E2E) runs **locally only**.

### Policy: Fix Without Shortcuts

| Situation        | ✅ CORRECT           | ❌ FORBIDDEN                          |
| ---------------- | -------------------- | ------------------------------------- |
| Test fails       | Fix the test or code | `--no-verify`, skip test, comment out |
| Lint error       | Fix the code         | `eslint-disable`, `--no-verify`       |
| Typecheck error  | Fix the types        | `@ts-ignore`, `any`, `--no-verify`    |
| E2E flaky        | Fix the flakiness    | Skip test, retry until pass           |
| "Takes too long" | Wait for it          | `--no-verify`, partial run            |

**NO EXCEPTIONS. NO SHORTCUTS. FIX THE PROBLEM.**

### Why This Policy Exists

- CI minutes are expensive and limited
- Local verification gives faster feedback (seconds vs minutes)
- Agents must take responsibility for code quality
- Pushing broken code wastes everyone's time

### Verification Workflow

```bash
# 1. Make changes
# 2. Run full verification
npm run verify:full

# 3. If ANY failure:
#    - DO NOT commit
#    - Fix the issue
#    - Run verify:full again
#    - Repeat until ALL PASS

# 4. Only after ALL PASS:
git add .
git commit -m "your message"
```

## Git Hooks (Enforced)

- **pre-commit**: `.husky/pre-commit` runs `npm run verify:full` (full verification suite)
- **commit-msg**: `.husky/commit-msg` runs `commitlint` (conventional commits format)
- pre-push: No additional checks (already verified at commit time)

**NEVER use `--no-verify`.** If the hook fails, fix the issue.

## Code Style (TypeScript)

Keep changes consistent with ESLint + tsconfig settings.

### Formatting

- Semicolons required.
- Single quotes required.
- Let ESLint do formatting: run `npm run lint:fix` when applicable.

### Imports

Preferred order (match existing code where possible):

1. Node built-ins (`node:*`)
2. External packages
3. Internal modules (relative or workspace packages like `@openpath/*`)

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

| Directory | Contract                         | Breaking Change Policy                     |
| --------- | -------------------------------- | ------------------------------------------ |
| `api/`    | Dockerfile builds from this path | Coordinate with downstream before renaming |
| `spa/`    | Static files served by nginx     | Coordinate with downstream before renaming |
| `shared/` | Shared types/schemas             | Coordinate with downstream before renaming |

Renaming these directories requires updating downstream Dockerfiles and compose files.

## Repo-specific Rules Files

- Cursor rules: none present.
- Copilot instructions: none present.
