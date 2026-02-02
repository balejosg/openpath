# API AGENTS.md

Express + tRPC API with PostgreSQL/Drizzle. Service-oriented architecture.

## Architecture

```
Routers (tRPC) → Services (business logic) → Storage (Drizzle ORM)
```

## tRPC Routers (10)

| Router          | Procedures       | Purpose                             |
| --------------- | ---------------- | ----------------------------------- |
| `auth`          | public/protected | Login, register, refresh, logout    |
| `users`         | admin            | User CRUD, role assignment          |
| `requests`      | mixed            | Domain whitelist requests workflow  |
| `classrooms`    | teacher          | Classroom/machine registration      |
| `schedules`     | teacher          | Time-based classroom reservations   |
| `push`          | protected        | Web push notification subscriptions |
| `healthReports` | sharedSecret     | Endpoint health monitoring          |
| `setup`         | public           | First-time admin creation           |
| `healthcheck`   | public           | Liveness/readiness probes           |
| `groups`        | admin            | Whitelist group/rule management     |

## Procedure Types

| Type                    | Auth              | Use Case                      |
| ----------------------- | ----------------- | ----------------------------- |
| `publicProcedure`       | None              | Health, setup, auth endpoints |
| `protectedProcedure`    | JWT               | Any authenticated user        |
| `adminProcedure`        | JWT+admin         | User management, groups       |
| `teacherProcedure`      | JWT+teacher/admin | Classroom management          |
| `sharedSecretProcedure` | Machine secret    | Endpoint-to-server auth       |

## Database (13 tables)

Core: `users`, `roles`, `requests`, `classrooms`, `machines`, `schedules`
Supporting: `tokens`, `settings`, `push_subscriptions`, `health_reports`, `whitelist_groups`, `whitelist_rules`, `dashboard_users`

Schema: `src/db/schema.ts` (Drizzle ORM)
Migrations: `drizzle/` via `drizzle-kit`

## Key Files

| Path                        | Purpose                           |
| --------------------------- | --------------------------------- |
| `src/server.ts`             | Express entry, middleware stack   |
| `src/trpc/trpc.ts`          | Procedure definitions, middleware |
| `src/trpc/context.ts`       | Request context, JWT extraction   |
| `src/trpc/routers/index.ts` | Main AppRouter aggregation        |
| `src/services/`             | Business logic (8 services)       |
| `src/lib/auth.ts`           | JWT management, blacklist         |
| `src/lib/logger.ts`         | Winston structured logging        |

## Conventions

- **Errors**: `TRPCError` in routers, `APIError` subclasses in Express middleware
- **Logging**: Winston only, never `console.*`
- **Validation**: Zod schemas from `@openpath/shared` at boundaries
- **Imports**: `.js` extensions required (NodeNext)

## Testing

```bash
npm run test:auth    # Auth suite (PORT 3001)
npm run test:e2e     # E2E suite (PORT 3002)
npm run test:setup   # Setup suite (PORT 3003)
npm run test:security # Security suite (PORT 3004)
```

Single file: `NODE_ENV=test PORT=3005 node --import tsx --test tests/groups.test.ts`

## Anti-Patterns

- Direct DB queries in routers (use services)
- `console.*` in production code
- Missing Zod validation on inputs
- Hardcoded ports in tests (use env)
