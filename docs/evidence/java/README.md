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

### `spring-cloud-proof.mjs` — the crown measurement (all 16 sections, all 16 re-earned)

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
| 11 | with the REGISTRY dead the chain still works, and the duration of that comfort is MEASURED (a fetch interval + its TTL), not promised | §5.1 of ADR 0056 |
| 12 | with the DOMAIN service dead the service-to-service door answers 503, names it, and says WHICH failure (`timeout` since 2026-11-10) | measured against a killed container |
| 13 | the breaker OPENS and the refusal is attributed — `not.permitted.calls` counts it, and the answer says `circuit-breaker-open`. The state read asks for the `state=open` gauge series specifically, because `resilience4j.circuitbreaker.state` is ONE GAUGE PER STATE, exactly one of which is 1 at any instant and any untagged read aggregates to 1 forever (measured red-fix 2026-11-10) | tagged-actuator read |
| 14 | with nexus-api dead the edge answers 503 and NAMES its upstream | tagged-actuator + §4 of ADR 0056 |
| 15 | with the EDGE dead the caller gets a CONNECTION ERROR — because there is nothing left to answer, and a 503 would be an invention | honest absence |
| 16 | everything the proof created is gone — databases, processes, build copies | the hygiene contract |

**What this proof is NOT:** it is excluded from CI's hosting (`verify:spring-cloud`, residue role
named in `tools/ci/proof-set.mjs`: a PostgreSQL no workflow step brings up and a warm Maven for
the modules the workflow never built). It runs green on this machine — 16/16 — and any runner
that provides the same two things will see the same verdict. Its plane is stated to the byte in
the file header; do not quote its numbers as a promise about a runner you have not read.

### The service-test suites — the modules' own doors

| module | command | this checkout read |
|---|---|---|
| nexus-api | `mvn -o -B test` | **932 PASS** (incl. `DomainCircuitBreakerConfigTest`, `DomainFailureTest` 12) |
| java-domain-service | `mvn -o -B test` | **39 PASS** |
| java-gateway | `mvn -o -B test` | **13 PASS** |
| java-registry | `mvn -o -B test` | **2 PASS** |
| java-config-server | `mvn -B test` | **4 PASS** |

These run on the hosted runner only for `services/java-config-server` (the one module ci.yml and
`main-line.yml` now both grade — §15 of `verify:ci-wiring` refuses a pom the commit owns that no
step tests); the others run where PostgreSQL and a warm Maven exist.

### The gates the census tracks

`verify:ci-wiring` (§1–§15, two workflow files), `verify:arms` (64/64 at the latest re-stamp),
`verify:arms-freshness` (9/9 fixture arms), `verify:evidence-census` (130 tracked modules closed
as `117 row + 5 helper` — `m9/plane-bound-claims.mjs` being helper #5), `verify:table-recount`
(§3 exec-host 359/13), `verify:record-encoding`. The M9 proofs carry `planeBoundRuleIsLive()` at
the top of every build so a blinded rule reddens the row rather than clearing it.

## Honest bounds (none of these are claims this ledger pretends to support)

- **No docker-compose row for the Java services yet** — the CONVERGENCE program lists it as its
  next slice (six deployables with healthchecks and a compose smoke leg). Until that lands,
  nothing here claims "the platform starts up" — it claims WHAT RAN, WHICH PORTS, and on WHICH
  machine.
- **No distributed tracing** — ADR 0056 named it as the open hole (Micrometer Tracing across
  gateway → api → Feign → domain). A trace id read at every hop is not proven anywhere in this
  ledger yet.
- **No edge rate limiting, no Prometheus registry** — both are program slices; both are named
  here so their absence is a fact on the record, not a gap somebody discovers.
- **The two runner-bound red rows** (`verify:liveness` and `verify:health`) are a property of
  the hosted runner's socket semantics, not of this repository's behaviour — the record in
  `docs/CURRENT-STATE.md` (cont. 3) says it plainly; the gates that once graded a machine
  remembered from another machine no longer do.
- **Eureka on a single node** — no peer replication story is implemented or claimed;
  `register-with-eureka: false` on the registry.
- **Native profile for the config server** — Git-backed config, encryption at rest, `{cipher}`
  values: none implemented, none claimed (ADR 0057 states it).

## Pointers

- ADR 0054 — Spring Cloud enters NEXUS as a REGISTRY and an EDGE, not a rewrite
- ADR 0055 — a service is reached BY NAME, and its failure is a FACT
- ADR 0056 — a failure must NAME itself (kinds, refusal attribution, the breaker's own metric)
- ADR 0057 — configuration enters NEXUS as ONE door, and it is optional at boot
- `docs/CURRENT-STATE.md` — the dated addendum log (cont. 5 records the config door)
- `docs/evidence/ci/README.md` — the census re-stamp (130 modules, helper #5, 2026-11-10)
- `infra/config/` — what the config door serves: the shared surface + one overlay per app,
  `{spring.application.name}.yml` (not the Maven module name — that contract was MEASURED)
