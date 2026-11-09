# 0055 — A service is reached BY NAME, and its failure is a FACT about the service

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

ADR 0054 introduced Spring Cloud as a **registry** and an **edge**, and deliberately left
service-to-service calls out: "`spring-cloud-openfeign` 4.3.3 is not in the local Maven repository
(only 4.1.1 is), so a Feign client would need a download and would introduce a second HTTP client
stack before the edge and the registry are used by anything."

Two things then had to be true before the second half of the story could be told at all.

**First: the service on the other side of the boundary had to be a real participant.** Measured on
2026-11-09, `services/java-domain-service` had never been started against the repository's own
PostgreSQL. Its `ddl-auto: validate` had never met the schema it claims to map, and its write path
was broken in a way that only a database could reveal:

```
ERROR:  invalid input value for enum user_role: "CREATOR"
```

`users.role` is a PostgreSQL enum whose labels are `'creator'` and `'admin'`; `users.plan` is a
`text` column the platform writes and compares in lowercase; the Java side wrote the **constant
names**. So the service's `createUser` had never succeeded — not once, for any caller, ever — and
nothing in its unit suite could see that, because a mock database cannot refuse a value.

**Second: the failure shape had to survive the boundary.** The edge already answers 503 and names
its upstream when a service is gone (ADR 0054). The same question had never been asked of a
service-to-service call: if `nexus-api` asks the domain service for a project and the domain
service is not running, what does `nexus-api` answer? The obvious implementation — let the HTTP
status of the downstream decide — produces a **404**, and a 404 means "there is no such project".
A caller would conclude the project had been deleted, and would say so, to a user.

## Decision

### 1. The contract is an interface, and the address is a NAME

`nexus-api` reaches the domain service through an OpenFeign client whose `name` is the **service
name**:

```java
@FeignClient(name = "nexus-domain-service")
public interface DomainServiceClient {
    @GetMapping("/api/v1/projects/{id}")
    DomainProject getProject(@PathVariable("id") UUID id);
}
```

The address comes from Eureka and the load balancer, so a second instance is reachable without a
redeploy. The path is the **domain service's own path** — a client that rewrote it to suit its own
routing would break the moment the domain service changed its surface, which is the coupling a
boundary exists to prevent.

### 2. The contract is DECLARED IN THE CALLER, not shared

The wire types (`DomainProject`, `DomainResponse`) live in `nexus-api`'s own package. They are **not**
extracted into a shared Java module, even though both services are Java and the types are small:

- the two services are independently released deployables with their own cadence;
- a shared module couples them at the **COMPILE** level, which is exactly what a microservice
  boundary exists to prevent;
- the contract between them is HTTP, and the contract is these records.

### 3. ONE body, THREE states, THREE status codes

Every answer — including the failures — is one body type, and the HTTP status says which of the
three facts happened:

| fact | state | status |
|---|---|---|
| the domain service holds that project | `found` | **200** |
| the domain service answered, and does not hold it | `not-found` | **404** |
| the domain service could not be reached at all | `downstream-unavailable` | **503** |

The third one is the reason the type exists. The 503 body **names** the service that could not be
reached, exactly as the edge's fallback names its upstream.

There is deliberately **no** "empty project" answer. An earlier draft returned a `DomainProject`
whose every field was null for the 503 case; that is a fabricated empty project — a caller that
ignored the status code would have seen a project with no name and no owner. A missing project and
an unreachable service must not be spelled the same way, even in a body.

**And the failure arrives WRAPPED, which is why the reader digs.** Measured on the topology proof:
with a circuit breaker in front of the call, a 404 from the domain service reached the reader as

```
NoFallbackAvailableException: No fallback available.
  (cause: NotFound: [404] during [GET] to [http://nexus-domain-service/api/v1/projects/…])
```

Spring Cloud's OpenFeign integration routes **every** exception through the breaker's fallback
function, and with no fallback bean configured that function throws
`NoFallbackAvailableException` **wrapping the original**. The original is the fact, and it is in the
cause.

So a reader that recognised only a bare `FeignException` answered **503 "the domain service could
not be reached"** to a caller who had asked about a project that simply does not exist — the exact
lie this slice exists to prevent, produced by a wrapper rather than by a mistake in the logic.
`DomainProjectReader` therefore finds the `FeignException` wherever it sits in the cause chain and
decides by its **status**: 404 is a fact about the project, anything else is a fact about the service.

### 4. The schema owns the vocabulary, and the service says so out loud

The labels a PostgreSQL enum column stores are **the schema's**, not Java's. The domain service now
carries them on the constants (`UserRole.CREATOR.label()` → `"creator"`), writes them through an
`AttributeConverter`, and **checks** them at the boundary: an unknown `kind` is a **400 that names
the accepted words**, not a constraint violation that becomes a 500.

The same rule reaches the other direction: `fromLabel(String)` is the Jackson factory, so a body
carrying `"free"` deserializes into the tier the platform means — Jackson's default enum reader
would have demanded `"FREE"`, and the platform has never sent that.

### 5. Discovery stays OPT-IN, and the service that owns the data is in the topology

`NEXUS_EUREKA_ENABLED` defaults to `false` everywhere. A service that cannot start because an
optional dependency is absent is a service whose absence takes the edge down with it.

