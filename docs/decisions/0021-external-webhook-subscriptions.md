# 0021 — External webhook subscriptions: the first outbound contract

- **Status:** Accepted (v557 the receiving half; v558 the on-demand `ping`; v559 the event fan-out; v560 the
  delivery receipts; v561 the live-PostgreSQL end-to-end run; v562 the owner's key rotation — all landed and
  gated)
- **Date:** 2026-10-30
- **Milestone:** M10 (External Agent Ecosystem)

## Context

M10 names four things: API, MCP, tool registry, webhooks. Until v557 the whole of `services/nexus-api` was
INBOUND — publish, search, social, moderation, the audit trail — and there was no way for anything outside
this repository to learn that something had happened without polling a table and diffing it. Measured
2026-10-30: zero occurrences of "webhook" under `services/`, `apps/`, `packages/` and `agents/`.

The audit trail has existed since v271 and is the service's own record of what happened, in order. It is also
the natural event source: an external consumer wants the same facts the trail records, and a webhook
vocabulary that drifted from the trail's verbs would be a second list of actions that agree until they do not.

Two §60 forces shape the design:

1. A webhook is the first thing this service does ON ITS OWN INITIATIVE. An endpoint is an address the service
   will POST to without a caller asking at that moment, which makes the endpoint a capability, not a string.
2. A signature that a subscriber cannot verify is decoration. The secret's shape, the canonical string and the
   comparison all have to be right BEFORE a dispatcher exists, because a delivery nobody can authenticate is
   a delivery nobody can trust.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Vocabulary | A webhook-only list of event names | A second spelling of the trail's verbs; the two drift and the drift is silent |
