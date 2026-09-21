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
