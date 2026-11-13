# NEXUS

> **Turn ideas into executable digital worlds.**

NEXUS is an **AI-native creative operating system**: humans provide intent, agents provide
execution, and the boundary between *idea → design → code → world → software → game → media*
gradually dissolves. Everything a project holds is an editable, runnable, versioned, forkable,
remixable **Artifact**, and everything a project contains is structured **Context** that
agents can retrieve precisely.

The product directive lives in [`docs/NEXUS_MASTER_DIRECTIVE.md`](docs/NEXUS_MASTER_DIRECTIVE.md)
(and the full spec text in [`docs/specs/MASTER_DIRECTIVE.original.txt`](docs/specs/MASTER_DIRECTIVE.original.txt)).
The repository consolidation of the two lines that built it — studio line and main line — is
recorded below (§Consolidation), and everything here runs against one tree.

## This is two projects' worth of work in one tree, on purpose

Until 2026-11-09 NEXUS had two parallel lines of development, both built from the same directive,
and both preserved completely by the consolidation:

| line | what lives there | the model it graded |
| --- | --- | --- |
| **Studio line** (`master`, this repo's `apps/studio` + `services/nexus-api` + `agents/`) | Studio workbench (`apps/studio`), Java 25 API (`services/nexus-api`), TS agent runtime (`agents/`), its own `packages/design-model`, turbo monorepo, the whole `docs/evidence` apparatus | `packages/design-model` — the `OpBatch`/`applyOp` line, gates in `docs/evidence`, `npm run verify:*` |
| **Main line** (`main`) | Web Studio (`apps/web`), MCP face (`apps/mcp-server`), FastAPI service (`apps/ai-service`), six model packages (`packages/design-model` → moved to `packages/creative-model`, plus schemas, world-model, game-model, video-model), e2e suite (`e2e/`), evidence-bearing `.scratch/` records | `packages/creative-model` — the `@nexus/creative-model` line, `apps/web` test suite, `npm run test:main` |

**Nothing was deleted, renumbered or re-measured.** The two design models remain two packages
side by side (`@nexus/design-model` for the studio line, `@nexus/creative-model` for the web
line), because a textual merge of two incompatible implementations would have broken both motions.
See **§The two models** below.

## The two models

| | `@nexus/design-model` | `@nexus/creative-model` |
| --- | --- | --- |
| path | `packages/design-model/` | `packages/creative-model/` |
| consumers | `apps/studio`, studio evidence proofs | `apps/web`, `apps/mcp-server`, `scripts/` |
| distribution | built to `dist/` by `npm run build` (`tsc -p tsconfig.json`) | consumed as TS source via `vitest.config.ts` aliases / `tsx` (no build step) |
| tests | `npm run test -w @nexus/design-model` (vitest) | `npx vitest run packages/creative-model/test` (also part of `npm run test:main`) |
| evidence | both suites run under the merged workspace | both suites run under the merged workspace |

`npm run build` builds the studio side (turbo). The main-line model needs no build: it is
aliased at source in `vitest.config.ts` and consumed by `tsx`.

## Layout of the merged tree

```
apps/studio        Studio line product (the creative workbench; turbo; port 3210)
apps/web           main line product (Web Studio; port 3100)
apps/mcp-server    main line MCP face (v1 client to the AI/Projects APIs)
apps/ai-service    main line FastAPI service (agent runtime + providers + RAG + QA)
packages/design-model     studio line model (OpBatch line)
packages/creative-model   main line model (createDocument line)
packages/schemas          zod contracts (main line)
packages/world-model       world/level model (main line)
packages/game-model        games model + tuning (main line)
packages/video-model       storyboard/video model (main line)
services/nexus-api         studio line backend (Spring Boot, Java 25)
agents/             studio line agent runtime (TS, hermetic DEMO-MODE planner, ADR 0016)
tools/              shared tooling (CI runner, hooks, render)
docs/               the living documentation — consolidated (see below)
docs/specs/         the master directive text
docs/decisions/     studio-line ADRs (0001–0027+)
docs/adr/           main line ADRs (0001–~0081)
docs/evidence/      the studio-line evidence ledger (M1–M10, amendments, proofs)
docs/specs/         MASTER_DIRECTIVE.original.txt — the source of truth by §-number
```

Docs that both lines kept (12 of them) now carry **both lines' text verbatim**, the studio line's
first, the main line's behind a `# 附录 · …` heading. Docs that only one line kept are untouched.

## Getting started

```bash
npm install             # installs BOTH lines' workspaces (turbo-run targets only what's touched)

# studio line
npm run dev             # turbo dev (studio)
npm test                # turbo test (design-model, studio, agents)
npm run build           # turbo build
npm run verify:ci-wiring   # the CI wiring census

# main line
npm run dev:web         # Web Studio   → http://localhost:3100
npm run dev:ai          # AI service   → http://localhost:3200  (see docs/ENVIRONMENT.md; 3200 is this machine's default — env AI_SERVICE_PORT overrides)
npm run test:main       # main line's vitest suite (aliases, serial, DB-backed)
npm run typecheck:main  # both models + every main-line TS project, --noEmit
```

AI runs against a deterministic DEMO MODE without keys; it is badged in the UI and labeled in
`provenance`, never disguised (§60). **Since 2026-11-12** the local dev default is a real provider
(wkapi.pro `/v1/chat/completions`, model `gpt-6-sol`; key lives only in gitignored
`apps/ai-service/.env`, the web process never holds it): `/healthz` reports `capability=real`,
and §AGENTS DEMO-MODE semantics stay as fallback for keyless machines. **Since 2026-11-13** prompt
caching is wired (`prompt_cache_key`, default lane `nexus-studio`, env override) — repeated
identical calls see `cached_tokens≈97%` (docs/ENVIRONMENT.md, evidence/ailive-4-cache-2026-11-13.md).

## Consolidation history

- **2026-11-09** — the two branches (`master`, the studio line pushing to `origin/master`; and
  `main`, the main line at `origin/main`) merged into one tree. 2 049 shared-path files made the
  union; 26 files needed by hand. The studio line's `packages/design-model` stays at its path
  (its consumers, evidence proofs and ADRs all read it there); the main line's
  `packages/design-model` moved to `packages/creative-model` and every reference to it inside
  main-line files was rewritten to `@nexus/creative-model`. The 12 shared docs carry both lines'
  bytes behind a banner; the main line's are the longer, more current record. No test was
  weakened to pass; nothing marked verified was edited to look otherwise.

## The promise and the bound

Every feature here is labeled with what it is. DEMO MODE is never disguised. Gates under
`docs/evidence/` grade the studio line's claims; the main line's suites and evidence (including
its tracked `.scratch/` record — main line's convention) grade its. A merged tree is not without
unmerged questions: see `docs/KNOWN_ISSUES.md` (studio line) and the "改完的那一半" sections in
`docs/ROADMAP.md` (main line).
