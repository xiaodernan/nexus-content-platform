# 0036 — Liveness is not readiness: two doors, two facts, two audiences

- **Status:** Accepted (v585, `GET /health/live` + `GET /health/ready`, the 8 new unit cases and the
  live-PostgreSQL run)
- **Date:** 2026-11-02
- **Milestone:** M9 (NEXUS Ops)
- **Builds on:** ADR 0030 (the health door: the process fact and the database fact, one status code), ADR
  0011 (the service boundary), ADR 0018 (public reads)

## Context

ADR 0030 shipped one door, `GET /health`, that answers both facts. That is right for a caller asking "can I
use this service?" — the status code is 503 when the database cannot serve. It is wrong for a supervisor
asking "is this process alive?", because the same 503 arrives after the pool's own 30 s borrow and carries a
fact about the DATABASE. An orchestrator that treats every non-200 as "restart the process" would restart a
healthy process during a database outage, which repairs nothing and drops whatever work was in flight.

The two questions are not the same question, and they fail independently:

| | database up | database down |
| --- | --- | --- |
| **process up** | serve traffic | healthy process, take it out of rotation |
| **process down** | no answer at all | no answer at all |

ADR 0030's own tradeoffs section named this bound: "There is no liveness door. … An orchestrator that treats
any non-200 as a restart signal would restart a healthy process — the split is stated here, not hidden."
This slice closes that bound with two doors and one measurement.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Shape | Keep one door and tell operators to read the body | The supervisor's machinery acts on the status code, not on a field it must parse; the two audiences need different codes |
| Shape | Make `/health` mean liveness and move readiness elsewhere | Breaks the already-shipped door's meaning for existing readers (ADR 0030 is Accepted) |
| Shape | **Add `/health/live` and `/health/ready`; keep `/health` unchanged** | **Chosen** — existing readers keep their contract; each new door states one fact |
| Liveness check | Borrow a connection and answer 200/503 | That is readiness wearing a liveness name; it inherits the pool's 30 s bound and a database fact |
| Liveness check | Spawn a thread / ping an external monitor | Two timing authorities, another failure mode, and the probe stops describing THIS process |
| Liveness check | **Answer from the bean's own state, no borrow, no timer** | **Chosen** — if this code runs, the HTTP stack runs; the absence of a `database` field is the claim |
| Readiness check | A second `SELECT 1` | A query path can fail for schema reasons, which is a different fact from "a connection can be borrowed" |
| Readiness check | **The same measurement `/health` makes: one borrow, one `isValid(1)`, one close** | **Chosen** — the doors cannot disagree about what "reachable" means |
| Readiness body | Only the status code | A caller reading the 503 body would have to infer the answer; the body states `ready` |
| Readiness body | **`ready` plus the same `database` object** | **Chosen** — the operator's word and the measurement, one object |
| Status | Liveness 503 when the pool is exhausted | Restarts a healthy process; the exact failure this slice exists to prevent |
| Status | **Liveness always 200 while the process answers; readiness 200/503** | **Chosen** — the codes name the facts each audience acts on |
| Cache | Default HTTP caching | Both answers are this moment's fact, and an uptime from a cache is a past fact |
| Cache | **`Cache-Control: no-store` on both** | **Chosen** — same rule as ADR 0030 |
| State | Record probes / a health table | A probe is not a fact about the world; ADR 0030 already refused a table |
| State | **None** | **Chosen** — zero writes, proved with psql |

## Choice

Two new doors, both public, both credential-free, both `Cache-Control: no-store`:

```json
// GET /health/live — 200 whenever this code runs; no database field exists to be false
{
  "service": "nexus-api",
  "version": "0.1.0-SNAPSHOT",
  "startedAt": "2026-11-02T17:20:17.222834700Z",
  "uptimeSeconds": 2
}
```

```json
// GET /health/ready — 200 when database.reachable, 503 when it is not
{
  "ready": true,
  "database": { "reachable": true, "latencyMs": 14 }
}
```

- `GET /health` keeps ADR 0030's shape and status rule unchanged. It remains the "can I use this service?"
  door; the split adds two questions, it does not move one.
- `liveness()` reads only the fields the bean already holds (`service`, `version`, `startedAt`, the clock's
  age). It never touches `DataSource`. A unit test asserts `verifyNoInteractions(dataSource)` rather than
  trusting the comment.
- `readiness()` calls the same `database()` measurement `report()` calls, then states `ready =
  database.reachable()`. The duplication is deliberate: the operator's word and the measurement are two
  fields, so a caller needs only one of them.
- The failure reason keeps ADR 0030's rule: `invalid-connection` or an exception's simple name, never a
  message, JDBC URL, host or credential.
- Nothing is written. The live proof reads zero audit entries, zero webhook deliveries and zero `health%`
  tables.

