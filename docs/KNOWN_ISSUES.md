# Known Issues & Limitations (honesty per §60)

Live list. Nothing here is hidden behind marketing copy.

## AI / providers
- **No live model provider is wired.** All AI output is **DEMO MODE** — deterministic
  heuristic composition + procedural placeholder imagery + hash embeddings. It is genuinely
  functional (produces real Design Model ops) but is **not** model-quality. The Studio shows
  a persistent "DEMO MODE" badge.

## Studio (Milestone 1, in progress)
- "Publish" in the slice means **local export** (JSON snapshot + standalone HTML + PNG
  screenshot). Hosted public URLs `/n/{user}/{project}`, accounts, and SEO (SSR/OpenGraph)
  land with M7/community + the `nexus-api` service.
- Text editing uses an in-place DOM overlay; rich/inline text styles (per-span) are not yet
  supported.
- Vector/pen-tool, boolean ops, masks, and component *instances syncing to a master* are
  deferred; frames/groups + variants exist as model types with partial UI.
- Snapshots persist to `localStorage` for the slice; server-side snapshot/versioning is M7+.

## Architecture
- `services/*` and `agents/*` are **scaffolded shells** with contracts only; they are not yet
  implemented. The Studio intentionally does not depend on them for the slice.
- Sandbox/security enforcement (ADR 0013) is **Proposed**, not built — no untrusted code path
  exists in the slice to protect.

## Tooling
- Package manager is **npm workspaces**, not pnpm: `corepack` cannot write the global pnpm
  shim without admin rights in this environment (EPERM). Layout stays pnpm-compatible.
