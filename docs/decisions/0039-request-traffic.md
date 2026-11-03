# 0039 — Traffic counted where it crosses: a bounded ledger, not a metrics system

- **Status:** Accepted (v592, `GET /health/traffic`, the 14 unit cases and the live-PostgreSQL run)
- **Date:** 2026-11-02 (evidence read 2026-11-03)
- **Milestone:** M9 (NEXUS Ops)
- **Builds on:** ADR 0037 (the vitals sample and its named bound), ADR 0030 (the health door), ADR 0036
  (liveness is not readiness), ADR 0018 (public reads)

## Context

ADR 0037 closed with a bound it did not cross: "There is no request count, no latency histogram, no error
rate, no GC count and no percentile. A reader who needs those needs a metrics system this milestone has not
built." This slice builds the first half of that sentence — the request count, the status families and a
coarse latency partition — and leaves the metrics-system half where it is.

The service can now say whether it is alive, whether it can serve, what its JVM holds, and for each webhook
subscription whether deliveries are landing. It cannot say how much traffic it has served, how many responses
were 4xx or 5xx, or how long requests took. Those are the first three questions an operator asks when a
service is slow or failing, and until this slice the only place they existed was the proxy in front of the
process — a different process with a different view.

The distinction that decides the design: `/health` is a SERVING fact and its 503 removes an instance from
rotation. Traffic is a USAGE fact about what already happened. A process that has answered a thousand 5xx
responses is still ready to serve the next request, so traffic must answer 200 and report the count; turning
the count into a status code would make this door a policy the service does not own.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Door | Add counts to `/health` | `/health` carries a 503 rule; counts do not decide serving, and a process with errors must not fail its own health door |
| Door | **A separate `GET /health/traffic`** | **Chosen** — a usage fact with its own shape and audience, next to `/health/vitals` |
| Library | Micrometer / a metrics registry | A new dependency, a registry lifecycle, and a scraper contract this milestone has not designed |
| Library | **The service's own bounded counters** | **Chosen** — fixed memory, no dependency, and an answer this proof can assert exactly |
| Shape | A map of path → count | Unbounded: every 404 path a scanner invents becomes a row; cardinality is attacker-controlled |
| Shape | A ring buffer of recent durations | Gives percentiles but stores history; a fixed window then answers "recent" not "since start" |
| Shape | **Five fixed latency buckets + five status families** | **Chosen** — bounded counters, exact partitions, and no invented edges beyond stated ones |
| Concurrency | Lock-free `LongAdder`s read one by one | A snapshot can straddle an in-flight request: families and buckets may disagree with `requests` |
| Concurrency | **One monitor around record and snapshot** | **Chosen** — the exact answer wins; the lock is the stated cost |
| Instrumentation | A Spring `HandlerInterceptor` | Does not see framework-produced 404s or requests that never reach a handler |
| Instrumentation | **A `OncePerRequestFilter`** | **Chosen** — wraps the whole dispatch, sees the final status, and counts exactly once |
| Failure | Let the thrown request go uncounted | A failed request is the one an operator looks for; the filter records 500 and rethrows |
| Self-count | Exclude `/health/*` from the ledger | The ledger would then lie about the traffic it actually served, and "health is cheap" is not a reason to hide it |
| Self-count | **Count every request, including traffic reads** | **Chosen** — the snapshot is taken before the asking request ends, so it excludes itself and appears in the next answer |
| Status | 503 when the 5xx share is high | A threshold this service does not own; the counts are served and the judgment stays with the operator |
| Status | **Always 200 while the process answers** | **Chosen** — the ledger does not borrow a connection, so it answers during an outage |
| Cache | Default HTTP caching | A ledger served from a cache is a past count |
| Cache | **`Cache-Control: no-store`** | **Chosen** — same rule as every other health door |
| State | A metrics table / a reset endpoint | A traffic read is not a fact about the world; the counters die with the process |
| State | **None — heap counters only** | **Chosen** — no audit entry, no delivery, no `traffic` table (proved with psql) |
| Auth | A token | The counts describe traffic, not a credential; ADR 0018's public-read rule applies |

## Choice

```json
// GET /health/traffic — 200 while the process answers; one snapshot of the ledger
{
  "requests": 11,
  "successes": 8,
  "redirects": 1,
  "clientErrors": 1,
  "serverErrors": 1,
  "unclassified": 0,
  "durationTotalMs": 87,
  "durationMaxMs": 40,
  "latency": {
    "upTo10Ms": 9,
    "upTo50Ms": 1,
    "upTo250Ms": 0,
    "upTo1000Ms": 1,
    "over1000Ms": 0
  }
}
```

- `TrafficFilter` (a `OncePerRequestFilter`) is the only place a request is counted. It reads the status the
  response actually carried after the dispatch, and hands `(status, elapsed nanos)` to `TrafficMeter`.
  Framework-produced 404s and thrown exceptions are therefore both counted; a thrown dispatch records `500`
  and the exception still reaches the container.
- `TrafficMeter.record` and `TrafficMeter.snapshot` share one monitor. Every request lands in exactly one
  status family and exactly one latency bucket, so `successes + redirects + clientErrors + serverErrors +
  unclassified == requests` and the five bucket counts also sum to `requests` — on every snapshot, and the
  live proof checks both partitions.
- Latency edges are fixed and inclusive at the top: exactly `10 ms` is `upTo10Ms`, `10 ms + 1 ns` is
  `upTo50Ms`. Durations are summed in nanoseconds and converted to milliseconds ONCE, so a thousand
  sub-millisecond requests do not add up to zero; `durationMaxMs` can be `0` for a fast process.
