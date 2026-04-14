# API AGENTS.md

Express + tRPC API with PostgreSQL/Drizzle. Service-oriented architecture.

## Execution Boundary

```text
Routers / routes -> services -> storage helpers -> PostgreSQL
```

Source-of-truth files:

- `src/server.ts`: Express middleware and REST route mounting
- `src/routes/`: public REST surfaces
- `src/trpc/routers/index.ts`: current app router inventory
- `src/services/`: business logic and transaction boundaries
- `src/db/schema.ts`: schema shape

## Router And Procedure Guidance

The exact router list changes over time. Use `src/trpc/routers/index.ts` instead of relying on stale counts.

Current procedure types:

- `publicProcedure`: health, setup, and other unauthenticated flows
- `protectedProcedure`: authenticated user flows
- `adminProcedure`: admin-only flows
- `teacherProcedure`: teacher/admin classroom flows
- `sharedSecretProcedure`: machine-auth or shared-secret flows

## Conventions

- Keep routers thin; business logic belongs in services.
- Multi-write flows should use service-owned transaction boundaries.
- Use Zod validation from `@openpath/shared` at API boundaries.
- Use Winston-based logging, not `console.*`.
- Keep `.js` import extensions for NodeNext compatibility.

## Testing

Prefer existing scripts because they already assign stable ports:

```bash
npm run test:auth --workspace=@openpath/api      # PORT 3001
npm run test:e2e --workspace=@openpath/api       # PORT 3002
npm run test:security --workspace=@openpath/api  # PORT 3004
npm run test:setup --workspace=@openpath/api     # PORT 3005
```

Single-file example:

```bash
cd api
NODE_ENV=test node --import tsx --test --test-concurrency=1 --test-force-exit tests/groups-auth.test.ts tests/groups-teacher-access.test.ts tests/groups-rule-ops.test.ts tests/groups-export.test.ts
```

Serial multi-file example for DB-reset-heavy suites:

```bash
cd api
NODE_ENV=test node --import tsx --test --test-concurrency=1 --test-force-exit tests/service-coverage-user-storage.test.ts tests/service-coverage-setup.test.ts tests/service-coverage-schema.test.ts tests/service-coverage-user-service.test.ts tests/service-coverage-auth-service.test.ts
```

Auth split example:

```bash
cd api
NODE_ENV=test PORT=3001 node --import tsx --test --test-concurrency=1 --test-force-exit tests/auth-registration.test.ts tests/auth-google-login.test.ts tests/auth-session.test.ts tests/auth-password.test.ts tests/auth-admin-guards.test.ts
```

API smoke split example:

```bash
cd api
NODE_ENV=test PORT=3006 node --import tsx --test --test-concurrency=1 --test-force-exit tests/api-basic-http.test.ts tests/api-submit-routes.test.ts tests/api-requests-trpc.test.ts tests/api-request-auth-guards.test.ts tests/lib/machine-proof.test.ts tests/lib/public-request-input.test.ts tests/lib/exemption-storage.test.ts tests/routes/public-requests.test.ts
```

Storage unit split example:

```bash
cd api
NODE_ENV=test node --import tsx --test --test-concurrency=1 --test-force-exit tests/schedules-time-utils.test.ts tests/schedules-crud.test.ts tests/schedules-query.test.ts tests/schedules-current.test.ts
```

Security split example:

```bash
cd api
NODE_ENV=test PORT=3004 node --import tsx --test --test-concurrency=1 --test-force-exit tests/security-headers.test.ts tests/security-authorization.test.ts tests/security-auth.test.ts tests/security-input-validation.test.ts tests/security-privacy-rate-limits.test.ts
```

Setup split example:

```bash
cd api
NODE_ENV=test PORT=3005 node --import tsx --test --test-concurrency=1 --test-force-exit tests/setup-status.test.ts tests/setup-first-admin.test.ts tests/setup-token-validation.test.ts tests/setup-auth-guards.test.ts tests/setup.test.ts
```

E2E teacher split example:

```bash
cd api
npm --prefix .. run build --workspace=@openpath/shared && NODE_ENV=test PORT=3002 node --import tsx --test --test-concurrency=1 --test-force-exit tests/e2e-admin-bootstrap.test.ts tests/e2e-teacher-profile.test.ts tests/e2e-teacher-requests.test.ts tests/e2e-teacher-boundaries.test.ts tests/e2e.test.ts
```

Push split example:

```bash
cd api
NODE_ENV=test PORT=3003 node --import tsx --test --test-concurrency=1 --test-force-exit tests/push-vapid.test.ts tests/push-subscription.test.ts tests/push-status.test.ts tests/push-unsubscribe.test.ts tests/push.test.ts
```

SSE split example:

```bash
cd api
NODE_ENV=test node --import tsx --test --test-concurrency=1 --test-force-exit tests/sse-auth.test.ts tests/sse-connection.test.ts tests/sse-events.test.ts
```

Coverage regression split example:

```bash
cd api
NODE_ENV=test node --import tsx --test --test-concurrency=1 --test-force-exit tests/coverage-regressions-storage.test.ts tests/coverage-regressions-legacy-storage.test.ts tests/coverage-regressions-router-validation.test.ts
```

Classrooms split example:

```bash
cd api
NODE_ENV=test node --import tsx --test --test-concurrency=1 --test-force-exit tests/classrooms-crud.test.ts tests/classrooms-machines.test.ts tests/classrooms-cleanup.test.ts
```

Blocked domains split example:

```bash
cd api
NODE_ENV=test node --import tsx --test --test-concurrency=1 --test-force-exit tests/blocked-domains-check.test.ts tests/blocked-domains-list.test.ts tests/blocked-domains-approval.test.ts
```

Roles split example:

```bash
cd api
NODE_ENV=test node --import tsx --test --test-concurrency=1 --test-force-exit tests/roles-assignment.test.ts tests/roles-revoke.test.ts tests/roles-authorization.test.ts tests/roles-list-teachers.test.ts
```

## Anti-Patterns

- direct DB queries in routers
- side effects inside transaction bodies
- missing Zod validation on request input/output boundaries
- `console.*` in production paths
