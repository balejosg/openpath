# High-ROI Quality Gates Implementation Plan

> Note: This is an implementation plan; update it as the code evolves.

**Goal:** Make coverage enforcement real in ClassroomPath, prevent `console.*` regressions in both SPAs, and remove the explicit `underscore` workaround while keeping `npm audit --audit-level=high` passing.

**Architecture:**

- ClassroomPath: generate coverage JSON artifacts during `verify:full` (API + SPA) so `scripts/check-new-file-coverage.js` can enforce the 80% threshold.
- OpenPath + ClassroomPath SPAs: enforce `no-console` for `src/**` (allow only `console.error` inside `reportError.ts`, allow console in tests).
- OpenPath + ClassroomPath: remove root `devDependencies.underscore` and rely on the existing transitive resolution to `underscore@1.13.8` (still pulled via `typed-rest-client`).

**Tech Stack:** Node.js 20+, npm workspaces, Husky pre-commit, ESLint (flat config), Vitest, Playwright, c8 (Istanbul JSON), npm audit.

---

## OpenPath (repo: `OpenPath/`)

### Task OP1: Ensure OpenPath SPA is linted by `verify:full`

**Files:**

- Modify: `OpenPath/react-spa/package.json`

**Step 1: Add a `lint` script to the SPA workspace**

Add scripts (keep them using the monorepo root config):

```json
{
  "scripts": {
    "lint": "eslint --config ../eslint.config.js . --max-warnings=0",
    "lint:fix": "eslint --config ../eslint.config.js . --fix --max-warnings=0"
  }
}
```

**Step 2: Verify Turbo now picks up SPA lint**

Run: `cd OpenPath && npm run verify:static`

Expected: Turbo runs `@openpath/react-spa:lint` (no “missing task” for react-spa).

**Step 3: Commit**

Run:

```bash
cd OpenPath
git add react-spa/package.json
git commit -m "chore(spa): add eslint lint script"
```

---

### Task OP2: Enforce `no-console` in OpenPath SPA app code

**Files:**

- Modify: `OpenPath/eslint.config.js`

**Step 1: Write the lint expectation (quick manual check)**

Create a temporary local change (do not commit) that introduces a `console.log` in `OpenPath/react-spa/src/...` and confirm lint would fail once the rule is in place.

**Step 2: Implement scoped ESLint overrides**

Update `OpenPath/eslint.config.js` to:

- Keep global `no-console: 'off'` (don’t break scripts/tooling)
- Add a `files: ['react-spa/src/**/*.{ts,tsx}']` override with `no-console: 'error'`
- Add a `files: ['react-spa/src/lib/reportError.ts']` override allowing only `console.error`
- Add a test override (e.g. `react-spa/src/**/__tests__/**` and `*.test.ts(x)` / `*.spec.ts(x)`) with `no-console: 'off'`

Example rule payload for `reportError.ts`:

```js
'no-console': ['error', { allow: ['error'] }]
```

**Step 3: Run lint for SPA only**

Run: `cd OpenPath/react-spa && npm run lint`

Expected: PASS (only `reportError.ts` uses console).

**Step 4: Commit**

Run:

```bash
cd OpenPath
git add eslint.config.js
git commit -m "chore(spa): ban console outside reportError"
```

---

### Task OP3: Remove the explicit `underscore` root devDependency

**Files:**

- Modify: `OpenPath/package.json`
- Modify: `OpenPath/package-lock.json`

**Step 1: Confirm current dependency chain**

Run: `cd OpenPath && npm ls underscore`

Expected: `underscore@1.13.8` present; chain includes `@stryker-mutator/core -> typed-rest-client -> underscore`.

**Step 2: Remove the root pin**

Edit `OpenPath/package.json` and remove:

```json
"underscore": "1.13.8"
```

**Step 3: Update lockfile (minimize churn)**

Run: `cd OpenPath && npm install --package-lock-only`

**Step 4: Verify audit and resolved version**

Run:

- `cd OpenPath && npm audit --audit-level=high`
- `cd OpenPath && npm ls underscore`

Expected:

- `npm audit` finds 0 vulnerabilities
- `underscore` still resolves to `1.13.8` transitively

**Step 5: Commit**

Run:

```bash
cd OpenPath
git add package.json package-lock.json
git commit -m "chore(security): drop underscore root pin"
```

---

## ClassroomPath (repo: `ClassroomPath/`)

### Task CP0: Create a ClassroomPath worktree for isolation

**Decision needed:** Choose worktree location:

- project-local `.worktrees/` (requires adding it to `ClassroomPath/.gitignore` first)
- global `~/.config/superpowers/worktrees/ClassroomPath/` (no gitignore changes)

---

### Task CP1: Make coverage artifacts exist (so the 80% gate actually runs)

**Files:**

- Modify: `ClassroomPath/api/package.json`
- Modify: `ClassroomPath/react-spa/package.json`
- Modify: `ClassroomPath/scripts/verify-full.sh`
- Modify: `ClassroomPath/.gitignore`

**Step 1: Add API coverage script + dependency**

In `ClassroomPath/api/package.json`:

