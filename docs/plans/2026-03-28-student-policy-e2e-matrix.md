# Student Policy E2E Test Matrix

**Purpose:** Define the exact test matrix, helper contracts, assertions, propagation expectations, and artifact requirements for the real Linux/Windows student policy workflow.

## Shared Preconditions

Every test run must satisfy the following:

- real PostgreSQL database
- real OpenPath API process
- real machine enrollment
- real whitelist URL and machine token
- real Firefox browser
- real OpenPath Firefox extension
- real Linux/Windows client behavior
- deterministic local fixture server
- seeded admin and teacher users
- one classroom with at least:
  - a restricted default group
  - an alternate group
  - a one-off schedule slot usable for exemptions and boundary checks

## Execution Modes

Each policy family must be validated in both modes:

### Mode A: SSE

The client receives rule-change propagation through the real SSE path.

### Mode B: Fallback

The SSE listener is disabled and the client must converge through the non-SSE update path.

## Fixture Hosts and Routes

The fixture server provides deterministic local content using hostnames that resolve to the local test server.

### Proposed Hosts

- `portal.127.0.0.1.sslip.io`
- `cdn.portal.127.0.0.1.sslip.io`
- `site.127.0.0.1.sslip.io`
- `api.site.127.0.0.1.sslip.io`

### Proposed Routes

- `/ok`
- `/private`
- `/iframe/private`
- `/xhr/private.json`
- `/fetch/private.json`

## Helper Contracts

### Backend Harness

`tests/e2e/student-flow/backend-harness.ts` must expose:

- `bootstrapStudentScenario()`
- `submitManualRequest(domain)`
- `getRequestStatus(requestId)`
- `approveRequest(requestId)`
- `rejectRequest(requestId)`
- `setAutoApprove(enabled)`
- `createGroupRule({ type, value, comment })`
- `deleteGroupRule(ruleId)`
- `createTemporaryExemption(machineId, classroomId, scheduleId)`
- `deleteTemporaryExemption(exemptionId)`
- `setActiveGroup(classroomId, groupIdOrNull)`
- `tickBoundaries(atIsoTimestamp)`

### Browser Suite

`tests/selenium/student-policy-flow.e2e.ts` must expose:

- `openAndExpectBlocked(url)`
- `openAndExpectLoaded({ url, title?, selector? })`
- `waitForBlockedScreen()`
- `waitForDomStatus(selector, expectedValue)`
- `assertDnsBlocked(hostname)`
- `assertDnsAllowed(hostname)`
- `assertWhitelistContains(hostname)`
- `assertWhitelistMissing(hostname)`
- `refreshBlockedPathRules()`
- `withSseDisabled(testFn)`
- `forceLocalUpdate()`

### Local Platform Assertions

Linux implementation:

- DNS assertions use `dig @127.0.0.1`
- whitelist assertions use `/var/lib/openpath/whitelist.txt`
- fallback mode disables `openpath-sse-listener.service`

Windows implementation:

- DNS assertions use `Resolve-DnsName -Server 127.0.0.1`
- whitelist assertions use `C:\OpenPath\data\whitelist.txt`
- fallback mode disables the `OpenPath-SSE` path/task

## Test Matrix

### Request Lifecycle

#### SP-001 Baseline domain block

**Server state:**

- domain is not whitelisted
- no exemption is active

**Student action:**

- navigate to the blocked host

**Helpers:**

- `openAndExpectBlocked(url)`
- `assertDnsBlocked(host)`
- `assertWhitelistMissing(host)`

**Pass criteria:**

- the target page does not load
- DNS is blocked locally
- whitelist does not contain the host

#### SP-002 Manual request stays pending

**Server mutation:**

- `submitManualRequest(domain)`

**Student action:**

- re-check the blocked host

**Helpers:**

- `getRequestStatus(requestId)`
- `openAndExpectBlocked(url)`

**Pass criteria:**

- request status is `pending`
- the domain remains blocked
- whitelist remains unchanged

#### SP-003 Manual request approved

**Server mutation:**

- `approveRequest(requestId)`

**Student action:**

- revisit the same host

**Helpers:**

- `assertWhitelistContains(host)`
- `openAndExpectLoaded({ url, title: 'Example Domain' })`

**Pass criteria:**

- request status becomes `approved`
- whitelist contains the host
- the page loads successfully

#### SP-004 Manual request rejected

**Server mutation:**

- `rejectRequest(requestId)`

**Student action:**

- revisit the same host

**Helpers:**

- `assertWhitelistMissing(host)`
- `openAndExpectBlocked(url)`

