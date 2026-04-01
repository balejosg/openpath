# OpenPath ADR Index

> Status: maintained
> Applies to: OpenPath repository
> Last verified: 2026-04-01
> Source of truth: `docs/ADR.md`

This file is the landing page for OpenPath architecture decisions. The canonical decisions live in `docs/adr/*.md`.

## Current High-Signal ADRs

- [`docs/adr/0001-dns-sinkhole-architecture.md`](adr/0001-dns-sinkhole-architecture.md)
- [`docs/adr/0001-use-dnsmasq-for-dns-filtering.md`](adr/0001-use-dnsmasq-for-dns-filtering.md)
- [`docs/adr/0002-jwt-authentication.md`](adr/0002-jwt-authentication.md)
- [`docs/adr/0003-github-as-source-of-truth.md`](adr/0003-github-as-source-of-truth.md)
- [`docs/adr/0003-multi-platform-design.md`](adr/0003-multi-platform-design.md)
- [`docs/adr/0005-full-postgres-persistence.md`](adr/0005-full-postgres-persistence.md)
- [`docs/adr/0008-dashboard-trpc-client-refactor.md`](adr/0008-dashboard-trpc-client-refactor.md)
- [`docs/adr/0009-transactional-service-writes.md`](adr/0009-transactional-service-writes.md)
- [`docs/adr/0010-public-spa-extension-surface.md`](adr/0010-public-spa-extension-surface.md)

## Read By Concern

- API write integrity: `0009`
- SPA downstream integration boundary: `0010`
- Persistence model: `0005`
- Auth/session model: `0002`
- OSS deployment/storage shape: `0001`, `0003`

## Guidance

- Prefer reading the specific ADR that matches the change you are making.
- Treat this index as navigation only, not as the detailed architecture contract.
- For current repo entrypoints and package-level guidance, start from [`docs/INDEX.md`](INDEX.md).
