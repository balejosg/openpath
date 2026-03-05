# Release Checklist

Use this checklist before releasing changes that affect endpoint machines.

## Pre-Release

- [ ] Changes are committed locally (pre-commit verification passed)
- [ ] Relevant local validation done (agent smoke tests where applicable)
- [ ] GitHub Actions checks are green for agent changes:
  - `ci.yml` (Linux BATS + Windows Pester)
  - `e2e-tests.yml` (agent E2E)

## Upgrade Testing

- [ ] Fresh install works
- [ ] Upgrade path works (APT upgrade or reinstall)
- [ ] Uninstall/rollback procedure tested

## Documentation

- [ ] Release notes / changelog updated
- [ ] Breaking changes documented

## Post-Release Monitoring

- [ ] Monitor endpoint health reporting in the dashboard / API
- [ ] Check for stale hosts (not reporting recently)
