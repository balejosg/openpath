# Browser Contracts And Pester Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce browser maintenance cost by splitting Windows browser Pester coverage, introducing shared browser contract fixtures across Linux and Windows, and extracting Chromium-specific Linux browser helpers into a dedicated module.

**Architecture:** Keep OpenPath browser behavior platform-agnostic by moving shared expectations into `tests/contracts/` fixtures consumed from both Bash and PowerShell tests. Reduce file breadth by moving Linux Chromium implementation out of `linux/lib/browser.sh` and moving Windows browser test responsibilities out of the monolithic `windows/tests/Windows.Tests.ps1` into focused suites with shared helpers.

**Tech Stack:** Bash, BATS, Python, PowerShell/Pester, JSON contract fixtures

### Task 1: Add shared plan scaffolding and focused test harnesses

**Files:**

- Create: `docs/plans/2026-04-07-browser-contracts-and-pester-split-plan.md`
- Create: `windows/tests/TestHelpers.ps1`
- Modify: `tests/browser_support.bash`
- Test: `tests/browser_policy.bats`
- Test: `tests/browser_chromium.bats`
- Test: `tests/linux-e2e.bats`

**Step 1: Write the failing tests**

Add tests that require:

- browser contract fixtures to exist under `tests/contracts/`
- focused browser Pester suites to exist under `windows/tests/`
- shared helper loading instead of helper duplication inside `Windows.Tests.ps1`

**Step 2: Run tests to verify they fail**

Run: `bats tests/browser_policy.bats tests/browser_chromium.bats tests/linux-e2e.bats`

Expected: FAIL because the contract fixtures, helper file, and split Pester files do not yet exist.

**Step 3: Write minimal implementation**

Create the helper/fixture files and wire the Bash support helpers so the tests can read contract JSON fixtures.

**Step 4: Run tests to verify they pass**

Run: `bats tests/browser_policy.bats tests/browser_chromium.bats tests/linux-e2e.bats`

Expected: PASS on the new structure checks.

### Task 2: Split Windows browser Pester coverage by responsibility

**Files:**

- Create: `windows/tests/Windows.Browser.FirefoxPolicy.Tests.ps1`
- Create: `windows/tests/Windows.Browser.ChromiumPolicy.Tests.ps1`
- Create: `windows/tests/Windows.Browser.NativeHost.Tests.ps1`
- Create: `windows/tests/Windows.Browser.Diagnostics.Tests.ps1`
- Modify: `windows/tests/Windows.Tests.ps1`
- Modify: `windows/tests/TestHelpers.ps1`
- Test: `tests/linux-e2e.bats`

**Step 1: Write the failing tests**

Add structural checks that expect browser-specific Pester files and expect the original monolith to stop containing the browser `Describe` block.

**Step 2: Run tests to verify they fail**

Run: `bats tests/linux-e2e.bats`

Expected: FAIL while `Windows.Tests.ps1` still contains the browser block and the new test files are absent.

**Step 3: Write minimal implementation**

Move browser-related Pester contexts into the new files, keep shared helper functions in `TestHelpers.ps1`, and leave `Windows.Tests.ps1` focused on non-browser modules.

**Step 4: Run tests to verify they pass**

Run: `bats tests/linux-e2e.bats`

Expected: PASS on the structural split checks.

### Task 3: Introduce shared browser contract fixtures

**Files:**

- Create: `tests/contracts/browser-firefox-managed-extension.json`
- Create: `tests/contracts/browser-chromium-policy.json`
- Modify: `tests/browser_support.bash`
- Modify: `tests/browser_policy.bats`
- Modify: `tests/browser_chromium.bats`
- Modify: `windows/tests/TestHelpers.ps1`
- Modify: `windows/tests/Windows.Browser.FirefoxPolicy.Tests.ps1`
- Modify: `windows/tests/Windows.Browser.ChromiumPolicy.Tests.ps1`

**Step 1: Write the failing tests**

