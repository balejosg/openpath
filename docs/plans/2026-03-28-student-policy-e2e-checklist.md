# Student Policy E2E Implementation Checklist

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to work through this checklist in order and keep the boxes accurate.

**Purpose:** Turn the student-policy E2E plan into an execution checklist that can be marked off during implementation.

**Companion documents:**

- `docs/plans/2026-03-28-student-policy-e2e.md`
- `docs/plans/2026-03-28-student-policy-e2e-matrix.md`

## Usage

- Check a box only when the code is implemented and the stated exit criteria are satisfied.
- Keep the checklist in sync with the codebase as implementation progresses.
- Do not mark the workflow complete until both Linux and Windows pass the required matrix in CI.

## Phase 0: Windows Backend Bootstrap

- [ ] Confirm a stable PostgreSQL bootstrap path on `windows-2022`.
- [ ] Confirm the API can start locally on the Windows runner with deterministic env vars.
- [ ] Confirm the Windows runner can host PostgreSQL, the API, and the fixture server simultaneously.
- [ ] Record the chosen bootstrap sequence inside the Windows runner implementation.
- [ ] Verify `/trpc/healthcheck.ready` is reachable from the Windows runner.

## Phase 1: Backend Harness

**Target file:** `tests/e2e/student-flow/backend-harness.ts`

- [x] Create the backend harness CLI file.
- [x] Add bootstrap command(s) for end-to-end scenario creation.
- [x] Reuse seeded admin and teacher users from the E2E database setup.
- [x] Implement real login flows for admin and teacher.
- [x] Implement classroom creation.
- [x] Implement one-off schedule creation.
- [x] Implement enrollment ticket creation.
- [x] Implement real machine registration.
- [x] Return scenario JSON with classroom ID, machine ID, machine token, whitelist URL, API URL, and fixture hosts.
- [x] Implement `submitManualRequest(domain)`.
- [x] Implement `getRequestStatus(requestId)`.
- [x] Implement `approveRequest(requestId)`.
- [x] Implement `rejectRequest(requestId)`.
- [x] Implement `setAutoApprove(enabled)`.
- [x] Implement `createGroupRule({ type, value, comment })`.
- [x] Implement `deleteGroupRule(ruleId)`.
- [x] Implement `createTemporaryExemption(machineId, classroomId, scheduleId)`.
- [x] Implement `deleteTemporaryExemption(exemptionId)`.
- [x] Implement `setActiveGroup(classroomId, groupIdOrNull)`.
- [x] Implement `tickBoundaries(atIsoTimestamp)`.
- [x] Verify every server-side mutation required by the matrix is exposed through the harness.

## Phase 2: Fixture Server

**Target file:** `tests/e2e/student-flow/fixture-server.ts`

- [x] Create the fixture server.
- [x] Serve deterministic content by `Host` header.
- [x] Add host support for `portal.127.0.0.1.sslip.io`.
- [x] Add host support for `cdn.portal.127.0.0.1.sslip.io`.
- [x] Add host support for `site.127.0.0.1.sslip.io`.
- [x] Add host support for `api.site.127.0.0.1.sslip.io`.
- [x] Add `/ok` route.
- [x] Add `/private` route.
- [x] Add `/iframe/private` route.
- [x] Add `/xhr/private.json` route.
- [x] Add `/fetch/private.json` route.
- [x] Add stable DOM markers for page status.
- [x] Add stable DOM markers for subdomain probe status.
- [x] Add stable DOM markers for iframe probe status.
- [x] Add stable DOM markers for XHR probe status.
- [x] Add stable DOM markers for fetch probe status.

## Phase 3: Extension Config Fallback

**Target files:**

- `firefox-extension/src/lib/config-storage.ts`
- `firefox-extension/native/openpath-native-host.py`
- `windows/scripts/OpenPath-NativeHost.ps1`
- `firefox-extension/tests/config-storage.test.ts`

- [x] Add native host `get-config` support on Linux.
- [x] Add native host `get-config` support on Windows.
- [x] Return API URL from the installed config.
- [x] Return request API URL from the installed config.
- [x] Return machine token from the installed config.
- [x] Return hostname from the installed config.
- [x] Update `loadRequestConfig()` to use native fallback when extension storage is empty.
- [x] Add tests for storage-first priority.
- [x] Add tests for native fallback behavior.
- [x] Add tests for graceful failure when native config cannot be loaded.

## Phase 4: Fast Path-Rule Refresh

**Target files:**

- `firefox-extension/src/background.ts`
- `firefox-extension/tests/background.test.ts`

- [x] Add a message action that forces blocked-path rule refresh.
- [x] Ensure the action calls `refreshBlockedPathRules(true)`.
- [x] Add unit coverage for forced refresh.
- [x] Preserve existing `evaluatePathBlocking()` behavior.
- [x] Preserve existing redirect-to-blocked-screen behavior.

## Phase 5: Selenium Student Policy Suite

**Target files:**

- `tests/selenium/student-policy-flow.e2e.ts`
- `tests/selenium/package.json`

- [x] Create the Selenium suite file.
- [x] Add headless Firefox setup.
- [x] Load the real OpenPath extension.
- [x] Read scenario JSON from the backend harness.
- [x] Implement `openAndExpectBlocked(url)`.
- [x] Implement `openAndExpectLoaded({ url, title?, selector? })`.
- [x] Implement `waitForBlockedScreen()`.
- [x] Implement `waitForDomStatus(selector, expectedValue)`.
- [x] Implement `assertDnsBlocked(hostname)`.
- [x] Implement `assertDnsAllowed(hostname)`.
- [x] Implement `assertWhitelistContains(hostname)`.
- [x] Implement `assertWhitelistMissing(hostname)`.
- [x] Implement `refreshBlockedPathRules()`.
- [x] Implement `withSseDisabled(testFn)`.
- [x] Implement `forceLocalUpdate()`.
- [x] Emit screenshots on failure.
- [x] Emit final HTML snapshot on failure.
- [x] Emit browser logs or equivalent diagnostics on failure.
- [x] Add package scripts for running the student policy suite.

