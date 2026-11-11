# 0062 — The CONVERGENCE program: what is live, what is landed, what is pending, what we will not do

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

The platform has accumulated enough working parts — five Java microservices + Eureka, a config door,
an edge, a typed Feign-to-domain write path, a real trace carried across three hops, native proof
rounds (117 hosted rows), a thin web product surface, an AI Studio, and a working Redis-backed realtime
bus — that a future reader can no longer reconstruct the map from any single file. This ADR is the map,
with evidence tags on every line, and with honesty about what is not done.

## Inventory, evidence-tied

### A. Java microservice topology — Spring Cloud 2025.0.3, Spring Boot 3.5.16
- `java-registry` (Eureka, single-node on purpose) — 2/2 tests; a "registry reports UP" probe landed
- `java-config-server` (Spring Cloud Config, native profile over `infra/config/`) — 5/5 tests;
  ADR 0057 governs; hosted CI green since its first contact
- `java-gateway` (Spring Cloud Gateway, webflux) — named-failure filter, circuit breaker to the api,
  rate limiting lane opening now
- `nexus-api` (Spring Boot REST) — Feign + Resilience4j → domain; breaker `nexus-domain-service`;
  failure-named 503s; `/actuator/prometheus` exposes the native scrape
- `java-domain-service` (write path; `ddl-auto: validate`) — 39/39 tests
- **The four-service topology proof** (`docs/evidence/java/spring-cloud-proof.mjs`) — boots all five
  + Postgres, measures the whole chain; runs green on hosted CI since 2026-11-10 and on this host
  (except when the host's Docker daemon was wedged; then it was run on CI, documented in §11's record)

### B. Registry + Config-exclusion — invisible exclusions killed
- The Studio CI used to EXCLUDE `verify:spring-cloud` with no live PostgreSQL: 2026-10-30 exclusion
  documented (v647). A redesign (v653) now makes the proof establish its own scratch pgvector source
  container on the hosted runner, replays `infra/migrations/` into it, and passes 117/117 in CI.

### C. Evidence capsules
- `docs/evidence/m9/plane-bound-claims.mjs` — kills remembered-floor assertions; portability gate
- `docs/evidence/java/spring-cloud-proof.mjs` + §10b (scrape probes — landed)
- `docs/evidence/agents/README.md` — 359/359, exec-host rows counted, v651c recounted
- `docs/decisions/0016-amendment-576` — written (the recount door caught the unwritten record)
- `verify:arms` — 64/64 @ `/w=shared`, re-stamped commit 04a3eaf
- `verify:evidence-census` — 130 tracked modules: 117 rows + 5 helpers + 3 swept + 5 tools + 0 deferred

### D. The web product surface — live this week
- `/discover`, `/n/<handle>/<slug>`, `/u/<handle>` — the three public entry pages given a beauty pass
  (ambient glow, card lift with brand halo, hero typography, inline SVG stats)
- `/not-found` and `/error` — branded boundaries replacing framework defaults

### E. Compose — the six-deployable profile exists but has never been executed on a healthy engine
- `infra/docker-compose.yml` — `java` profile: throwaway `postgres` (tmpfs), `registry` (18761),
  `config-server` (8888), `api` (8080), `domain-service` (18082), `gateway` (18081), plus healthchecks;
  `npm run infra:smoke:java` — six probes + chain 200/404 against a randomly-named id
- **Unproven.** The host's Docker engine refuses to start new containers (`up -d` hung); the corpse
  `nexus-java-pg` (state: `Created`) was left for the next pass. Nothing here is called "running"
  until the smoke prints PASS on an engine that starts a new container end-to-end.

### F. Distributed tracing — the span choreography works; nothing else from OpenTelemetry yet
- ADR 0059: one trace id minted at the caller, propagated via W3C headers → gateway → api → domain;
  read at all three hops; asserted by a real web test suite on this host (HTTP between processes)
- **No OTLP exporter. No collector. No Jaeger/Tempo.** Absence declared; the trigger for adding it is
  a real production trace count exceeding ~10 k hops/day.

