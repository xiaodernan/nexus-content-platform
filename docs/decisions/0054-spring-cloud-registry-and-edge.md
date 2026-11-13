# 0054 — Spring Cloud enters NEXUS as a REGISTRY and an EDGE, not as a rewrite

- **Status:** Accepted
- **Date:** 2026-11-09

## Context

NEXUS's Java side was one service (`services/nexus-api`, ~150 source files, 48 test classes) plus a
second, smaller service (`services/java-domain-service`) that had never been built, tested, or
honestly described — its README still called it "scaffolding-only" while its domain services,
entities, repositories and controllers all existed.

Two facts forced the question:

1. **The services addressed each other by hard-coded URLs.** `nexus-api` listens on 8080 because
   that is what its `application.yml` says. A second instance, a second host, or a moved port is
   invisible to everything except the operator who edits the file.
2. **Nothing stood between a caller and a service.** Every consumer had to know a service's address
   AND the difference between "the service says no" and "the service is not there".

The repository already had the discipline this work had to respect: no fake behaviour (§159), a
DEMO MODE badge wherever a real provider is absent (§160), and a rule that every feature lands with
a runnable check. A microservice story that could not be *run* would have violated all three.

The question was not "should NEXUS use Spring Cloud" — it was "which part of Spring Cloud can be
introduced so that each piece is real, runnable, and proved, without a rewrite".

## Decision

Introduce Spring Cloud in **two services and two pieces**, each independently runnable and
independently tested:

| service | Spring Cloud piece | job |
|---|---|---|
| `services/java-registry` | Eureka **server** (Netflix 4.3.3) | discovery: which instances of a service are alive |
| `services/java-gateway` | **Gateway** (4.3.5) + Resilience4j | the edge: routing, breakers, and the failure shape |

Both use the **Spring Cloud 2025.0.3 BOM**, which is the release train that matches this repo's
Spring Boot 3.5.16 parent. The BOM is imported rather than versions being spelled out, so the
whole train moves as a unit.

Three properties are load-bearing and were measured, not assumed:

- **The registry is off the traffic path.** Clients use it to learn addresses and then call those
  addresses directly, so a registry outage degrades *discovery*, not the data plane.
- **Discovery is optional at runtime.** `NEXUS_EUREKA_ENABLED` defaults to `false`. A service that
  cannot start because an optional dependency is absent is a service whose absence takes the edge
  down with it.
- **The edge never answers on an upstream's behalf.** A route whose upstream is unreachable answers
  **503** with a body that names the upstream — never `200` with an empty body, which a caller
  cannot tell from "there is no such project". This mirrors the rule the artifact page in
  `services/nexus-api` already follows (503 = the service is not running, 404 = nothing is
  published here).

## Options

**A rewrite of `nexus-api` into a Spring Cloud application.** Rejected: it would replace ~150
working files and 48 passing test classes with a port of the same logic, and the repo's rule is one
deep, *verified* increment at a time. A rewrite cannot be verified incrementally.

**Spring Cloud Kubernetes / Config Server / Bus / Stream.** Rejected for now: each adds an
infrastructure dependency (a cluster, a config backend, a broker) that this machine does not run,
and every one of them would be exercised by nothing. They are the natural NEXT additions once a
registry and an edge exist and are used.

**OpenFeign for service-to-service calls.** Not yet: `spring-cloud-openfeign` 4.3.3 is not in the
local Maven repository (only 4.1.1 is), so a Feign client would need a download and would
introduce a second HTTP client stack before the edge and the registry are used by anything.

**Hard-coded URLs with a shared config file.** Rejected as the long-term answer: it is the state
this ADR was written to leave. It stays as the DEFAULT so that a deployment with no registry
behaves exactly as before.

**A shared Maven module for the Java services** (to stop the two copies of `PortAnnouncer`).
Rejected *for now*: introducing a parent aggregator would touch every Java build to remove one
40-line duplication. The duplication is named in both READMEs and the decision to change it belongs
in its own ADR, when a third service makes the cost real.

## Reason

Each piece is small enough to be proved end-to-end and useful on its own:

- The registry's contract is one sentence — *an instance that registers is an instance the registry
  reports* — and it is now a test, not a claim.
- The edge's contract is two sentences — *it forwards, and it does not lie when it cannot* — and
  both are tests against the **shipped** route table.

Neither piece changes the behaviour of any existing service. `nexus-api` is untouched by this ADR;
it does not even gain the Eureka dependency yet (that is the next increment, and it is opt-in).

## Tradeoffs

- **Two more processes to run.** The topology is now three JVMs, not one. The registry and the edge
  are both optional at runtime, so a developer can still run `nexus-api` alone.
- **The Eureka namespace is `eureka.*`, not `spring.cloud.eureka.*`.** This was measured the hard
  way: with the block written under the wrong prefix the client started anyway and dialled a
  registry nobody started, for a reason no log line explained. Both READMEs now name it.
- **No authentication anywhere in the topology.** The registry accepts a registration from anyone
  who can reach the port; the edge has no auth, no rate limit, no TLS. This is a development
  topology and is not a security boundary.
- **The `java-domain-service` is still undescribed and untested.** This ADR does not fix it; it is
  filed as the next item, because a second service that nobody has run is a worse problem than the
  missing Spring Cloud pieces.
