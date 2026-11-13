# NEXUS Service Registry

The **discovery server** for NEXUS's Java services — Spring Cloud Netflix **Eureka server**.

It answers one question for the platform: *which instances of a named service are alive right now*.
Everything else about those services is their own business and is not this registry's concern.

```
POST /eureka/apps/{appId}      register an instance
GET  /eureka/apps               what the registry currently holds
GET  /actuator/health           is the registry itself answering
```

## Where it sits

```
              ┌──────────────────────┐
   client ───▶│  nexus-registry      │  discovery (NOT the traffic path)
              │  :8761               │
              └──────────────────────┘
                        ▲ registers
              ┌─────────┴─────────┐
              │  nexus-api        │
              │  nexus-gateway    │
              └───────────────────┘
```

The registry is deliberately **off the traffic path**. Clients use it to learn addresses and then
call those addresses directly. A registry outage therefore degrades *discovery* — a client falls back
to its configured addresses — and not the data plane.

## Why it exists

Before this service, the Java services addressed each other by hard-coded URLs. That is fine for one
service and wrong for a platform: a second instance of `nexus-api` was invisible to everything but
the operator who typed the port. Discovery is the piece that turns "a list of URLs" into "a set of
services".

## Tech stack

- Java 25, Spring Boot 3.5.16, Maven
- Spring Cloud 2025.0.3 (`spring-cloud-dependencies` BOM) — the release train that matches Boot 3.5.x
- Spring Cloud Netflix Eureka server 4.3.3
- Actuator for the health question

## Verified

`mvn -o -B test` → **2/2 PASS**, BUILD SUCCESS:

| case | what it proves |
|---|---|
| `anInstanceThatRegistersIsAnInstanceTheRegistryReports` | a registration is **stored and reported back** over Eureka's own REST API — the registry starts, stores nothing, and this test still fails |
| `theRegistryAnswersItsOwnHealthQuestion` | `/actuator/health` answers `UP` |

The first case encodes its payload with **Eureka's own codec** (`EurekaJsonJacksonCodec`) rather
than a hand-written JSON string. That is not a style preference: `InstanceInfo` carries an abstract
`DataCenterInfo`, so a hand-written payload has to guess the server's type-info shape. The first
draft of this test did exactly that and the registry answered
`400 {"error":"cannot parse request body"}` — a fact the test now names in its own comment.

## Honest bounds

- **Single node.** `register-with-eureka` and `fetch-registry` are both `false`: a registry with no
  peers must not spend its startup looking for them. Peer replication is NOT implemented and NOT
  claimed.
- **Self-preservation is OFF.** It is a real production setting; for a single-node development
  registry it hides the fact an operator needs ("nothing is renewing"), so it is disabled here and
  the fact is stated rather than implied by a dashboard.
- **No authentication.** Anyone who can reach the port can register an instance. The port belongs to
  a development topology, not to a network.
- **The read cache refreshes every 1 s** (the default is 30 s) so a caller can read back its own
  registration promptly.
- **It answers no business question.** It holds no project, no user, no publication.

## Configuration

| variable | default | meaning |
|---|---|---|
| `NEXUS_REGISTRY_PORT` | `8761` | the port this service binds |
| `NEXUS_REGISTRY_HOST` | `localhost` | the address other services are told to reach it at |
| `NEXUS_PORT_FILE` | *(empty)* | when set, the bound port is written here (see `PortAnnouncer`) |

## Running it

```bash
mvn -o -B spring-boot:run                    # http://127.0.0.1:8761
mvn -o -B spring-boot:run -Dspring-boot.run.arguments=--server.port=0
```

The Eureka dashboard is at `http://127.0.0.1:8761/`.
