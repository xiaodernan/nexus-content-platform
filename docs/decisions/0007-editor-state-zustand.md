# 0007 — Editor/session state with Zustand

- **Status:** Accepted
- **Date:** 2026-09-22

## Context
Beyond the Design Model (ADR 0004), the Studio has volatile *session* state: current
selection, viewport (pan/zoom), tool mode, active panel, hover target, clipboard, and
agent-run progress. This state is high-frequency (pointer moves) and must not churn the
canonical document store.

## Decision
Use **Zustand** with thin slices (`useEditorStore`, `useViewportStore`, `useSelectionStore`)
for session state only. The Design Model lives in a separate store exposed via a selector;
mutations to it go exclusively through the operation dispatcher (ADR 0006), not through
Zustand setters.

## Options
- Zustand (this choice) — minimal boilerplate, selector-based subscriptions (no re-render
  storms), easy outside-React access for imperative canvas handlers.
- Redux Toolkit — powerful but heavy ceremony for a tool we want to iterate fast on.
- React Context — causes broad re-renders on high-frequency viewport updates. Disqualifying.
- Jotai/Signals — fine, but Zustand's single-store + selector ergonomics fit the pointer
  loops best.

## Reason
Zustand's external store + selectors let the canvas read viewport/selection imperatively in
the render loop without subscribing React to every mousemove. Keeping session state separate
from the document store preserves the "model is canonical" boundary.

## Tradeoffs
- (−) Two state systems (Zustand session + design-model store) must not blur. Mitigated by a
  hard rule: session store holds no document data; document store holds no transient UI flags.