- The door answers `200` while the process answers, under `Cache-Control: no-store`, and never borrows a
  connection. A database outage does not change it.
- Nothing is written. The live proof reads zero audit entries, zero webhook deliveries and zero `health%`/
  `traffic%` tables.

## Reason

- **Different fact, different door.** `/health` decides rotation; traffic reports history. Sharing a door
  would force the 503 rule onto a count that must keep answering while the thing it counts is failing.
- **Bounded memory is the design.** Five families and five buckets are ten counters regardless of how many
  distinct paths an attacker requests. A per-path map is a cardinality bomb with a friendly name.
- **The whole must add up.** An operator reads `serverErrors` against `requests` to compute a failure share.
  If the two partitions could disagree by the requests in flight, every ratio would be slightly wrong in a
  way nobody could name. One lock buys an exact snapshot; the live proof asserts the sums.
- **Count where the status is final.** A `HandlerInterceptor` sees handler returns, not the framework's own
  404 or the container's error page. The filter wraps the dispatch, so the number it records is what the
  client actually received.
- **A failure is a fact, not a gap.** A request that throws is counted as `500` and still propagates; an
  operator asking "how many failures?" must not be told zero because the only counting site sat after the
  failure.
- **The self-read is stated, not hidden.** `/health/traffic` counts itself: the answer does not contain the
  request that asked (it has not ended), and the next answer contains it. The proof asserts the exact +1.
- **Still no state.** The ledger is heap state, dies with the process, and psql proves no table was added.

## Tradeoffs (stated, not implied)

- **No per-path, per-method or per-tenant breakdown.** Ten counters cannot say WHICH path is slow or which
  endpoint produced the 5xx. A reader who needs that needs the metrics system ADR 0037 named.
- **Coarse latency.** Five buckets, not percentiles: the answer says "how many were at most 250 ms", never
  p50/p95/p99, and the edges are this slice's choice rather than a configurable histogram.
- **A monitor per request.** The exact snapshot is not free; under heavy contention the lock is a serial
  point. This milestone accepts it for correctness and states the cost rather than switching to adders that
  can disagree with themselves.
- **No history and no reset.** Restarting the process starts the ledger at zero; there is no endpoint to
  clear it, and two snapshots are two instants with nothing correlating them.
- **The self-read is in the next answer.** A reader who subtracts successive snapshots to get a rate will
  see their own previous poll in the delta. The proof pins this rather than pretending the door is invisible.
- **JVM-wide, process-local.** Traffic from every thread and every path lands in one ledger; in a multi-
  instance deployment each process answers only for itself, and aggregation is the platform's job.
- **Always 200 has a cost.** A caller must read the values; a status-only check says only that the process
  answered, which is `/health/live`'s job. The overlap is deliberate.
- **No authentication.** The counts describe traffic volume and outcomes, not a user or a secret; ADR 0018's
  public-read rule applies. A deployment that considers volume sensitive can gate the path at its proxy.
- **Failures are counted as 500, not as their eventual status.** If a container maps a thrown exception to a
  different 5xx, the ledger still says 500. This service's own handlers return explicit statuses, and the
  filter records what the dispatch did, not what a future error page might choose.

## Evidence

(Read on this box, 2026-11-03; the bytes under test are exactly the bytes this increment commits.)

- **Unit cases:** `mvn -Dtest=TrafficMeterTest,TrafficFilterTest,TrafficControllerTest test` — **14/14**
  (7 meter + 5 filter + 2 controller), `BUILD SUCCESS`. The suite this slice draws from: `mvn -B test`
  over this tree answers **751 tests, 0 failures, 0 errors, 0 skipped**.
- **`docs/evidence/m9/service-traffic-proof.mjs`** (`npm run verify:traffic`) — exit 0, against a throwaway
  `pgvector/pgvector:pg16` on 127.0.0.1:60132 and the built `target/nexus-api-0.1.0-SNAPSHOT.jar`:
  - §1 `/health/traffic` answered **200 in 17 ms**, exactly nine fields, `Cache-Control: no-store`; the baseline read counted the proof's own readiness polls (**1 request, 1 success**).
  - §2 after issuing `GET /health/live` (200), `GET /no-such-door` (framework 404) and `GET /health/ready` (200), the next read reported **requests 1 → 5 (+4: the three calls plus the baseline read itself)**, **successes +3**, **clientErrors +1**, **serverErrors +0** — the status families are the ones the responses actually carried, and the self-read rule is already visible.
  - §3 a second read reported **requests 5 → 6 (+1: the first read itself)**, and both partitions summed to `requests` on every reading; `durationTotalMs >= durationMaxMs` held.
  - §4 with the database STOPPED, `/health/traffic` still answered **200 in 4 ms**, **requests 6 → 7 (+1)**, `serverErrors` unchanged, and `/health/live` answered 200 in 4 ms — the ledger is heap state, never a database read.
  - §5 after the database returned, traffic answered **200 in 5 ms** with the same nine fields; `psql` read **ZERO** audit entries, **ZERO** webhook deliveries and **ZERO** `health%`/`traffic%` tables.
  - §6 teardown removed the service process and the throwaway container (`nexus-traffic-db-…`).
  The ~7-minute build ran from this worktree right before these bytes were committed — not from a hand-cut archive — and the proof's own summary line is printed at the end of its run.
- `npm run verify:evidence-census` — this proof is a ROW in the population it counts; the census passes **only because the proof and this ADR are tracked in the commit that carries them** (with the row untracked the census refuses — measured, not presumed).
