# ADR 0008: Dashboard tRPC Client Refactor

**Date**: 2026-01-02  
**Status**: Accepted  
**Deciders**: Architecture Team  
**Context**: Technical debt reduction, architecture simplification

## Context and Problem Statement

The Dashboard service originally had direct database access and duplicated functionality from the API service:

- **Database coupling**: Dashboard directly accessed PostgreSQL via Drizzle ORM
- **Code duplication**: Group/whitelist management logic existed in both API and Dashboard
- **Authentication duplication**: Dashboard had its own user management separate from API
- **Maintenance burden**: Changes to groups/rules required updates in two places
- **Security concerns**: Two services with direct DB access increased attack surface

This violated the DRY principle and created tight coupling between Dashboard and the database schema.

## Decision Drivers

- **Eliminate code duplication**: Single source of truth for business logic
- **Simplify architecture**: Reduce number of services with direct database access
- **Improve maintainability**: Changes in one place instead of two
- **Enhance security**: Centralize authentication and authorization
- **Enable scalability**: Dashboard can be horizontally scaled without DB connection pooling issues

## Considered Options

### Option 1: Keep Current Architecture (Rejected)

**Pros**: No changes needed  
**Cons**: Continued maintenance burden, code duplication, security concerns

### Option 2: Merge Dashboard into API (Rejected)

**Pros**: Complete unification  
**Cons**: Loses service separation, harder to deploy independently

### Option 3: Refactor Dashboard as tRPC Client (Accepted)

**Pros**:

- Maintains service separation
- Eliminates database dependency in Dashboard
- Reuses existing API logic
- Clear responsibility boundaries

**Cons**:

- Requires migration effort
- Additional network hop for Dashboard requests

## Decision Outcome

**Chosen option**: Refactor Dashboard as tRPC Client

Dashboard is now a thin REST wrapper around the API's tRPC endpoints, acting as a proxy service for legacy clients that expect REST-style endpoints.

## Implementation Details

### API Changes

1. **New Groups Router** (`api/src/trpc/routers/groups.ts`):
   - 15 tRPC procedures for groups and rules management
   - Requires admin role (`adminProcedure`)
   - Comprehensive CRUD operations

2. **Groups Storage Layer** (`api/src/lib/groups-storage.ts`):
   - PostgreSQL-based storage using Drizzle ORM
   - Handles `whitelist_groups` and `whitelist_rules` tables
   - Export functionality for dnsmasq

3. **Groups Service Layer** (`api/src/services/groups.service.ts`):
   - Business logic with `Result<T>` pattern
   - Stats aggregation
   - System-wide enable/disable

4. **Public Export Endpoint** (`GET /export/:name.txt`):
   - Unauthenticated endpoint for dnsmasq clients
   - Returns plain text whitelist files
   - Respects group enabled/disabled state

### Dashboard Changes

1. **Removed Dependencies**:
   - `bcrypt` (auth now via API)
   - `drizzle-orm`, `pg` (no direct DB access)
   - `express-session`, `uuid` (session management simplified)

2. **Added Dependencies**:
   - `@trpc/client` for API communication

3. **New Architecture**:

   ```
   Client → Dashboard (REST) → tRPC Client → API (tRPC) → Database
   ```

4. **Files**:
   - **New**: `dashboard/src/trpc.ts` - tRPC client factory
   - **New**: `dashboard/src/api-client.ts` - Wrapper around tRPC calls
   - **Replaced**: `dashboard/src/db.ts` → `dashboard/src/api-client.ts`
   - **Rewritten**: `dashboard/src/index.ts` - Uses API client instead of DB

### Authentication Changes

Dashboard users are now migrated to the main `users` table with `admin` role:

- Migration script: `api/scripts/migrate-dashboard-users.ts`
- JWT-based auth tokens stored in signed cookies
- Access token + refresh token flow
- No more separate dashboard admin password

### Environment Variables

**Dashboard** (new):

- `API_URL`: URL to API server (default: `http://localhost:3000`)
- `COOKIE_SECRET`: Secret for signing cookies

**Dashboard** (removed):

- `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_PASSWORD`

## Testing

Comprehensive test suite added (`api/tests/groups.test.ts`):

- 30 tests covering all groups router functionality
- Authorization tests (unauthenticated, non-admin, admin)
- CRUD operations for groups and rules
- Bulk operations
- Statistics and system status
- Export operations (tRPC and REST)
- All tests passing

## Consequences

### Positive

- **Single source of truth**: All whitelist logic in API
- **Simplified Dashboard**: Reduced from 400+ to ~300 lines
- **Better security**: Centralized auth, fewer DB connections
- **Easier testing**: Mock tRPC client instead of DB
- **Reduced dependencies**: Dashboard is lighter
- **Clear boundaries**: API = business logic, Dashboard = REST proxy

### Negative

- **Additional network hop**: Dashboard → API latency (negligible on localhost)
- **tRPC dependency**: Dashboard coupled to tRPC client library
- **Migration required**: Existing dashboard users must be migrated

### Neutral

- **Service separation maintained**: Dashboard still deployable independently
- **REST API preserved**: Legacy clients continue to work

## Compliance

This refactor aligns with:

- **ADR-0001**: DNS sinkhole architecture (groups storage for whitelist management)
- **ADR-0004**: tRPC adoption (extends tRPC usage to dashboard)
- **SECURITY-HARDENING.md**: Reduces attack surface, centralizes auth

## Migration Path

1. **Run migration script**: `npm run db:migrate-dashboard-users --workspace=@openpath/api`
2. **Update Dashboard env**: Set `API_URL` and `COOKIE_SECRET`
3. **Remove Dashboard env**: Delete `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_PASSWORD`
4. **Restart services**: API first, then Dashboard
5. **Test**: Verify Dashboard login and groups management work

## Future Considerations

- **GraphQL alternative**: Could replace tRPC with GraphQL in future
- **Direct tRPC exposure**: Frontend could call API tRPC directly, eliminating Dashboard
- **API gateway**: Dashboard pattern could extend to other legacy clients
- **WebSocket support**: Real-time updates via tRPC subscriptions

## References

- Implementation PR: (To be linked)
- Groups router: `api/src/trpc/routers/groups.ts`
- Dashboard client: `dashboard/src/api-client.ts`
- Test suite: `api/tests/groups.test.ts`