**Pass criteria:**

- request status becomes `rejected`
- whitelist does not contain the host
- the page remains blocked

#### SP-005 Duplicate request

**Server mutation:**

- submit the same request a second time

**Student action:**

- none beyond re-checking the result

**Helpers:**

- `submitManualRequest(domain)`
- `getRequestStatus(requestId)`

**Pass criteria:**

- the second submission is reported as `duplicate` or equivalent conflict
- access state does not change incorrectly
- no unexpected extra approval appears

#### SP-006 Auto-approve disabled

**Server mutation:**

- `setAutoApprove(false)`

**Student action:**

- trigger blocked request flow from real browser traffic

**Helpers:**

- page-driven `fetch` or `xhr` probe
- `waitForDomStatus('#fetch-status', 'blocked')` or equivalent

**Pass criteria:**

- access is not granted automatically
- server reports non-approved behavior
- the resource remains blocked

#### SP-007 Auto-approve enabled

**Server mutation:**

- `setAutoApprove(true)`

**Student action:**

- trigger the same blocked request flow from real browser traffic

**Helpers:**

- page-driven `fetch` or `xhr` probe
- `assertWhitelistContains(host)` if the flow whitelists the domain
- second fetch/xhr probe after convergence

**Pass criteria:**

- server reports `autoApproved === true`
- client converges locally
- the follow-up request succeeds

### Blocked Subdomain

#### SP-008 Direct subdomain block

**Server mutation:**

- `createGroupRule({ type: 'blocked_subdomain', value: blockedSubdomain })`

**Student action:**

- open the base host
- open the blocked subdomain directly

**Helpers:**

- `openAndExpectLoaded(baseUrl)`
- `openAndExpectBlocked(subdomainUrl)`
- `assertDnsAllowed(baseHost)`
- `assertDnsBlocked(subdomainHost)`

**Pass criteria:**

- base host loads
- blocked subdomain does not load
- DNS behavior matches the rule

#### SP-009 Subdomain subresource block

**Server state:**

- blocked subdomain rule is active

**Student action:**

- open a page on the base host that references a resource on the blocked subdomain

**Helpers:**

- `openAndExpectLoaded(pageUrl)`
- `waitForDomStatus('#subdomain-status', 'blocked')`

**Pass criteria:**

- base page loads
- subresource probe reports blocked
- student-visible page state confirms the blocked dependency

#### SP-010 Subdomain unblock

**Server mutation:**

- `deleteGroupRule(ruleId)`

**Student action:**

- revisit both the direct subdomain URL and the base page with the subresource probe

**Helpers:**

- `assertDnsAllowed(subdomainHost)`
- `openAndExpectLoaded(subdomainUrl)`
- `waitForDomStatus('#subdomain-status', 'ok')`

**Pass criteria:**

- direct subdomain access succeeds
- subresource loads successfully again

### Blocked Path

#### SP-011 Path block on main frame

**Server mutation:**

- `createGroupRule({ type: 'blocked_path', value: 'site.127.0.0.1.sslip.io/private' })`

**Student action:**

- navigate to `https://site.127.0.0.1.sslip.io/private`

**Helpers:**

- `refreshBlockedPathRules()`
- `waitForBlockedScreen()`

**Pass criteria:**

- browser lands on `/blocked/blocked.html`
- the `error` query param begins with `BLOCKED_PATH_POLICY:`
- a non-blocked route on the same host still loads normally

#### SP-012 Path block on iframe

**Server state:**

- same blocked path rule is active

**Student action:**

- open a page that embeds the blocked path in an iframe

**Helpers:**

- `openAndExpectLoaded(pageUrl)`
- `waitForDomStatus('#iframe-status', 'blocked')`

**Pass criteria:**

- page itself loads
- iframe probe reports blocked

#### SP-013 Path block on XHR

**Server state:**

- same blocked path rule is active

**Student action:**

- trigger an XHR request to the blocked route

**Helpers:**

- `waitForDomStatus('#xhr-status', 'blocked')`

**Pass criteria:**

- XHR is blocked
- no protected payload reaches the page

#### SP-014 Path block on fetch

**Server state:**

- same blocked path rule is active

**Student action:**

- trigger a fetch request to the blocked route

**Helpers:**

- `waitForDomStatus('#fetch-status', 'blocked')`

**Pass criteria:**

- fetch is blocked
- no protected payload reaches the page

#### SP-015 Path unblock

**Server mutation:**

- `deleteGroupRule(ruleId)`

**Student action:**

