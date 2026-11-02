# 0037 — The process's own numbers: a vitals sample, not a metrics system

- **Status:** Accepted (v588, `GET /health/vitals`, the 5 unit cases and the live-PostgreSQL run)
- **Date:** 2026-11-02
- **Milestone:** M9 (NEXUS Ops)
- **Builds on:** ADR 0030 (the health door), ADR 0036 (liveness is not readiness), ADR 0018 (public reads)

## Context

The service can now say whether it is alive (`/health/live`), whether it can serve (`/health/ready`, `/health`)
and whether its database answers. What it cannot say is what it is USING: how much heap it holds, how many
threads it runs, how many processors it sees. Those are the numbers an operator reaches for first when a
process is slow, restarting, or suspected of a leak — and until this slice the only way to read them was to
attach a profiler to the machine.

ADR 0030's tradeoffs named this bound: "No history, no percentile, no flap detection… the door exposes one
sample per call rather than a metrics registry." This slice adds the sample. It does NOT become a metrics
system: no request counters, no latency histogram, no GC totals, no storage.

The distinction that decides the design: a serving fact belongs on `/health` (a 503 when the database
cannot serve), and a usage fact must NOT become a status threshold. A heap at 95% is an alert for a human or
an autoscaler, not a reason this service invents a 503 — the threshold belongs to the operator, not to the
door.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Door | Add vitals fields to `/health` | `/health` is a serving fact with a 503 rule; usage numbers do not decide serving, and mixing them invites a threshold this service does not own |
| Door | **A separate `GET /health/vitals`** | **Chosen** — a usage fact with its own shape and its own audience (an operator watching the process) |
| Source | A custom counter incremented on every request | That is a metrics system with lifetime and reset semantics; this slice samples the JVM, it does not count the service |
| Source | **`MemoryMXBean`, `ThreadMXBean`, `Runtime.availableProcessors()`** | **Chosen** — the JVM's own statements, read at the moment of the call |
| Source | A cached snapshot refreshed on a timer | A timer is another authority, and a cached number is a past fact wearing the present tense |
| Source | **Read the beans on every call** | **Chosen** — a second read is a second measurement (a unit test pins this) |
| Status | 503 when heap is above a threshold | The threshold is not this service's; the door would be inventing an operational policy |
| Status | **Always 200 while the process answers** | **Chosen** — the numbers are the process's own; alerting reads the values |
| `heapMaxBytes` | Clamp `-1` (undefined) to 0 | Turns "no defined maximum" into "empty heap", a false claim; the JDK's `-1` is served as `-1` |
| Cache | Default HTTP caching | A sampled number served from a cache is a past fact |
| Cache | **`Cache-Control: no-store`** | **Chosen** — same rule as the other health doors |
| State | A sample table / a ring buffer | A vitals read is not a fact about the world; history is another system's job |
| State | **None** | **Chosen** — no audit entry, no delivery, no `health` table (proved with psql) |
| Auth | A token | The numbers describe the JVM, not a credential; ADR 0018's public-read rule applies |

## Choice

```json
// GET /health/vitals — 200 while the process answers; six integers, one sample
{
  "heapUsedBytes": 124768096,
  "heapCommittedBytes": 155189248,
  "heapMaxBytes": 4246732800,
  "liveThreads": 26,
  "peakThreads": 26,
  "processors": 16
}
```

- `VitalsSource` is the only place that touches the JDK beans; a test substitutes it, so the mapping and the
  door are graded without a JVM bean.
- `VitalsService.read()` asks the source on EVERY call. There is no field, no cache and no reset: two calls
  are two samples (a unit test returns two different heap values from the source and asserts both arrive).
- `heapMaxBytes` is passed through exactly as `MemoryUsage.getMax()` reports it, including `-1`.
  `heapUsedBytes` and `heapCommittedBytes` are non-negative, `peakThreads >= liveThreads`, and
  `processors >= 1`; the live proof checks these invariants rather than trusting the JVM.
- The door answers `200` while the process answers, with `Cache-Control: no-store`. It has no status rule
  that depends on a value.
