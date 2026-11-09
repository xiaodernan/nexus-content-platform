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

Only the gateway is a client today. `nexus-api` and `java-domain-service` still read their packaged files;
wiring them is a later slice, and this README will not claim them before they are.

## Running

```powershell
java -jar services\nexus-config\target\nexus-config-0.1.0-SNAPSHOT.jar
# port 8888 by default; NEXUS_CONFIG_PORT overrides
```

The gateway opts in per deployment; the client is **off** by default:

```powershell
$env:NEXUS_CONFIG_ENABLED='true'
$env:NEXUS_CONFIG_URL='http://127.0.0.1:8888'
java -jar services\nexus-gateway\target\nexus-gateway-0.1.0-SNAPSHOT.jar
```

`spring.config.import` is `optional:configserver:` on purpose: a config server that is down must not stop the
door, and the packaged `application.yml` remains the offline truth.

## Measured (2026-11-09)

`GET http://127.0.0.1:8888/nexus-gateway/default` answered two property sources
(`classpath:/nexus-config/nexus-gateway.yml`, then `classpath:/nexus-config/application.yml`) with
`nexus.gateway.rate-limit.rate-per-second: 50`. With `NEXUS_CONFIG_ENABLED=true`, the gateway's own startup
line said `gateway rate limit: enabled=true ratePerSecond=50.0 ...` — the local file says 100, so 50 can only
have come from here. Without the flag the same jar starts from its packaged file (100).

## Deliberately not

- **Not a runtime dependency.** Optional import; no client blocks on this server.
- **No authentication and no encryption.** Anyone who can reach 8888 can read the configuration. It holds no
  secrets; secrets do not go in these files.
- **No write API.** Configuration changes are file changes reviewed in git.
- **No service registration.** This server does not join Eureka; clients address it by URL.
- **No dynamic refresh.** `@RefreshScope` is not wired; a value change needs a client restart. An honest
  limitation, not an implied feature.
