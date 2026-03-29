# Student Policy E2E Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add blocking GitHub Actions lanes on `main` that validate the key student-facing policy flows on real Linux and Windows clients, using a real API + database backend, a real Firefox browser, and the real Firefox extension.

**Architecture:** The critical path uses a real OpenPath backend, real machine enrollment, real Linux/Windows client behavior, real Firefox navigation, and the real Firefox extension for path blocking. Server-side state changes are triggered through real HTTP/tRPC mutations, not through the admin SPA. The SPA is explicitly out of scope for the blocking workflow.

**Tech Stack:** TypeScript/Express, PostgreSQL, Bash, PowerShell, Selenium WebDriver, Firefox, systemd, Windows Task Scheduler

## Scope

This implementation must cover all student-relevant policy families:

- domain request lifecycle (`pending`, `approved`, `rejected`, `duplicate`)
- auto-approve behavior (`AUTO_APPROVE_MACHINE_REQUESTS` disabled/enabled)
- blocked subdomains
- blocked paths for `main_frame`, `sub_frame`, `xmlhttprequest`, and `fetch`
- temporary machine exemptions (create, revoke, expire)
- active classroom group overrides
- schedule boundary transitions
- propagation through both SSE and non-SSE fallback paths

The exact scenario list, helper contracts, and assertions live in `docs/plans/2026-03-28-student-policy-e2e-matrix.md`.

The implementation tracking checklist lives in `docs/plans/2026-03-28-student-policy-e2e-checklist.md`.

## Non-Goals

- No ClassroomPath changes.
- No admin SPA UI coverage in the blocking workflow.
- No popup-driven request submission in the blocking workflow.
- No visual regression coverage.
- No generic dashboard smoke tests unrelated to student/client behavior.

## Test Architecture

The student policy workflow is composed of five layers:

1. **Real backend harness**
   - Starts the API against a real PostgreSQL database.
   - Logs in seeded admin/teacher users.
   - Creates classrooms, schedules, rules, requests, and exemptions through real API/tRPC contracts.
   - Registers and enrolls a real machine.
   - Exposes deterministic test control commands.

2. **Student fixture server**
   - Serves deterministic pages and resources from local HTTP endpoints.
   - Uses multiple hostnames to model domain, subdomain, and path behavior.
   - Avoids relying on third-party sites.

3. **Real client machine**
   - Linux: installed agent, local DNS enforcement, systemd services.
   - Windows: installed agent, Acrylic DNS Proxy, scheduled tasks.
   - Uses the real whitelist and real machine token flow.

4. **Real Firefox browser and extension**
   - Firefox runs headless in CI.
   - The real OpenPath extension is loaded.
   - Path blocking is validated through the extension's `webRequest` behavior.

5. **Cross-platform student suite**
   - A single Selenium suite runs the same logical matrix on Linux and Windows.
   - Platform-specific runners only handle environment bootstrap and local diagnostics.

## Workflow Shape

`OpenPath/.github/workflows/e2e-tests.yml` will keep the existing lifecycle lanes and add two new blocking lanes:

- `linux-student-policy`
- `windows-student-policy`

All four lanes become required for relevant pushes to `main`:

- lifecycle Linux
- lifecycle Windows
- student-policy Linux
- student-policy Windows

## Proposed Files

### Create

- `tests/e2e/student-flow/backend-harness.ts`
- `tests/e2e/student-flow/fixture-server.ts`
- `tests/selenium/student-policy-flow.e2e.ts`
- `tests/e2e/Dockerfile.student`
- `tests/e2e/ci/run-linux-student-flow.sh`
- `tests/e2e/ci/run-windows-student-flow.ps1`

### Modify

- `.github/workflows/e2e-tests.yml`
- `tests/selenium/package.json`
- `package.json`

### Recommended Product-Side Modifications

These are not test-only hacks; they improve real product wiring and make the student workflow reliable in CI:

- `firefox-extension/src/lib/config-storage.ts`
- `firefox-extension/src/background.ts`
- `firefox-extension/native/openpath-native-host.py`
- `windows/scripts/OpenPath-NativeHost.ps1`
- `firefox-extension/tests/config-storage.test.ts`
- `firefox-extension/tests/background.test.ts`

## Task 0: Close the Windows backend bootstrap risk

**Files:**

- Research only before implementation.
- Likely touch: `tests/e2e/ci/run-windows-student-flow.ps1`

**Steps:**

1. Confirm a stable way to launch PostgreSQL on `windows-2022`.
2. Confirm the API can be started locally with deterministic environment variables.
3. Confirm the runner can host both the API and fixture server without port conflicts.
4. Document the exact bootstrap sequence before wiring the full workflow.

**Exit Criteria:**

- Windows runner can host PostgreSQL + API + fixture server.
- `/trpc/healthcheck.ready` returns healthy from the same runner.

## Task 1: Build the backend harness

**Files:**

- Create: `tests/e2e/student-flow/backend-harness.ts`

**Steps:**

1. Add a CLI entry with subcommands for bootstrap and state mutations.
2. Reuse seeded users from the E2E DB setup.
3. Implement real login flows for admin and teacher.
4. Create classrooms and one-off schedules through real routers.
5. Register and enroll a machine with a real machine token and whitelist URL.
6. Add helpers for request approval/rejection, rule creation/deletion, exemptions, and active group changes.
7. Add a deterministic boundary tick helper for schedule/exemption expiry validation.

**Exit Criteria:**

- One command produces a complete scenario JSON with all IDs, tokens, URLs, and hostnames needed by the browser suite.
- Every server-side mutation used by the matrix is exposed through the harness.

## Task 2: Build the fixture server

**Files:**

- Create: `tests/e2e/student-flow/fixture-server.ts`

**Steps:**

1. Serve deterministic pages for domain, subdomain, and path tests.
2. Route behavior by `Host` header.
3. Provide dedicated DOM markers for page status and blocked subresource probes.
4. Add endpoints for `main_frame`, `iframe`, `xhr`, and `fetch` path checks.

**Exit Criteria:**

- The browser suite can detect success/failure by DOM markers alone.
- No external sites are required to validate student behavior.

## Task 3: Add extension config fallback from native host

**Files:**

- Modify: `firefox-extension/src/lib/config-storage.ts`
- Modify: `firefox-extension/native/openpath-native-host.py`
- Modify: `windows/scripts/OpenPath-NativeHost.ps1`
- Test: `firefox-extension/tests/config-storage.test.ts`

**Steps:**

1. Add a native host `get-config` action.
2. Return the API URL, request API URL, hostname, and machine token from the installed client config.
3. Update `loadRequestConfig()` to use native fallback when storage config is absent.
4. Add tests for priority, fallback, and failure handling.

**Exit Criteria:**

- Request and auto-approve flows do not require popup or manual extension config.
- Linux and Windows native hosts expose the same contract.

## Task 4: Add fast path-rule refresh hooks

**Files:**

- Modify: `firefox-extension/src/background.ts`
- Test: `firefox-extension/tests/background.test.ts`

**Steps:**

1. Add a message action that forces `refreshBlockedPathRules(true)`.
2. Optionally expose lightweight path-rule diagnostics for the test suite.
3. Add unit tests for forced refresh behavior.

**Exit Criteria:**

- The browser suite can update path rules without waiting for the 60-second polling loop.
- Existing path blocking behavior remains unchanged.

## Task 5: Build the Selenium student policy suite

**Files:**

- Create: `tests/selenium/student-policy-flow.e2e.ts`
- Modify: `tests/selenium/package.json`

**Steps:**

