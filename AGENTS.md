# AGENTS.md (Repository Instructions for Coding Agents)

This repository is the standalone OpenPath OSS core: Linux and Windows endpoint agents plus a Node.js/TypeScript monorepo for the API, dashboard proxy, shared contracts, React SPA, and browser extension.

## Dependency Rule

OpenPath must remain agnostic of downstream wrappers, managed distributions, and tenant-specific overlays.

- Do not add imports, configs, env vars, or runtime assumptions that require any downstream wrapper.
- Do not move downstream wrapper logic into OpenPath.
- If functionality is genuinely shared, implement it here as a generic OpenPath capability.

The dependency direction is one-way: `wrapper -> OpenPath`.

## Absolute Prohibitions

These rules have no exceptions for agent work:

- Do not use `git commit --no-verify` or `git commit -n`.
- Do not use `HUSKY=0 git commit`.
- Do not skip failing tests or disable checks just to get a commit through.
- Do not use `@ts-ignore` or broad lint disables as a shortcut around a real problem.
- Do not reintroduce repo-side cleanup hacks for the historical hosted Windows Pester teardown cancellation.

If a hook fails, fix the issue and retry. Do not bypass the workflow.

## Historical Hosted Windows Pester Teardown Defect

The required Windows Pester lane now runs on the pinned self-hosted OpenPath
Windows runner. Before that migration, the GitHub-hosted Windows runner could
cancel the job after `Run Windows Unit Tests`, `Record Windows lane outcome`,
and `Complete job` had all succeeded. That cancellation is documented as a
hosted-runner teardown defect, not an OpenPath Windows client regression.

Do not add descendant process cleanup, WMI process killing, success marker
recovery, or timeout-sentinel logic to the required Windows Pester lane as a
repo-side fix if the lane ever returns to hosted Windows. Changing this stance
requires new upstream runner evidence and maintainer approval.

## CI/CD Runner Measurement

For CI speed or runner follow-up work, read
[`docs/ci-cd-runner-measurement.md`](docs/ci-cd-runner-measurement.md) before
changing workflow routing, runner setup, or diagnostic artifact handling. Record
workflow run IDs, per-job durations, cache signals, artifact evidence, and
runner health instead of relying on informal timing notes.

## Branch And Git Policy

OpenPath uses a trunk-based workflow.

- Work on `main`.
- Do not create feature branches or PR branches.
- Do not push from detached HEAD.
- If you need an isolated checkout, use a detached worktree based on `main`.

Technical enforcement lives in `.husky/pre-commit`, `.husky/pre-push`, and `scripts/require-main-branch.sh`.

## Hook Behavior

- `pre-commit`: checks sensitive files and runs staged verification through `scripts/agent-verify.js --staged`
- `commit-msg`: appends `Verified-by: pre-commit`
- `pre-push`: runs `npm run verify:full`

Do not run `npm run verify:full` manually immediately before every push just to duplicate the hook. Run it manually only when debugging a failure or when the user explicitly asks for it.

## Hypothesis Validation Order

Do not use broad CI or release workflows as the first signal for a development hypothesis when a cheaper lane can falsify it first.

Default order:

- focused local suite or `npm run verify:quick`
- direct runner connection for Windows-targeted endpoint, browser-policy, or runtime hypotheses
- broader CI for integrated evidence

From the shared workspace, use `../scripts/validate-hypothesis.sh` when choosing the first pass:

- `../scripts/validate-hypothesis.sh openpath local`
- `../scripts/validate-hypothesis.sh openpath windows-direct`
- `../scripts/validate-hypothesis.sh openpath windows-gh`

On a Windows-capable development environment, prefer focused Pester or `npm run test:student-policy:windows` before waiting on broader workflow fan-out. From the shared Linux workspace, prefer the direct runner lane first; keep `windows-gh` for integration-time verification rather than the default development loop.

## Repo Map

- `linux/`: Bash endpoint agent (`dnsmasq`, firewall rules, systemd, browser policy helpers)
- `windows/`: PowerShell endpoint agent (Acrylic DNS Proxy, Windows Firewall, Task Scheduler, browser rollout)
- `api/`: Express + tRPC service with PostgreSQL/Drizzle
- `dashboard/`: REST compatibility proxy over API tRPC routes
- `react-spa/`: React SPA and Playwright/Vitest coverage
- `shared/`: shared Zod schemas, helpers, and contract types
- `firefox-extension/`: browser extension and release artifact tooling

Start with:

- [`README.md`](README.md)
- [`CONTRIBUTING.md`](CONTRIBUTING.md)
- [`docs/INDEX.md`](docs/INDEX.md)

## Environment And Tooling

- Node.js `>= 20`
- npm workspaces from repo root
- `bats` for Bash tests
- PowerShell/Pester for Windows-oriented validation

Common root commands:

- `npm install`
- `npm run build --workspaces --if-present`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run verify:docs`
- `npm run verify:agent`
- `npm run verify:quick`

## Testing Guide

Use the smallest relevant test surface first.

### API

- all: `npm test --workspace=@openpath/api`
- focused: `npm run test:auth --workspace=@openpath/api`
- focused: `npm run test:setup --workspace=@openpath/api`
- focused: `npm run test:e2e --workspace=@openpath/api`
- focused: `npm run test:security --workspace=@openpath/api`

### Dashboard

- all: `npm test --workspace=@openpath/dashboard`

### React SPA

- unit: `npm test --workspace=@openpath/react-spa`
- smoke e2e: `npm run test:e2e:smoke`
- full e2e: `npm run test:e2e`

### Shared

- all: `npm test --workspace=@openpath/shared`

### Firefox Extension

- all: `npm test --workspace=@openpath/firefox-extension`

### Linux Agent Contracts

- shell: `cd tests && bats *.bats`
- installer contracts: `npm run test:installer:linux`
- APT contracts: `npm run test:installer:apt`
- student-policy flow: `npm run test:student-policy:linux`

### Windows Agent Contracts

- student-policy flow: `npm run test:student-policy:windows`
- broader Windows checks run through the Windows test suites under `windows/tests/`

## Documentation Rules

- Maintained and process docs are English-only.
- Keep maintained docs aligned with repo truth.
- If you add a maintained doc, link it from [`docs/INDEX.md`](docs/INDEX.md).
- Delete obsolete docs instead of leaving contradictory stubs.
- Treat `CHANGELOG.md` and most ADRs as historical context, not current runbooks.
