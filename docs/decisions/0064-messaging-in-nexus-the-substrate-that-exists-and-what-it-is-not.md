# 0064 — Messaging in NEXUS, honestly inventoried: SSE-only delivery, Redis pub-sub as the cross-instance fanout, and the things it is NOT

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

The request that this ADR is answering is "notice Redis use and use message queues properly". The honest
answer, before a new queue is opened: none of this platform's real-time work goes through a queue or
message broker today; the path is **HTTP-served SSE over a per-process fanout, with Redis as the optional
cross-instance carrier**. Adding a queue because the prompt said "queues" would be a sentence, not a fact.

## What exists (in code, with citations)

1. **Realtime bus (§NEXUS)** — `apps/web/src/server/realtime/bus.ts`. One fanout object held in the
   process. ALL SSE delivery goes through this. Subscribers call `bus.subscribe(channel, handler)`
   and publish with `bus.publish(channel, event)`. The bus is replaceable per environment; the host
   selects Redis when `NEXUS_REDIS_URL` is set and in-process otherwise. It does NOT persist, NOT
   retry, NOT guarantee delivery — the SSE client reconnects, and an offline recipient re-fetches on
   the next poll. That is the SSE contract, not a queue.
2. **Redis-backed fanout** — `apps/web/src/server/realtime/redisBus.ts` — translates each `publish`
   into a Redis `PUBLISH` on the same channel. Subscribers subscribe to the same channel. It IS a
   pub-sub floor; it is NOT a queue. ORDER is not guaranteed across processes; DELIVERY is not
   acknowledged; a browser tab that is not connected at the time the pub is fired sees NOTHING of it.
   The contract is **lossy-but-ordered-where-it-matters**, documented as such.
3. **Moderation queue** — `moderation_case_queue` in Postgres. Rows are created for content that
   needs admin attention. The admin page polls/reads. This is a **worklist**, not a queue: the agent
   does not "receive messages" and process them; it lists work in an admin UI.
4. **Agent inbox** — `agent_tasks` in Postgres. A task is enqueued on the API side (`server/ai/...`),
   the runner polls/claims by status transition under a row lock (`SELECT ... FOR UPDATE` +
   `UPDATE ... WHERE status = 'queued' RETURNING`). This is a **leasing-AGENT queue** — NOT
   a pub-sub queue; NOT a streaming queue — but it IS durable, and the consumer may crash and retry
   without loss (the row stays in `running` until the runner ack / aborts it); a TTL cleanup job
   handles stuck rows. The contract is closer to a task queue (e.g. Sidekiq/DelayedJob) than to the
   "fanout" lane. It does exactly one thing: deliver tasks to a runner.
5. **The Java Spring Cloud estate — NO broker.** Eureka is service discovery (pull), Config Server is
   configuration (pull), Gateway is request routing. None of them is a message broker. The Java lane
   has NO RabbitMQ, NO Kafka, NO Spring Cloud Stream binding, NO Spring Cloud Bus.

## What is absent (and why the absence is correct, for now)

| what | why absent | what would make adding it honest |
|---|---|---|
| RabbitMQ / Kafka / Spring Cloud Bus / Spring Cloud Stream | every real-time lane today serves one consumer (the browser tab that triggered the work) or a fixed set (the admin UI); one message, one recipient, and the expected latency budget is the user's request/response — a queue between today's producers and consumers adds nothing and costs a second failure mode | a second producer side (e.g. the domain service emitting durable facts the API replays), an SLA requiring ordering across consumers, or a removal of the browser in favour of a worker fleet |
| Persistent event sourcing / audit log through a broker | the audit log already lives in the Postgres transaction with the operation that produced the audit row — same DB, same commit. A broker would split the audit into two stores to keep separately synchronised | a real cross-service boundary where the auditing party does not share a database with the audited service |
| WebSocket server independent of fit | SSE is already the right adversary of "prefer richer, paid transport" — it works over HTTP/1.1, survives every proxy that allows text/event-stream, and disconnects gracefully | a bidirectional signal need (mutable cursors, push-to-client acknowledgement), and even then the existing `agent_tasks` table handles the durable half without a broker |

## Decision

Do not add a broker to NEXUS for the sake of having one. Every real-time lane is currently satisfied
by exactly one of the four mechanisms above. When a future lane writes "add a queue here", the ADR that
granted it must name the lane, the producer, the consumer, the durability requirement, and the failure
mode it survives — or the commit must not open a second transport.
