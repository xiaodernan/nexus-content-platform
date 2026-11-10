# 0057 — Configuration enters NEXUS as ONE door, and it is optional at boot

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

ADR 0054 added a **registry** (who is alive) and an **edge** (who stands in front of whom). ADR
0055 made a service-to-service call typed and honest about absence. ADR 0056 made every failure
name its kind. What the services still had, one by one, was the rest of their configuration:
four copies of the same `management.endpoints.web.exposure.include`, four copies of the same
root log level, and — after ADR 0056 — the same metrics door exposed independently in each
`application.yml`, agreed by hand and by nothing else.

Two facts forced the question this ADR settles:

1. **A shared value had no single home.** Changing the platform's log discipline meant editing
   four files that nobody could read together, and the drift would be invisible until the day
   somebody diffed them.
2. **An operator knob that needed a rebuild was not a knob.** "Raise the api's log line to debug
   for the next ten minutes" should not mean "commit, build, deploy" on a machine that has the
   service already running.

## Decision

### 1. One config server, serving YAML, nothing else

`services/java-config-server` — a Spring Cloud Config **server** on the `native` profile,
serving the repository's own `infra/config/` directory. The resolution order is Spring Cloud's
own: `{application}-{profile}.yml`, then `{application}.yml`, then `application-{profile}.yml`,
then `application.yml`.

- `infra/config/application.yml` — what EVERY Java service gets: the `health,info,metrics`
  exposure, the root log level at `warn`, and the `nexus.config-server-served=true` marker.
- `infra/config/{spring.application.name}.yml` — what exactly one service gets on top of the
  shared file. Today: the service's own package at `info`.

**The file name is `{spring.application.name}`, not the module name.** This was measured, not
assumed: the first draft named the files after the Maven modules (`java-gateway.yml`), the
server served the shared file and 404'd the overlay, and the test that asked the registry for
its own key failed with "aServiceAskingForAnotherServicesKeyDoesNotGetIt got: shared only".
Renamed to `nexus-gateway.yml`, `nexus-registry.yml`, `nexus-domain-service.yml`,
`nexus-api.yml` — the name the application announces itself as, and the test passes.

### 2. Every service imports the door OPTIONALLY

Each Java service carries

```yaml
spring:
  config:
    import: "optional:configserver:${NEXUS_CONFIG_SERVER_URL:http://127.0.0.1:8888}"
```

A deployment **without** a config door boots exactly as it did before this ADR: the local
`application.yml` wins whatever the door has to say, and absence is not an error. The import is
not a convenience for development — it is the difference between "the config server is part of
the contract" and "the config server is part of the availability story", and only the first is
true here. All four service suites pass on a machine with no config server listening
(931 / 13 / 39 / 2).

### 3. No secrets, ever

The config server serves configuration, not credentials. `infra/config/` carries the metrics
exposure and the log line. The rule for a future secret: it goes in the environment, not in
`infra/config/`, and if it fits neither, it does not go in the config server.

### 4. The 2025.0.3 train does not have Spring Cloud Config's starters — measured

Spring Boot 3.5.16 uses Spring Cloud 2025.0.3, whose `spring-cloud-dependencies` BOM manages
Spring Cloud Config as a **maintenance module**: `spring-cloud-config-dependencies:4.3.4`,
which manages `spring-cloud-config-client` and `spring-cloud-config-server` — and NOT
`spring-cloud-starter-config-client` / `spring-cloud-starter-config-server`. A build that named
the starter artifacts failed with "dependencies.dependency.version missing", which is the BOM
saying, in Maven's words, that they do not exist. The dependency names used are the managed ones:

- clients: `spring-cloud-starter-config` (4.3.4; pulls `spring-cloud-config-client:4.3.4`)
- the server: `spring-cloud-config-server` (4.3.4; core module, in the same BOM)

### 5. The breaker's state metric is THREE gauges — and the proof now reads the one it asks about

ADR 0056 recorded `resilience4j.circuitbreaker.state` as "the breaker's state as a gauge". That is
not quite true, and the difference cost a red proof run. The tagged publisher registers one gauge
per state — `closed`, `open`, `half_open` — tagged `state=<state>`, value 1 in that state and 0
otherwise (`io.github.resilience4j.micrometer.tagged.AbstractCircuitBreakerMetrics`, sources jar,
read with the same discipline as ADR 0056 read Feign's). Exactly one is 1 at any instant, so:

- `?tag=name:nexus-domain-service` — the untagged-by-state aggregate — is **constantly 1**. A
  proof that asserted "the numeric changed once the breaker opened" asserted something physically
  impossible and reddened on it.
- `?tag=name:nexus-domain-service&tag=state:open` — the one series this question is about — is
  1 iff OPEN, 0 otherwise, and is what the proof asserts (§13).

The proof also reads the `closed` series before the domain service dies (§9) and requires it to
be 1 — a breaker that started OPEN would refuse a call that should have gone through, and nothing
in the four-service chain may start a broken component silently.

## Options

**Keep the four YAMLs, add one for the api.** Rejected: the status quo, spread over four files
that drift by impossibility-of-finding rather than by intention.

**ConfigMap/Docker Compose environment injection instead of a config server.** Rejected: the
compose file owns the **runtime** topology; a config server owns **what each service says about
itself**, independent of how it is started. The two authorities should not be conflated — and
this repo's `infra/docker-compose.yml` is explicitly not the topology the proof runs (it is five
services on ad-hoc ports).

**Drop Spring Cloud Config for a shared properties jar.** Rejected: a jar couples a config change
to a rebuild, which is the thing being fixed — "an operator knob that needed a rebuild was not
a knob."

**Config server with a Git backend, serving from the repository.** Rejected for now: a Git
backend is a real choice with a real operational cost (credentials, clone agents, push latency,
key rotation). The native profile serves the same YAMLs from disk with zero infrastructure, and a
Git backend changes nothing about the resolution order a service imports.

**Block boot until the door answers (mandatory import).** Rejected: it makes the config server
part of the availability story. A config server that dies at 03:00 must not take four healthy
services with it; the door is read once at boot and then irrelevant.

## Reason

- The shared surface is said **once**; the service-own surface is said **next to it**, and nobody
  has to diff four files to know whether the platform agrees with itself.
- The optionality is measured, not promised: all four suites pass with no config server
  listening on this machine.
- A service-addressed metric question is now answerable at boot: `nexus.config-server-served=true`
  is served to every service and visible in `GET /env` — configuration that documents itself
  without control flow anywhere.
- The metric reading that ADR 0056's §5 implied but did not implement is now implemented: the
  proof reads the **exact gauge series** it asserts on, and the sentence in ADR 0056 stands
  corrected here rather than patched over.

## Tradeoffs

- **Two moving parts where there was one file.** The config server is a sixth deployable; it
  must be started, stopped, and (in development) tolerated when absent. That is the cost of
  saying "the shared things once".
- **A native-profile server serves exactly what is on disk.** A change to `infra/config/` is
  live at the next service start, not at push time — which is the feature, and also means the
  repository must keep the directory honest (it is small and reviewable on purpose).
- **`optional:` means a service may boot with configuration nobody intended.** The env-only
  override discipline (`NEXUS_CONFIG_SERVER_URL`, `NEXUS_CONFIG_SEARCH`) keeps that honest, and
  `nexus.config-server-served` in `/env` is the one-line check when somebody suspects the door
  was bypassed.
- **No encryption, no HA, no Git.** All deliberate, all stated, all replaceable by the next ADR
  when a deployment needs any of them.
