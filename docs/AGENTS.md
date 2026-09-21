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

Status: **M2 v0 has landed** — `agents/runtime` (`@nexus/agent-runtime`, ADR 0016) implements the
orchestrator loop, Task/Plan/ToolCall handoff contracts, the permission-scoped Tool Registry with
Human-Checkpoint gating and an in-memory workspace, driven by a deterministic DEMO-MODE planner.
Remaining scaffolds: the multi-agent Registry (§24), memory (§26), real fs/exec/browser/git tools
(land with the ADR 0013 sandbox); the full runtime matures across M2/M6.
