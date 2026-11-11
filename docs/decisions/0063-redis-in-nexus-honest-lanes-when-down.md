# 0063 — Redis in NEXUS: what it earns, what it costs, when it lies

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

The first runtime dependency the platform reached for beyond Postgres was Redis. It now serves four
distinct things, each with different requirements, failure modes and confidence levels. This ADR is
the single map of what Redis actually does here — so the next reader stops naming one Redis thing and
calling it "the Redis".

## The four lanes, honestly

### Lane 1 — Rate limiting: Redis sliding-window, with in-process sibling fallback

`rateLimitRedis.ts` + `rateLimitMemory.ts` (route-level externalization with deliberate fallback).
Characteristics:

- **Shared across instances** when `NEXUS_REDIS_URL` points at a Redis shared by all instances; one
the budget survives restarts and honours escalations across instances.
- **In-process only** when unset: per-process window, single-node semantic.
  `test/rate-limit.integration.test.ts` spec ensures the current fallback mode matches the declared
  semantics (15 requests per window per actor, ordering preserved under concurrency).
- **Observability caveat**: the hit counter lives on the Redis side; a Redis outage flips to the
  in-process counter instead of silently unshackling (the "degraded-but-bounded" posture
  rather than "degraded-to-nothing").

### Lane 2 — Realtime notification fanout: cross-instance SSE+Redis publish/subscribe

The `realtimeBus` publishes client-visible events (job status, approval/agent state) through Redis's
pub/sub so that replicas see their peers' events. It's the only Redis-first lane the current
topology needs — because every replica may host WebSocket/SSE connections to the same session types,
and users expect the UI to react to work done elsewhere in the cluster.

### Lane 3 — `/api/discover` anonymous feed cache: SETEX-shared window

Created later this arc. Documented in ADR 0061 (correctness boundary, 15s TTL, writer-triggered
invalidation via `publish.ts` and `moderation.ts::resolveCase`) and with a live proof in
`test/discover-redis.integration.test.ts` (4/4 green against the local Redis).
Alternatives rejected in ADR 0061.

### Lane 4 — Server-side sessions / authentication (user-facing opt-in)

Not wired. The user asks about it; it is fair to say here: **not yet implemented**. No file in
`apps/web/src` imports Redis solely for HTTP session data — `authCookies.ts` + Postgres are used.
It is named honestly as a lane to add (and why: fewer round-trips on hot auth reads) but NOT built,
and present tense here does not deceive.

## Failure modes and what we do about them

| lane | if Redis dies | detect | mitigation |
|---|---|---|---|
| rate-limit | per-process window, same route, no lane escalation | `driver()` reports `in-process` | per-process window is bounded and tested; the hosted lane shows the difference (even single-instance takes the same route) |
| realtime | webchat clients see no peer events | driver reports `in-process` | user sees job status eventually via refetch, never worse than stale |
| discover cache | per instance 15s recompute | `redis-unavailable` reported | still bounded, just no shared collapse; trade-off is known |
| sessions | **will matter once builtin is opted in** | explicit config; no bad state today | lane not started; to introduce it the ADR gets amended before a single line ships |

## What this ADR does NOT do

It does not ORDAIN "we should cover everything with Redis"; it does not promise "the next thing to add
is a session lane"; it does not pretend the four lanes are equivalent in permanence, hotness or
fit-for-use. It documents what EXISTS honestly, and to the same standard documents that Lane 4 is
unimplemented.

## Decision

Keep Redis to exactly the lanes it serves today. Do not add new use-pieces simply because the SDK
is present. The next honest step is to prove Gate Lane 3 against a multi-replica deploy off CI
(and, if warranted, to add Lane 4 with its own ADR — never silently).

## Reason

Redis here is a **bounded window** of operational advantage per lane, never a substitute for Postgres /
memcached-style fire-and-forget caching, and never a source of hidden durability claims that the
driver wouldn't actually deliver.

**CITES** the four code files above; the two routes are covered by tests that run;
Lane 2 is exercised by the realtime bus suite on the same host; Lane 4 is explicitly absent.