- Add devDependency: `c8`
- Add script:

```json
"test:coverage": "c8 --reporter=json node --import tsx --test tests/*.test.ts"
```

**Step 2: Add SPA coverage script + dependency**

In `ClassroomPath/react-spa/package.json`:

- Add devDependency: `@vitest/coverage-v8`
- Add script:

```json
"test:coverage": "vitest run --coverage --coverage.provider=v8 --coverage.reporter=json"
```

**Step 3: Wire coverage scripts into `verify:full`**

In `ClassroomPath/scripts/verify-full.sh`, replace:

- `npm run test --workspace=@classroompath/react-spa` → `npm run test:coverage --workspace=@classroompath/react-spa`
- `npm run test --workspace=@classroompath/api` → `npm run test:coverage --workspace=@classroompath/api`

Keep `npm run test:integration --workspace=@classroompath/api` as-is.

**Step 4: Ignore generated coverage output**

In `ClassroomPath/.gitignore`, add:

- `coverage/`
- `api/coverage/`
- `react-spa/coverage/`

**Step 5: Run a targeted verification**

Run: `cd ClassroomPath && npm run verify:full`

Expected at the end:

- Coverage check prints `Loaded coverage data` for both `api` and `react-spa`
- No “Skipping coverage check for this commit.”

**Step 6: Commit**

Run:

```bash
cd ClassroomPath
git add api/package.json react-spa/package.json scripts/verify-full.sh .gitignore package-lock.json
git commit -m "chore(verify): generate coverage and enforce gate"
```

---

### Task CP2: Enforce `no-console` in ClassroomPath SPA app code

**Files:**

- Create: `ClassroomPath/react-spa/eslint.config.js`
- Modify: `ClassroomPath/react-spa/package.json`
- Modify: `ClassroomPath/package.json`
- Modify: `ClassroomPath/scripts/verify-full.sh`

**Step 1: Add ESLint deps at ClassroomPath root**

In `ClassroomPath/package.json` devDependencies add:

- `eslint`
- `@eslint/js`
- `typescript-eslint`

**Step 2: Add react-spa lint scripts**

In `ClassroomPath/react-spa/package.json` add:

```json
"lint": "eslint . --max-warnings=0",
"lint:fix": "eslint . --fix --max-warnings=0"
```

**Step 3: Create a minimal flat ESLint config**

Create `ClassroomPath/react-spa/eslint.config.js` that:

- Ignores `node_modules/`, `dist/`, `coverage/`
- Applies `no-console: 'error'` to `src/**/*.{ts,tsx}`
- Turns `no-console` off for tests (`src/**/__tests__/**`, `*.test.tsx`, `*.spec.tsx`)
- Allows only `console.error` inside `src/lib/reportError.ts`

**Step 4: Run it in verify:full**

In `ClassroomPath/scripts/verify-full.sh` static analysis step, add a parallel command:

- `npm run lint --workspace=@classroompath/react-spa`

**Step 5: Verify**

Run: `cd ClassroomPath/react-spa && npm run lint`

Expected: PASS.

**Step 6: Commit**

Run:

```bash
cd ClassroomPath
git add react-spa/eslint.config.js react-spa/package.json package.json scripts/verify-full.sh package-lock.json
git commit -m "chore(spa): ban console outside reportError"
```

---

### Task CP3: Remove the explicit `underscore` root devDependency

**Files:**

- Modify: `ClassroomPath/package.json`
- Modify: `ClassroomPath/package-lock.json`

**Step 1: Confirm chain**

Run: `cd ClassroomPath && npm ls underscore`

**Step 2: Remove root devDependency**

Edit `ClassroomPath/package.json` and remove:

```json
"underscore": "1.13.8"
```

**Step 3: Update lockfile**

Run: `cd ClassroomPath && npm install --package-lock-only`

**Step 4: Verify audit + resolved version**

Run:

- `cd ClassroomPath && npm audit --audit-level=high`
- `cd ClassroomPath && npm ls underscore`

Expected:

- `npm audit` finds 0 vulnerabilities
- `underscore` still resolves to `1.13.8` transitively

**Step 5: Commit**

Run:

```bash
cd ClassroomPath
git add package.json package-lock.json
git commit -m "chore(security): drop underscore root pin"
```

---

### Task CP4: Sync ClassroomPath OpenPath submodule after OpenPath changes

**Files:**

- Modify: `ClassroomPath/upstream/openpath` (gitlink)

**Step 1: Update submodule**

Run: `cd ClassroomPath && npm run submodule:update`

**Step 2: Commit submodule pointer**

Run:

```bash
cd ClassroomPath
git add upstream/openpath
git commit -m "chore: sync openpath submodule"
```

---

### Task CP5: Push and deploy STAGING

**Step 1: Push OpenPath**

Run: `cd OpenPath && git push origin main`

**Step 2: Push ClassroomPath**

Run: `cd ClassroomPath && git push origin main`

**Step 3: Deploy staging + smoke tests**

Run: `cd ClassroomPath && npm run deploy:staging`

Expected: Exit code 0 and smoke tests pass.
