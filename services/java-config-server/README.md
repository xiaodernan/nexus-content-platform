# NEXUS Configuration Service

The **configuration server** for NEXUS's Java services — Spring Cloud **Config Server** (native profile).

It answers one question for the platform: *what should THIS service say about itself on its next
start?* — the metrics/health surface every service exposes, the log level of the service's own
package, and nothing else. It holds no business data, it holds no secrets, and no service needs it
to boot.

```
GET /application/default         what EVERY Java service is told (shared surface)
GET /nexus-api/default           what nexus-api is additionally told
GET /nexus-domain-service/default  (likewise for the domain service)
GET /nexus-gateway/default        (likewise for the edge)
GET /nexus-registry/default       (likewise for the registry)
GET /actuator/health              is the config door itself answering
```

## Where it sits

```
               ┌──────────────────────┐
   service ───▶│  nexus-config-server │  configuration (NOT the traffic path, NOT the data path)
   import      │  :8888               │
               └──────────────────────┘
                         ▲ read once, at boot
    ┌───────────┬─────────┼──────────┐
    │           │         │          │
 nexus-api  nexus-domain  nexus-   nexus-
            -service      gateway  registry
```

It is deliberately **off the traffic path**. A service imports it once at startup; after boot the
config door may die and no request is affected. An outage of the config server therefore degrades
*configuration changes* — a restart without a new value — not any runtime behaviour.

## Why it exists

Before this service, "which management endpoints does this service expose?" was answered by a
hand-editing of four YAML files, one per service, that nobody could read together. A config server
says the shared things **once** (`infra/config/application.yml`) and the service-own things **beside
it** (`infra/config/{spring.application.name}.yml`), and the resolution order is Spring Cloud's own:

```
{application}-{profile}.yml  →  {application}.yml  →  application-{profile}.yml  →  application.yml
```

## Tech stack

- Java 25, Spring Boot 3.5.16, Maven
- Spring Cloud 2025.0.3 (`spring-cloud-dependencies` BOM) — the release train matching Boot 3.5.x
- Spring Cloud Config **4.3.4** — a maintenance-mode module of the train. The BOM manages the core
  `spring-cloud-config-server` module (via `spring-cloud-config-dependencies`); there is no
  `spring-cloud-starter-config-server` in this train, and the client side uses the managed
  `spring-cloud-starter-config` (which pulls `spring-cloud-config-client`). Measured 2026-11-10:
  `spring-cloud-dependencies:2025.0.3` → `spring-cloud-config-dependencies:4.3.4` manages
  `spring-cloud-config-server` and `spring-cloud-config-client` only.
- Actuator for the health question

## Verified

`mvn -B test` → **4/4 PASS**, BUILD SUCCESS. Each case resolves the real YAMLs in `infra/config/`:

| case | what it proves |
|---|---|
| `applicationDefaultServesTheSharedFourServiceConfig` | the shared file is served and carries the metrics surface |
| `nexusApiDefaultServesTheServiceOwnKey` | the service overlay IS layered in for its own application |
| `aServiceAskingForAnotherServicesKeyDoesNotGetIt` | isolation: the registry's view does not contain the api's key |
| `actuatorHealthAnswersTheDoorIsAnswering` | `/actuator/health` says `UP` |

Two facts measured on the way here, kept for the next person who touches this:

1. The native profile serves `infra/config/` by **`spring.application.name`**, which is why the
   service-specific files are `nexus-api.yml`, `nexus-gateway.yml`, `nexus-registry.yml`,
   `nexus-domain-service.yml` — the first draft named them after the *modules* (`java-gateway.yml`),
   and the fourth test above failed with the shared file only. The file name is the contract.
2. A service whose `application.yml` imports
   `optional:configserver:http://127.0.0.1:8888` MUST boot with the door **absent** — all four
   services' test suites pass with no config server running on this machine. If the import were not
   optional, every service would hang at boot waiting for a door that had not been started yet.

The four services still pass their suites with the client on the classpath:

| service | suite |
|---|---|
| nexus-api | 931 PASS |
| java-gateway | 13 PASS |
| java-domain-service | 39 PASS |
| java-registry | 2 PASS |

## Honest bounds

- **Native profile, not Git-backed.** The YAMLs live in this repository (`infra/config/`), resolved
  from disk. A Git backend is a real choice with a real operational cost (credentials, clone agents,
  push latency); it is NOT implemented and NOT claimed.
- **No secrets.** The config server serves the logging line and the metrics exposure — nothing else.
  A secret that lived in `infra/config/` would be readable by every clone of this repository; if a
  secret is ever needed it goes in the environment, never in the config server.
- **No encryption.** `{cipher}…` values are not implemented; the config server cannot serve what it
  cannot understand, and this one understands YAML.
- **The door is OPTIONAL everywhere.** Every service imports it with
  `optional:configserver:${NEXUS_CONFIG_SERVER_URL:http://127.0.0.1:8888}` — a deployment without a
  config door boots with its local `application.yml` exactly as before this service existed. The
  option is a feature, not a convenience.
- **Not in `infra/docker-compose.yml`.** The Java topology is the proof's to run, on ad-hoc ports;
  this service plugs into the same shape (see `docs/evidence/java/spring-cloud-proof.mjs`).
- **Single node.** No HA story is claimed or implemented. A development topology with one door.

## Configuration

| variable | default | meaning |
|---|---|---|
| `NEXUS_CONFIG_SERVER_PORT` | `8888` | the port this service binds |
| `NEXUS_CONFIG_SEARCH` | `file:../../infra/config/` | where the native profile reads the YAMLs from |
| `NEXUS_CONFIG_SERVER_URL` | `http://127.0.0.1:8888` | the door each service's `spring.config.import` points at |

## Running it

```bash
mvn -B spring-boot:run                       # http://127.0.0.1:8888
curl http://127.0.0.1:8888/nexus-api/default
```
