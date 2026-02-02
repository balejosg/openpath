# OpenPath Dashboard

A lightweight Node.js/TypeScript REST proxy service that wraps the OpenPath API's tRPC endpoints for legacy clients.

## Overview

The Dashboard is a **thin REST wrapper** around the OpenPath API. It no longer has direct database access—instead, it acts as a tRPC client to the main API service. This architecture:

- **Eliminates code duplication**: All business logic lives in the API
- **Simplifies deployment**: Dashboard is stateless and can be horizontally scaled
- **Improves security**: Single point of database access in the API
- **Maintains backward compatibility**: Existing REST clients continue to work

## Architecture

```
Client (REST) → Dashboard (Express) → tRPC Client → API (tRPC) → Database
```

### Components

- **Express server** (`src/index.ts`): REST endpoints for legacy clients
- **tRPC client** (`src/trpc.ts`): Connects to API server
- **API client wrapper** (`src/api-client.ts`): Convenience methods for common operations

### Key Differences from Previous Architecture

**Before**: Dashboard had direct database access via Drizzle ORM  
**After**: Dashboard proxies all requests to API via tRPC

**Before**: Separate authentication system with bcrypt  
**After**: JWT-based auth managed by API, stored in signed cookies

**Before**: 400+ lines with database logic  
**After**: ~300 lines as pure REST proxy

## Features

- **Authentication Proxy**: Login/logout endpoints that interact with API
- **Groups Management**: CRUD operations for whitelist groups and rules
- **System Control**: Toggle system status, view statistics
- **Export Redirect**: Redirects export requests to API public endpoint

## Quick Start

### Prerequisites

- Node.js >= 20
- Running OpenPath API instance

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
npm start
```

## Configuration

Environment variables:

### Required

- `API_URL`: URL to OpenPath API (default: `http://localhost:3000`)
- `COOKIE_SECRET`: Secret for signing auth cookies (generate with `openssl rand -hex 32`)

### Optional

- `PORT`: Port for dashboard service (default: `3001`)
- `NODE_ENV`: Environment (`development`, `production`, `test`)

### Removed (No Longer Needed)

- ~~`DATABASE_URL`~~: Dashboard no longer accesses database
- ~~`SESSION_SECRET`~~: Replaced by `COOKIE_SECRET`
- ~~`ADMIN_PASSWORD`~~: Users managed in API

## Testing

```bash
# Run all tests
npm test

# Lint check
npm run lint

# Type check
npm run typecheck
```

Tests use `supertest` for HTTP testing and mock the tRPC client where necessary.

## API Endpoints

All endpoints require authentication via signed cookies (except `/export/*`).

### Authentication

- `POST /api/auth/login` - Login and receive JWT tokens
- `POST /api/auth/logout` - Logout and clear cookies
- `GET /api/auth/check` - Check authentication status

### Groups Management

- `GET /api/groups` - List all groups
- `POST /api/groups` - Create new group
- `PATCH /api/groups/:id` - Update group
- `DELETE /api/groups/:id` - Delete group

### Rules Management

- `GET /api/groups/:id/rules` - List rules for group
- `POST /api/groups/:id/rules` - Add rule to group
- `DELETE /api/rules/:id` - Delete rule
- `POST /api/groups/:id/rules/bulk` - Bulk add rules

### System

- `GET /api/stats` - Get system statistics
- `GET /api/system/status` - Get system status
- `POST /api/system/toggle` - Toggle system enable/disable

### Export

- `GET /export/:name.txt` - Redirect to API export endpoint

## Migration from Previous Version

If upgrading from the old architecture:

1. **Migrate dashboard users to API**:

   ```bash
   npm run db:migrate-dashboard-users --workspace=@openpath/api
   ```

2. **Update environment variables**:
   - Add `API_URL` (e.g., `http://localhost:3000`)
   - Add `COOKIE_SECRET` (generate new random secret)
   - Remove `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_PASSWORD`

3. **Restart services**:

   ```bash
   # Start API first
   npm start --workspace=@openpath/api

   # Then start Dashboard
   npm start --workspace=@openpath/dashboard
   ```

## Development Notes

- Dashboard does **not** serve static SPA files—that's handled by the API
- All database operations are performed via tRPC calls to API
- Authentication tokens are stored in signed HTTP-only cookies
- For new features, add them to the API first, then add REST proxy endpoints here

## See Also

- [ADR-0008: Dashboard tRPC Client Refactor](../docs/adr/0008-dashboard-trpc-client-refactor.md)
- [API Documentation](../api/README.md)
- [tRPC Groups Router](../api/src/trpc/routers/groups.ts)

## License

AGPL-3.0-or-later