## Phase 6: Linux Runner Lane

**Target files:**

- `tests/e2e/Dockerfile.student`
- `tests/e2e/ci/run-linux-student-flow.sh`

- [x] Create the Linux student Dockerfile.
- [x] Install Firefox in the image.
- [x] Install geckodriver in the image.
- [x] Install Node in the image.
- [x] Stage the extension assets in the image.
- [x] Create the Linux student runner script.
- [x] Start PostgreSQL on the Linux host runner.
- [x] Start the API on the Linux host runner.
- [x] Start the fixture server on the Linux host runner.
- [x] Start the student container with access to host services.
- [x] Enroll the Linux client with the real machine token flow.
- [x] Run an initial whitelist update.
- [x] Run the student policy suite in SSE mode.
- [x] Disable the Linux SSE listener.
- [x] Run the student policy suite in fallback mode.
- [x] Collect Linux client logs.
- [x] Collect Linux DNS diagnostics.
- [x] Collect Linux whitelist snapshot.

## Phase 7: Windows Runner Lane

**Target file:** `tests/e2e/ci/run-windows-student-flow.ps1`

- [x] Create the Windows student runner script.
- [ ] Start PostgreSQL on the Windows runner.
- [ ] Start the API on the Windows runner.
- [ ] Start the fixture server on the Windows runner.
- [ ] Install the Windows client.
- [ ] Enroll the Windows client with the real machine token flow.
- [ ] Run an initial whitelist update.
- [ ] Install Firefox.
- [ ] Install geckodriver.
- [ ] Run the student policy suite in SSE mode.
- [ ] Disable the Windows SSE path/task.
- [ ] Run the student policy suite in fallback mode.
- [ ] Collect Windows client logs.
- [ ] Collect Windows DNS diagnostics.
- [ ] Collect Windows whitelist snapshot.
- [ ] Collect Windows scheduled-task diagnostics.

## Phase 8: Workflow Wiring

**Target files:**

- `.github/workflows/e2e-tests.yml`
- `package.json`

- [x] Add `linux-student-policy` job.
- [x] Add `windows-student-policy` job.
- [x] Keep lifecycle Linux job intact.
- [x] Keep lifecycle Windows job intact.
- [x] Expand workflow `paths` filters for API changes.
- [x] Expand workflow `paths` filters for shared package changes.
- [x] Expand workflow `paths` filters for Linux client changes.
- [x] Expand workflow `paths` filters for Windows client changes.
- [x] Expand workflow `paths` filters for extension changes.
- [x] Expand workflow `paths` filters for Selenium and E2E support changes.
- [x] Add workflow `concurrency` for `main`.
- [x] Make the summary/final gate depend on both new student-policy jobs.
- [x] Add repo-level convenience scripts if needed.

## Phase 9: Scenario Completion Checklist

### Request Lifecycle

- [ ] SP-001 Baseline domain block
- [ ] SP-002 Manual request stays pending
- [ ] SP-003 Manual request approved
- [ ] SP-004 Manual request rejected
- [ ] SP-005 Duplicate request
- [ ] SP-006 Auto-approve disabled
- [ ] SP-007 Auto-approve enabled

### Blocked Subdomain

- [ ] SP-008 Direct subdomain block
- [ ] SP-009 Subdomain subresource block
- [ ] SP-010 Subdomain unblock

### Blocked Path

- [ ] SP-011 Path block on main frame
- [ ] SP-012 Path block on iframe
- [ ] SP-013 Path block on XHR
- [ ] SP-014 Path block on fetch
- [ ] SP-015 Path unblock

### Temporary Exemptions

- [ ] SP-016 Create temporary exemption
- [ ] SP-017 Revoke temporary exemption
- [ ] SP-018 Temporary exemption expiry

### Active Group and Schedule

- [ ] SP-019 Set active group override
- [ ] SP-020 Clear active group override
- [ ] SP-021 Enter schedule boundary
- [ ] SP-022 Exit schedule boundary

### Propagation

- [ ] SP-023 Propagation through SSE
- [ ] SP-024 Propagation through fallback

## Phase 10: Verification and Stabilization

- [x] Linux student-policy lane passes locally.
- [ ] Windows student-policy lane passes locally.
- [ ] Linux lifecycle lane still passes.
- [ ] Windows lifecycle lane still passes.
- [x] SSE mode passes on Linux.
- [ ] SSE mode passes on Windows.
- [x] Fallback mode passes on Linux.
- [ ] Fallback mode passes on Windows.
- [ ] Required failure artifacts are emitted correctly.
- [x] The full matrix is green on Linux.
- [ ] The full matrix is green on Windows.
- [ ] The workflow is blocking on relevant pushes to `main`.
- [ ] Three consecutive GitHub Actions runs are green.
- [ ] `tests/e2e/README.md` references remain correct.

## Final Definition of Done

- [ ] Every student-relevant policy family is validated on real Linux and Windows clients.
- [ ] Server mutations are driven through real backend contracts, not the admin SPA.
- [ ] Browser assertions reflect real student-visible behavior.
- [ ] Both SSE and fallback propagation modes are covered.
- [ ] The workflow is ready to serve as the implementation reference for the student-policy E2E rollout.
