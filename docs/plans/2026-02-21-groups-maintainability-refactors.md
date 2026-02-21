# Groups Maintainability Refactors Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve maintainability of Groups RBAC enforcement (API) and teacher UX (SPA) by centralizing group-scoped authorization, removing UI-only gating helpers, and optimizing bulk storage operations, without changing external contracts.

**Architecture:**
- API keeps the layering: Routers (tRPC) -> Services (business logic) -> Storage (Drizzle).
- Group-scoped procedures use reusable tRPC middleware wrappers so authorization is enforced consistently.
- Storage bulk operations become set-based queries (IN clauses) to avoid N+1 behavior and double-fetches.
- SPA uses a single source of truth (server-filtered `groups.list`) and a shared hook to derive allowed groups.

**Tech Stack:** TypeScript, tRPC, Node test runner, Drizzle ORM, React, React Query, Playwright.

## Non-Goals

- No API shape changes (keep procedure names and input schemas compatible).
- No behavior changes to authorization semantics (keep current 403/404 behavior).
- No new UI flows or new permissions; this is refactor + maintainability.

## Task 1: Centralize Group-Scoped RBAC in the Groups Router

**Files:**
- Modify: `api/src/trpc/routers/groups.ts`
- Modify: `api/src/services/groups.service.ts`
- Test: `api/tests/groups.test.ts`

**Step 1: Write failing tests (router auth helper coverage)**

Add a new test to ensure group-scoped procedures enforce access via a single path, not ad-hoc checks.

```ts
await test('should forbid teacher group-scoped operations via shared middleware', async () => {
  const resp = await trpcQuery(
    API_URL,
    'groups.listRules',
    { groupId: otherGroupId },
    bearerAuth(teacherToken)
  );
  assert.strictEqual(resp.status, 403);
});
```

**Step 2: Run the single test to verify RED**

Run: `npm run test:groups --workspace=@openpath/api`

Expected: FAIL (until middleware refactor is wired correctly). If it passes immediately, adjust the test to cover the refactor target (e.g. add a new middleware-specific path or check).

**Step 3: Implement reusable group-scoped procedures**

In `api/src/trpc/routers/groups.ts`, create:

- `teacherGroupIdProcedure` (expects `input.groupId`)
- `teacherGroupByIdProcedure` (expects `input.id`)

Use a safe helper to read the key from `input` without `any`:

```ts
function getInputStringField(input: unknown, key: string): string | null {
  if (typeof input !== 'object' || input === null) return null;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
```

Then:

```ts
const teacherGroupIdProcedure = teacherProcedure.use(async ({ ctx, input, next }) => {
  const groupId = getInputStringField(input, 'groupId');
  if (!groupId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'groupId is required' });
  }
  await assertCanAccessGroupId(ctx.user, groupId);
  return next({ ctx });
});
```

Switch procedures that currently call `assertCanAccessGroupId` to use `teacherGroupIdProcedure` / `teacherGroupByIdProcedure`.

**Step 4: Remove router -> storage reads**

Update `assertCanAccessGroupId` to call `GroupsService.getGroupById` instead of importing storage directly.

Add new service helpers:
- `GroupsService.getRuleGroupId(ruleId)`
- `GroupsService.getRuleGroupIds(ruleIds)` (or `getRulesByIds` returning `Rule[]`)

Then update router paths (`deleteRule`, `bulkDeleteRules`) to call service helpers.

**Step 5: Run relevant tests (GREEN)**

Run: `npm run test:groups --workspace=@openpath/api`

Expected: PASS.

**Step 6: Commit**

```bash
git add api/src/trpc/routers/groups.ts api/src/services/groups.service.ts api/tests/groups.test.ts
git commit -m "refactor(api): centralize group-scoped RBAC in groups router"
```

## Task 2: Optimize Storage Bulk Operations for Rules

**Files:**
- Modify: `api/src/lib/groups-storage.ts`
- Modify: `api/src/services/groups.service.ts`
- Test: `api/tests/groups.test.ts`

**Step 1: Write failing test (bulk delete path)**

Add a test that bulk deletes multiple rules and asserts the returned `deleted` count and `rules` payload reflect the deleted items.

**Step 2: Run test to verify RED**

Run: `npm run test:groups --workspace=@openpath/api`

Expected: FAIL until the optimized storage path is wired.

**Step 3: Implement set-based storage methods**

In `api/src/lib/groups-storage.ts`:

