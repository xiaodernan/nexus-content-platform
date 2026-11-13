# 0065 — The routes actuator is a door drawn on a wall in this WebFlux edge (verified, not assumed), and what NEXUS does instead

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

The edge (`services/java-gateway`, Spring Cloud Gateway 4.3.5 on Boot 3.5.16, WebFlux-only —
Spring MVC is deliberately absent) ships the routes actuator beans in `spring-cloud-gateway-server-4.3.5.jar`:
`GatewayControllerEndpoint` and `GatewayLegacyControllerEndpoint`, both `@RestControllerEndpoint(id = "gateway")`,
`enableByDefault = false`. The exposure line in `application.yml` gates `/actuator/health`, `info`, `metrics`,
`prometheus`. Adding `gateway` to that list SHOULD have opened
`GET /actuator/gateway/routes` as the operator's answer to "which table is this edge running?"

## What was measured (this deployment, this jar, three configurations)

All three runs are the same rebuilt jar with only actuator flags varied. Every time:

1. Default configuration (`verbose.enabled` unset — the bean's own `matchIfMissing=true` case):
   `/actuator` discovery lists exactly `health`, `info`, `metrics`, `prometheus` — `gateway` is absent;
   `/actuator/gateway/routes` returns **404**.
2. `--spring.cloud.gateway.server.webflux.actuator.verbose.enabled=true`: identical result —
   "Exposing 4 endpoints beneath base path '/actuator'", `/actuator/gateway/routes` **404**.
3. `--spring.cloud.gateway.server.webflux.actuator.verbose.enabled=false`: identical result,
   `/actuator/gateway/routes` **404**.

Bytecode archaeology explains it, and the measurements are the load-bearing evidence:

- Both beans are `@RestControllerEndpoint` — the Spring **MVC** annotation family. Spring Boot's reactive
  stack maps actuator through `WebFluxEndpointHandlerMapping`/`OperationHandler`; these controller-endpoints
  never reach it. The discovery page is the honest refutation: an exposure-list entry for an endpoint that
  does not exist enables nothing, silently.
- The beans are additionally gated by `@ConditionalOnProperty("spring.cloud.gateway.server.webflux.actuator.verbose.enabled",
  matchIfMissing = true)` (new) and `@Conditional(OnVerboseDisabledCondition)` (legacy) plus
  `@ConditionalOnAvailableEndpoint`, and neither alternative produces a mapped route on the reactive handler
  mapping in this build.

## Decision

Do not list `gateway` in `management.endpoints.web.exposure.include`. A 404 that tells the operator
nothing is not an operator door. This ADR is the record of that probe so the next person does not spend
an afternoon re-deriving it.

NEXUS answers the "what table is it running with?" question the way that cannot drift:

1. **The proof boots the real jar and routes a real request through it** (`docs/evidence/java/spring-cloud-proof.mjs` §6 —
   `lb://nexus-api` resolved to the live, Eureka-registered, self-naming service). The route table is
   exercised, not inspected.
2. **The configuration is the route table.** The edge holds no runtime writer of `RouteDefinition`; there is
   no path in-tree that mutates the table at runtime, so "configured" and "running" cannot diverge silently
   beyond a code change — and code changes are reviewed.
3. **If a second route consumer appears** (a mutation API, a tenant-supplied route table, or a Spring Cloud
   release that mounts the routes endpoint on the reactive stack), revisit: expose `gateway` again and pin
   it with a WebTestClient assertion in `GatewayActuatorExposureTests`. The trigger is named, not vague.

## Consequences

- The edge's operator surface stays exactly four endpoints, all proven; nothing is dark, nothing is
  pretended.
- The lesson, one more time in a new place: **the existence of a class on the classpath is not the existence
  of a door.** Verification is the door.
