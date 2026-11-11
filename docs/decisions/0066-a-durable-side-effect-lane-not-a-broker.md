# 0066 — A durable side-effect lane, not a broker: Redis Streams for post-response work that must happen once

- **Status:** Accepted
- **Date:** 2026-11-11
- **Grants:** the fifth lane ADR 0064 said a future commit must earn before opening a second transport.

## Context

ADR 0064 inventoried the four messaging mechanisms that actually exist in NEXUS — the in-process SSE
bus, Redis pub-sub as its cross-instance carrier, the Postgres moderation worklist, and the `agent_tasks`
leasing queue for the AI runner — and **declined to add a broker**. Its decision rule was not "never add
a transport"; it was: *a commit may open a second transport only if it names the lane, the producer,
the consumer, the durability requirement, and the failure mode it survives.* This ADR is that naming,
for one specific lane. It does not reopen the broker question.

The prompt this slice answers asks for "proper use of message queues" and "Redis use". The honest
answer, before any code, is that **one** real gap existed: `POST`-less export
(`GET /api/projects/<id>/export`) computed a zip and then, still on the download response path,
`await`ed a notification write — a DB insert plus an SSE publish — before it could hand the bytes back.
That work is a *side effect*: it must happen (the author is owed a Build-complete notice, §164), it must
happen **once**, but it has nothing to do with whether the bytes are ready and it may happen a moment
later. It is durable-but-late, not realtime. None of the four existing lanes fits it:

| lane | why it does not fit |
|---|---|
| SSE bus / Redis pub-sub | lossy, no ack, no replay — a notification that must not be lost cannot ride a channel with no acknowledgement |
| moderation worklist | a human reads it in an admin UI; this work is done by a machine, immediately |
| `agent_tasks` leasing queue | bound to the AI runner and its Postgres row-lock status machine; generic side-effects are not agent tasks |

## The lane, named per ADR 0064

- **Lane:** `build.complete` — post-export notification. First of a general "durable side-effect"
  class; the registry is closed (`JOB_HANDLERS`) so adding a type is a deliberate act, not an accident.
- **Producer:** `notifyBuildComplete` in `server/domain/export.ts`. It mints the idempotency anchor
  (`exportId`) and `XADD`s one `build.complete` entry. The minting happens HERE, not in the handler —
  that is the crux of the at-least-once safety (below).
- **Consumer:** one in-process worker per Next server instance, `server/queue/worker.ts`, started from
  `instrumentation.ts register()` in the `nodejs` runtime only. It reads with `XREADGROUP` in a consumer
  group, so each entry is delivered to exactly one instance, and dispatches by job type.
- **Durability requirement:** at-least-once. An entry survives a process restart (it is in a Redis
  Stream, not a socket). A worker that dies after taking an entry but before `XACK` leaves it PENDING;
  `XAUTOCLAIM` hands it to a live worker after an idle threshold. This is stronger than pub-sub and is
  exactly what "the author must be notified" needs.
- **Failure mode it survives:** a worker crash / restart between taking a job and acknowledging it.
  The job is re-delivered, not lost and not permanently stuck.

## Why it is idempotent (and why that is not optional)

At-least-once means the handler provably **can** run twice for one job. The queue cannot prevent that;
the domain must. The anchor is `exportId`:

1. The **producer** mints it and carries it in the payload. A redelivery reuses the same entry, hence
   the same `exportId`. (If the handler minted its own, every retry would notify the author twice — the
   exact failure at-least-once invites.)
2. `lib/notify-plan.ts` derives `dedupeKey = build:<exportId>`.
3. `notifications.dedupe_key` carries a real `UNIQUE` index (schema + migration 0010), and `emit`
   inserts with `ON CONFLICT DO NOTHING`. Two deliveries → `created` then `duplicate` → **one row**.

