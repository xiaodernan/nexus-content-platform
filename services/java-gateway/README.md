# NEXUS Edge Gateway

The **front door** for service-to-service traffic — Spring Cloud **Gateway** (reactive/WebFlux),
with Resilience4j circuit breakers behind every route.

It owns three things and nothing else:

1. **the routing table** — which path goes to which service;
2. **the circuit breakers** — what happens when a service behind the door is down;
3. **the failure shape** — what a caller is told when the door could not reach a service.

It holds no business data and makes no business decisions. Every route it forwards is a route to a
service that already owns the answer.

```
        ┌────────────────────┐
   ───▶ │  nexus-gateway     │──▶ nexus-api        (lb://nexus-api  or  a configured address)
        │  :8081             │
        └────────────────────┘
```

## The one rule this service exists to keep

**An edge that cannot reach a service must not answer as if it had.**

This is the most tempting lie a gateway can write. The upstream is gone; the edge is very much
alive; and an edge that is feeling helpful returns `200 OK` with an empty body. The caller cannot
tell that apart from *"there is no such project"* — and it will go looking for the problem in the
wrong place.

This repo already refuses that confusion elsewhere: the artifact page in `services/nexus-api`
answers **503** for "the service is not running" and **404** for "nothing is published here",
because those are different facts. The edge keeps the same discipline, and the fallback body is
written to be unambiguous:

```json
{
  "ok": false,
  "reason": "upstream-unavailable",
  "upstream": "nexus-api",
  "failure": "connection-refused",
  "detail": "the gateway could not reach nexus-api: the connection was refused; no answer was invented on its behalf"
}
```

The `upstream` name is not a guess — it is carried by the route's own `fallbackUri`, so the body
names the service that was actually being protected.

**And it names WHICH failure (ADR 0056).** Naming the upstream answers "where do I look?"; it does
not answer "what happened?". A refused connection, a call that timed out, a breaker that was open
and an upstream that is not registered anywhere are **four different problems with four different
fixes** — and an edge that answers all four with the same sentence sends the operator to the logs
to find out which it was. So the edge reads the exception Spring Cloud's own circuit breaker filter
leaves in the exchange (`ServerWebExchangeUtils.CIRCUITBREAKER_EXECUTION_EXCEPTION_ATTR`) and names
it: `circuit-breaker-open`, `connection-refused`, `timeout`, `no-instance`, or `unknown` — and
`unknown` is a real answer, not a shrug: an edge that cannot name a failure says so rather than
picking the nearest word and sending it to a caller who will believe it.

`GET /actuator/metrics/resilience4j.circuitbreaker.state` says whether the edge's **own** breaker
is closed or open, and its `name` tag is the name the route table uses (`nexusApiCircuitBreaker`).
The operator's door is `/actuator/**` — and the route table matches only `/api/**`, so it is not on
the public side.

## Tech stack

- Java 25, Spring Boot 3.5.16, Maven
- Spring Cloud 2025.0.3 (`spring-cloud-dependencies` BOM)
- Spring Cloud Gateway 4.3.5 (`spring-cloud-starter-gateway-server-webflux`)
- Resilience4j circuit breakers (`spring-cloud-starter-circuitbreaker-reactor-resilience4j`)
- Eureka client + LoadBalancer, **off by default**
- Actuator for the health question

> **Note the ABSENCE of `spring-boot-starter-web`.** A Gateway application is reactive (WebFlux).
> The servlet starter on the classpath makes the two runtimes fight over the same port. This pom is
> where that is prevented.

## Verified

`mvn -o -B test` → **2/2 PASS**, BUILD SUCCESS:

| case | what it proves |
|---|---|
| `theEdgeForwardsToTheServiceBehindItAndAppliesItsOwnPathRules` | the **shipped** route forwards, and its `StripPrefix=1` is visible in the bytes that come back |
| `whenTheServiceBehindItIsAbsentTheEdgeSaysSoAndInventsNothing` | with the upstream stopped, the edge answers **503** and names the upstream — it does not answer 200 |

Both cases use the route that ships in `application.yml` and change only the upstream **address**,
through the same `NEXUS_GATEWAY_NEXUS_API_URI` variable an operator would set. Nothing adds a
test-only route: a test that exercises a route the product does not have proves the test, not the
product.

The second case makes the upstream absent by **stopping it**, rather than by adding a second route
or mocking the client — a mocked upstream keeps answering, and the behaviour under test is
precisely the case where nothing answers.

## Honest bounds

- **One route ships.** `/api/**` in front of `nexus-api`. The route table is the product; it grows
  when a service joins the edge, not before.
- **The circuit breaker's fallback is a local `forward:`.** It does not reach the network, so the
  edge can still answer honestly while the service behind it is down.
- **Discovery is OFF by default.** `NEXUS_EUREKA_ENABLED=true` turns on Eureka registration and
  `lb://` route targets. Without it the edge runs exactly as before. (Measured here: the Eureka
  namespace is TOP-LEVEL `eureka.*`, not `spring.cloud.eureka.*` — written under the wrong prefix,
  the client started anyway and dialled a registry nobody started.)
- **No authentication, no rate limiting, no TLS termination.** The edge is a development-topology
  component; it is not a security boundary yet.
- **The `detail` sentence is prose, not a diagnosis.** It says the upstream could not be reached. It
  does not say why (refused? timed out? DNS?), because the edge does not know.

## Configuration

| variable | default | meaning |
|---|---|---|
| `NEXUS_GATEWAY_PORT` | `8081` | the port this service binds |
| `NEXUS_GATEWAY_NEXUS_API_URI` | `http://127.0.0.1:8080` | where `/api/**` goes |
| `NEXUS_EUREKA_ENABLED` | `false` | register with the registry and allow `lb://` targets |
| `NEXUS_EUREKA_URL` | `http://127.0.0.1:8761/eureka/` | the registry's address |
| `NEXUS_PORT_FILE` | *(empty)* | when set, the bound port is written here (see `PortAnnouncer`) |

## Running it

```bash
mvn -o -B spring-boot:run
mvn -o -B spring-boot:run -Dspring-boot.run.arguments=--server.port=0
```
