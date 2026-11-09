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
the shared registry — it is shown, not routed).

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
- **No rate limiting.** `apps/web` and `nexus-api` own their own bounds; the gateway adds none.
- **No TLS termination, no WebSocket upgrade path.** The Studio's realtime channel does not go through
  this module yet.
- **No retries.** A failed call is answered, not repeated: a POST retried by a proxy is a duplicate the
  caller never asked for.
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
while it was still answering.

## Bounds, stated (§60)

- Registration in `nexus-api` is **off by default** (`NEXUS_API_REGISTER`); a deployment turns it on. Until
  then this gateway's route cannot resolve and correctly answers `503` — which is the honest state, not a
  broken one.
- The registry lists **addresses, not health**. A service that dies without cancelling its lease stays
  listed until the lease expires.
- One gateway instance. No session affinity, no shared breaker state, no operator UI.
