# Windows Client Maintainability Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce duplication and drift in the Windows client by centralizing standalone script bootstrap logic and shared enforcement transitions, without changing the external behavior of OpenPath.

**Architecture:** Introduce two small Windows-only shared modules. `ScriptBootstrap.psm1` owns standalone script initialization and required-command validation. `Enforcement.psm1` owns the common transitions into protected mode and fail-open mode so `Update-OpenPath.ps1`, `Test-DNSHealth.ps1`, `CaptivePortal.psm1`, and checkpoint restore paths stop reimplementing them.

**Tech Stack:** PowerShell 5.1+, Pester content/behavior tests, existing OpenPath Windows modules.

## Non-Goals

- No API or ClassroomPath changes.
- No changes to allowlist format, firewall rule semantics, or scheduled task cadence.
- No full rewrite of `Common.psm1`.

## Task 1: Extract standalone script bootstrap

**Files:**

- Create: `windows/lib/ScriptBootstrap.psm1`
- Modify: `windows/scripts/Update-OpenPath.ps1`
- Modify: `windows/scripts/Test-DNSHealth.ps1`
- Modify: `windows/tests/Windows.Tests.ps1`

**Step 1: Write failing tests**

Add tests that require:

- `Update-OpenPath.ps1` to call a shared bootstrap helper.
- `Test-DNSHealth.ps1` to call the same helper.
- The helper module to validate required commands and re-import `Common.psm1` globally.

**Step 2: Verify RED**

Run the narrowest available verification for the changed files. In this environment, use targeted content checks; on Windows, run:

```powershell
cd windows
Invoke-Pester .\tests\Windows.Tests.ps1
```

Expected: the new tests fail before the shared helper exists.

**Step 3: Implement shared bootstrap**

Create `Initialize-OpenPathScriptSession` with:

- `OpenPathRoot`
- `RequiredCommands`
- optional dependent module list

Behavior:

- import dependent modules first
- re-import `Common.psm1` with `-Global`
- throw if any required command is missing

**Step 4: Switch standalone scripts**

Replace ad-hoc bootstrap logic in:

- `windows/scripts/Update-OpenPath.ps1`
- `windows/scripts/Test-DNSHealth.ps1`

with the shared helper.

**Step 5: Verify GREEN**

Re-run the targeted checks and, on Windows, `Invoke-Pester`.

## Task 2: Extract shared enforcement transitions

**Files:**

- Create: `windows/lib/Enforcement.psm1`
- Modify: `windows/lib/Common.psm1`
- Modify: `windows/lib/CaptivePortal.psm1`
- Modify: `windows/scripts/Update-OpenPath.ps1`
- Modify: `windows/tests/Windows.Tests.ps1`

**Step 1: Write failing tests**

Add tests that require:

- `Update-OpenPath.ps1` to call a shared fail-open helper and a shared enforcement-restore helper.
- `CaptivePortal.psm1` and checkpoint restore code to use the shared enforcement-restore helper.

**Step 2: Verify RED**

Run the targeted checks and confirm the new tests fail before the helper exists.

**Step 3: Implement shared enforcement helper**

Create:

- `Enter-OpenPathFailOpenMode`
- `Restore-OpenPathProtectedMode`

Expected responsibilities:

- fail-open: restore original adapter DNS, remove firewall rules, remove browser policies
- protected mode: optionally restart Acrylic, set adapter DNS to loopback, optionally apply firewall rules

Keep the helper generic to OpenPath; no ClassroomPath assumptions.

**Step 4: Switch callers**

Use the helper from:

- `windows/scripts/Update-OpenPath.ps1`
- `windows/lib/Common.psm1` checkpoint restore path
- `windows/lib/CaptivePortal.psm1`

**Step 5: Verify GREEN**

Re-run targeted checks and, on Windows, `Invoke-Pester`.

## Task 3: Final verification and landing

**Files:**

- Modify: `windows/tests/Windows.Tests.ps1`

**Step 1: Verify targeted diff**

Run:

```bash
git diff -- windows/lib/ScriptBootstrap.psm1 \
  windows/lib/Enforcement.psm1 \
  windows/lib/Common.psm1 \
  windows/lib/CaptivePortal.psm1 \
  windows/scripts/Update-OpenPath.ps1 \
  windows/scripts/Test-DNSHealth.ps1 \
  windows/tests/Windows.Tests.ps1
```

**Step 2: Verify Windows-specific tests**

On Windows:

```powershell
cd windows
Invoke-Pester .\tests\Windows.Tests.ps1
```

**Step 3: Commit**

```bash
git add docs/plans/2026-03-24-windows-client-maintainability-refactor.md \
  windows/lib/ScriptBootstrap.psm1 \
  windows/lib/Enforcement.psm1 \
  windows/lib/Common.psm1 \
  windows/lib/CaptivePortal.psm1 \
  windows/scripts/Update-OpenPath.ps1 \
  windows/scripts/Test-DNSHealth.ps1 \
  windows/tests/Windows.Tests.ps1
git commit -m "refactor(windows): centralize script bootstrap and enforcement transitions"
```
