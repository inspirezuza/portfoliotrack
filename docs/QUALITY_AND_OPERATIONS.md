# Quality And Operations

This document tracks the repository-level quality changes that keep PortfolioTrack safer to maintain.

## Improvement Checklist

1. Package manager: use `pnpm` with `pnpm-lock.yaml` and the pinned `packageManager` field.
2. CI quality gate: GitHub Actions installs with `pnpm install --frozen-lockfile` and runs `pnpm run verify`.
3. First-class typecheck: `pnpm run typecheck` runs `tsc --noEmit --pretty false` and is part of `verify`.
4. Dependency upgrades: Dependabot opens conservative weekly PRs; major framework/library/tooling upgrades are grouped manually.
5. Migration workflow: use `pnpm run db:migrate:local` for local `drizzle-kit push`, and `pnpm run db:migrate:prod` for committed production migrations after `config:check:prod`.
6. Runtime observability: high-risk server paths use structured `logServerError` events with request, portfolio, run, or import context.
7. Incremental refactoring: shared chart mouse-state parsing lives in `src/lib/charts/recharts-state.ts`; continue extracting helpers only when touching related behavior.
8. Domain tests: unit coverage includes position math, benchmark/performance comparison, Excel workbook import/export parsing, DR metadata, market-data staleness, config validation, and server logging.
9. Config validation: `pnpm run config:check` and `pnpm run config:check:prod` fail loudly when required auth or production database settings are missing.

## Verification Commands

Use this for normal work:

```powershell
pnpm run verify
```

It runs formatting, linting, TypeScript, Node tests, and production build in order.

Use this before broad route/UI changes, release handoff, or deploy handoff:

```powershell
pnpm run verify:full
```

It adds the Playwright Chromium smoke suite before the production build.

## Dependency Policy

- Patch and minor updates can be handled by Dependabot.
- Major upgrades should stay in separate commits or PRs by stack, for example Next/React, Recharts, Zod, TypeScript, or ESLint.
- Keep `@types/node` aligned with the runtime Node major. This project currently verifies on Node 22.
- Run a browser smoke check after charting, routing, shell, or framework upgrades because those can compile cleanly while failing in the browser.

## Database Safety

- `pnpm run db:migrate:local` is the explicit local schema push command.
- `pnpm run db:migrate` is a compatibility alias for the local command.
- `pnpm run db:generate` creates committed SQL migrations under `drizzle/`.
- `pnpm run db:check` checks generated migration consistency.
- `pnpm run db:migrate:prod` first runs `config:check:prod`, then applies committed migrations with `drizzle-kit migrate`.
- Never use local `drizzle-kit push` as the production release step.
