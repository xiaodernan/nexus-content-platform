# Testing & Quality Gates

Philosophy (§59): OBSERVE → PLAN → IMPLEMENT → RUN → TEST → SCREENSHOT → INSPECT → FIX →
RETEST → COMMIT. Never claim success without evidence (§12, §32).

Layers:
- **Unit** — Vitest for `packages/*` (design-model ops/reducer/undo/diff; providers/router
  determinism). Golden tests rely on DEMO MODE determinism (ADR 0010).
- **Typecheck** — strict TS across the repo (`npm run typecheck`).
- **Visual QA** (§30) — for frontend changes: build → launch dev server → screenshot via
  browser automation → inspect → fix → retest. Playwright is the target harness (M2).

Quality gates before publication (§31): build, tests, security, accessibility, performance,
visual quality, runtime behavior.

Status: unit + typecheck wired and passing for the packages built this pass; the Playwright
visual-QA loop lands with M2 (browser automation is itself an M2 capability). The Studio
slice is validated here with real dev-server screenshots captured during this build.
