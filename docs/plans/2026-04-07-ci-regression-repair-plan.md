# CI Regression Repair Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Repair the post-push Linux and Windows CI/E2E regressions without reintroducing ClassroomPath coupling.

**Architecture:** Keep the browser refactor intact, but harden runtime packaging and module/test loading contracts. Prefer fixes that reduce path/name fragility instead of re-expanding monolithic files.

**Tech Stack:** Bash, BATS, PowerShell/Pester, GitHub Actions test harnesses

### Task 1: Restore Linux runtime/spec packaging

**Files:**

- Modify: `linux/install.sh`
- Modify: `tests/e2e/Dockerfile`
- Modify: `tests/e2e/Dockerfile.student`
- Modify: `tests/e2e/ci/run-linux-apt-contracts.sh`
- Test: `tests/linux-e2e.bats`

**Steps:**

1. Identify every runtime environment that invokes `linux/install.sh` or `linux/scripts/build/build-deb.sh`.
2. Ensure each environment copies `runtime/browser-policy-spec.json`.
3. Add or update contract tests so missing `runtime/` content fails locally before CI.

### Task 2: Repair Linux Firefox staging contract drift

**Files:**

- Modify: `linux/lib/firefox-extension-assets.sh`
- Modify: `linux/install.sh`
- Modify: `tests/e2e/pre-install-validation.sh`
- Test: `tests/browser_firefox_extension.bats`
- Test: `tests/linux-e2e.bats`

**Steps:**

1. Extract a shared helper for staging the unpacked Firefox installation bundle.
2. Make `install.sh` use that helper instead of open-coded staging.
3. Update contract checks to validate the refactored call site instead of the pre-refactor location.

### Task 3: Repair Windows helper/module loading

**Files:**

- Modify: `windows/tests/TestHelpers.ps1`
- Modify: `windows/tests/Windows.Tests.ps1`
- Modify: `windows/tests/Windows.Browser.*.Tests.ps1`
- Modify: `windows/lib/Browser.Common.psm1`
- Modify: `windows/lib/Browser.FirefoxPolicy.psm1`
- Modify: `windows/lib/Browser.FirefoxNativeHost.psm1`
- Modify: `windows/lib/Browser.Diagnostics.psm1`
- Modify: `windows/lib/Browser.psm1`

**Steps:**

1. Replace fragile helper loading with a proper importable Pester helper module.
2. Remove brittle `Browser.Common\...` usage where unqualified imported commands are sufficient.
3. Keep wrapper functions in `Browser.psm1` stable while reducing child-module name coupling elsewhere.

### Task 4: Add regression coverage and verify

**Files:**

- Modify: `tests/linux-e2e.bats`
- Modify: `windows/tests/*.Tests.ps1`

**Steps:**

1. Add assertions that CI container contexts include `runtime/browser-policy-spec.json`.
2. Add assertions that Windows browser helpers can be imported from the split test suites.
3. Run the smallest local verification set that exercises the repaired paths.

## Deferred Refactors

- Replace filename-grep installer contracts with executable helper-level contract tests so refactors do not fail on call-site moves alone.
- Introduce a small Windows browser submodule loader/helper that centralizes `Import-Module` semantics and makes split-module runtime failures fail fast with one code path.
- Narrow `TestHelpers` so split suites import only the modules they actually exercise; today the helper still bootstraps more modules than some tests need.
- Extract a shared Bash helper for assembling Linux CI Docker contexts; `run-linux-e2e.sh`, `run-linux-student-flow.sh`, and `run-linux-apt-contracts.sh` still duplicate the same minimal bundle logic.
- Generate release tarball contents from the installer validation manifest so release packaging and pre-install validation cannot drift apart.
- Add a dedicated Windows test bootstrap module for discovery-time imports so `Windows.Tests.ps1` and split suites do not drift on which commands exist before Pester starts discovery.
