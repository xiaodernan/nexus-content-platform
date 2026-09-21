# 0002 — Monorepo layout & build tooling

- **Status:** Accepted
- **Date:** 2026-09-22

## Context
The spec (§50, §61) wants a polyglot system: a Next.js Studio, shared TypeScript
packages (design model, providers), a Java/Spring backend, a Python/FastAPI AI service,
and later 3D/game runtimes — all in one evolving codebase with shared contracts. Milestone
0 requires `docs/ architecture/ agents/ packages/ apps/`.

## Options
- **Turborepo + npm workspaces** — incremental task runner, huge Next.js affinity, low ceremony.
- **Nx** — richer generators/graph, but a steeper learning curve and heavier config.
- **pnpm workspaces** — most disk-efficient installs and strict hoisting.
- **Multiple repos** — clean isolation, but contract drift and cross-cutting change pain.

## Decision
A **monorepo using npm workspaces + Turborepo** for the JavaScript/TypeScript side, with
non-JS services (`services/`) integrating through the same repo but their own native
build tools (Maven, uv/poetry). Top-level dirs: `apps/`, `packages/`, `services/`,
`agents/`, `docs/`, `architecture/`.

## Reason
- npm workspaces are available in this environment without admin rights (pnpm/corepack
  global shim install is blocked by `EPERM` on `C:\Program Files\nodejs`); this is an
  environment-forced, reversible choice — the workspace layout stays pnpm-compatible.
- Turborepo gives cached, parallel `build`/`test`/`lint` across `apps/*` and `packages/*`
  without imposing Nx's mental model.
- Keeping every language in one repo lets the Project Graph (§37) and Context Engine
  (23) see cross-cutting relationships.

## Tradeoffs
- (−) npm's non-deterministic hoisting vs pnpm's strictness. Mitigated with a lockfile
  (`package-lock.json`) committed and `npm ci` in CI.
- (−) Polyglot repos can grow unbounded. Mitigated by clear package/service boundaries
  (ADR 0011) and Turborepo pipeline boundaries so `test`/`build` only run affected nodes.
