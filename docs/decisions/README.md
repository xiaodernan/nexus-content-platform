# NEXUS Architecture Decision Records

Every major architectural decision is recorded here (spec §78). Format per record:
**Decision · Context · Options · Choice · Reason · Tradeoffs · Date**.

An ADR is immutable once Accepted. Later reversals are recorded as a new ADR that
`supersedes` the old one, so the reasoning trail is never lost.

## Index

| ID    | Title                                                       | Status   |
|-------|-------------------------------------------------------------|----------|
| 0001  | Record architecture decisions                               | Accepted |
| 0002  | Monorepo layout & build tooling                             | Accepted |
| 0003  | Frontend stack for the Studio                               | Accepted |
| 0004  | Nexus Design Model as the single canonical representation   | Accepted |
| 0005  | Custom scene-graph canvas renderer                          | Accepted |
| 0006  | Operation log: undo/redo, snapshots, AI-diff                | Accepted |
| 0007  | Editor state with Zustand                                   | Accepted |
| 0008  | Design tokens in W3C DTCG format                            | Accepted |
| 0009  | Provider abstraction & model router                         | Accepted |
| 0010  | Deterministic DEMO MODE (no fake implementations)           | Accepted |
| 0011  | Backend service boundaries (Node/Spring/FastAPI)            | Accepted |
| 0012  | Persistence: PostgreSQL + pgvector + Redis                  | Accepted |
| 0013  | Sandbox & security model                                    | Proposed |
| 0014  | Local-first snapshot persistence & Studio view-state         | Accepted |
| 0015  | Component → instance projection at view time                 | Accepted |
| 0016  | Agent runtime v0: hermetic demo loop + tool registry         | Accepted |
| 0017  | Reproducible browser verification: a zero-dependency CDP harness | Accepted |
| 0018  | Accounts, ownership and publication identity                 | Proposed |
| 0019  | Credits ledger & creator-economy model layer                | Accepted |
| 0020  | The refund mechanism: reversing one purchase atomically     | Accepted |
| 0021  | External webhook subscriptions: the first outbound contract | Accepted |
| 0022  | The tool registry: declare, never execute                  | Accepted |
| 0023  | Tool details and the owner's update                        | Accepted |
| 0024  | A tool declaration's revision history                      | Accepted |
| 0025  | Tool deprecation: its own fact, doors and public list        | Accepted |
| 0026  | The MCP face: advertise the registry, refuse execution       | Accepted |
| 0027  | Catalog search: literal wildcards, narrowed count            | Accepted |
| 0028  | A contract you can pin: a computed fingerprint               | Accepted |
| 0029  | A declaration can be given away: its chain of holders        | Accepted |
| 0030  | The health door: two facts, one status code                  | Accepted |
| 0031  | A history narrowed to what you do not have: `since`          | Accepted |
| 0032  | Retention is the owner's, and it names the bound it keeps     | Accepted |
| 0033  | The catalog names the rows that are going away              | Accepted |
| 0034  | A journal of what happened, because two changes delete their own evidence | Accepted |
| 0035  | A feed you can watch: two narrowings that never lie about what they hid | Accepted |
| 0036  | A list of ids is one read, and it names the ones that held nothing | Accepted |
| 0037  | A claim about one contract: the attestation, bound to its pin | Accepted |
| 0036  | Liveness is not readiness: two doors, two audiences           | Accepted |
| 0037  | The process's own numbers: a sample, not a metrics system | Accepted |
| 0038  | The catalog can name the rows that carry a claim: a `tested` filter | Accepted |
| 0039  | Traffic counted where it crosses: a bounded ledger, not a metrics system | Accepted |
| 0040  | The contract you pinned can be read back: a lookup by pin, scoped to one declaration | Accepted |
| 0041  | An incident is a record with a life, not a status page | Accepted |
| 0042  | A patch is the bytes an author wrote, and the service does not run it | Accepted |
| 0043  | A keyset page is a name, not an offset                         | Accepted |
| 0044  | A diff names where, not what: two pins in one pointer vocabulary | Accepted |
| 0045  | A pin names content, not a row: the registry-wide lookup | Accepted |
| 0046  | A manifest of pins is one read, and an unrecorded pin is named | Accepted |
| 0047  | A deprecation page is ordered by a pair                       | Accepted |
| 0048  | A deprecation page can name whose warnings it wants            | Accepted |
| 0049  | A replacement hint is resolved on every read                   | Accepted |
| 0050  | A warning list can be selected by replacement state            | Accepted |
| 0051  | A journal is pruned only from the front                        | Accepted |
| 0052  | A replacement chain names where it ends                        | Accepted |
| 0053  | A warning list can select several states at once                | Accepted |
| 0054  | Spring Cloud enters NEXUS as a REGISTRY and an EDGE, not as a rewrite | Accepted |
| 0055  | A service is reached BY NAME, and its failure is a FACT about the service | Accepted |
| 0056  | A failure must NAME itself: which service, which kind, and who refused | Accepted |
| 0057  | Configuration enters NEXUS as ONE door, and it is optional at boot | Accepted |
| 0058  | Spring Cloud in NEXUS: what runs, what only parses, and what is deliberately absent | Accepted |
| 0059  | A span is evidence only where a hop writes it down | Accepted |
| 0061  | When the Discover feed cache is correct, and when it breaks | Accepted |
| 0059  | A trace id is evidence only where a hop WRITES IT DOWN                  | Accepted |
