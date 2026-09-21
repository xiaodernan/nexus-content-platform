# Known Issues & Limitations (honesty per §60)

Live list. Nothing here is hidden behind marketing copy.

## AI / providers
- **No live model provider is wired.** All AI output is **DEMO MODE** — deterministic
  heuristic composition + procedural placeholder imagery + hash embeddings. It is genuinely
  functional (produces real Design Model ops) but is **not** model-quality. The Studio shows
  a persistent "DEMO MODE" badge.

## Studio (Milestone 1 core — working, see docs/evidence/studio)
- The Design Model, infinite Canvas (2D scene-graph renderer), layers tree, properties
  editor, design-system token panel, DEMO-MODE generate + AI-edit, live preview, undo/redo,
  AI-diff and local export (JSON / standalone HTML / canvas PNG) are all functional.
- "Publish" in the slice means **local export** only. Hosted public URLs `/n/{user}/{project}`,
  accounts, and SEO (SSR/OpenGraph) land with M7/community + the `nexus-api` service.
- History is **in-memory** (op-log) for the slice; snapshots do not yet persist to
  `localStorage`/server. Persistence is M7+ / `nexus-api`.
- Text is edited via a Properties-panel textarea; no on-canvas in-place text entry yet, and
  no per-span rich text. Pen/vector, boolean ops, masks, and instance→master syncing are
  deferred; frames/groups/variants exist as model types with partial UI.
- Live drag/resize updates a non-destructive geometry overlay that is committed as a single
  op on pointer-up; snapping/guides render but magnetic snapping is still rudimentary.
- **Visual QA automation caveat:** the Qoder in-app browser reports `document.hidden=true`
  with a `0×0` viewport, suspending `requestAnimationFrame` and refusing pointer/screenshot
  actions. Canvas paint and clicks were therefore validated through DOM structure, the
  headless pipeline proof, the model→preview HTML, and model→SVG artifacts (see
  `docs/evidence/studio/README.md`). In a normal visible browser via `npm run dev` the canvas
  paints and exports PNG normally.

## Architecture
- `services/*` and `agents/*` are **scaffolded shells** with contracts only; they are not yet
  implemented. The Studio intentionally does not depend on them for the slice.
- Sandbox/security enforcement (ADR 0013) is **Proposed**, not built — no untrusted code path
  exists in the slice to protect.

## Tooling
- Package manager is **npm workspaces**, not pnpm: `corepack` cannot write the global pnpm
  shim without admin rights in this environment (EPERM). Layout stays pnpm-compatible.
