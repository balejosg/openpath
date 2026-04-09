# Linux Runtime Refactors Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove high-risk shell API ambiguity, centralize the Firefox native-host contract, and split `openpath-update.sh` into smaller decision/apply helpers without changing intended runtime behavior.

**Architecture:** Replace positional booleans in browser integration setup with named shell options, make the Firefox native-host manifest/template the shared source for Linux installation paths, and extract explicit runtime decision helpers in the Linux updater so portal/no-network/download outcomes are computed separately from their side effects.

**Tech Stack:** Bash, BATS, Node test runner with `tsx`.

### Task 1: Lock the new browser integration API with tests

**Files:**

- Modify: `tests/browser_setup.bats`
- Modify: `tests/browser_chromium.bats`

**Step 1: Write the failing tests**

- Expect `openpath-browser-setup.sh` to call `install_browser_integrations` with named flags instead of positional booleans.
- Expect Chromium/browser integration tests to call the same shell API with named flags.

**Step 2: Run test to verify it fails**

- Run: `bats tests/browser_setup.bats tests/browser_chromium.bats`

**Step 3: Write minimal implementation**

- Refactor `linux/lib/browser.sh` to parse named options.
- Update Linux callsites to the new option style.

**Step 4: Run test to verify it passes**

- Run: `bats tests/browser_setup.bats tests/browser_chromium.bats`

### Task 2: Centralize the Firefox native-host contract

**Files:**

- Modify: `firefox-extension/tests/native-host-contract.test.ts`
- Modify: `firefox-extension/native/install-native-host.sh`
- Modify: `linux/lib/browser.sh`
- Create or rename: `firefox-extension/native/whitelist_native_host.json`

**Step 1: Write the failing tests**

- Expect the Firefox manifest filename to align with the host name contract.
- Expect Linux installation to render the Firefox manifest from the shared template.

**Step 2: Run test to verify it fails**

- Run: `node --import tsx --test firefox-extension/tests/native-host-contract.test.ts`

**Step 3: Write minimal implementation**

- Move the Firefox manifest contract to the shared manifest file.
- Render/copy from that shared manifest instead of hand-writing duplicated JSON.

**Step 4: Run test to verify it passes**

- Run: `node --import tsx --test firefox-extension/tests/native-host-contract.test.ts`

### Task 3: Extract updater runtime decisions into helpers

**Files:**

- Modify: `linux/scripts/runtime/openpath-update.sh`
- Modify: `tests/openpath-update.bats`

**Step 1: Write the failing tests**

- Expect explicit helper functions for preflight portal handling and whitelist download fallback decisions.
- Keep existing behavior checks for `NO_NETWORK`, fail-open, and policy sync.

**Step 2: Run test to verify it fails**

- Run: `bats tests/openpath-update.bats`

**Step 3: Write minimal implementation**

- Extract pure-ish decision helpers from `main`.
- Keep side effects in small apply helpers.

**Step 4: Run test to verify it passes**

- Run: `bats tests/openpath-update.bats`

### Task 4: Remove duplicated URL-host helper and run targeted verification

**Files:**

- Modify: `linux/scripts/runtime/openpath-update.sh`

**Step 1: Delete duplication**

- Reuse `get_url_host` from `linux/lib/common.sh`.

**Step 2: Run focused regression suite**

- Run: `bats tests/browser_setup.bats tests/browser_chromium.bats tests/browser_native_host.bats tests/captive-portal.bats tests/openpath-update.bats`
- Run: `node --import tsx --test firefox-extension/tests/native-host-contract.test.ts`

**Step 3: Review architecture boundary**

- Confirm no `ClassroomPath` imports, terminology, or env vars were introduced in `OpenPath/`.
