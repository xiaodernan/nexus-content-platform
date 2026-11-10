# 0056 — A failure must NAME itself: which service, which kind, and who refused

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

ADR 0055 made a service-to-service call **typed, named, and honest about the difference between a
missing project and a missing service**. What it did not settle is the next question: when the
service really is gone, the answer was

```json
{ "state": "downstream-unavailable", "reason": "the domain service could not be reached: No fallback available." }
```

and the edge's answer was

```json
{ "ok": false, "reason": "upstream-unavailable", "upstream": "nexus-api",
  "detail": "the gateway could not reach the upstream service; no answer was invented on its behalf" }
```

Both name **a service**. Neither names **a failure**.

"No fallback available." is Spring Cloud's wrapper message: the breaker's fallback function threw
because no fallback bean exists, and the original cause was put inside it. It is the wrapper's
words, not the failure's. And the edge's sentence is true of every failure the edge can have —
refused connection, timeout, open breaker, unregistered upstream — so it cannot tell an operator
which of the four problems just happened, and the four have four different fixes.

Worse, the one thing the answer *did* say was wrong in a way nobody had noticed. The reader
classified a failure by the **status** carried by the `FeignException`, and wrote "the domain
service answered with an error **-1**". `-1` is not an HTTP status. It is what Feign uses to say
**"no answer was received at all"** — so the answer claimed the service had ANSWERED, when the
entire fact of the failure is that it did not.

The rules were read out of the library rather than guessed, with `javap` on the jars this
repository actually builds against (Feign 13.6.1, resilience4j 2.2.0, Spring Cloud Gateway 4.3.5):

| what happened | what Feign raises | status |
|---|---|---|
| the connection failed (refused, unresolvable host, read timeout) | `FeignException.errorExecuting(Request, IOException)` → `RetryableException` | **-1** |
| the service answered with an error and a `Retry-After` header | `ErrorDecoder$RetryAfterDecoder` → `RetryableException` | the real status |
| the service answered with any other error | `FeignException.errorStatus(...)` | the real status |
| the service answered 404 | `FeignException.NotFound` | 404 |

So the rule is not a convention anybody agreed on — it is what the library does: **a status below
400 means no answer was received; a status from 400 to 599 means the service answered and its
answer was an error.**

## Decision

### 1. A failure carries a KIND and a SENTENCE

Every 503 body carries two things about the failure: a **kind** — a stable word a program may
branch on — and a **reason** — a sentence a human reads. Neither replaces the other: a program
cannot parse an English sentence without guessing, and a person cannot branch on a word without a
sentence explaining it.

The kinds on the service-to-service side (`dev.nexus.api.domain.DomainFailure`):

| kind | what it means |
|---|---|
| `error-status` | the downstream answered, and its answer was an HTTP error |
| `connection-refused` | nothing was listening |
| `host-unknown` | the host name could not be resolved |
| `timeout` | the call did not finish in time |
| `circuit-breaker-open` | the breaker refused the call — **it was never made** |
| `no-instance` | the router had no instance to choose |
| `malformed-answer` | the downstream answered, and the answer was not a project |
| `unknown` | a failure this classifier does not know how to name |

And on the edge's side (`dev.nexus.gateway.fallback.UpstreamFailure`): `circuit-breaker-open`,
`connection-refused`, `timeout`, `no-instance`, `unknown`.

The kinds are **stable strings, not exception class names.** A class name is a fact about this
repository's dependency tree; a caller that branches on it breaks the day a library renames
something. `unknown` is a first-class kind, not a shrug: an edge that cannot name a failure says
so rather than picking the nearest word and sending it to a caller who will believe it.

### 2. A 404 is still a 404, and it carries NO kind

The kinds describe **failures of the service**. "There is no such project" is not a failure of the
service — it is the service doing exactly what it was asked. So a `not-found` answer carries
`failure: null`, and ADR 0055's rule stands unchanged.

### 3. The breaker's refusal is its OWN kind

`circuit-breaker-open` is not a flavour of "could not be reached". When the breaker refuses, the
call was **never made** — no connection, no timeout, no upstream involved. The upstream was
healthy; the edge decided not to ask. That is a different fact with a different fix, and merging
it into "connection refused" would send an operator to check a service that was working perfectly.

This is the same distinction ADR 0055 drew between a 404 and a 503, one level down: the question
is never "did it work?" but "**what actually happened?**".

### 4. The edge names the upstream AND the kind

