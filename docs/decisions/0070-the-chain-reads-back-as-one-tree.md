# 0070 — The chain reads back as one tree, and the view is a lens over rows

- **Status:** Accepted (v871, `GET /incidents/{id}/chain`, the 10 unit cases and the live-PostgreSQL run)
- **Date:** 2026-11-22
- **Milestone:** M9 (NEXUS Ops) — the read model over the completed chain
- **Builds on:** ADRs 0018, 0041, 0042, 0067, 0068, 0069, and ADR 0016 amendments 547–548, 577–580

## Context

Five doors now write five tables: an incident, a patch with its bytes, a review request, a verdict, and a
deployment with a reported outcome. A reader who wants the story had to walk it one hop at a time — five
round trips, with no single answer that shows whether a patch was ever deployed. The chain is complete; it
is not yet readable as one thing.

The question is whether to add a sixth table (a materialised "chain summary") or a view. A sixth table would
need invalidation on every write, would drift the moment a door was missed, and would be a second answer to
questions the five tables already answer.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Shape | A materialised summary row / sixth table | Needs invalidation on five write paths; the first missed one is a lie that looks authoritative |
| Shape | **A read-time view over the existing services** | **Chosen** — it cannot drift, because it is computed from the tables at read time |
| Data access | Read the repositories directly | Would bypass the doors' rules (a row a door would refuse could surface here) and duplicate ordering/window logic |
| Data access | **Call the services that OWN each table** | **Chosen** — the view sees exactly what each door would answer, with the same ordering and caps |
| Field shapes | New chain-specific records | Two shapes for one fact; a rename would not break this view and would silently diverge |
| Field shapes | **Nest the writing doors' own record types** | **Chosen** — a change to a door's record is a compile error here, so divergence is impossible |
| Bounds | Unbounded recursion | An incident with thousands of patches would answer with thousands of nested rows and no signal |
| Bounds | **Cap each level at 100 and carry its total beside it** | **Chosen** — `total > list.size()` is the reader's honest truncation signal |
| Writes | Cache the tree for speed | A cache is a sixth record with a lifetime; the read is cheap and the tables are the truth |
| Error | An unknown incident answers an empty tree | "Nothing happened" and "no such incident" are different answers |

## Consequences

**What this buys.** One GET shows the whole story, with every status visible at once: an incident, its
patches, each patch's requests, and each request's decisions and deployments. Every nested value is the
exact record the writing door answers with (eleven / eight / seven / six / ten fields), pinned by unit cases
and the live proof. The read writes nothing: the proof compares all five tables' row counts before and
after, and the audit and delivery tables stay at zero. A restart reads back the same tree byte-identical —
the view is a lens, not a cache.

**What it does not buy.** The view is not paginated beyond the 100-per-level cap, not permissioned (ADR
0018), and not a search index: a caller must know the incident id. It does not add a merge, an apply or a
deployment capability. Truncation is visible but not navigable — a caller who needs the rest walks the
per-table doors with their windows.

**Measured.** 10/10 unit cases (6 service + 4 controller) and the live proof
`docs/evidence/m9/chain-proof.mjs`: the chain ran twice (approved→deployed, rejected); one GET answered two
patches, two requests, two decisions and one deployment nested in the doors' own shapes; patch A read
`deployed` / request `approved` / decision `approved` / deployment `succeeded` and patch B read `proposed` /
request `rejected` / decision `rejected` / no deployment in the same answer; an unknown incident 404
`unknown-incident`; two extra reads moved no row count (1/2/2/2/1) and wrote no audit or delivery; a
STOP/START read back the same tree; psql read the five tables and ZERO / ZERO.
