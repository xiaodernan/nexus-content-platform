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

In front of every route sits `RateLimitFilter`: a per-client token bucket keyed by the first
`X-Forwarded-For` entry when present, else the peer address. Over the bucket: `429` +
`{"error":"rate_limited"}` + `Retry-After: 1`.

Where the counter lives is configuration (SC-12):

| `nexus.gateway.rate-limit.backend` | meaning |
| --- | --- |
| `memory` (default) | a bucket per instance over a Caffeine cache with a ceiling (`NEXUS_GATEWAY_RATE_LIMIT_CLIENTS`) and a 10-minute idle expiry. No second process; two gateways allow twice the configured rate |
| `redis` | one atomic bucket per client in Redis, shared by every gateway instance. The configured rate becomes the rate of the cluster |

The Redis backend is a Lua script: read `tokens`/`ts`, refill from Redis's own `TIME` (instances have
different clocks, so a local clock would make the allowance depend on which instance answered), subtract
one token, write back with a TTL equal to the time a full bucket needs to refill. One EVAL, so two
instances cannot hand out the same token twice.

**It fails open, deliberately.** If Redis cannot answer — down, blackholed, command timeout — the request
proceeds unthrottled and a WARN is logged at most once per 10 s. A rate limit is a bound, not an
authentication decision; an outage of the component whose job is to slow traffic down must not become an
outage of all traffic. The honest statement during that window is "the gateway is up and unthrottled",
and the log says exactly that. Timeouts are 1 s (command and connect) so "no answer" becomes "allow"
quickly instead of becoming a slow request path.

Measured on the joined-up run (2026-11-09, bucket forced to rate 0 / burst 3, memory backend):

| attempt | answer |
| --- | --- |
| 1–3 | forwarded (the probe path itself answered `404` from `nexus-api` — the point is it reached the route) |
| 4–6 | `429`, `Retry-After: 1`, `{"error":"rate_limited",...}` |

and a 1.2 MB `POST /api/v1/projects` answered `413` with zero rows written to PostgreSQL.

Measured for the shared backend (2026-11-09, two gateways 8092 / 8093, one Redis, `rate=0 burst=2`):
8092 answered `200`, `200`; 8093 — whose local bucket had never been touched — answered the third request
with `429`. Redis held `nexus:gateway:rate:127.0.0.1` with `tokens=0` and a TTL of 3588 s. A third
instance pointed at a dead Redis port answered `200` twice with `burst=1`, logging
`... failed; request allowed unthrottled (fail-open) ...`.

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

### Authentication at the door (SC-13)

The door can require a token before a request reaches any backend — but it is **off by default** so the
packaged door stays offline-truth (no secret, no open door). Turn it on with a real secret:

```bash
NEXUS_GATEWAY_AUTH_ENABLED=true
NEXUS_GATEWAY_AUTH_SECRET=<a real secret the deployment controls>
```