- Nothing is written. The live proof reads zero audit entries, zero webhook deliveries and zero `health%`
  tables.

## Reason

- **Different fact, different door.** `/health` answers "can this process serve?" with a 503 that removes an
  instance from rotation. Vitals answers "what is this process using?" and must not remove anything. Sharing
  a door would force one status rule onto two unrelated facts.
- **The JDK is the only authority here.** Heap usage, thread counts and processor count are facts the JVM
  already publishes. Re-deriving them from the service's own counters would be a second, weaker
  measurement.
- **A sample is the honest shape.** No history means no window, no percentile, no reset semantics and no
  storage. An operator who wants a time series already has the platform's metrics; what this service owes
  them is a truthful current number without a new subsystem.
- **Not inventing a threshold.** A door that returned 503 at some heap percentage would encode an
  operational policy this service does not own, and would force every caller to agree with it. The values
  are served; the judgment stays with the operator.
- **The database cannot make vitals fail.** The live proof stops PostgreSQL under the running process and
  vitals still answers 200 in single-digit milliseconds, because it borrows no connection. That is the same
  independence `/health/live` has, measured on a different door.
- **Still no state.** The sample is computed from the JVM and returned; psql reads zero rows and zero
  tables afterwards.

## Tradeoffs (stated, not implied)

- **JVM facts, not service metrics.** There is no request count, no latency histogram, no error rate, no GC
  count and no percentile. A reader who needs those needs a metrics system this milestone has not built.
- **One sample per call.** Two calls can differ; nothing correlates them, and a scrape every N seconds
  builds a series outside this service. The door does not promise that the values are stable, only that
  each is what the JVM said at that moment.
- **`heapMaxBytes` can be `-1`.** A reader must handle the JDK's "no defined maximum" rather than assume a
  positive ceiling. The proof asserts the value is either `-1` or positive and never clamps it.
- **`liveThreads` and `peakThreads` are JVM-wide.** They include threads the service did not create (the
  JVM's own, the database pool's, the web server's). This is a process fact, not a per-component breakdown.
- **The heap is one memory pool.** Non-heap memory (metaspace, code cache, direct buffers) is not reported;
  a leak outside the heap would not appear here.
- **Always 200 has a cost.** A caller must read the values to decide anything; a status-only check tells
  them the process answered, which is what `/health/live` already says. The two doors overlap deliberately:
  liveness is the cheap status, vitals is the numbers.
- **No authentication.** The numbers describe this process's resource usage, not a user or a secret; ADR
  0018's public-read rule applies. A deployment that considers heap size sensitive can gate the path at its
  proxy, which is outside this service.
- **`processors` is what the JVM sees,** which can differ from the host's core count under cgroup limits
  older than the JDK's container awareness. The door reports the JVM's view, not the host's.

## Evidence

- `mvn -B test` over a clean `git archive` of HEAD `389a157` carrying only this slice: **710/710 in 35 test
  classes**, 0 failures. This slice contributes **5**: 3 service cases (the six numbers pass through
  unchanged; an undefined maximum stays `-1`; two reads ask the source twice and return two samples) and 2
  controller cases (200 with exactly six fields and `no-store`; `-1` served unchanged with 200).
- `docs/evidence/m9/service-vitals-proof.mjs` (`npm run verify:vitals`) — builds the service, starts a
  throwaway `pgvector/pgvector:pg16`, reads vitals, STOPS the database, reads vitals again, STARTS it, and
  reads psql. Measured in this run: §1 `200` in **77 ms**, heap **124 768 096 / 155 189 248** bytes of
  **4 246 732 800**, **26** live / **26** peak threads, **16** processors, exactly six fields, `no-store`;
  §2 with the database stopped, vitals still `200` in **6 ms** with the same shape and `/health/live` `200`
  in **12 ms**; §3 after the database returned, vitals `200` in **24 ms**, and psql reads **0** audit
  entries, **0** webhook deliveries and **0** `health%` tables.
- `npm run verify:evidence-census` — this proof is a ROW in the population it counts.
