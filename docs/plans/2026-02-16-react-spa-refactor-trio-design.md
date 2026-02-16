# React SPA Refactor Trio Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement three reusable refactors in OpenPath React SPA: normalized search, list-detail selection consistency, and standardized mutation feedback.

**Architecture:** Add focused hooks/helpers in `react-spa/src/hooks` and `react-spa/src/lib` with unit tests first, then wire existing views to consume them with minimal behavior changes. Keep view logic thin and declarative by pushing normalization, selection reconciliation, and API error mapping into reusable units.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, tRPC client.

### Task 1: Normalized Search Primitive

**Files:**

- Create: `react-spa/src/hooks/useNormalizedSearch.ts`
- Create: `react-spa/src/hooks/__tests__/useNormalizedSearch.test.ts`
- Modify: `react-spa/src/views/Classrooms.tsx`
- Modify: `react-spa/src/views/DomainRequests.tsx`

**Steps:**

1. Write failing tests for normalization behavior (trim, lowercase, collapse spaces, optional diacritic-insensitive mode).
2. Run the hook test file and confirm it fails for missing implementation.
3. Implement minimal `normalizeSearchTerm` + `useNormalizedSearch` API.
4. Re-run hook tests and confirm pass.
5. Integrate in `Classrooms` and `DomainRequests` filters.
6. Add/update view tests for case/whitespace-insensitive filtering.

### Task 2: List-Detail Selection Consistency

**Files:**

- Create: `react-spa/src/hooks/useListDetailSelection.ts`
- Create: `react-spa/src/hooks/__tests__/useListDetailSelection.test.tsx`
- Modify: `react-spa/src/views/Classrooms.tsx`
- Modify: `react-spa/src/views/__tests__/Classrooms.test.tsx`

**Steps:**

1. Write failing tests for selected-item reconciliation when filtered list becomes empty or selected item disappears.
2. Run tests and verify RED state.
3. Implement minimal hook to reconcile selected id/object against visible list.
4. Re-run tests and verify GREEN.
5. Integrate hook in `Classrooms` to prevent stale detail panel with empty list.
6. Add/update classroom view tests for empty filtered state clearing detail.

### Task 3: Standardized Mutation Feedback

**Files:**

- Create: `react-spa/src/hooks/useMutationFeedback.ts`
- Create: `react-spa/src/hooks/__tests__/useMutationFeedback.test.ts`
- Modify: `react-spa/src/views/Groups.tsx`
- Create: `react-spa/src/views/__tests__/Groups.test.tsx`

**Steps:**

1. Write failing tests for mapping common mutation failures (`BAD_REQUEST`, `CONFLICT`, generic fallback) into user-facing messages.
2. Run tests and verify RED state.
3. Implement minimal feedback mapper hook/helper.
4. Re-run tests and verify GREEN.
5. Integrate in Groups configuration save flow and render actionable inline error.
6. Add view tests proving visible feedback when `groups.update` fails.

### Task 4: Verification and Delivery

**Files:**

- Modify: any files needed for lint/type/test fixes.

**Steps:**

1. Run `npm run verify:affected` from `OpenPath`.
2. Fix failures until clean.
3. Commit in OpenPath (hook-driven full verification).
4. Push OpenPath and sync ClassroomPath submodule.
5. Deploy staging and validate key flows before issue updates.
