# OpenPath E2E and Contract Test Inventory

> Status: maintained
> Applies to: `tests/e2e/`
> Last verified: 2026-04-13
> Source of truth: `tests/e2e/README.md`

This directory holds the repo's cross-platform installation, packaging, and student-policy contract coverage.

## Current Top-Level Suites

- `linux-e2e-tests.sh`
- `agent-integration.bats`
- `Windows-E2E.Tests.ps1`
- `student-flow/*.test.ts`
- `ci/run-linux-e2e.sh`
- `ci/run-linux-apt-contracts.sh`
- `ci/run-linux-installer-contracts.sh`
- `ci/run-linux-student-flow.sh`
- `ci/run-windows-e2e.ps1`
- `ci/run-windows-student-flow.ps1`

## What These Tests Cover

- Linux installer/package/runtime contracts
- Windows bootstrap/runtime contracts
- student-policy scenario reconciliation helpers
- required artifact manifests under `validation/`

## Useful Entry Points

```bash
npm run test:installer:linux
npm run test:installer:apt
npm run test:student-policy:linux
npm run test:student-policy:windows
```

## Windows CI Timeout Note

If the Windows Pester lane times out after `Run Windows Unit Tests` and `Complete job` have both succeeded, treat it as the documented hosted-runner teardown defect rather than a client regression. Use the successful Pester step plus the separate Windows E2E and Windows Student Policy workflows as release evidence until the platform behavior changes.
