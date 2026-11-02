# 0030 — The health door: two facts, one status code

- **Status:** Accepted (v582, `GET /health`, the 9 unit cases and the live-PostgreSQL run)
- **Date:** 2026-11-02
- **Milestone:** M9 (NEXUS Ops)
- **Builds on:** ADR 0011 (the service boundary), ADR 0018 (public reads), ADR 0016's audit trail (what the
  service DID is already recorded; this is whether it can do anything now)

## Context

M9's first word is observability. The audit trail (amendment 271) records what every successful mutation DID,
in order. It cannot answer the cheaper and more urgent question a probe asks: **can this process serve right
now?** Until this slice, the only answer was indirect — a port that accepts a connection, or one of the
proofs polling an endpoint it happened to know. A port that accepts proves the JVM is running. It says
nothing about the database behind it, which is the component whose failure actually stops the service.

The two facts fail independently. A process can answer HTTP while its database is unreachable (the common
outage: the database is restarted, or a network partition heals slowly), and a database can be healthy while
the process is dead. A door that collapsed them into one boolean would be unable to say which happened, and
a load balancer reading "200" would keep sending traffic to an instance that cannot serve.

This slice is the smallest door that states both, and it deliberately does not grow into a monitoring system.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Door | Reuse an existing content read (e.g. `GET /tools`) as the probe | A content read can be slow, paged and change with data; a probe must be cheap and answer about the process, not the catalog |
| Door | **A dedicated `GET /health`, two facts in the body and the status code** | **Chosen** — a probe has a stable shape, a caller can tell "down" from "gone" |
| Status | Always 200 with `ok: false` in the body | A load balancer and a `curl -f` see success; the failure would be invisible to the machinery that acts on it |
| Status | **200 when the database answers, 503 when it does not** | **Chosen** — the status is the fact the caller acts on; the body still carries the process fact |
| Check | A JPA `SELECT 1` | Needs an entity manager and a query path; a schema problem or a lazy transaction would be reported as "database down", which is a different claim |
| Check | Hikari's own `isRunning()` (pool metadata) | The pool being open says nothing about whether a connection can be borrowed; it is the cached opinion this door exists to avoid |
| Check | **One borrow from the SAME pool, one `Connection.isValid(1)`, one close** | **Chosen** — it measures the resource every request needs, without a query or a second pool |
| Retry | Two or three attempts before answering | A retry turns a probe into a load source and hides flapping; one attempt is the honest sample |
| Retry | **One attempt, no retry** | **Chosen** — the answer describes this moment, not a best-of-three |
| Deadline | An application timer racing the pool | Two timing authorities disagree; the door would say "down" while the pool was still trying |
| Deadline | **The pool's own `connectionTimeout`** | **Chosen** — the live run measured Hikari's 30 s bound at 30 016 ms and the ADR states it |
| Failure reason | The exception's message / a stack trace | Served without authentication; a message can carry a host, a user, a password or a URL |
| Failure reason | Nothing at all | A 503 with no reason is indistinguishable from a bug in the door |
| Failure reason | **A short token: `invalid-connection` or the exception's simple name** | **Chosen** — enough to name the failure, not enough to describe the machine |
| Version | A literal in the code | Drifts from the build the first time the POM changes |
| Version | **The packaged jar's `Implementation-Version`, `unknown` when unpackaged** | **Chosen** — the build's own statement; a unit test or IDE run honestly says it does not have one |
| Version | A `build-info.properties` generated resource | Another build step and another file to keep in step; the manifest already exists |
| startedAt | The JVM's launch instant via `RuntimeMXBean` | The true process age, but it imports a management API and cannot be pinned by the injected `Clock` the rest of the service uses |
| startedAt | **The health bean's construction instant** | **Chosen** — the earliest moment this class can state from its own clock; the bound is disclosed |
| startedAt | The first request's instant | Then uptime is zero on every first read and says nothing about how long the process has been up |
| Cache | Default HTTP caching | An uptime served from a cache is a past fact wearing the present tense |
| Cache | **`Cache-Control: no-store`** | **Chosen** — every read is this moment's measurement |
| Auth | A probe token | A probe that must carry a credential cannot be the probe that runs when credentials are the thing that broke (ADR 0018's public-read rule) |
| Auth | **None** | **Chosen** — the body carries no secret; the detail is a token |
| State | A probe-history table | A health read is not a fact about the world; a table would be a lifetime to manage and a write on every poll |
| State | **None** | **Chosen** — no audit entry, no webhook delivery, no `health` table |
| Scope | Fan out to every dependency (Redis, ai-svc, webhooks) | Two of those are not wired in this build; a deep check would report failures of components this service does not use |
| Scope | **This service's own database only** | **Chosen** — the dependency whose failure stops serving |

## Choice

`GET /health` answers one JSON object:

```json
{
  "service": "nexus-api",
  "version": "0.1.0-SNAPSHOT",
  "startedAt": "2026-11-02T16:11:39.767921100Z",
  "uptimeSeconds": 1,
  "database": { "reachable": true, "latencyMs": 1 }
}
```

- **200** when `database.reachable` is true; **503** when it is false. The 503 body has the same shape, with
  `"reachable": false`, a measured `latencyMs` and a `detail` token.
- `service` is `${spring.application.name:nexus-api}`. `version` is read ONCE, at bean construction, from the
  packaged jar's manifest (package attribute first, then the outer jar's manifest for a Spring Boot
  executable jar), and is `"unknown"` when this class is not running from a jar.
- `startedAt` is the `Clock`'s instant when this bean was constructed; `uptimeSeconds` is that clock's age,
  clamped at zero if the clock moves backwards.