Add Linux tests that load contract fixtures and assert Firefox managed-extension precedence and Chromium policy defaults match the fixture values. Add Windows structural tests that require the new Pester files to load fixtures through a shared helper.

**Step 2: Run tests to verify they fail**

Run: `bats tests/browser_policy.bats tests/browser_chromium.bats tests/linux-e2e.bats`

Expected: FAIL because the fixtures do not yet exist and the tests do not yet consume them.

**Step 3: Write minimal implementation**

Create fixture JSON files, add Bash helpers to read them, and add PowerShell helper functions for loading JSON contract fixtures so Windows tests use the same data source.

**Step 4: Run tests to verify they pass**

Run: `bats tests/browser_policy.bats tests/browser_chromium.bats tests/linux-e2e.bats`

Expected: PASS with Linux tests reading the shared contracts and Windows structural tests confirming shared fixture usage.

### Task 4: Extract Linux Chromium helpers from `browser.sh`

**Files:**

- Create: `linux/lib/chromium-managed-extension.sh`
- Modify: `linux/lib/browser.sh`
- Modify: `tests/browser_chromium.bats`
- Modify: `tests/browser_policy.bats`
- Test: `tests/browser_chromium.bats`

**Step 1: Write the failing tests**

Add tests that require Chromium helper functions to live in a dedicated module and require `browser.sh` to source that module.

**Step 2: Run tests to verify they fail**

Run: `bats tests/browser_chromium.bats tests/browser_policy.bats`

Expected: FAIL because the helper module does not exist and `browser.sh` still owns the Chromium implementation.

**Step 3: Write minimal implementation**

Move the Chromium-specific functions into `linux/lib/chromium-managed-extension.sh`, source that file from `browser.sh`, and keep the public function surface unchanged.

**Step 4: Run tests to verify they pass**

Run: `bats tests/browser_chromium.bats tests/browser_policy.bats`

Expected: PASS with the extracted module.

### Task 5: Verify and commit

**Files:**

- Modify: `windows/tests/*.ps1`
- Modify: `tests/*.bats`
- Modify: `linux/lib/*.sh`
- Modify: `tests/contracts/*.json`

**Step 1: Run focused verification**

Run: `bats tests/browser_policy.bats tests/browser_firefox_extension.bats tests/browser_chromium.bats tests/browser_native_host.bats tests/linux-e2e.bats tests/openpath-update.bats`

Expected: PASS

**Step 2: Run syntax verification**

Run: `bash -n linux/lib/browser.sh linux/lib/chromium-managed-extension.sh linux/lib/firefox-policy.sh linux/lib/firefox-managed-extension.sh linux/lib/common.sh linux/install.sh linux/scripts/runtime/openpath-update.sh linux/scripts/build/build-deb.sh`

Expected: exit code `0`

**Step 3: Review staged diff**

Run: `git diff --stat`

Expected: only the intended browser/test refactor files changed.

**Step 4: Commit**

Run:

```bash
git add docs/plans/2026-04-07-browser-contracts-and-pester-split-plan.md \
  linux/lib/browser.sh \
  linux/lib/chromium-managed-extension.sh \
  tests/browser_policy.bats \
  tests/browser_chromium.bats \
  tests/browser_support.bash \
  tests/linux-e2e.bats \
  tests/contracts/browser-firefox-managed-extension.json \
  tests/contracts/browser-chromium-policy.json \
  windows/tests/TestHelpers.ps1 \
  windows/tests/Windows.Browser.FirefoxPolicy.Tests.ps1 \
  windows/tests/Windows.Browser.ChromiumPolicy.Tests.ps1 \
  windows/tests/Windows.Browser.NativeHost.Tests.ps1 \
  windows/tests/Windows.Browser.Diagnostics.Tests.ps1 \
  windows/tests/Windows.Tests.ps1
git commit -m "refactor(browser): split windows suites and share contracts"
```

Expected: pre-commit passes and creates a new local commit on `main`.
