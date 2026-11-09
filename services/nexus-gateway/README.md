# services/nexus-gateway

The HTTP door `docs/decisions/0011-backend-service-boundaries.md` already promised the Studio: "talks to
the API gateway over typed HTTP/WS contracts only". Before this module that sentence named a door that did
not exist — `apps/studio` reached `nexus-api` at a hard-coded `127.0.0.1:8080`. This is the door.

Spring Boot 3.5 + Spring Cloud Gateway (reactive) + LoadBalancer + Resilience4j, on Java 25.

## What it does

| request | answer |
| --- | --- |
| `/api/**` | routed to the `nexus-api` **service id** through `nexus-registry`, prefix stripped |
| `/domain/**` | routed to the `nexus-domain-service` **service id**, prefix stripped (SC-6) |
| `/platform/services` | what the registry holds right now, with a `note` saying it is not a health check |
| `/platform/health` | one `GET /actuator/health` per discovered instance: `UP` / `DOWN` / `UNKNOWN`, plus `allUp` (SC-8) |
| anything the route cannot complete | `503` + `{error:"service_unavailable", service, cause, note}` |

The route is built in `GatewayConfig` with the **compiled DSL**, not a YAML route table. The Gateway 4.2+
line moved `spring.cloud.gateway.*` to `spring.cloud.gateway.server.webflux.*`; a route table written
against a prefix a dependency bump renames does not fail — it starts cleanly and stops matching. A compiled
route is a build error instead of a silent 404.

There are exactly **two** routes, both written down here. `discovery.locator.enabled` would publish
`/{serviceId}/**` for every service in the registry — including the registry itself and other projects'
services — turning "can reach the registry" into "can reach every backend". Adding a backend is therefore a
deliberate edit to `GatewayConfig`, not something the registry gets to decide.

Measured on a joined-up run (2026-11-09): `POST /domain/api/v1/projects` answered `201`, `GET` by id `200`,
`DELETE` `204`, and the same `GET` afterwards `404`; `/platform/services` listed `nexus-api`,
`nexus-gateway`, `nexus-domain-service` (plus `football-edge`, a service another local project registers in
the shared registry — it is shown, not routed). `/platform/health` answered `allUp: true` with all three
reachable and each instance `UP` at its registry address; with `nexus-domain-service` stopped, the same call
answered `allUp: false` and `UNKNOWN` ("no answer within 800 ms") for that instance — a silent address is
not called `DOWN`. After that run the default timeout was raised to 1500 ms: the first probe after a backend
start can exceed 800 ms while its servlet initializes, and a healthy cold service should not read UNKNOWN.

### The edge policy every route carries (SC-7)

Both routes go through one `edgePolicy(...)` in `GatewayConfig`, so the two backends cannot drift apart:

| filter | what it answers | why |
| --- | --- | --- |
| `StripPrefix` | backend sees `/api/v1/...` | the count comes from the route prefix, not a magic number |
| `setRequestSize` | `413` at the door; body never forwarded | a backend cannot be made to buffer an oversized upload |
| `secureHeaders` | nosniff, frame `DENY`, referrer policy, HSTS | it applies to the 413/429/503 answers too, not just the happy path |
| `retry`, GET only | one retry on connection failure / `502` / `503` | a proxy that repeats a write is how one click becomes two publications. `setSeries()` is deliberately emptied: left unset, the filter retries ANY 5xx, which would repeat a GET whose backend answered `500` — an answer, not a transient fault |
| `circuitBreaker` | `503` naming the recorded cause | last, so it counts the final outcome of the retried call |

In front of every route sits `RateLimitFilter`: a per-client token bucket
(`NEXUS_GATEWAY_RATE_LIMIT_RATE` per second, `NEXUS_GATEWAY_RATE_LIMIT_BURST` burst), keyed by the first
`X-Forwarded-For` entry when present, else the peer address, over a Caffeine cache with a ceiling
(`NEXUS_GATEWAY_RATE_LIMIT_CLIENTS`) and a 10-minute idle expiry. Over the bucket: `429` +
`{"error":"rate_limited"}` + `Retry-After: 1`.

Measured on the joined-up run (2026-11-09, gateway on 8091, bucket forced to rate 0 / burst 3):

| attempt | answer |
| --- | --- |
| 1–3 | forwarded (the probe path itself answered `404` from `nexus-api` — the point is it reached the route) |
| 4–6 | `429`, `Retry-After: 1`, `{"error":"rate_limited",...}` |

and a 1.2 MB `POST /api/v1/projects` answered `413` with zero rows written to PostgreSQL.