- `database.detail` is **omitted** when reachable, `invalid-connection` when the borrowed connection refuses
  `isValid(1)`, and otherwise the exception's **simple name**. The body never carries a message, a stack
  trace, a JDBC URL, a host or a credential.
- `Cache-Control: no-store` on both answers.
- Nothing is written: no audit entry, no webhook delivery, no table.

## Reason

- **The status code is the fact a caller can act on.** A load balancer, a `curl -f` in a script and a human
  with a browser all read the status first. 503 is the only answer that makes a broken database visible to
  the machinery that routes traffic; the body is for the human who asks why.
- **The body keeps the process fact alive.** A 503 still carries `service`, `version`, `startedAt` and
  `uptimeSeconds`, so "the database is down" is distinguishable from "the service is gone".
- **The probe measures the resource that fails.** A borrow from the same pool every request uses, then
  `isValid(1)`, is closer to the truth than a pool flag or a separate connection. It is still not a query:
  the door says the connection is usable, not that the schema is right.
- **One attempt and the pool's own clock.** The service adds no timer, no thread and no retry. When the pool
  is exhausted the call waits for Hikari's `connectionTimeout` (30 s by default), and the measured latency is
  that wait — 30 016 ms in the live run. The door does not race the pool with a second opinion.
- **The failure is named without describing the machine.** `invalid-connection` and a simple class name are
  enough for an operator to recognize the failure class, and contain no address, user, password or message.
  The proof asserts the absence in the unauthenticated body.
- **The version is the build's own statement.** The live proof reads the POM's version and requires the
  packaged jar to answer exactly that, so a hard-coded literal or a stale constant cannot pass. An
  unpackaged tree says `unknown` rather than borrowing a version from a manifest on the classpath.
- **The same process survives the outage.** `startedAt` is unchanged and `uptimeSeconds` grows across the
  database stop/start, which is what makes the recovery a recovery rather than a restart.
- **Nothing is stored.** Reading health is not a fact in the world; the proof reads zero audit entries, zero
  webhook deliveries and zero `health%` tables before, during and after the outage.

## Tradeoffs (stated, not implied)

- **`startedAt` is the bean's construction, not the JVM's launch.** It is later than process start by most of
  the context's startup time, so uptime under-reports the process's age. The alternative (`RuntimeMXBean`)
  would be the true launch instant but could not be pinned by the injected clock the tests use. The door
  states the instant it can honestly measure; it does not claim the process's birthday.
- **`isValid` is connection validity, not schema validity.** A migrated-away table, a missing column or a
  failing query would still answer `reachable: true`. There is no `SELECT 1`, no migration check and no
  read/write distinction.
- **A blocked borrow can take 30 seconds.** When the pool has no usable connection, the answer waits for
  Hikari's `connectionTimeout`. A probe with a shorter deadline would time out before this door answers, and
  a caller must allow the pool's bound. This service does not add a second timer.
- **There is no liveness door.** One door carries two facts; a 503 does not mean the process should be
  restarted, only that this instance cannot reach its database. An orchestrator that treats any non-200 as a
  restart signal would restart a healthy process — the split is stated here, not hidden.
- **No history, no percentile, no flap detection.** The door answers this moment; the audit trail records
  mutations, not probes. A probe history would be a table this slice deliberately does not add.
- **The version is `unknown` outside a packaged jar.** Unit tests and IDE runs say so. The live proof requires
  the packaged jar to answer the POM's version, so the bound is measured where it matters.
- **The detail names the failure technology.** `SQLTransientConnectionException` tells a reader that JDBC is
  involved; it does not name an address or a credential. That disclosure is deliberate and bounded.
- **Only this service's database is checked.** Redis and `ai-svc` are not wired; webhooks are outbound and do
  not gate serving. A deep dependency matrix would report components this build does not use.
- **No authentication and no metrics.** The body carries nothing a credential would protect (ADR 0018), and
  the door exposes one sample per call rather than a metrics registry.

## Evidence

- `mvn -B test` over a clean `git archive` of HEAD `8dba4d5` carrying only this slice: **642/642 in 33 test
  classes**, 0 failures. This slice contributes **9**: 7 service cases (a reachable database with no detail
  and a non-negative latency; `invalid-connection`; an exception reduced to its simple name with a JSON body
  that contains no `jdbc:`/host/password/message; exactly one borrow and one close; a throw on borrow leaves
  nothing to close; uptime measured, clamped and monotonic against a steppable clock; `unknown` when
  unpackaged) and 2 controller cases (200 with `no-store` and no `detail`; 503 with the reason and the
  process fact intact).
- `docs/evidence/m9/service-health-proof.mjs` (`npm run verify:health`) — builds the service, starts a
  throwaway `pgvector/pgvector:pg16`, and reads the door three times around a real outage. Measured in this
  run: §1 `200`, `version "0.1.0-SNAPSHOT"` (the POM's own), `startedAt 2026-11-02T16:11:39.767921100Z`,
  uptime 1 s, database reachable in **1 ms**, no `detail`, `Cache-Control: no-store`; §2 psql reads **0**
  audit entries, **0** webhook deliveries and **0** `health%` tables; §3 with the database stopped under the
  running process, `503`, `reachable: false`, `detail "SQLTransientConnectionException"`, latency **30 016 ms**
  (Hikari's 30 s bound), the same `startedAt`, and a body containing no JDBC URL, host, password, message or
  stack trace; §4 with the database started again, `200`, no `detail`, reachable in **4 504 ms**, the SAME
  `startedAt`, uptime **3 s → 33 s**, and psql still reads **0 / 0 / 0** — the read wrote nothing.
- `npm run verify:evidence-census` — this proof is a ROW in the population it counts.
