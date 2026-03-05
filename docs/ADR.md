# Architecture Decision Records (ADR)

OpenPath ADRs live in `docs/adr/`.

Start here for the current, maintained operational docs: [`docs/INDEX.md`](INDEX.md).

## Current docs (start here)

- Core overview: [`README.md`](../README.md)
- Agent/dev workflow: [`AGENTS.md`](../AGENTS.md)
- API (Express + tRPC, PostgreSQL): [`api/README.md`](../api/README.md)
- Web UI (Vite + React): [`react-spa/README.md`](../react-spa/README.md)
- Linux agent (dnsmasq + firewall): [`linux/README.md`](../linux/README.md)
- Windows agent (PowerShell): [`windows/README.md`](../windows/README.md)
- Firefox extension (blocked-domain detection): [`firefox-extension/README.md`](../firefox-extension/README.md)

## ADR index

- [`docs/adr/0001-dns-sinkhole-architecture.md`](adr/0001-dns-sinkhole-architecture.md)
- [`docs/adr/0001-use-dnsmasq-for-dns-filtering.md`](adr/0001-use-dnsmasq-for-dns-filtering.md)
- [`docs/adr/0002-jwt-authentication.md`](adr/0002-jwt-authentication.md)
- [`docs/adr/0003-github-as-source-of-truth.md`](adr/0003-github-as-source-of-truth.md)
- [`docs/adr/0003-multi-platform-design.md`](adr/0003-multi-platform-design.md)
- [`docs/adr/0005-full-postgres-persistence.md`](adr/0005-full-postgres-persistence.md)
- [`docs/adr/0008-dashboard-trpc-client-refactor.md`](adr/0008-dashboard-trpc-client-refactor.md)
- [`docs/adr/template.md`](adr/template.md)

## Notes

- Some older ADRs describe legacy decisions that are no longer the default path. Prefer the component READMEs above for the current workflow.
- If you change the architecture, update the relevant ADR status to `Superseded` (or add an explicit note) so readers don't follow stale guidance.