| Vocabulary | **Alias `AuditService.ACTIONS`** | **Chosen** — one owner (v385 established it as the trail's vocabulary), and an event joins when the verb joins |
| Endpoint | Accept any URL the caller sends | The service would be made to probe its own network on a stranger's word |
| Endpoint | **Absolute http(s), no credentials, no fragment, no loopback/private literal** | **Chosen** — the literal half is decidable at subscription time; the resolution half is the dispatcher's |
| Secret | Caller-supplied | A client picks a key its own logs already hold |
| Secret | **Service-minted (32 bytes, `SecureRandom`), returned once** | **Chosen** — the only place it is readable is the answer to the subscription that made it |
| Signature | HMAC over the body only | A captured request can be replayed forever |
| Signature | **HMAC-SHA256 over `<timestamp>.<body>`, header `t=…,v1=…`, constant-time compare, time-bounded verify** | **Chosen** — the shape Stripe's subscribers already implement, with the timestamp inside the signed bytes |
| Delivery | Dispatch now, with retries | Needs a resolution-time SSRF check, idempotency keys and delivery receipts — each a decision this ADR would otherwise make silently |
| Delivery | **Record + signature first (v557); then one ON-DEMAND delivery, the `ping` (v558)** | **Chosen** — the receiving half is the half that grades without a network, and the ping is the smallest door that makes the network path, the signature and the refusal rules gradeable before any event exists |
| Delivery | **Fan out every recorded event as it happens (v559), from an AFTER_COMMIT listener** | **Chosen** — the trail is the producer, and after-commit is the first phase in which the fact is true; a delivery sent inside the transaction could announce what the rollback then un-does. Still no retry, receipt or idempotency key — the outbox those need is a later decision |
| Delivery | **Write every attempt down (v560), in its OWN transaction, and read it back through a door of the owner's own** | **Chosen** — the fan-out otherwise answered a listener nobody was waiting on, so a failed delivery was a fact that existed for one microsecond. `REQUIRES_NEW` is not a preference: the fan-out runs after the caller's transaction has COMMITTED and its persistence context is still bound to the thread, so a receipt saved with the default propagation would join a finished transaction and never commit |

## Choice

`dev.nexus.api.webhooks` — a `webhook_subscription` row (subscriber, endpoint, events, secret, createdAt),
five doors (`POST /webhooks`, `GET /webhooks?subscriber=`, `GET /webhooks/deliveries?subscriber=&webhook=`,
`DELETE /webhooks/{id}?subscriber=`, `POST /webhooks/{id}/ping?subscriber=`), a `WebhookSigner` whose header
every delivery carries, and `WebhookDispatcher` — the one place that POSTs, behind two seams (`HostResolver`,
`WebhookTransport`) so its decisions are graded without touching a stranger's server.

Rules, each refused by name:

- the subscriber is an account id (host-declared; ADR 0018 is why there is no session to read it from);
- the endpoint is absolute `http(s)`, at most 1000 characters, no credentials, no fragment, and not a
  loopback or private-network literal;
- the events are at least one name from `AuditService.ACTIONS`, de-duplicated and stored in the vocabulary's
  own order, so two subscriptions to the same set are byte-identical rows;
- one endpoint per subscriber, at most 10, and a duplicate endpoint is a 409 that NAMES the existing row;
- the secret is minted by the service, 64 lowercase hex characters, and appears in exactly one answer;
- only the OWNER may ping a subscription (a stranger must not be able to aim this service at somebody else's
  URL), the endpoint's name is resolved at DELIVERY time and every address it answers must be public, and a
  non-2xx is reported as `refused` with its status rather than collapsed into "failed".

v559 completed the arc. `AuditService.record` publishes `AuditRecorded(action, targetId, at)` after the save
and inside its own transaction; `WebhookEventListener` is the only listener, and its `AFTER_COMMIT` phase is
what makes the announcement a fact. It calls `WebhookDispatcher.deliver`, which reads the subscription table,
keeps the rows whose event set contains the verb, orders them oldest first (the id breaks a tie), and attempts
each one through the SAME path the ping uses — same body, same signature, same resolution-time address rule,
same three outcomes. The answer is one `DeliveryAnswer` per attempt, and one endpoint's failure never stops
the next: a subscriber's outage is not another subscriber's silence.

v560 gives the fan-out a memory. `WebhookDeliveryLog.record` writes one `webhook_delivery` row per ATTEMPT —
the ping's and the fan-out's alike, because both paths go through the dispatcher's one `attempt` — carrying
the subscriber, the webhook id, the event, the target, the outcome, the status, the detail and BOTH instants
(when the fact happened, when this service knocked). The write is `REQUIRES_NEW` because the fan-out runs
`AFTER_COMMIT`: the caller's transaction has committed and its persistence context is still bound to the
thread, so a receipt saved with the default propagation would join a finished transaction and quietly never
commit. `GET /webhooks/deliveries?subscriber=&webhook=` reads the log back newest first, capped and paged —
scoped to the subscriber, narrowed to one subscription when one is named, and carrying the WHOLE count beside
the window so a narrowed answer says what it is hiding. The row keeps its own copy of what it was about, so
a receipt survives the removal of the subscription that produced it: a take-down must not erase the record
of having called that endpoint.

## Reason

- **One vocabulary.** The events a webhook can ask for are the verbs the trail records, aliased rather than
  copied. A subscription to an action the service never records would be a subscription to a silence.
- **The endpoint is judged as a capability.** Loopback and private literals are refused at subscription time
  because that is where the caller can be told why; a DNS name is an indirection whose meaning is decided by
  the resolver at delivery time, and the dispatcher must re-check there.
- **The timestamp is inside the signature.** `t` is part of the signed string, so a captured request cannot
  be re-aimed at another moment, and the verifier's tolerance is a window a subscriber picks rather than
  infinity. The comparison is `MessageDigest.isEqual`, not `equals`, so a forged signature leaks nothing
  about how much of it was right.
- **The secret is absent, not redacted.** Every read answer has no secret field at all: a redacted one is a
  field a client can fill from its own logs, and the listing test serializes the answer and looks for the field
  rather than trusting the record's shape.
- **The event carries three facts, and no actor.** `AuditRecorded` names the verb, the target id and the
  instant — exactly the body a subscriber receives. The actor's account id stays on this side of the wire:
  a subscriber asked what happened, not who was holding the pen, and an event that grew an identity field
  would put a stranger's account id on somebody else's server (ADR 0018's reason, one hop further out).

## Tradeoffs (stated, not implied)

- **Fan-out is SYNCHRONOUS, on the committing thread.** `deliver` runs inside the after-commit listener,
  bounded by `DELIVERY_TIMEOUT` (10 s) per subscription: ten slow endpoints delay the caller that committed
  the write by up to ten timeouts, and the HTTP answer it already received said nothing about any of them.
  An outbox (write the deliveries down, send them elsewhere) is the shape that removes that delay, and it is
  deliberately not built here — the receipt and idempotency decisions arrive with it.
- **The subscription table is read WHOLE per event.** `deliver` reads `findAll()` and filters the comma-joined
  `events` column in memory, because a derived query over that text would be a query about SPELLING rather
  than a query about the set. A table that outgrows a scan needs a join table and a real query — stated here
  rather than implied.
- **Every attempt is recorded; none is retried, backed off or replayed.** `webhook_delivery` holds one row per
  attempt (`delivered`, `refused`, `unreachable`), so a subscriber that was down when an event happened can now
  learn that it missed one — but the service still has no schedule and no replay, and the audit trail remains
  the only complete record. A receipt is written only for an attempt that actually happened: a request refused
  at subscription time or by a missing row leaves nothing to remember.
- **The delivery log only grows.** Nothing prunes `webhook_delivery`: it gains a row per attempt per
  subscription, forever, and a retention rule (how long a receipt is kept, and who may delete one) is a later
  decision rather than an assumption here.
- **One commit per attempt.** A `REQUIRES_NEW` receipt is its own transaction, so a fan-out to ten
  subscriptions costs ten commits on top of the ten deliveries. The outbox that would batch them is the same
  later decision the synchronous fan-out defers.
- **No ordering guarantee across events.** Each event's fan-out is ordered, but two events committed
  back-to-back are delivered by whichever thread finishes first — a subscriber that needs causal order must
  read the trail.
- **The DNS hole is closed on both delivery paths, and must be reused, not re-implemented.** The resolution
  check runs per delivery because a name can answer differently each time; a fan-out path that skipped it
  would re-open the hole v558 closed. What the check cannot see is the address the CONNECTION actually uses
  (the transport resolves the name a second time): pinning the checked address into the request is a later
  decision, stated here rather than implied.
- **Rotation is immediate, with no overlap.** Since v562 the owner may replace a subscription's signing key
  (`POST /webhooks/{id}/rotate`), and the old key dies with the call: the row has ONE secret column and rotation
  overwrites it, so the next attempt is signed with the new key and a receiver still holding the old one cannot
  verify it. There is no grace window and no dual signature — an overlap would have to be modelled as two
  secrets with an expiry, and that is a later decision. A subscriber that can accept neither an outage nor an
  immediate switch must rotate in its own window; the service states this rather than hiding it.
- **No auth.** The subscriber id is host-declared, like every other account id in this build, and anyone who
  can reach the service can list or remove a subscription by naming its owner. ADR 0018 is the reason.
- **No idempotency key.** A retried delivery and a second event are the same bytes to a subscriber otherwise;
  the key arrives with the retry schedule, and it is deliberately not invented here.
- **`ddl-auto: update`.** The table joins the same no-migrations regime as the rest of the service (README
  bound, unchanged by this ADR).

## Evidence

- `npm run verify:api-tests` — `mvn -B test`, **487/487, 27 classes**, exit 0. v557/v558 contributed 61 cases
  (26 service, 10 signer, 11 controller, 10 dispatcher, 4 transport); v559 added 10 (6 dispatcher fan-out, 2
  listener, 2 audit); v560 added 10 (6 delivery log, 2 dispatcher receipts, 2 controller); v562 added 6 (4
  service, 2 controller). The signer's
  expected HMAC is computed by a SECOND implementation (Node's `crypto.createHmac`), so the vector is an
  independent witness rather than the class agreeing with itself. The transport is graded against a socket the
  test owns (`ServerSocket` on loopback, one request): the bytes and headers that reach it are asserted to be
  the bytes and headers that were handed over, a 302 is reported rather than followed, and a port nobody
  listens on surfaces as an exception instead of a status. The v559 fan-out is graded for the five rules a
  reader would otherwise take on trust: only the rows that asked for the verb are called, the order is
  oldest-first with an id tie-break whatever order the table answers in, one unreachable endpoint does not
  stop the next, ONE body is signed with each row's OWN key, and the resolution-time address rule is reused
  rather than re-implemented. The listener's `AFTER_COMMIT` phase is read back off the annotation, because a
  regression to `@EventListener` would still pass a mapping test.
- The v560 receipt log is graded for what a reader would otherwise take on trust. A receipt carries the
  subscriber, the event, the target and BOTH instants (the fact's, and this service's clock at the knock).
  The write's `REQUIRES_NEW` propagation is read back off the annotation for the same reason the listener's
  phase is: a receipt saved in the caller's finished transaction would still pass a save-and-read mapping
  test and commit nothing, and no unit test can observe a committed transaction without a Spring context.
  The window is pinned as capped (100), floored (offset ≥ 0), and translated into page rows the way the trail
  is (v388) — 40 rows with a 20-row window is page 2 and skip 40; the narrowing to one subscription happens
  IN the query, and the count is narrowed the same way, so a window can say what it is hiding. The dispatcher
  is graded for writing exactly one receipt per attempt on both paths — the ping's three outcomes, and a
  fan-out that writes a receipt even for the endpoint that failed — and the controller for the read door
  carrying no secret and for refusing a subscriber-less request by name.
- `docs/evidence/m7/service-suite-proof.mjs` derives its totals from the surefire report (§4) and digests the
  service tree (§1/§3), so it grades this slice without a literal count being typed anywhere.
- `docs/evidence/m10/webhook-proof.mjs` (`npm run verify:webhooks`) — v561, the LIVE run the slices above
  ended by naming as missing. The service is built in an isolated copy, started against a throwaway
  `pgvector/pgvector:pg16` container through command-line arguments, and graded over HTTP and `psql`: two
  endpoints subscribed (the events SENT out of the vocabulary's order and stored in its own), the secret
  64 hex characters and readable exactly once, a loopback literal and a duplicate endpoint refused BY NAME,
  a real publish committing and the `AFTER_COMMIT` fan-out knocking on BOTH endpoints, two receipts carrying
  the TRAIL's instant rather than their own clock, a real unpublish fanning out the same way while the trail
  keeps one entry per verb, the owner's ping writing ONE receipt (and none for the endpoint it was not
  addressed to), a refused ping (400/403/404) writing NOTHING, a stranger's account answered with an EMPTY
  log, the window capped/narrowed/newest-first with the count beside it, `psql` counting four rows and
  finding NO `secret` column while the stored key equals the one the one-time answer gave, a removal that
  leaves its receipts byte-identical, the owner ROTATING the remaining key (new 64-hex secret shown once,
  endpoint/events/creation instant untouched, `psql` showing the old key is not retained, read doors still
  printing none, 400/403/404 rotations leaving the stored key untouched, and no receipt written because a
  rotation delivers nothing), and a NEW JVM answering the same four rows after a restart with the ROTATED
  key still the stored one. The restart section is the one a unit gate could not make: a `REQUIRES_NEW` row
  that never committed is visible before the restart and gone after it.
- **Still not graded, stated:** no delivery reaches a REAL subscriber's server. RFC 6761 reserves
  `hooks.invalid`, so the live run grades the fan-out, the ownership rule, the resolution step, the three
  outcomes and the receipt, and fails at the network step by design; a local receiver is impossible because
  the service refuses every loopback and private address at subscription time AND at delivery time (the
  proof asserts the first refusal rather than working around it). The signature over delivered bytes
  remains graded by the unit vector, and the transport by the test's own socket. The retry/outbox,
  retention, auth and idempotency bounds above are unchanged; rotation is graded by the unit cases and
  by the live run, and its no-overlap limit is stated above rather than hidden.

## Date

2026-10-30
