# 0014 — Local-first snapshot persistence and Studio view-state (M1 polish)

- **Status:** Accepted
- **Date:** 2026-09-22

## Context
The Studio vertical slice is functional but a session dies on refresh, the document is
single-page with no way to add/switch pages, text only edits from a side panel, and shapes
don't align. Spec §62 demands the M1 slice be *extremely polished* before M2, and the slice
must stay self-contained (TypeScript only, no backend/Docker/AI keys). Hosted persistence
(PostgreSQL + pgvector + Redis, ADR 0012) and server snapshot/versioning (M7) are still far
off, so the editor needs a durable, honest interim mechanism that does **not** pre-commit the
canonical model to a transport it does not have yet.

## Decision
Four coordinated capabilities, all studio-local, none requiring a `@nexus/design-model` change:

1. **Local-first snapshots.** Serialize the *whole canonical `DesignDocument`* (not the op-log)
   behind a two-seam split: `lib/persist.ts` is pure (`serializeApp`/`deserializeApp` with a
   `schemaVersion` envelope + minimal structural validation), and `lib/storage.ts` is the only
   module that touches `window` (guarded, with an injectable `KvStore` fake). `Studio.tsx`
   hydrates once on mount and debounced-saves on every `doc` change via `useStudio.subscribe`.
   A corrupted/foreign payload fails closed to "start fresh", never a half-loaded editor.

2. **History / Snapshots panel as a *mirror*, not a second source of truth.** `store.ts` keeps a
   lightweight log of `{summary, provenance, diff}` and a `cursor`; every row renders the same
   `DiffCard`. **Restore = drive the existing `undo()`/`redo()` until the cursor reaches the
   target** — the `History` class (ADR 0006) stays authoritative; the UI never replays ops by hand.

3. **Multi-page via studio-local `activePageId`.** Page *adds* route through the existing
   reversible `addSubtree`→`pageIds` op (so they are undoable), but which page is *viewed* is
   ephemeral view-state, intentionally **not** an op this increment. A `safePage` staleness guard
   falls back to the first page if the viewed page is removed by an undo.

4. **On-canvas text editing without violating §8.** Double-click opens a positioned DOM `<textarea>`
   overlay that renders the node's own `resolveTextStyle`; the canvas suppresses that node's glyphs
   via `Scene.hideId`. The model stays canonical — the overlay commits exactly one reversible
   `updateNode({characters})` on blur/submit, and Escape cancels.

## Options
- **This choice** — pure serialize/deserialize + a guarded `window` seam, model-snapshot payloads.
- Server-backed autosave now — needs the `nexus-api` service that deliberately does not exist yet (§M7).
- Persist the op-log and replay it — smaller payloads, but hydration correctness would couple the
  store to history internals and make the "start fresh on corruption" guard harder.
- Make `activePageId` a first-class undoable `setActivePage` op — cleaner model, but forces a
  package rebuild + new op tests this increment; deferred to keep the slice shippable.

## Reason
Local-first persistence is the honest interim for a self-contained slice: it survives refresh and
is genuinely useful *today*, while §60 forbids pretending a hosted backend is wired. Keeping the
pure logic out of `window` and behind seams makes every one of these behaviors unit-testable
headless (`snap.test.ts`, `persist.test.ts`) and drives them from the same op primitive already
proven in ADR 0006 — no parallel truth.

## Tradeoffs
- (−) `localStorage` is per-browser, unauthenticated, ~5 MB-capped and lossy across devices.
  Accepted for the slice; ADR 0012's Postgres/pgvector store supersedes it at M7. The design model
  was already transport-agnostic (ADR 0004), so the payload format is unchanged when that swap lands.
- (−) Page switching is not undoable and `activePageId` lives in the store, not the doc, so two
  tabs can disagree on the viewed page. Deliberate; the undoable `setActivePage` op is the next step.
- (−) The text overlay is a real DOM element but only ever *mirrors* the model and writes back
  through one op, so §8 (model-is-canonical) holds; rich per-span inline styles are still a side
  concern deferred in KNOWN_ISSUES.