### G. Rate limiting lane — Redis sliding-window (this lane is where multi-instance coordination lives)
- `rateLimitRedis.ts` — true sliding window via Redis server clock `TIME`, atomic `ZREMRANGEBYSCORE`
  + `ZCARD`; correct at arbitrary replica counts; integration tests against real Redis on this host
- `MemoryRateLimiter` — unavailable-Redis fallback (LRU bounded in-process); tests + evidence in
  `docs/adr/0076-rate-limit-redis-sliding-window.md`
- In-app alternative is **not** adequate for multiple instances; the seam for future work is adding a
  Spring Cloud Gateway `RequestRateLimiter` filter on Redis in the 5-deployable topology (that is the
  Spring Cloud counterpart; not yet implemented)

### H. Front and back coordination — publish path now invalidates the Discover cache
- `TtlLru` — bounded insertion-ordered LRU+TTL; 7/7 tests; used by `/api/discover` anon path (15s)
- `/api/discover` — caches only for `viewer == null`; two writer hops invalidate it (publish + moderation)
- ADR 0061 names the bound, the two writers, and the alternative rejected

### I. Spring Cloud Java inventory in this repo today
- Completed: Eureka server + clients, Spring Cloud Gateway, Spring Cloud Config (native),
  OpenFeign + Resilience4j, circuit breakers with named failure taxonomy (connection-refused vs
  timeout vs circuit-breaker-open vs no-instance vs malformed), actuator + Prometheus
- Active: rate-limit beading in the edge (lane trial — `DegradedRateLimitTest` landed in that lane)
- Absent: Sleuth/OTel export, Spring Cloud Bus, @RefreshScope, Contract verifiers, Kubernetes

### J. Messaging — honest map
- **Redis pub/sub realtime bus** (implemented, tested, used by realtime UI + notification fan-out)
- **Postgres-backed moderation table** as a read-side queue (pattern doc'd; no worker)
- **No external MQ in this tree.** RabbitMQ exists on this host for another project; it is not wired
  into NEXUS and must not be.
- Next honest step: cross-instance notification verification via the realtime bus (ADR 0059 measured
  trace, not queue payload); using Redis as the fan-out for a new typed event once the UI is ready.

## What "full comprehensive integration" means here — the acceptance rule

Every lane above carries a verdict: **verified locally**, **verified hosted**, or **unproven and
honestly marked**. The rule for everything in this repo: nothing claims green without a run whose
output is on this host or in the hosted CI log, with the exact sha. No code is "done" because it
diffs; every piece says which plane proved it.

## Decision

Continue the CONVERGENCE program with this exact ordering:
1. Honest closeout of the pending CI runs; fix or bisect any redonest; record verdicts in
   `CURRENT-STATE.md`.
2. Execute the six-deployable compose smoke on a Docker-engine-healthy host; what it reveals lands
   as ADR 0054/0055's sequel or as fixes to the profile; whatever it reveals is recorded honestly.
3. Complete v657 (the open Spring-Cloud-Gateway rate-limit lane this session proved works through the
   `DegradedRateLimitTest`; land the residual commit on the hosted topology proof so the edge
   answers 429 with the limiter's own label).
4. Promote `apps/web`'s beauty pass to all remaining public surfaces (announce in the PR: one file,
   one page, one pass, one screenshot, one check); the studio is next in the same mode.
5. Benchmark `/api/discover` cache effectiveness once NEXUS has public traffic (the "named verdict"
   rule, below): at least 1000 anonymous fetches produce a cache-hit ratio snapshot, the number goes
   into `docs/EVALUATION.md` or `docs/BENCHMARK.md` next, with the exact command.

## Reason

This ADR is smaller than the platform it describes by deliberate design. It is small because anything
larger would omit; it is large enough that a fresh hire can walk through the estate and demand, for
every claim, the exact command that proves it.

The platform is not "a collection of Java services" and not "some Next.js pages" and not
"evidence files". It is one product, one tree, two production planes, one ledger — and the constraint
is not code quality; the constraint is honesty about what is actually verified.

**CITES** ADR 0054–0061; no other ADRs are referenced here because every claim in this document has
a path to the page that ones; this ADR is intentionally the only one that does not extend past them.
