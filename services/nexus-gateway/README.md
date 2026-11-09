# services/nexus-gateway

The HTTP door `docs/decisions/0011-backend-service-boundaries.md` already promised the Studio: "talks to
the API gateway over typed HTTP/WS contracts only". Before this module that sentence named a door that did
not exist — `apps/studio` reached `nexus-api` at a hard-coded `127.0.0.1:8080`. This is the door.

Spring Boot 3.5 + Spring Cloud Gateway (reactive) + LoadBalancer + Resilience4j, on Java 25.

## What it does

| request | answer |
| --- | --- |
| `/api/**` | routed to the `nexus-api` **service id** through `nexus-registry`, prefix stripped |
| `/platform/services` | what the registry holds right now, with a `note` saying it is not a health check |
| anything the route cannot complete | `503` + `{error:"service_unavailable", service, cause, note}` |

The route is built in `GatewayConfig` with the **compiled DSL**, not a YAML route table. The Gateway 4.2+
line moved `spring.cloud.gateway.*` to `spring.cloud.gateway.server.webflux.*`; a route table written
against a prefix a dependency bump renames does not fail — it starts cleanly and stops matching. A compiled
route is a build error instead of a silent 404.

There is exactly **one** route. `discovery.locator.enabled` would publish `/{serviceId}/**` for every
service in the registry, turning "can reach the registry" into "can reach every backend". Adding a backend
is a deliberate edit to `GatewayConfig`.

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
