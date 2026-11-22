# nexus-config — the configuration address (SC-9)

A Spring Cloud Config Server in `native` mode. It serves the YAML files in
`src/main/resources/nexus-config/` from its own classpath, so it needs no Git repository, no Vault and no
network to answer. `native` is a lab choice, not a claim about production: the same server points at a
Git-backed repository there, with the same HTTP contract (`GET /{application}/{profile}`).

## Why this exists

The gateway reads its bounds from `application.yml` plus `NEXUS_GATEWAY_*` environment variables. That works
on one machine and stops working when two environments need different values without different jars. Central
config makes an environment's truth one address instead of a shell script that must remember every variable.

## What it serves

| file | merged into | note |
| --- | --- | --- |
| `application.yml` | every client | only settings that are identical for all services |
| `nexus-gateway.yml` | `spring.application.name=nexus-gateway` | the gateway's environment truth |
| `nexus-api.yml` | `spring.application.name=nexus-api` | lab registration truth (SC-11) |
| `nexus-domain-service.yml` | `spring.application.name=nexus-domain-service` | lab registration truth (SC-11) |

All three services are clients now (SC-9 gateway, SC-11 api/domain). Each one's packaged file keeps
registration OFF; the central files are the deployment truth that says "this lab has a registry".

## Running

```powershell
java -jar services\nexus-config\target\nexus-config-0.1.0-SNAPSHOT.jar
# port 8888 by default; NEXUS_CONFIG_PORT overrides
```

Every service opts in per deployment; the client is **off** by default:

```powershell
$env:NEXUS_CONFIG_ENABLED='true'
$env:NEXUS_CONFIG_URL='http://127.0.0.1:8888'
java -jar services\nexus-gateway\target\nexus-gateway-0.1.0-SNAPSHOT.jar
```

`spring.config.import` is `optional:configserver:` on purpose: a config server that is down must not stop the
door, and the packaged `application.yml` remains the offline truth.

The same two variables work for `nexus-api` and `java-domain-service`; their `spring.application.name` picks
the document.

## Measured (2026-11-09)

`GET http://127.0.0.1:8888/nexus-gateway/default` answered two property sources
(`classpath:/nexus-config/nexus-gateway.yml`, then `classpath:/nexus-config/application.yml`) with
`nexus.gateway.rate-limit.rate-per-second: 50`. With `NEXUS_CONFIG_ENABLED=true`, the gateway's own startup
line said `gateway rate limit: enabled=true ratePerSecond=50.0 ...` — the local file says 100, so 50 can only
have come from here. Without the flag the same jar starts from its packaged file (100).

SC-11, same day, two arms on `nexus-api` with this server answering on 8888 and **no** `NEXUS_API_REGISTER`
in the environment: client OFF → `/actuator/health` 200 but the registry has no `NEXUS-API`; client ON →
`NEXUS-API` (8081) appears and `/platform/health` reports it `UP`. The packaged default is false, so the
registration could only have come from `nexus-api.yml`. `nexus-domain-service` registers the same way.

## Ops surface (ADR-0313, 2026-11-23)

Three endpoints under `/nexus/config/ops` answer "which version is being served, did it move, and what moved".
None of them writes configuration.

| endpoint | what it says |
| --- | --- |
| `GET /version?application=&profile=` | the digest of the served version, its key count, and whether the source served anything at all — shape only, never values |
| `POST /refresh?application=&profile=&actor=` | re-read the source and report `established` / `unchanged` / `changed` / `empty-source` / `source-error` with added / removed / modified keys |
| `GET /audit?limit=` | the appended ledger, newest first, with `kept` and `totalRecorded` |

The digest is computed from the same `EnvironmentRepository` that builds `GET /{application}/{profile}`, so a
fingerprint that disagrees with what a client fetched is a bug in this service, not a stale client. Refresh
means "read again and tell the difference"; `NativeEnvironmentRepository` really re-reads per call (measured:
the repository logs `Adding property source: Config resource 'file [...]'` on every request, and flipping the
source file between two refreshes is what the test does to prove it).

**`keyCount: 0` is two different facts, and this surface refuses to let one number stand for both.** Measured
on a packaged jar whose `search-locations` pointed at a directory that exists but holds no config: `/version`
answered HTTP 200 with `keyCount: 0`, `servedEmpty: true` and **`/actuator/health` said `UP`** — the server's
own health check is blind to serving nothing, and a client would silently fall back to its packaged defaults
while believing the centre answered. `/refresh` against that source answers **503 `empty-source`** and does
not take a baseline, because recording an empty version as the previous one turns the next healthy refresh into
"every key added" — a typo'd location would then generate a stream of false changes in the ledger. Same rule
when the source *raises*: 503 `source-error` with only the exception's short class name (measured:
`FailedToConstructEnvironmentException` for both a malformed `file://C:\…` location and a YAML file with a
duplicated mapping key), no path, no stack, baseline and ledger untouched.

Gated by `NEXUS_CONFIG_ADMIN_TOKEN` (`nexus.config.admin-token`), presented as `X-Nexus-Config-Admin`:
**unset → all three answer 503**, set but wrong → 401. A blank token counts as unset. Unset must not read as
"working", because this server is not behind the gateway (a client has to reach it before it can register).

The ledger is in-process: bounded (`nexus.config.audit.keep`, default 200), reset by a restart, and it never
stores a plaintext secret — keys whose name has a `password` / `token` / `secret` / … *segment* are recorded as
`redacted:<8 hex>` so "it changed" stays answerable without copying the value into a second, unmanaged place.

### Measured live (2026-11-23, packaged jar, port 18892)

`search-locations` at a real directory with the four lab files, `NEXUS_CONFIG_ADMIN_TOKEN` set, no other env:

1. `/version` → `keyCount: 6`, `servedEmpty: false`, digest `54ec9763…`.
2. `/refresh` → `established`, `auditSeq: 1` (a baseline entry with `baseline: true`).
3. source file broken by a duplicated `gateway:` key → `/refresh` → **503 `source-error`**, `auditSeq: null`,
   and the ledger still had one entry: a failed read writes nothing and keeps the previous baseline.
4. file restored → `/refresh` → `unchanged`, digests equal.
5. `rate-per-second: 50` → `999` in the served file → `/refresh` → `changed`,
   `modified: ["nexus.gateway.rate-limit.rate-per-second"]`, `from "50" to "999"`, digest moved
   `54ec9763… → d3a9a22e…`.
6. `/audit` → both entries, newest first, with the key named and its old and new value.

Nothing on this path wrote configuration: step 3 is an editor mistake in the source file, and the surface's job
was only to say what it costs.


## Deliberately not

- **Not a runtime dependency.** Optional import; no client blocks on this server.
- **No authentication and no encryption on the served documents.** Anyone who can reach 8888 can read the
  configuration. It holds no secrets; secrets do not go in these files. The ops surface is the one place that
  *is* gated, because it names keys and change history rather than values.
- **No write API.** Configuration changes are file changes reviewed in git.
- **No service registration.** This server does not join Eureka; clients address it by URL.
- **No client-side propagation.** `@RefreshScope` is still not wired: this surface can tell you that the
  served version moved, but a running client keeps its merged values until restart. An honest limitation, not
  an implied feature — see ADR 0313 for why "push" is the part that needs a broker and a failure story.

