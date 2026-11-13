# 0058 — Spring Cloud in NEXUS: what actually runs, what only parses, and what is deliberately absent

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

Between 2026-11-09 and 2026-11-10, NEXUS grew a live Spring Cloud microservices estate as a SEQUENCE of
incremental, measured pieces — never as one big-bang platform. Enough pieces have accumulated that a
reader can no longer reconstruct the inventory, the guarantees and the gaps by reading five ADRs and
three READMEs. This record is the map, and it draws its own borders: what is **measured**, what is
**config-validated only**, what is **excluded**, and what is **deliberately absent**.

## The estate, service by service

| deployable | module | role | measured at HEAD |
|---|---|---|---|
| `nexus-api` | `services/nexus-api` | studio line backend; Feign client + Resilience4j in front of the domain | **932/932 tests**, incl. breaker config + failure classifier |
| `java-domain-service` | `services/java-domain-service` | authoritative write path | **39/39** |
| `java-registry` | `services/java-registry` | Eureka server, single node on purpose, self-preservation off | **2/2** |
| `java-gateway` | `services/java-gateway` | webflux edge; own breaker (`nexusApiCircuitBreaker`), failure-named 503s | **13/13** |
| `java-config-server` | `services/java-config-server` | Spring Cloud Config, native profile, serves `infra/config/` | **4/4** |

Cross-service guarantees are PROOFS ON THIS BOX, not claims on paper — every claim below carries an
executable sentence or a CI run:

- the four-service topology proof (`docs/evidence/java/spring-cloud-proof.mjs`) boots registry →
  edge → api → domain against throwaway databases and measures **16/16 green** — upstream discovery,
  the registry dying and the chain surviving, the domain dying and the edge answering 503 with
  `failure: timeout`, the breaker opening and the answer naming `circuit-breaker-open`, the edge
  dying and the caller receiving a refused connection (not an invented 503), and the removal of
  every artifact afterwards. Run on the hosted runner it is EXCLUDED (`tools/ci/proof-set.mjs`
  names the missing PostgreSQL), and that exclusion is graded by the gate.
- ADR 0056's failure taxonomy: every 503 carries a stable kind + a human sentence — the api and the
  gateway each classify; a 404 is not a failure of anything.
- The Eureka topology is IP-address-preferred (`prefer-ip-address: true` in all three clients)
  because container/pod names are not resolvable across Docker networks — measured, not assumed.
- The config door is OPTIONAL everywhere: all four suites stay green with no config server
  listening. This is a design rule wearing an ADR, not a convenience.
- The whole Java estate is reachable from `docker compose --profile java` (six deployables with
  tmpfs throwaway pg and port-accept healthchecks; `scripts/smoke-java-profile.mts` is the
  one-shot verification). **Config-validated only.** The host that wrote this record cannot start
  new containers (measured 2026-11-10, container-start write path wedged; see CURRENT-STATE cont. 8),
  and neither CI nor that host has run the smoke to a completed PASS.

## What is deliberately absent (and will remain absent until a measurement demands it)

| Spring Cloud piece | why it is absent here | what would change the answer |
|---|---|---|
| Spring Cloud Bus | one service talks to one other service and one config door; there is no fan-out to wake and `POST /actuator/refresh` would be a knob nobody turns — decoration, not a capability | a third service that must react to the config door within a time bound, measured |
| `@RefreshScope`, `actuator/refresh` | decorating it adds an unmeasured runtime surface sensitive to credential-role endpoints without a real knob that must hot-rotate | a real value that becomes wrong the day somebody edits `infra/config/` without restarting anything, and that value's wrongness is a defect with a fix |
| Spring Cloud Sleuth / Micrometer Tracing | a tracing chain with ONE trace id read at every hop is the honest trace for this topology; installing half an OTLP exporter and calling it "observability" is not | a wiring whose first hosted contact showed an id at the gateway and both services, read from the same span |
| Spring Cloud Contract | the contract between api and domain is checked end-to-end by the topology proof against a REAL domain; a generated stub would be a second, lying artifact that runtime never reads | the proof passing with the domain stubbed by a contract-verifier run on a runner — plus a hosted green row |
| Circuit-breaker fallback factory | a fallback on the Feign client would answer WITH false content the moment the domain is gone, dressed up as success in a body a caller might forward | a product decision to degrade gracefully, name the degradation in the body, and measure it end-to-end |
| Spring Cloud Kubernetes | nothing Kubernetes-specific is used; the topology DNS-discovery contract is Eureka, deliberately | a runtime plane that is actually a cluster |
| Single-node Eureka limitations, self-preservation off | stated in the registry README and in 0054; no peer replication is and was going to be implemented before a second host exists | a second host, plus the measured peer-sync behaviour |
| Config-backed secrets, `{cipher}` | the config server serves the shared metrics surface and a log line; a secret in `infra/config/` would be readable by every clone | a KMS/escrow the platform owns, plus this ledger re-measured |

Absence by design is not a threat model; it is an honest boundary with a plan to move it. The one
Spring Cloud property that MUST be able to move with the project is the config door's reach
(ADR 0057), and it is the only one with an operating plan (`NEXUS_CONFIG_SERVER_URL`,
`NEXUS_CONFIG_SEARCH`).

## What the local topology costs

Five services + one PostgreSQL means five JNIs, five healthchecks, one registry, one gate. The
price is paid and measured: the topology proof's 16 sections take ~10 minutes on this host, the
`spring-cloud` CI row costs a full PostgreSQL the workflow doesn't have, and the build pays a
background cost at each Maven build. Splitting the repos was never the question — the question was
whether the platform's shape is MEASURABLE end to end and it is. Without the proof and the CI gate,
this topology would be decoration; with them, every seam is evidence.

## Decision

Keep the estate at this size until a measurement — a named trace hop, a measured cache hit of
somebody's request, a hosted PostgreSQL row, a measured fan-out cost — demands the next piece.
Additions happen only with (a) an ADR that names its measured trigger, (b) a proof or a CI row that
measures it, and (c) a README that names its boundary. Refresh, tracing and bus remain unwritten
not because they are hard but because no measurement so far has declared their absence a defect.

## Reason

- One place answers "is this real?" — the estate inventory + the two proof planes + the honest
  bounds in `docs/evidence/java/README.md`.
- No example from this estate is hypothetical: every line cites a command or a CI run that
  produced it on this box or the hosted runner.
- The absence table is a contract for the next author: any addition that skips the trigger/measure
  rules is a regression into decoration.

## Tradeoffs

- **Five services cost build time and five Spring Cloud version faces.** The 2025.0.3 train is on
  this box already, and every service builds offline against it. The price is paid and the failure
  modes are named — there is no other estate of this size in the repository. This is the price of
  the topology being real, and it is measured: the local builds take 2–4 minutes per service and
  the proof takes ~10 minutes when a host can run it.
- **No refresh-scope decor means live config still needs restarts.** The config door changes
  take effect at the next service boot, and ADR 0057's optional import documents that boundary.
  That is the price of not running an unmeasured knob that LOOKS like a capability.
- **The smoke has not passed yet.** Until CI (or a host with a healthy engine) runs
  `scripts/smoke-java-profile.mts` and it prints PASS, the six-deployable compose profile is
  config-validated YAML, and the word "up" does not appear outside that boundary.

**CITES** ADR 0054 (registry and edge), 0055 (reached by name), 0056 (failure must name itself),
0057 (the config door, optional at boot), `docs/evidence/java/README.md`, CURRENT-STATE cont. 5–8;
no amendments to ADR 0016's ledger — this record decides nothing for the CI-gate chain.
