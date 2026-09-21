# Agents & Orchestrator

The **Agent Runtime** (§23) plans, creates subtasks, selects agents/tools, retrieves context,
manages memory, retries, checkpoints, permissions, cost, and evaluation. Initial roles (§24):
Product, Research, Design, Coding, Data, Game, World, Image, Video, QA, Security, DevOps, SEO,
Growth — extensible via the Agent Registry.

Agents exchange **structured handoffs** (§25): Task, Context, Plan, Changes, Results,
Evidence, Errors — not just chat. Memory (§26) is scoped, inspectable, deletable,
permission-controlled.

**Design Agent contract for this repo:** it operates on the Design Model by emitting
`OpBatch` objects (ADR 0006) that the reducer validates. In DEMO MODE the "agent" is the
deterministic heuristic composer — same interface, real ops, no pretending (§60).

Status: **M2 v0–v3 have landed** — `agents/runtime` (`@nexus/agent-runtime`, ADR 0016) implements the
orchestrator loop, Task/Plan/ToolCall handoff contracts, the permission-scoped Tool Registry with
Human-Checkpoint gating and an in-memory workspace, a deterministic hybrid **code index**
(`fs.index`: chunking + symbol extraction + token-bag hash embeddings), read-only real-repo
ingestion (`collectTextFiles`, injected fs), §26 memory (scoped, inspectable, deletable; recall
is the planner's top research tier) and v3 durability: schema-versioned memory save/load plus the
first **jailed** real-disk tools (`disk.read/write/list`, `guardedJoin` root jail, writes
checkpoint-gated), and v4 persisted index snapshots (`saveIndex/loadIndex` + fingerprint
`rescanIndex` that provably equals a cold rebuild). Driven by a deterministic DEMO-MODE planner.
Remaining scaffolds: the multi-agent Registry (§24), snapshot reuse inside `fs.index`,
vector-backed recall (§63/ADR 0012), general exec/browser/git tools (land with the
ADR 0013 sandbox); the full runtime matures across M2/M6.