## Reason

- **The status code is the audience's fact.** A supervisor acts on liveness: non-200 means restart. A load
  balancer acts on readiness: non-200 means remove from rotation. One door cannot serve both without
  misinforming one of them.
- **Liveness must not wait behind the pool.** The live proof measures both doors in the SAME outage,
  liveness first: `/health/live` answers 200 in single-digit milliseconds while `/health/ready` waits
  Hikari's own 30 s borrow. If liveness borrowed, it would inherit that wait and turn "alive" into "alive,
  unless the database is down".
- **The absence of a field is the claim.** A liveness body with a `database` field would invite a reader to
  treat it as readiness. The shape is pinned in the proof (`service/startedAt/uptimeSeconds/version`, no
  others), and the unit test checks the field is absent in serialized JSON.
- **One measurement, two doors.** Readiness and `/health` cannot drift because they call the same method; a
  test calls both on the same mock and compares the answers.
- **The same process is named on all three doors.** `startedAt` is identical across `/health/live`,
  `/health/ready` and `/health` in the live run, and it survives the outage — recovery is not a restart.
- **No state, again.** The split is two reads of facts the process already has. It adds no table, no audit
  entry and no delivery.

## Tradeoffs (stated, not implied)

- **Liveness is shallow.** It proves the HTTP stack and this bean run. It does NOT prove the JVM's threads
  are healthy, that memory is available, or that a request needing the database can succeed. That is
  readiness's job, and a liveness door that went deeper would duplicate it and inherit its bound.
- **Readiness still waits up to Hikari's `connectionTimeout`.** The live run measured **30 108 ms** with the
  database stopped. A readiness probe with a shorter deadline will time out before this door answers; the
  probe's timeout must allow the pool's bound. This service adds no second timer (ADR 0030's rule).
- **`ready` repeats `database.reachable()`.** Two fields carry one fact. The repetition is chosen so a
  caller can read either; it is also a second place that must stay in step, which the shared method and the
  test enforce.
- **The three doors overlap.** `/health` is the union of the two new answers in one body. That is deliberate
  compatibility, not redundancy: ADR 0030's readers keep their contract, and the union remains the door for
  a caller who wants both facts in one call.
- **Only this service's database gates readiness.** Redis and `ai-svc` are not wired; webhooks are outbound.
  A deep dependency matrix would report components this build does not use (ADR 0030's scope).
- **No authentication, no metrics, no history.** The bodies carry nothing a credential would protect; each
  call is one sample. A percentile or flap detector would be a monitoring system this milestone has not
  built.
- **The version is `unknown` outside a packaged jar.** Unit tests and IDE runs say so; the live proof
  requires the jar to answer the POM's version.

## Evidence

- `mvn -B test` over a clean `git archive` of HEAD `a4da07e` carrying only this slice: **696/696 in 33 test
  classes**, 0 failures. This slice contributes **8**: 5 service cases (liveness answers the process facts
  and `verifyNoInteractions(dataSource)`; liveness uptime follows the injected clock and clamps at zero;
  readiness is true with no `detail`; readiness is false with the short token and a body containing no
  `jdbc:`/host/password/message; readiness and `/health` name the same measurement) and 3 controller cases
  (liveness 200 with no `database` field and `no-store`; readiness 200 with `ready=true`; readiness 503 with
  `ready=false` and the reason).
- `docs/evidence/m9/service-liveness-proof.mjs` (`npm run verify:liveness`) — builds the service, starts a
  throwaway `pgvector/pgvector:pg16`, reads both doors with the database up, STOPS the database, measures
  liveness FIRST and then readiness, STARTS the database, and reads the recovery. Measured in this run:
  §1 `/health/live` `200` in **17 ms**, `version "0.1.0-SNAPSHOT"` (the POM's own), `startedAt
  2026-11-02T17:20:17.222834700Z`, uptime 2 s, no `database` field, `no-store`; §2 `/health/ready` `200`,
  `ready=true`, reachable in **17 ms**, no `detail`, `/health` still 200, the same `startedAt`; §3a with the
  database stopped, `/health/live` still `200` in **8 ms** with the same `startedAt` and uptime; §3b
  `/health/ready` `503` after **30 108 ms** (Hikari's own borrow), `ready=false`, `reachable=false`, `detail
  "SQLTransientConnectionException"`, no JDBC URL, host, password, message or stack trace; §4 after the
  database returned, `/health/ready` `200` with `ready=true` and no `detail`, `/health/live` still the SAME
  `startedAt`, uptime **4 s → 40 s** in **22 ms**, and psql reads **0** audit entries, **0** webhook
  deliveries and **0** `health%` tables throughout.
- `npm run verify:evidence-census` — this proof is a ROW in the population it counts.
