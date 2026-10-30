# 0021 — External webhook subscriptions: the first outbound contract

- **Status:** Accepted (v557 receiving half; v558 the first delivery — an on-demand `ping` — landed and
  gated; event fan-out is the next slice)
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
| Delivery | Fan out every recorded event as it happens | The producer needs after-commit semantics: a delivery sent inside a transaction can announce a fact the rollback then un-does |

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

## Tradeoffs (stated, not implied)

- **One delivery exists, and only on demand.** A subscriber can make this service POST a signed `ping` to its
  own endpoint; nothing produces EVENTS yet, so a subscription to `publish` is still a promise rather than a
  stream. Event fan-out — many subscriptions, the trail as producer, after-commit semantics — is the next
  slice. Until it lands, a subscriber learns of an event only by reading the trail.
- **The DNS hole is closed on the ping path, and must be reused, not re-implemented.** The resolution check
  runs per delivery because a name can answer differently each time; a fan-out path that skipped it would
  re-open the hole this slice closed. What the check cannot see is the address the CONNECTION actually uses
  (the transport resolves the name a second time): pinning the checked address into the request is a later
  decision, stated here rather than implied.
- **No retry, no receipt.** A refused or unreachable ping is reported and forgotten; there is no schedule, no
  backoff and no delivery row. A subscriber that was down when an event happened has no way to learn it was
  missed — the trail is still the only complete record.
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

- `npm run verify:api-tests` — `mvn -B test`, **461/461, 25 classes**, exit 0 (61 new cases across v557 and
  v558: 26 service, 10 signer, 11 controller, 10 dispatcher, 4 transport). The signer's expected HMAC is
  computed by a SECOND implementation (Node's `crypto.createHmac`), so the vector is an independent witness
  rather than the class agreeing with itself. The transport is graded against a socket the test owns
  (`ServerSocket` on loopback, one request): the bytes and headers that reach it are asserted to be the bytes
  and headers that were handed over, a 302 is reported rather than followed, and a port nobody listens on
  surfaces as an exception instead of a status.
- `docs/evidence/m7/service-suite-proof.mjs` derives its totals from the surefire report (§4) and digests the
  service tree (§1/§3), so it grades this slice without a literal count being typed anywhere.
- **Not graded yet:** no proof against a live PostgreSQL exercises these rows, and no proof observes a
  delivery to a REAL subscriber's server (the transport test's endpoint is the test's own). The table is
  created by `ddl-auto` on first start; that a row round-trips is asserted only by the JPA mapping, not by a
  run.

## Date

2026-10-30