### 6. The breaker's CONFIGURATION and the breaker's NAME must be the same name

This deserves its own section, because it is a silent failure of the worst kind: a configuration
file that configures an instance nothing uses still LOOKS right.

Spring Cloud OpenFeign does not name a circuit breaker after the Feign client. It ships two name
resolvers and **both** of them name it something nobody would guess:

- the default one returns `Feign.configKey(type, method)` — for this client that is
  `dev.nexus.api.domain.DomainServiceClient#getProject`;
- the "alphanumeric" one — **which is the default one**, on by default through
  `spring.cloud.openfeign.circuitbreaker.alphanumeric-ids.enabled` — returns the same string with
  every non-alphanumeric character removed: `devnexusapidomainDomainServiceClientgetProject`.

So the configuration that says

```yaml
resilience4j:
  circuitbreaker:
    instances:
      nexus-domain-service:
        ...
```

describes an instance **nothing was using**, and the breaker that actually stood in front of the
call ran on the **defaults**: 100 calls before it might open, 60 seconds before it might half-open,
and every exception counted as a failure — **including a 404**.

The fix is to name the breaker ourselves: `DomainCircuitBreakerNameResolver` returns the **client's
name verbatim**, and because both library resolvers are `@ConditionalOnMissingBean`, ours is the one
that survives. So the instance in `application.yml` and the breaker in front of the call are the same
word, and a reader can check that by reading one file.

`ignoreExceptions: feign.FeignException.NotFound` says the rest of it: **a 404 is an ANSWER, not a
failure** — the service did exactly what it was asked. Counting it as a failure opens the breaker
for a service that is working perfectly.

`DomainCircuitBreakerConfigTest` reads `application.yml` and refuses to let the client's name, the
instance's name, and the switch drift apart again.

### 7. The evidence is a RUNNING SYSTEM, not a mock

`docs/evidence/java/spring-cloud-proof.mjs` grew from three services to four. It copies the **real
schema** out of the platform's database with `pg_dump` into a throwaway database (the domain
service validates against it, and would correctly refuse to start against an empty one), inserts
**its own** row, and then asserts, through the whole chain —

> edge → `nexus-api` → `lb://nexus-domain-service` → domain service → PostgreSQL

— that the row that comes back is the row that was inserted, that an id the domain service does not
hold is a **404**, and that with the domain service killed the same question is a **503 that names
it**.

Two of its assertions are about **layers**, because a request crosses two of them and each may
answer:

- the service-to-service door is asked **directly** (that is the claim this ADR makes), and
- the same question is asked **through the edge**, which has its own breaker and its own honest 503.

Measured: with the domain service dead, `nexus-api` waits for the call to time out, and the edge's
breaker may open and answer first. Both answers are true — the edge says "the upstream was
unavailable", the api says "the domain service could not be reached" — and neither is a 200 with an
empty body.

The proof also **prints what the services said** when it fails. That is not decoration: the finding
that the failure arrives wrapped came out of the api's log, not out of the proof's own output, and a
proof that cannot show what the services said makes the next person guess.

## Options

**`RestTemplate` / `RestClient` instead of OpenFeign.** Rejected: both put the URL in the calling
code and give the caller an untyped `ResponseEntity` to decode. The point of the boundary is a
contract the compiler checks.

**A shared Java module for the wire types.** Rejected, as above: compile-level coupling between two
independently released services.

**Letting the downstream's HTTP status decide the caller's answer.** Rejected: it is what turns "the
service is down" into "the project does not exist", and it is the failure this ADR exists to
prevent.

**Keeping the uppercase constant names and letting the database refuse them.** Rejected by
measurement: every user write failed.

**`ddl-auto: none`, to stop the schema check from being in the way.** Rejected: `validate` passes
against the real schema (measured), and a write path that may silently diverge from the schema it
does not own is a divergence waiting to happen.

**Letting the database refuse the bad vocabulary word (a 500).** Rejected: it blames the server for
the caller's mistake.

## Reason

- The boundary is now **typed, named, and proved in one request** — not a design document.
- The failure shape is the same on both sides of the boundary: unreachable ⇒ **503 naming the
  service**, absent ⇒ **404**, present ⇒ **200**. A caller does not have to learn two vocabularies.
- Every claim in this ADR has a command that reproduces it: `mvn -o -B test` in both services, and
  `node docs/evidence/java/spring-cloud-proof.mjs`.

## Tradeoffs

- **A second HTTP client stack.** Feign sits beside the JDK client the other services use. It is the
  price of a typed contract, and the contract is the thing that matters.
- **The breaker is configured, not proven under load.** Resilience4j's `nexus-domain-service`
  instance is in place and the fallback path is tested, but no test opens the breaker on purpose.
- **The topology has no authentication anywhere.** The registry accepts a registration from anyone
  who can reach the port; the edge has no auth, no rate limit, no TLS. This is a development
  topology and is not a security boundary.
- **The four JVMs need about 1.2 GB of heap together.** The host has ~2.5 GB free
  (`docs/ENVIRONMENT.md`), which is why the proof caps each process with `-Xmx` rather than
  assuming a machine that can afford more.
