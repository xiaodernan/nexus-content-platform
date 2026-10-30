# 0021 — External webhook subscriptions: the first outbound contract

- **Status:** Accepted (v557 the receiving half; v558 the on-demand `ping`; v559 the event fan-out — all
  landed and gated)
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

## Choice

`dev.nexus.api.webhooks` — a `webhook_subscription` row (subscriber, endpoint, events, secret, createdAt),
four doors (`POST /webhooks`, `GET /webhooks?subscriber=`, `DELETE /webhooks/{id}?subscriber=`,
`POST /webhooks/{id}/ping?subscriber=`), a `WebhookSigner` whose header every delivery carries, and
`WebhookDispatcher` — the one place that POSTs, behind two seams (`HostResolver`, `WebhookTransport`) so its
decisions are graded without touching a stranger's server.

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
- **No delivery is recorded, retried or backed off.** The fan-out answers its caller with a
  `DeliveryAnswer` per attempt, but nothing stores them and there is no schedule or backoff. A subscriber that
  was down when an event happened cannot learn that it missed one, and the service cannot replay it: the
  audit trail remains the only complete record.
- **No ordering guarantee across events.** Each event's fan-out is ordered, but two events committed
  back-to-back are delivered by whichever thread finishes first — a subscriber that needs causal order must
  read the trail.
- **The DNS hole is closed on both delivery paths, and must be reused, not re-implemented.** The resolution
  check runs per delivery because a name can answer differently each time; a fan-out path that skipped it
  would re-open the hole v558 closed. What the check cannot see is the address the CONNECTION actually uses
  (the transport resolves the name a second time): pinning the checked address into the request is a later
  decision, stated here rather than implied.
- **No rotation.** A secret cannot be replaced in place; a subscriber that loses or suspects its secret
  removes the subscription and makes a new one. A rotation door (two live secrets, one retiring) is a later
  decision.
- **No auth.** The subscriber id is host-declared, like every other account id in this build, and anyone who
  can reach the service can list or remove a subscription by naming its owner. ADR 0018 is the reason.
- **No idempotency key.** A retried delivery and a second event are the same bytes to a subscriber otherwise;
  the key arrives with the retry schedule, and it is deliberately not invented here.
- **`ddl-auto: update`.** The table joins the same no-migrations regime as the rest of the service (README
  bound, unchanged by this ADR).

## Evidence

- `npm run verify:api-tests` — `mvn -B test`, **471/471, 26 classes**, exit 0. v557/v558 contributed 61 cases
  (26 service, 10 signer, 11 controller, 10 dispatcher, 4 transport); v559 added 10 (6 dispatcher fan-out, 2
  listener, 2 audit). The signer's expected HMAC is computed by a SECOND implementation (Node's
  `crypto.createHmac`), so the vector is an independent witness rather than the class agreeing with itself.
  The transport is graded against a socket the test owns (`ServerSocket` on loopback, one request): the bytes
  and headers that reach it are asserted to be the bytes and headers that were handed over, a 302 is reported
  rather than followed, and a port nobody listens on surfaces as an exception instead of a status. The v559
  fan-out is graded for the five rules a reader would otherwise take on trust: only the rows that asked for
  the verb are called, the order is oldest-first with an id tie-break whatever order the table answers in,
  one unreachable endpoint does not stop the next, ONE body is signed with each row's OWN key, and the
  resolution-time address rule is reused rather than re-implemented. The listener's `AFTER_COMMIT` phase is
  read back off the annotation, because a regression to `@EventListener` would still pass a mapping test.
- `docs/evidence/m7/service-suite-proof.mjs` derives its totals from the surefire report (§4) and digests the
  service tree (§1/§3), so it grades this slice without a literal count being typed anywhere.
- **Not graded yet:** no proof against a live PostgreSQL exercises these rows, and no proof observes a
  delivery to a REAL subscriber's server (the transport test's endpoint is the test's own). The table is
  created by `ddl-auto` on first start; that a row round-trips is asserted only by the JPA mapping, not by a
  run. v559's WIRING — a real publish committing, the listener firing after that commit, and a fan-out over
  rows read from a database — is graded by the annotation read-back and by mocked collaborators, not by an
  end-to-end run: there is no Spring-context integration test in this build, and that is the gap a later
  slice (or the compose stack's own proof) has to close.

## Date

2026-10-30
