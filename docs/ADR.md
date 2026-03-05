# Architecture Decision Records (ADR)

OpenPath ADRs live in `docs/adr/`.

This file is an index and a pointer to the current, maintained docs for each component.

## Current docs (start here)

- Core overview: `OpenPath/README.md`
- API (Express + tRPC, PostgreSQL): `OpenPath/api/README.md`
- Web UI (Vite + React): `OpenPath/react-spa/README.md`
- Linux agent (dnsmasq + firewall): `OpenPath/linux/README.md`
- Windows agent (PowerShell): `OpenPath/windows/README.md`
- Firefox extension (blocked-domain detection): `OpenPath/firefox-extension/README.md`

## ADR index

- `docs/adr/0001-dns-sinkhole-architecture.md`
- `docs/adr/0001-use-dnsmasq-for-dns-filtering.md`
- `docs/adr/0002-jwt-authentication.md`
- `docs/adr/0003-github-as-source-of-truth.md`
- `docs/adr/0003-multi-platform-design.md`
- `docs/adr/0005-full-postgres-persistence.md`
- `docs/adr/0008-dashboard-trpc-client-refactor.md`
- `docs/adr/template.md`

## Notes

- Some older ADRs describe legacy decisions that are no longer the default path. Prefer the component READMEs above for the current workflow.
- If you change the architecture, update the relevant ADR status to `Superseded` (or add an explicit note) so readers don't follow stale guidance.
