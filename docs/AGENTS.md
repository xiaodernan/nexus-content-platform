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

Status: `agents/` is a scaffolded placeholder; the orchestrator runtime lands with M2/M6.
