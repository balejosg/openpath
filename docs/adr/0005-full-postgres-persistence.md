# ADR 0005: Transition to Full PostgreSQL Persistence

## Status

Accepted (Supersedes [ADR 0002](0002-json-file-storage-over-database.md))

## Context

Originally (ADR 0002), the system used JSON files for data storage to keep the architecture simple and dependency-free. As the system scales and moves towards a SaaS-ready architecture with concurrent users and potential horizontal scaling, file-based storage becomes a bottleneck and a consistency risk.

A partial migration was started, but left `push-subscriptions` and `health-reports` using JSON files, creating a "hybrid" persistence model that is confusing and fragile (docker mounts, ephemeral containers).

## Decision

We will migrate **ALL** persistence to PostgreSQL. No state shall be stored in local JSON files.

## Consequences

### Positive

- **Single Source of Truth**: All data lives in the database.
- **Stateless API**: The API container can be destroyed/recreated without data loss (logs excepted).
- **Scalability**: Multiple API instances can share the same database.
- **Consistency**: ACID transactions available for all operations.

### Negative

- **Dependency**: API now strictly requires a running Postgres instance.
- **Complexity**: Dev environment requires Docker/Postgres (added to docker-compose.dev.yml).

## Implementation Refinement

- `push.ts` migrated to use `push_subscriptions` table.
- `health-reports.ts` migrated to use `health_reports` table.
- `docker-compose.dev.yml` upgraded to include a db service.
- `README.md` updated to reflect the new architecture.