1. Add browser setup and teardown for headless Firefox with the real extension.
2. Read scenario JSON from the backend harness.
3. Implement helpers for browser navigation, blocked screen assertions, whitelist assertions, DNS assertions, and propagation waits.
4. Implement the full test matrix defined in the companion matrix document.
5. Emit screenshots, HTML snapshots, and logs on failure.

**Exit Criteria:**

- The student matrix runs locally against the harness and fixture server.
- The suite is shared across Linux and Windows.

## Task 6: Implement the Linux runner lane

**Files:**

- Create: `tests/e2e/Dockerfile.student`
- Create: `tests/e2e/ci/run-linux-student-flow.sh`

**Steps:**

1. Build a Linux E2E image with systemd, Firefox, geckodriver, Node, and the extension assets.
2. Start PostgreSQL + API + fixture server on the host runner.
3. Start the student container with networking to the host services.
4. Enroll the Linux client through the installed CLI.
5. Run an initial local whitelist update to converge the client.
6. Execute the student suite in SSE mode.
7. Disable the SSE listener and execute the fallback portion.
8. Collect logs and artifacts.

**Exit Criteria:**

- Linux passes the full student matrix in both SSE and fallback modes.
- Failure diagnostics are sufficient for remote debugging.

## Task 7: Implement the Windows runner lane

**Files:**

- Create: `tests/e2e/ci/run-windows-student-flow.ps1`

**Steps:**

1. Start PostgreSQL + API + fixture server on the Windows runner.
2. Install and enroll the Windows client.
3. Install Firefox and geckodriver.
4. Run an initial whitelist update.
5. Execute the student suite in SSE mode.
6. Disable the `OpenPath-SSE` task/path and execute the fallback portion.
7. Collect logs, whitelist state, and browser artifacts.

**Exit Criteria:**

- Windows passes the full student matrix in both SSE and fallback modes.
- Scheduled task and local DNS diagnostics are available on failure.

## Task 8: Wire the workflow

**Files:**

- Modify: `.github/workflows/e2e-tests.yml`

**Steps:**

1. Add `linux-student-policy` and `windows-student-policy`.
2. Keep existing lifecycle jobs unchanged.
3. Expand workflow path filters to include API, shared, Linux, Windows, extension, Selenium, and E2E files.
4. Add workflow `concurrency` to cancel stale runs on `main`.
5. Update the summary/final gate to require the new jobs.

**Exit Criteria:**

- Relevant pushes to `main` run all four blocking lanes.
- The student lanes do not depend on the admin SPA.

## Task 9: Stabilize and harden

**Files:**

- Modify selected test and runner files as needed.

**Steps:**

1. Tune convergence timeouts for SSE and fallback.
2. Ensure path blocking covers `main_frame`, `sub_frame`, `xmlhttprequest`, and `fetch`.
3. Minimize flakiness by using only local deterministic hosts and content.
4. Re-run the full workflow multiple times until stable.

**Exit Criteria:**

- Three consecutive green runs on Linux and Windows.
- Artifacts are sufficient to debug any failing branch.

## Verification Strategy

The implementation is complete only when the following are true:

- the full student matrix passes on Linux
- the full student matrix passes on Windows
- both propagation modes are covered
- the workflow is blocking on `main`
- no admin SPA flow is required for server mutation setup

## Main Risks

- PostgreSQL bootstrap stability on `windows-2022`
- Firefox + extension stability in CI
- host/container networking for Linux student fixtures
- path blocking flakiness if forced refresh is not implemented
- extension request configuration if native fallback is not implemented

## Recommended Commit Boundaries

1. backend harness
2. fixture server
3. extension config fallback + tests
4. path-rule forced refresh + tests
5. Selenium suite
6. Linux runner
7. Windows runner
8. workflow wiring
9. stabilization

## Definition of Done

This plan is complete when every student-relevant policy family is validated on real Linux and Windows clients on every relevant push to `main`, with all server mutations driven through real backend contracts and all student assertions observed through the actual browser/client behavior.