- Update `getRulesByIds(ids)` to perform one `SELECT ... WHERE id IN (...)`.
- Update `bulkDeleteRules(ids)` to perform one `DELETE ... WHERE id IN (...)`.

Ensure results ordering is stable (either document that ordering is DB-dependent or re-map to match input order).

**Step 4: Avoid duplicate reads in service**

In `GroupsService.bulkDeleteRules`, reuse the single pre-delete fetch for SSE + undo payload and do not re-fetch the same IDs again.

**Step 5: Run tests (GREEN)**

Run: `npm run test:groups --workspace=@openpath/api`

Expected: PASS.

**Step 6: Commit**

```bash
git add api/src/lib/groups-storage.ts api/src/services/groups.service.ts api/tests/groups.test.ts
git commit -m "refactor(api): optimize rule bulk operations"
```

## Task 3: SPA - Add Shared Allowed-Groups Hook and Remove UI-Only Gating

**Files:**
- Create: `react-spa/src/hooks/useAllowedGroups.ts`
- Modify: `react-spa/src/views/Classrooms.tsx`
- Modify: `react-spa/src/views/Groups.tsx`
- Modify: `react-spa/src/views/TeacherDashboard.tsx`
- Modify: `react-spa/src/lib/auth.ts`
- Test: `react-spa/src/hooks/__tests__/useAllowedGroups.test.tsx`
- Test: `react-spa/src/views/__tests__/Groups.test.tsx`

**Step 1: Write failing hook test (RED)**

Create `react-spa/src/hooks/__tests__/useAllowedGroups.test.tsx` with an initial test that expects the hook to return an empty list when `trpc.groups.list` returns empty.

Run: `cd react-spa && npx vitest run src/hooks/__tests__/useAllowedGroups.test.tsx`

Expected: FAIL (hook file missing).

**Step 2: Implement `useAllowedGroups` (GREEN)**

Create `useAllowedGroups.ts` that:
- calls `trpc.groups.list` (React Query)
- returns `{ groups, groupsById, isLoading, error, refetch }`

**Step 3: Migrate views to the hook**

Update views to use the hook instead of duplicating mapping/filtering logic.

**Step 4: Remove `getTeacherGroups`**

Delete `getTeacherGroups()` from `react-spa/src/lib/auth.ts` and update tests/mocks referencing it.

**Step 5: Run SPA unit tests**

Run: `npm test --workspace=@openpath/react-spa`

Expected: PASS.

**Step 6: Commit**

```bash
git add react-spa/src/hooks/useAllowedGroups.ts react-spa/src/hooks/__tests__/useAllowedGroups.test.tsx react-spa/src/views/Classrooms.tsx react-spa/src/views/Groups.tsx react-spa/src/views/TeacherDashboard.tsx react-spa/src/lib/auth.ts react-spa/src/views/__tests__/Groups.test.tsx
git commit -m "refactor(spa): centralize allowed groups and remove getTeacherGroups"
```

## Task 4: E2E - Consolidate Authenticated Waits and Navigation

**Files:**
- Modify: `react-spa/e2e/fixtures/test-utils.ts`
- Modify: `react-spa/e2e/domain-management.spec.ts`

**Step 1: Refactor helpers**

Create a helper `waitForAuthenticatedLayout(page)` that waits on a role-agnostic element (sidebar logout button).

**Step 2: Update call sites**

Use `waitForAuthenticatedLayout` in both admin and teacher login flows and ensure domain-management teacher flows assert a stable heading.

**Step 3: Run a focused E2E grep**

Run: `cd react-spa && npx playwright test --grep "Teacher Domain Approval Workflow" --project=chromium`

Expected: PASS.

**Step 4: Commit**

```bash
git add react-spa/e2e/fixtures/test-utils.ts react-spa/e2e/domain-management.spec.ts
git commit -m "refactor(e2e): unify authenticated waits across roles"
```

## Task 5: Documentation Updates

**Files:**
- Modify: `api/AGENTS.md`

**Step 1: Update router table**

Update `groups` router description to reflect mixed teacher/admin procedures.

**Step 2: Commit**

```bash
git add api/AGENTS.md
git commit -m "docs(api): update groups router auth description"
```

## Final Verification

Run (from repo root): `npm run verify:quick`

If everything is green, proceed to merge the worktree branch back to `main` (fast-forward) and keep commits local unless a push is explicitly requested.
