# Testing & Quality Gates

Philosophy (§59): OBSERVE → PLAN → IMPLEMENT → RUN → TEST → SCREENSHOT → INSPECT → FIX →
RETEST → COMMIT. Never claim success without evidence (§12, §32).

Layers:
- **Unit** — Vitest for `packages/*` (design-model ops/reducer/undo/diff; providers/router
  determinism). Golden tests rely on DEMO MODE determinism (ADR 0010).
- **Typecheck** — strict TS across the repo (`npm run typecheck`).
- **Browser verification** (ADR 0017) — `tools/harness/`, a zero-dependency CDP harness that
  drives a real Chrome and asserts against the Studio's read-only observability bridge:
  - `npm run verify:harness` — proves the harness itself (visible viewport, running rAF,
    canvas paint + pixel readback, accepted screenshot, trusted pointer/keyboard input).
  - `npm run verify:studio` — drives the **unmodified** Studio bundle through the §62 golden
    path and writes real PNG evidence to `docs/evidence/studio/harness/`.
  Start the Studio first: `NODE_OPTIONS= ../../node_modules/.bin/next dev -p 3210` from
  `apps/studio` (see KNOWN_ISSUES → Tooling for why `NODE_OPTIONS` must be cleared).
- **Visual QA** (§30) — capture → inspect → fix → retest. The capture half is now real (PNG
  bytes + painted-pixel counts). Perceptual baseline diffing is the next step and is **not**
  claimed yet.
- **Agent proofs** — `docs/evidence/**/*-proof.mjs`, one runnable script per capability claim.

Quality gates before publication (§31): build, tests, security, accessibility, performance,
visual quality, runtime behavior.

Status: unit + typecheck + the ADR 0017 browser harness are wired and green. Every capability
claim in `docs/evidence/**` is backed by a script in this repository that can be re-run.

## Running the gates in this environment

Vitest's default parallel pool is unreliable on this Windows host (handle starvation can hide
test files, and the ambient `NODE_OPTIONS` `--require` shim can emit a spurious `EPERM`).
Authoritative counts come from:

```bash
NODE_OPTIONS= npx vitest run --root <package> --no-file-parallelism
```

Turbo may also fail with `os error 231 (all pipe instances are in use)` when several builds
run concurrently; build the affected package directly with `tsc -p tsconfig.json`.