**The bound that is easy to miss:** `/platform/services` is a controller *inside this gateway*, and
Spring's `RequestMappingHandlerMapping` answers it before `RoutePredicateHandlerMapping` ever runs — so
`GlobalFilter`s (including the limiter) do not see it. It is a diagnostic endpoint, not a route; do not
expose this gateway's own endpoints as if they were perimeter-hardened. If it ever needs the same bucket,
it belongs behind a route or inside the controller — written down as owed, not assumed.

### The receipt names the address you called, not the instance

A publish receipt carries a `url`. `nexus-api` composes it from the request it sees, so behind a gateway
that forwarded only `Host`, it would name the internal instance (`192.168.1.5:8081`) — an address the caller
usually cannot open and one that leaks the topology.

This gateway sets `X-Nexus-Original-URL` (the scheme and authority the **client** typed) on every routed
request, and `nexus-api` prefers it. Measured on a joined-up run (2026-11-09):

| caller | receipt `url` |
| --- | --- |
| `GET http://127.0.0.1:8091/api/projects?limit=1` (through the gateway) | `http://127.0.0.1:8091/projects/doc_19d8pa` |
| `GET http://127.0.0.1:8081/projects?limit=1` (direct) | `http://127.0.0.1:8081/projects/doc_19d8pa` |

Why a self-defined header and not `X-Forwarded-Host`: the framework's own `XForwardedHeadersFilter` runs
after route filters and rewrites the standard header with a host-only value — measured, the backend received
an empty string. Our header is set by a `GlobalFilter` at `LOWEST_PRECEDENCE - 1` and is ours end to end;
the gateway test asserts the value the stub socket actually received.

**Trust boundary:** `nexus-api` trusts `X-Nexus-Original-URL` the same way it would trust any forwarded
header — the gateway overwrites it (never appends), and a client that can reach `nexus-api` directly can
forge it. Deployments must not expose `nexus-api` to untrusted clients; the gateway's overwrite is the
reason the value can be believed.

## What it deliberately does not do

- **No authentication.** A backend behind this door is reachable by anyone who can reach the door.
- **No shared limiting.** The bucket is per instance: two gateways allow twice the configured rate. Shared
  limiting needs Redis, and making Redis a hard dependency of every request is its own outage mode; that
  slice is owed, not hidden.
- **No TLS termination, no WebSocket upgrade path.** The Studio's realtime channel does not go through
  this module yet.
- **No retried writes.** Retry is GET-only by construction; POST/PATCH/DELETE are answered once.
- **No invented success.** A backend that is down, slow, or dropped mid-call answers `503` with the cause
  the breaker recorded. It never answers `200 []`: "the system of record has no publications" and "the
  system of record is down" must not look the same (§159).

## Running it

```bash
# behaviour tests: real upstream socket, stub registry, no Eureka needed
mvn -f services/nexus-gateway/pom.xml test
```

A joined-up three-service run (from the repo root, one terminal each):

```bash
mvn -f services/nexus-registry/pom.xml spring-boot:run
```

```bash
# nexus-api needs PostgreSQL; on this machine the dev database is 55433
NEXUS_API_REGISTER=true; NEXUS_DB_URL=jdbc:postgresql://127.0.0.1:55433/nexus
mvn -f services/nexus-api/pom.xml spring-boot:run
```

```bash
mvn -f services/nexus-gateway/pom.xml spring-boot:run
# then: curl http://127.0.0.1:8090/platform/services
#       curl http://127.0.0.1:8090/api/projects?limit=1
```

The gateway's own port is `NEXUS_GATEWAY_PORT` (8090), the registry's is `NEXUS_REGISTRY_PORT` (8761), and
the service id it routes to is `NEXUS_GATEWAY_API_SERVICE` (`nexus-api`). The breaker's time limit defaults
to 5 s (`NEXUS_GATEWAY_TIMEOUT`): the library default of 1 s would report a cold service as unavailable
while it was still answering. The edge bounds are `NEXUS_GATEWAY_MAX_REQUEST_BYTES` (1048576) and
`NEXUS_GATEWAY_RATE_LIMIT` / `_RATE` / `_BURST` / `_CLIENTS` (true / 100 / 200 / 10000).

## Bounds, stated (§60)

- Registration in `nexus-api` is **off by default** (`NEXUS_API_REGISTER`); a deployment turns it on. Until
  then this gateway's route cannot resolve and correctly answers `503` — which is the honest state, not a
  broken one.
- The registry lists **addresses, not health**. A service that dies without cancelling its lease stays
  listed until the lease expires. `/platform/health` closes that gap with a point-in-time probe: it asks
  every discovered instance's actuator and names the address it actually called. It does not cache, so it
  is also not a monitoring history.
- **`UNKNOWN` is a real answer.** A timeout, a connection that silently disappears, or a 2xx without a
  recognizable `status` field is reported as `UNKNOWN`, never rounded to `UP` or `DOWN`.
- One gateway instance. No session affinity, no shared breaker state, no operator UI.