A caller then presents `Authorization: Bearer <token>`. The token is a compact, stateless, provider-free
HMAC-SHA256 token the deployment's own identity service mints and the door verifies — `base64url(payload)
+ "." + base64url(HMAC-SHA256(payload, secret))`, where `payload = {"sub","scp":[...],"iat","exp"}`. No
third party, no JWT library, no default key that silently opens the door. A blank secret while enabled fails
startup (`refusing to start an open door`) rather than starting open — fail-closed, unlike the rate limiter.

Whitelisted (no token needed): `/platform/health`, `/actuator/health`, `/fallback/**` — the door must answer
its own health probe before a caller is known, and the fallback is what the door says when it could not reach
a backend. Everything routed to a backend needs a valid, unexpired token or it gets `401` and never reaches
the backend. On success the door overwrites `X-Nexus-Subject` / `X-Nexus-Scopes` on the trusted request, so
a forged identity header from the client cannot impersonate someone else. The test mints tokens with the
same code path the door verifies (`AuthFilter.mint` / `AuthFilter.verify`), so "a valid token is accepted"
is proven against a real signature, not a stubbed one.

## What it deliberately does not do

- **No authentication *by default*.** The door ships with `nexus.gateway.auth.enabled=false`, so the packaged
  door stays offline-truth: no secret, no open door, and the laptop and the test suite run without a token
  service. Turn it on WITH a real secret (`NEXUS_GATEWAY_AUTH_SECRET`); enabling it with a blank secret fails
  startup instead of starting an open door (SC-13). When on, a caller presents `Authorization: Bearer <token>`
  — a compact HMAC-SHA256 token the deployment's identity service mints (`AuthFilter.mint`) and the door
  verifies with the same secret. Whitelisted (no token needed): `/platform/health`, `/actuator/health`,
  `/fallback/**`. Anything routed to a backend needs a valid, unexpired token or it gets `401` and never
  reaches a backend. On success the door injects `X-Nexus-Subject` / `X-Nexus-Scopes` for the backend,
  overwriting any client-supplied value.
- **Shared limiting is opt-in, not the default.** `backend=memory` keeps the door independent of a second
  process; `backend=redis` makes the rate a cluster-wide bound. With the Redis backend, Redis is on the
  request path, and its failure is answered by failing open (see above) rather than by closing the door —
  the price of that choice is written down, not hidden.
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

The gateway unit tests (now **43** — the original 30 plus 13 auth tests, `AuthFilterTest` 9 and
`GatewayAuthWiringTest` 4) mock the Redis template where they must, so the Lua bucket itself is graded
separately, against a real Redis and without any JVM (repo root; needs only `nexus-redis` on 56379):

```bash
npm run ratelimit:gateway-lua
```

It reads the script out of `RedisRateLimitBackend.java` (no second copy to drift), prints its sha256,
and asks six questions of the live server: the shared bucket refuses the third caller, the
per-instance control does not, three independent connections cannot over-issue a burst of 3, refill
uses Redis's own clock and is clamped by capacity, a future stamp cannot mint tokens, and the TTL is
the argument rather than a constant. Any failed verdict exits non-zero; a dead Redis is an error, not
a skip. Readings land in `.scratch/gateway-rate-lua-live/readings.json`. What this does **not** prove
is two gateway *processes* sharing one bucket — that needs three JVMs and is recorded in ADR-0095.

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
`NEXUS_GATEWAY_RATE_LIMIT` / `_RATE` / `_BURST` / `_CLIENTS` (true / 100 / 200 / 10000). The limiter's
backend is `NEXUS_GATEWAY_RATE_LIMIT_BACKEND` (`memory`; set `redis` for a shared counter), its key prefix is
`NEXUS_GATEWAY_RATE_LIMIT_KEY_PREFIX` (`nexus:gateway:rate:`), and the Redis server is
`NEXUS_REDIS_HOST` / `NEXUS_REDIS_PORT` (`127.0.0.1` / 56379 — this machine's 6379 belongs to another
project and requires AUTH). Connection and command timeouts are `NEXUS_GATEWAY_REDIS_CONNECT_TIMEOUT` /
`NEXUS_GATEWAY_REDIS_TIMEOUT` (1 s each). Authentication is `NEXUS_GATEWAY_AUTH_ENABLED` (`false`) and
`NEXUS_GATEWAY_AUTH_SECRET` (blank — a blank secret while enabled fails startup, so the door is closed
rather than open). Whitelisted from the token check: `/platform/health`, `/actuator/health`, `/fallback/**`.

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
- No session affinity, no shared breaker state, no operator UI. Multiple gateway instances are supported
  (SC-12): with `NEXUS_GATEWAY_RATE_LIMIT_BACKEND=redis` they decrement one bucket per client, so the
  configured rate is the cluster's rate. With the default `memory` backend each instance keeps its own
  bucket and N instances allow N times the rate — that is the honest reading of the default, not a bug.
  The breaker's state is still per instance either way.