- revisit the blocked main-frame route
- re-run iframe, XHR, and fetch probes

**Helpers:**

- `refreshBlockedPathRules()`
- `openAndExpectLoaded(privateUrl)`
- `waitForDomStatus('#iframe-status', 'ok')`
- `waitForDomStatus('#xhr-status', 'ok')`
- `waitForDomStatus('#fetch-status', 'ok')`

**Pass criteria:**

- main-frame route loads
- iframe loads
- XHR succeeds
- fetch succeeds

### Temporary Exemptions

#### SP-016 Create temporary exemption

**Server mutation:**

- `createTemporaryExemption(machineId, classroomId, scheduleId)`

**Student action:**

- revisit a host that is still not whitelisted

**Helpers:**

- `openAndExpectLoaded(url)`
- `assertWhitelistMissing(host)`

**Pass criteria:**

- the host loads because the machine is temporarily unrestricted
- the whitelist still does not contain the domain

#### SP-017 Revoke temporary exemption

**Server mutation:**

- `deleteTemporaryExemption(exemptionId)`

**Student action:**

- revisit the same host

**Helpers:**

- `openAndExpectBlocked(url)`
- `assertWhitelistMissing(host)`

**Pass criteria:**

- the host becomes blocked again
- the whitelist remains unchanged

#### SP-018 Temporary exemption expiry

**Server mutation:**

- `tickBoundaries(expiryTimestamp)`

**Student action:**

- revisit the same host after the forced boundary tick

**Helpers:**

- `openAndExpectBlocked(url)`

**Pass criteria:**

- access is revoked automatically when the exemption expires
- no manual delete is required

### Active Group and Schedule

#### SP-019 Set active group override

**Server mutation:**

- `setActiveGroup(classroomId, alternateGroupId)`

**Student action:**

- check a resource allowed only in the alternate group
- check a resource allowed only in the base group

**Helpers:**

- `openAndExpectLoaded(alternateAllowedUrl)`
- `openAndExpectBlocked(baseOnlyUrl)`

**Pass criteria:**

- policy switches to the alternate group immediately
- access reflects the new effective group

#### SP-020 Clear active group override

**Server mutation:**

- `setActiveGroup(classroomId, null)`

**Student action:**

- re-check the same pair of resources

**Helpers:**

- `openAndExpectBlocked(alternateAllowedUrl)`
- `openAndExpectLoaded(baseOnlyUrl)`

**Pass criteria:**

- policy returns to the scheduled/default group
- access reflects the original effective group

#### SP-021 Enter schedule boundary

**Server mutation:**

- `tickBoundaries(scheduleStartTimestamp)`

**Student action:**

- revisit a resource allowed only while the schedule is active

**Helpers:**

- `openAndExpectLoaded(scheduleOnlyUrl)`

**Pass criteria:**

- the schedule activates
- the effective group changes
- the student-visible access changes accordingly

#### SP-022 Exit schedule boundary

**Server mutation:**

- `tickBoundaries(scheduleEndTimestamp)`

**Student action:**

- revisit the same resource

**Helpers:**

- `openAndExpectBlocked(scheduleOnlyUrl)`

**Pass criteria:**

- the schedule deactivates
- the effective group reverts
- the student-visible access reverts accordingly

### Propagation

#### SP-023 Propagation through SSE

**Applies to:**

- request approval
- subdomain rule add/delete
- path rule add/delete
- exemption create/delete/expire
- active group set/clear
- schedule enter/exit

**Mode:**

- SSE enabled

**Helpers:**

- `waitForConvergence({ mode: 'sse' })`

**Pass criteria:**

- convergence happens without forced local update
- client logs show active SSE behavior or whitelist-changed handling

#### SP-024 Propagation through fallback

**Applies to:**

- the same policy families as SP-023

**Mode:**

- SSE disabled

**Helpers:**

- `withSseDisabled(...)`
- `forceLocalUpdate()`

**Pass criteria:**

- convergence does not depend on SSE
- the final access state matches the SSE mode outcome

## Required Failure Artifacts

Every failure must emit:

- final browser screenshot
- final HTML snapshot
- backend logs
- client logs
- local whitelist snapshot
- local DNS probe output
- propagation mode indicator (`sse` or `fallback`)

## Definition of Done

The student policy workflow is complete only when:

- all 24 scenarios pass on Linux
- all 24 scenarios pass on Windows
- SSE and fallback modes are both covered
- the workflow is blocking on relevant pushes to `main`
- no admin SPA interaction is required to prepare or mutate server state
