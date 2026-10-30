# 0021 — External webhook subscriptions: the first outbound contract

- **Status:** Accepted (the receiving half is landed, tested and gated; delivery is the next slice)
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
| Delivery | **Record + signature now; dispatcher next** | **Chosen** — the receiving half is the half that can be graded without a network, and the bound is stated |

## Choice

`dev.nexus.api.webhooks` — a `webhook_subscription` row (subscriber, endpoint, events, secret, createdAt),
three doors (`POST /webhooks`, `GET /webhooks?subscriber=`, `DELETE /webhooks/{id}?subscriber=`), and a
`WebhookSigner` whose header every future delivery will carry.

Rules, each refused by name:

- the subscriber is an account id (host-declared; ADR 0018 is why there is no session to read it from);
- the endpoint is absolute `http(s)`, at most 1000 characters, no credentials, no fragment, and not a
  loopback or private-network literal;
- the events are at least one name from `AuditService.ACTIONS`, de-duplicated and stored in the vocabulary's
  own order, so two subscriptions to the same set are byte-identical rows;
- one endpoint per subscriber, at most 10, and a duplicate endpoint is a 409 that NAMES the existing row;
- the secret is minted by the service, 64 lowercase hex characters, and appears in exactly one answer.

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

- **Nothing is delivered yet.** A subscription in this build is a RECORD of an instruction. No dispatcher, no
  retry schedule, no delivery receipt, no `ping` door. The next slice is the dispatcher; until it lands, a
  subscriber learns of an event only by reading the trail.
- **A DNS name that resolves to a private address is accepted.** The resolution check belongs to the
  dispatcher and does not exist. This is the largest hole in the endpoint rule, and it is the dispatcher's
  first obligation.
- **No rotation.** A secret cannot be replaced in place; a subscriber that loses or suspects its secret
  removes the subscription and makes a new one. A rotation door (two live secrets, one retiring) is a later
  decision.
- **No auth.** The subscriber id is host-declared, like every other account id in this build, and anyone who
  can reach the service can list or remove a subscription by naming its owner. ADR 0018 is the reason.
- **No idempotency key.** The dispatcher will need one — a retried delivery and a second event are the same
  bytes to a subscriber otherwise — and it is deliberately not invented here.
- **`ddl-auto: update`.** The table joins the same no-migrations regime as the rest of the service (README
  bound, unchanged by this ADR).

## Evidence

- `npm run verify:api-tests` — `mvn -B test`, **444/444, 23 classes**, exit 0 (44 new cases: 26 service, 10
  signer, 8 controller). The signer's expected HMAC is computed by a SECOND implementation (Node's
  `crypto.createHmac`), so the vector is an independent witness rather than the class agreeing with itself.
- `docs/evidence/m7/service-suite-proof.mjs` derives its totals from the surefire report (§4) and digests the
  service tree (§1/§3), so it grades this slice without a literal count being typed anywhere.
- **Not graded yet:** no proof against a live PostgreSQL exercises these rows, and no proof observes a
  delivery. The table is created by `ddl-auto` on first start; that a row round-trips is asserted only by the
  JPA mapping, not by a run.

## Date

2026-10-30