Steps 2–3 are graded against a **real Postgres** in `job-lane-idempotency.integration.test.ts`
(`created`, `duplicate`, one row; a *different* `exportId` still writes a second row — dedupe does not
mistake "every export is a new event" for a duplicate). Steps 1 and the handoff are graded in
`job-worker.test.ts`; the transport (delivery, retry, and XAUTOCLAIM reclaim of a dead consumer's
pending entry) is graded against a **real Redis** in `job-queue.test.ts`.

## What is deliberately NOT here

- **Not a broker.** No Kafka/Rabbit, no Spring Cloud Stream. Redis Streams is one substrate the platform
  already runs; the ADR 0064 "second producer side / worker fleet / cross-service ordering SLA" triggers
  for a *broker* are still absent, and we did not pretend otherwise. This is a side-effect pipe inside
  one service, not an inter-service event bus.
- **Not a replacement for SSE or the realtime bus.** The zip-download response still streams to the
  browser; `build.status` frames still go over the existing bus. The queue only moves the *durable*
  half (the notification row) off the response path. SSE remains lossy and is unchanged.
- **Off by default.** `NEXUS_JOB_QUEUE=1` opts the lane in. With it off (the default), `getJobQueue()`
  is a true no-op that opens **no** connection and `notifyBuildComplete` runs the old synchronous `emit`
  verbatim — the behaviour the export integration tests pin. With it on but `NEXUS_REDIS_URL` unset,
  the in-memory driver runs and **logs a warning**: silent in-memory side-effects would be a durability
  lie. Opt-in is what lets a deployment that uses Redis only for realtime fanout avoid running a worker.
- **No client-facing queue, no ordering guarantee.** Jobs are independent; there is no FIFO promise and
  no API surface for clients. Unknown job types and poison payloads are logged and ACKed away (they
  never kill the loop, and are never retried forever). Retries are bounded by `maxAttempts`, then
  dropped — dead-letter by log, because this platform has no dead-letter store yet.
- **The stream is bounded, with a stated shedding rule.** Both the producer and the retry path append
  through one method using `XADD ... MAXLEN ~ 10000` (approximate, so XADD stays O(1) over Redis macro
  nodes, not O(n)). Old — already-ACKed — entries are trimmed past that cap, so a long-lived Redis does
  not grow forever. The trade is explicit: if a consumer is down long enough that the UNPROCESSED
  backlog exceeds 10k, the oldest pending entries are shed to keep memory bounded. For advisory
  side-effects (one notification per export) that is the right side of the trade; a lane whose work
  must never be shed under any circumstance needs a larger cap, a real dead-letter path, and its own
  ADR before it rides here.

## Consequences

- The export download no longer waits on a DB insert + SSE publish; the response path is shorter, and
  a notification-write hiccup cannot delay the bytes the author asked for.
- A deployment that turns the lane on **must** run the Next `nodejs` server (where `register()` fires)
  and set `NEXUS_REDIS_URL` for durability; a serverless/edge-only deployment that opts in without
  either gets the in-memory fallback and an honest warning, not silent loss.
- Latency is now eventual: the notification may land a moment after the download completes. That is a
  deliberate trade, documented, and only paid by instances that opt in.
- A second job type can join the lane by adding one entry to `JOB_HANDLERS` with a validator. That is a
  code change and a decision (per this ADR's "closed registry"), not a config flag that silently
  enlarges what the worker will execute.

## Evidence

- `apps/web/test/job-queue.test.ts` — 6 legs against a real Redis (56379): delivery, bounded retry,
  driver selection, and XAUTOCLAIM reclaim of a crashed consumer's pending entry (ACKed out of pending).
- `apps/web/test/job-worker.test.ts` — 9 legs: the opt-in switch (off by default, no connection), the
  producer-minted id surviving the handoff, one dedupeKey per id, and poison-payload rejection.
- `apps/web/test/job-lane-idempotency.integration.test.ts` — 2 legs against a real Postgres: two
  deliveries of one `build:<exportId>` → one row; a distinct `exportId` → a second row.
- `apps/web/test/export-route.integration.test.ts` + `export.integration.test.ts` — 19 legs proving the
  opt-in-off path is byte-for-byte the old synchronous behaviour (no regression).
