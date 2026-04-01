# OpenPath React SPA

> Status: maintained
> Applies to: `@openpath/react-spa`
> Last verified: 2026-04-01

OpenPath's React SPA is the OSS administration UI for dashboard, classrooms, groups, rules, requests, and settings flows.

It also exposes a small public surface for downstream consumers. That public surface is the only supported integration boundary.

## Start Here

- Public surface ADR: [`../docs/adr/0010-public-spa-extension-surface.md`](../docs/adr/0010-public-spa-extension-surface.md)
- Repo docs index: [`../docs/INDEX.md`](../docs/INDEX.md)

## Supported Public Entry Points

The package exports:

- `@openpath/react-spa/openpath.css`
- `@openpath/react-spa/public-ui`
- `@openpath/react-spa/public-shell`
- `@openpath/react-spa/public-auth`
- `@openpath/react-spa/public-google`

Downstream consumers should use these entry points instead of deep-importing files under `src/`.

## Development

From `OpenPath/`:

```bash
npm install
npm run build --workspace=@openpath/shared
npm run build --workspace=@openpath/api
npm run dev --workspace=@openpath/react-spa
```

From `OpenPath/react-spa/`:

```bash
npm run dev
```

## Verification

From `OpenPath/`:

```bash
npm run test:react-spa
npm run test:e2e
```

From `OpenPath/react-spa/`:

```bash
npm test
npm run test:e2e
npm run typecheck
npm run lint
```

## Notes For Downstream Consumers

- The public entry points are source-based today, not a separately versioned design system package.
- Internal file layout under `src/` can change without downstream compatibility guarantees.
- If a downstream app needs a new reusable surface, add it deliberately to `src/public/*` and document it in ADR 0010.