The edge's fallback already knew the upstream's name — it comes from the route's `fallbackUri`, not
from a guess. What it could not do was name the failure, because it never saw one: the exception
was inside the breaker.

Spring Cloud's own circuit breaker filter leaves the throwable in the exchange, under
`ServerWebExchangeUtils.CIRCUITBREAKER_EXECUTION_EXCEPTION_ATTR` (measured in
`SpringCloudCircuitBreakerFilterFactory`). The fallback reads it from there and names it. The
route table still has no path on `/actuator/**` — the operator's door is not on the product side,
and the gateway's own test now says so.

### 5. The breaker says what it is doing, and that is READABLE

A 503 says "the service could not be reached". It does not say which component stopped the call.
The breaker's own metric does — and the metric's `name` tag is the breaker's **own name**, the
same word the configuration file uses:

- `resilience4j.circuitbreaker.state` — the breaker's state as a gauge;
- `resilience4j.circuitbreaker.not.permitted.calls` — the calls the breaker **refused**.

So `nexus-api` and the edge expose the actuator's `metrics` endpoint, and the topology proof reads
both numbers. This closes a trail that began in ADR 0055 with a configuration file that named a
breaker **nothing was using**: the name in the file, the name in the runtime, and the name in the
metric are now the same word, and the proof reads the third one out of the running service.

The operator's door is `/actuator/**`, and the edge routes only `/api/**` — so the door is on the
service's own port and nowhere else.

### 6. The proof MEASURES the durations it does not promise

Two facts about this topology are properties of Eureka's lease and of the client's fetch interval,
not of this repository. The proof therefore **asserts** the topology (the chain keeps working with
the registry gone) and **measures** the duration (forty seconds later, the same call still
answered), reporting the second as a measurement rather than a guarantee.

## Options

**Keep the reason sentences, and add a `failure` field for machines.** Chosen, and it is why both
exist rather than one: the sentence is what a human reads, the word is what a program branches on.

**Use exception class names as the kinds.** Rejected: they are facts about the dependency tree, and
a caller that branches on `feign.RetryableException` breaks when the library reorganises.

**Map every non-404 to one kind, "unreachable".** Rejected: it is the thing being fixed. A refused
connection, a timeout, an open breaker and an unregistered upstream are four different problems,
and the operator's first question is which one it is.

**Let the status alone decide, and treat `-1` as "an error like any other".** Rejected by
measurement: `-1` is Feign's way of saying there was no answer, and treating it as an answer is
how the answer came to say "answered with an error -1".

**Let the edge keep answering one sentence for all its failures.** Rejected: it cannot be told
apart from a service that is genuinely down, and the two have different fixes.

**Read the breaker's state as a number and map the ordinals to names.** Rejected: the mapping is a
library implementation detail (`State` has an `order`, and its ordinals are not the ones a reader
would guess). The `not.permitted.calls` **counter** says what happened without any table at all —
a breaker that refused calls is a breaker that refused calls.

**Publish the actuator's `prometheus` endpoint.** Not done: the plain `metrics` endpoint carries
the same numbers, and a Prometheus registry would be a dependency the services would then owe an
answer for.

## Reason

- A 503 now answers **"what happened?"** and not only "something did not happen".
- The two layers answer in the same vocabulary: `circuit-breaker-open`, `connection-refused`,
  `timeout`, `no-instance` mean the same thing on both sides of the edge.
- The claim "the breaker refused it" is **measured**, not inferred: the metric counts the refused
  calls, and the answer says `circuit-breaker-open`. Before this, a 503 could have come from the
  breaker, the network, or the service, and nothing in the system could tell them apart.
- Every claim has a command: `mvn -o -B test` in the two services, and
  `node docs/evidence/java/spring-cloud-proof.mjs`.

## Tradeoffs

- **Two vocabularies, one per deployable.** The kinds are deliberately **not** in a shared module
  (ADR 0055, §2), so the edge and the api each carry their own classifier. They agree because the
  words were chosen together, not because a compiler enforces it — a shared module would fix that
  and undo the decoupling.
- **The kinds are a public contract.** Adding one is easy; **renaming** one breaks a caller that
  branches on it. That is the point of a stable word, and it is also a cost.
- **`unknown` is a real answer.** A failure nobody can name is reported as such, which is more
  useful than a wrong name and less useful than a specific one.
- **The actuator's endpoints are now reachable on each service's own port.** They are not routed
  through the edge, and the gateway's test says so — but a service reachable from the network is a
  service whose port must not be exposed publicly, which is a deployment concern this repository
  does not own yet.
