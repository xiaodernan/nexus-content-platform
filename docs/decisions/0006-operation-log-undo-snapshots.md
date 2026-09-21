# 0006 — Operation log: one mechanism for undo/redo, snapshots and AI-diff

- **Status:** Accepted
- **Date:** 2026-09-22

## Context
Several requirements need the *same* underlying capability:
- Undo/redo (§7, §35), where AI operations must be transactional and undoable.
- Snapshots: create/compare/restore/branch/fork (§35).
- **AI Diff** (§36): show before/after and exactly which nodes/assets changed.
- Version lineage for remix (§4, §42).

Research on canvas-editor state (command pattern + immutable snapshots with Zustand) shows
naïve "snapshot the whole doc on every keystroke" explodes memory, while pure command-log
diffing is hard to reason about.

## Decision
Represent **every mutation as a named, reversible `Op`** (`{ type, target, before, after }`)
applied by a pure `applyOp(model, op) => model` reducer. Maintain:
- an **undo/redo stack** of committed `OpBatch` (a group = one user gesture or one AI action),
- **structural sharing** so an `Op` copies only the nodes it touches,
- **derived diffs** (before/after node sets) computed from the batch — reused verbatim by the
  AI Diff UI, snapshots and remix lineage.

## Options
- **Ops + structural sharing + batched history** (this choice).
- Whole-document snapshots per step — simplest, wasteful memory.
- Immutable.js / Automerge / Yjs CRDT — great for multiplayer later, but heavier than the
  slice needs now and would pre-commit us to a merge model before §4/§42 requirements firm up.

## Reason
One primitive (the Op) yields undo, redo, diff, snapshot, transaction and audit-trail for
free, and is exactly what the Design Agent (§11) and Coding Agent should emit and inspect.
It satisfies "Never destroy user code silently" (§9): an AI Op that would clobber a
`code-only` region is rejected at `applyOp` validation time.

## Tradeoffs
- (−) Every new capability must be expressed as Ops, not ad-hoc mutation. Accepted — it is
  the discipline that makes §35/§36 possible.
- (−) Full-CRDT multiplayer/merge (§4, §42 "Merge") is deferred; the batch structure is
  designed so a later CRDT/OT layer can wrap `OpBatch` without changing the model.
