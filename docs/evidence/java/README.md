# NEXUS Java · evidence ledger

Where every claim about NEXUS's Java services is proven or explicitly NOT proven — and which
plane proved it. This page is the family's front door; the proofs and the record it names are the
back rooms.

## The five Java deployables (+ PostgreSQL as the data plane)

| deployable | module | what it answers | health door |
|---|---|---|---|
| **nexus-api** | `services/nexus-api` | the studio line's backend — REST, webhooks, the §132 gate, domain reads | `/actuator/health`, `/health` |
| **java-domain-service** | `services/java-domain-service` | the authoritative WRITE path for `projects`/`users` | `/health` |
| **java-gateway** | `services/java-gateway` | the EDGE — Spring Cloud Gateway routing `lb://nexus-api`, its own breaker (`nexusApiCircuitBreaker`) | `/actuator/health` |
| **java-registry** | `services/java-registry` | DISCOVERY — Eureka server, single node on purpose | `/actuator/health` |
| **java-config-server** | `services/java-config-server` | the CONFIG door (ADR 0057) — Spring Cloud Config, native profile, serves `infra/config/` | `/actuator/health` |

The sixth deployable in the topology is **PostgreSQL** itself: the proof copies the real schema
into **throwaway databases inside the repository's own running container** (`nexus-postgres`,
`pg_dump` payloads, ~111 kB) and removes them in §16, every run. Nothing here writes to a
database anybody else owns.

## What each proof claims, and which plane it claimed it on

### `spring-cloud-proof.mjs` — the crown measurement (all 17 sections, all 17 re-earned)

Boots registry → gateway → api → domain → PostgreSQL on **ad-hoc ports** against throwaway
databases, and measures, section by section:

| § | what is proven | the plane |
|---|---|---|
| 1 | all four jars build in ISOLATED COPIES of the services | Maven (offline ▪ the repo's standard) |
| 2 | the registry boots and reports UP | local port |
| 3 | throwaway databases are created from the REAL schema (`pg_dump`) | the repo's container |
| 4 | the domain service boots and registers itself through DISCOVERY | measured, not assumed |
| 5 | nexus-api boots and registers itself the same way | measured |
| 6 | the edge routes `lb://nexus-api` to the live instance | full request path |
| 7 | the WHOLE chain edge → api → domain → PostgreSQL returns the inserted row | the product claim |
| 8 | an id the domain service does not hold answers 404, said so, `failure: null` | ADR 0055's line |
| 9 | both breakers are visible and named as configured (`nexus-domain-service`, `nexusApiCircuitBreaker`) | the runtime's OWN names, read from the running service |
| 10 | all four services answer their own health question — UP about themselves | four doors, four answers |
| 10b | the four CONSUMER doors answer the **Prometheus scrape** — a body carrying `# HELP`/`jvm_`, not just a 200 (v658) | four doors, four scrapes |
| 10c | **ONE trace id**, minted by the caller as a W3C `traceparent`, is required in the correlation segment of the edge, nexus-api AND the domain service — with three DIFFERENT span ids under it (v656) | three logs of one request |
| 11 | with the REGISTRY dead the chain still works, and the duration of that comfort is MEASURED (a fetch interval + its TTL), not promised | §5.1 of ADR 0056 |
| 12 | with the DOMAIN service dead the service-to-service door answers 503, names it, and says WHICH failure (the failure byte the service mints — asserted non-empty, kind printed per run; the deadline is an explicit 5 s decision since `196e624`, 2026-11-11) | measured against a killed container |
| 13 | the breaker OPENS and the refusal is attributed — `not.permitted.calls` counts it, and the answer says `circuit-breaker-open`. The state read asks for the `state=open` gauge series specifically, because `resilience4j.circuitbreaker.state` is ONE GAUGE PER STATE, exactly one of which is 1 at any instant and any untagged read aggregates to 1 forever (measured red-fix 2026-11-10) | tagged-actuator read |
| 14 | with nexus-api dead the edge answers 503 and NAMES its upstream | tagged-actuator + §4 of ADR 0056 |
| 15 | with the EDGE dead the caller gets a CONNECTION ERROR — because there is nothing left to answer, and a 503 would be an invention | honest absence |
| 16 | everything the proof created is gone — databases, processes, build copies | the hygiene contract |

**What this proof is NOT:** it is no longer an exclusion. Since **v653** the row runs on the hosted
runner too: `ci.yml` builds the four modules and pre-pulls `pgvector/pgvector:pg16`, and the proof
establishes its own scratch source there (`tools/ci/proof-set.mjs` carries an EMPTY `EXCLUDED`). On
this machine it runs against the repository's own container instead:

```bash
export NEXUS_PROOF_SOURCE=nexus-postgres NEXUS_PROOF_DB_PORT=55433
"/c/Program Files/nodejs/node.exe" docs/evidence/java/spring-cloud-proof.mjs
```

The system Node 24 is not a preference: the bundled Node 22 on this host dies inside `fs.cpSync`
(§1 copies four service trees) with exit code 127 and no stack — see `docs/ENVIRONMENT.md`. And the
proof disables the config door for every service it starts, so a config server on the developer's
machine cannot change what it measures (ADR 0057, amended in v658).

### The service-test suites — the modules' own doors

| module | command | this checkout read |
|---|---|---|
| nexus-api | `mvn -o -B test` | **932 PASS** (incl. `DomainCircuitBreakerConfigTest`, `DomainFailureTest` 12) |
| java-domain-service | `mvn -o -B test` | **39 PASS** |
| java-gateway | `mvn -o -B test` | **22 PASS** (incl. `DegradedRateLimitTest` 2 and `ResilientRateLimiterTest` 7 from v657's Redis-absent case) |
| java-registry | `mvn -o -B test` | **2 PASS** |
| java-config-server | `mvn -o -B test` | **5 PASS** (the scrape leg is one of them) |

These run on the hosted runner only for `services/java-config-server` (the one module ci.yml and
`main-line.yml` now both grade — §15 of `verify:ci-wiring` refuses a pom the commit owns that no
step tests); the others run where PostgreSQL and a warm Maven exist.

### The gates the census tracks

`verify:ci-wiring` (§1–§15, two workflow files), `verify:arms` (64/64 at the latest re-stamp — the
receipt on disk is older than this section's ref; see the honest bounds), `verify:arms-freshness`
(9/9 fixture arms), `verify:evidence-census` (the closure re-derives every run — no module count is
restated here, because at `dd14c10` the derived population is 119 and any hand-typed number rots),
`verify:table-recount`, `verify:record-encoding`. The M9 proofs carry `planeBoundRuleIsLive()` at
the top of every build so a blinded rule reddens the row rather than clearing it.

Two census rows are new since this page's previous state: `verify:gateway-tests` (the module's own
22 tests, reached-direct, wired by the parallel lane at `01e2e20` and linted clean at `dd14c10`) and
`verify:db-index` (`EXPLAIN` of the four soft-delete queries against a 2000-row mirror, wired by the
parallel lane at `7191e7e`; the plan is asserted as `Index Scan`s against this repository's partial
indexes — its own commit message names the plane). The first row is this lane's companion; this
README records both and claims neither beyond what its run prints.

**The arms-receipt honesty (2026-11-12, updated):** `docs/evidence/ci/arms-receipt.json` was re-armed
by the v665/v664 wiring lane at ref `5485c62` — the re-arm ran whole in the pinned worktree (64/64 arms,
planes self-removed) and the receipt now stamps **119 rows**. Both byte-subject and integrity checks
pass at HEAD: `verify:arms-freshness` exit 0 (9/9 fixture arms) with that receipt, measured here on this
host. Studio CI for the full proofs battery at that ref and after: **the record-encoding gate reddened
for ONE line in the parallel lane's `0095` ADR (line 10, a registered CJK-latin boundary render the
flank rule could not exempt)** — fixed at `932d07f`; the re-arm's arms-freshness verdict itself passed
(the earlier red reads here: residue named 0, 118/119).

A correction recorded honestly for the record: the earlier claim that the hosted runner cannot write the
receipt remains true, and the re-arm was owed until this lane landed it. Both branches carry it. The
gate stays honest; this paragraph is not retired, it is satisfied.

## Honest bounds (none of these are claims this ledger pretends to support)

- **A docker-compose row for the six Java services exists but is config-validated, not executed.**
  `infra/docker-compose.yml` gained a `java` profile on 2026-11-10: five Dockerfiles
  (`services/<name>/Dockerfile`, `eclipse-temurin:25-jre`), a tmpfs throwaway `nexus-java-pg`
  (schema comes from this repo's own `npm run db:migrate`), and port-accept healthchecks for the six
  deployables. `docker compose --profile java config --quiet` exits 0 — that is the ENTIRE claim.
  The author's host cannot start NEW containers right now (`up -d` hung at
  `Container nexus-java-pg Starting` for over an hour; a `Created`-but-unstartable corpse named
  `nexus-java-pg` was left behind; force-remove it when the engine allows). The smoke script exists
  (`scripts/smoke-java-profile.mts`) and asserts the six doors plus the edge chain answering 404 for
  an unknown id; it has never run on this box or in CI, so until it prints PASS, the paragraph
  stays exactly this honest.
- **Log correlation, not trace storage.** Since v656 (ADR 0059) one caller-minted trace id is
  propagated with W3C `traceparent` across edge → api → Feign → domain and PRINTED at every hop,
  and §10c requires that exact id in all three logs. What does NOT exist: a collector, an exporter,
  any span retention, per-span latency percentiles, or a service map. Spans are created, given ids,
  put on the wire, printed — and then they end with the process. `grep <traceId>` over three logs is
  the whole capability, and it is the one thing claimed.
- **The edge rate limiter exists, over Redis, and degrades when it must (v657, landed 2026-11-10/11).**
  `RequestRateLimiter` (`redis-rate-limiter`, burst 100 / refill 50 by default, 429 on overflow) guards
  `lb://nexus-api`. The counter IS the deployment's Redis, not a shared library file. With no reachable
  counter, the edge **serves the request, labels it** (`X-Nexus-Edge-Degraded: unavailable`) and counts it
  per request in the `nexus.edge.rate_limit.degraded` metric — RFC 9110 §15.5.29's 429 is a claim about
  the caller, and nothing here counted anything. Proven by `DegradedRateLimitTest` (real jar, 6399-as-no-
  Redis-port) in `verify:gateway-tests`, the row that now grades this module from the census. The counter's
  reachability stays visible in metric and on the wire; the edge's own `/actuator/health` does NOT depend on
  it (v658: `management.health.redis.enabled` default false, overridable).
- **The scrape is published; nothing scrapes it.** All five deployables carry
  `micrometer-registry-prometheus` and answer `/actuator/prometheus` (v658: §10b for the four
  consumers, `ConfigServerTest` for the config door, and a static allowlist gate for the
  configuration). There is no Prometheus server, no scrape config, no retention and no alerting in
  this repository — and none is claimed.
- **The runner-bound red rows (`verify:liveness` and `verify:health`) are resolved, and the resolution is
  recorded.** The readiness probe was `pg_isready`, which answered 0 while `psql` still saw
  `FATAL: the database system is starting up`; both rows — and `verify:spring-cloud` beside them — reddened
  together at 10:50 UTC on 2026-11-11 (ADR 0056's failure-names-itself rule one layer down, in the probe).
  The probes now run real `psql -c 'SELECT 1' ON_ERROR_STOP=1` and gate on code 0; `verify:spring-cloud`
  afterwards required the §10 per-probe log split to name which door reddened (the edge's auto-registered
  Redis health indicator flipped `/actuator/health` to 503 — `decbdb8` made the door answer for the edge).
  Hosted CI at `decbdb8` then: both branches, `verify:spring-cloud ... OK 108.3s / 122.8s`, `117/117`, residue 0.
  Hosted CI at `4c3bcac` (the door-kill witness fix): both branches SUCCESS again. This bullet is kept as the
  record of WHY the probes look like this; it is no longer a promise about today.
- **Eureka on a single node** — no peer replication story is implemented or claimed;
  `register-with-eureka: false` on the registry.
- **Native profile for the config server** — Git-backed config, encryption at rest, `{cipher}`
  values: none implemented, none claimed (ADR 0057 states it).

## Pointers

- ADR 0054 — Spring Cloud enters NEXUS as a REGISTRY and an EDGE, not a rewrite
- ADR 0055 — a service is reached BY NAME, and its failure is a FACT
- ADR 0056 — a failure must NAME itself (kinds, refusal attribution, the breaker's own metric)
- ADR 0057 — configuration enters NEXUS as ONE door, and it is optional at boot
- ADR 0058 — Spring Cloud in NEXUS: what runs, what only parses, and what is deliberately absent
- ADR 0061 — when the Discover feed cache is correct, and when it breaks
- ADR 0063 — Redis in NEXUS: what it earns, what it costs, when it lies
- ADR 0064 — Messaging in NEXUS, honestly inventoried: SSE-only delivery, Redis pub-sub as the
  cross-instance carrier, and the things it is NOT
- ADR 0065 — the routes actuator is a dead door on the WebFlux edge (verified three ways);
  NEXUS proves the live route table instead
- `docs/CURRENT-STATE.md` — the dated addendum log (cont. 5 records the config door)
- `docs/evidence/ci/README.md` — the census re-stamp (130 modules, helper #5, 2026-11-10)
- `infra/config/` — what the config door serves: the shared surface + one overlay per app,
  `{spring.application.name}.yml` (not the Maven module name — that contract was MEASURED)
