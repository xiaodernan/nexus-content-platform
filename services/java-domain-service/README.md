# NEXUS Domain Service

The Java write-path service. It maps onto the **schema the web layer owns** (`apps/web/src/server/db/schema.ts`
and its Drizzle migrations) and serves it over `/api/v1/{users,projects}`. Through `nexus-gateway` that
surface is published as `/domain/**` (SC-6).

## What is real, and what is not

| area | state |
| --- | --- |
| `User` — lifecycle, profile, guest claim, plan, role listing | **real**: entity + repository + service + controller + tests |
| `Project` — lifecycle, soft delete, fork, by-owner | **real**: entity + repository + service + controller + tests |
| `Community` — likes, follows, the shared refusal policy (comments/remixes/saves not yet) | **real**: entity + repository + service + controller + tests; the policy sentences are the web layer's own `contracts/community-policy.json` export, copied into the jar and validated against the wire schemas |
| `Permission` — read-only access checks (`hasPermission`, `isAdmin`, authority) | **real, service only**: reads `users.role` + `projects.owner_id` + the publication → project chain; no controller, nothing routes to it |
| `Billing` — credit ledger reader, subscription plan | **real, service only**: `@Immutable` ledger entity + SUM(delta) balance reader; consumption rows stay written by the web layer (`finishTask`); no controller |
| `WirePublisher` — cross-process realtime frames (SC-53/SC-62) | **real**: `StringRedisTemplate` pub/sub on `nexus:realtime:v1`; a frame nobody receives is dropped, never an error; the Java source of the wire the web/Studio side subscribes to |

Nothing in the table is a stub any more. The two "service only" rows are deliberate: their logic is real and
tested, but no controller routes to them — exposing a route before anything needs it is how dead endpoints
accumulate (§159: never claim reachable what nothing reaches).

## Tech stack

- Java 25, Spring Boot 3.5.16
- Spring Cloud 2025.0.3 — Eureka client for the `nexus-domain-service` service id (registration OFF by
  default); OpenFeign for the one real cross-service leg (`AiServiceClient` → ai-service `/healthz`);
  resilience4j **is** wired since SC-60 — the Feign → ai-service breaker has a real open/close cycle and
  the smoke-readable `/actuator/circuitbreakers` view (SC-64).
- PostgreSQL (the shared `nexus` database; connection is pool-configured, see below)
- `spring-boot-starter-data-redis` — used by `WirePublisher` (realtime frames), never decoratively

## Run it

```powershell
$env:NEXUS_DOMAIN_PORT='8082'
$env:NEXUS_DOMAIN_DB_URL='jdbc:postgresql://127.0.0.1:55433/nexus'
$env:DB_USERNAME='nexus'; $env:DB_PASSWORD='…'
$env:NEXUS_DOMAIN_REGISTER='true'      # false by default: a standalone run needs no registry
java -jar target/domain-service-1.0.0-SNAPSHOT.jar
```

Then, directly or through the gateway (`/domain` prefix):

```
GET    /api/v1/users/by-role/creator
GET    /api/v1/projects/{uuid}
POST   /api/v1/projects
DELETE /api/v1/projects/{uuid}        # soft delete: deleted_at is stamped, the row stays
POST   /api/v1/community/publications/{publicationId}/like
POST   /api/v1/community/users/{userId}/follow
GET    /api/v1/community/policy
```

## What it learned the hard way (measured, not assumed)

- **Native ENUM columns.** `projects.kind`/`visibility` and `users.role` are PostgreSQL ENUMs, while the
  entities hold Strings/enums. Binding a String as `varchar` fails with *"column kind is of type project_kind
  but expression is of type character varying"*. The pool sets `stringtype=unspecified`
  (`spring.datasource.hikari.data-source-properties`), so PostgreSQL infers the enum from the column. This is
  set on the **pool**, not the URL, so an overridden `NEXUS_DOMAIN_DB_URL` cannot forget it.
- **Enum labels are lowercase.** `@Enumerated(STRING)` binds `CREATOR` and reads `valueOf("free")`;
  PostgreSQL's `user_role` labels are `creator`/`admin` and `users.plan` stores `free`/`studio`. Both are
  mapped by converters (`UserRoleConverter`, `UserPlanConverter` on this line; `UserRoleLabelConverter` /
  `UserPlanLabelConverter` carrying the labels on the merged line — both ship, each vocabulary refused by name).
- **`jsonb` is not `varchar`.** `projects.brand_kit`/`visual_dna`/`modes` are `jsonb`; without
  `@JdbcTypeCode(SqlTypes.JSON)` an insert that omits them binds NULL as varchar and fails. Declaring the JDBC
  type is what makes an insert with those fields absent actually work.
- **No DDL and no migration tool here.** The schema belongs to the web layer. `ddl-auto` defaults to `none`
  (set `NEXUS_DOMAIN_DDL_AUTO=validate` for the strict contract — the service then refuses to start on a
  mapping mismatch) and Flyway was removed: a second writer of DDL is how two systems disagree about the same
  table.
- **Explicit security posture.** `spring-boot-starter-security` with no filter chain locks everything behind
  a generated password; `SecurityConfig` permits the API surface on purpose. Authentication moved to the
  gateway's AuthFilter (SC-13, default off); this service still performs none itself, so **deployments must
  not expose this service's port**.
- **Version alignment (2026-11-09, merged line).** This pom previously pinned Spring Boot 3.2.0 / Java 21 and
  had never been compiled; it now rides Boot 3.5.16 / Java 25 with the repository's pinned compiler and
  UTF-8 encoding. `ddl-auto: validate` remains available and documented; the runtime default here is `none`.
- **The fabricated answers (2026-11-09, merged line).** Fifteen methods used to answer with values the
  service never established (`return 0` balances, `return false` permissions, `void` no-ops that reported
  SUCCESS for writes that never happened). They now refuse by name with
  `com.nexus.domain.UnimplementedOperation`, and `NoFabricatedAnswersTest` enumerates the public methods of
  the services that do not own their writes and requires every one of them to refuse — the population is
  derived from the classes, so it cannot quietly shrink. `ProjectVocabulary` checks kind/visibility words
  against the schema's own list so a bad word is a **400 naming the accepted words**, and
  `ResourceNotFoundException` keeps a missing row a **404**, a contradicting request a **409**.

## Tests

`mvn -f services/java-domain-service/pom.xml test` — 90+ tests, all green offline:

- `CommunityServiceTest` (19), `CommunityPolicyTest` (14), `CommunityControllerTest` (10),
  `CommunityWireContractTest` (8) — the community rules against the real policy export; every refusal arm
  asserts that nothing was written
- `PermissionServiceTest` (11) — ownership off the owner column, publication → project tracing, ghost rows
  grant nothing, unknown resource types are a caller bug, missing users refuse
- `BillingServiceTest` (5) — balance is SUM(delta), unknown kind refused before the query, plan lowercase
- `AiServiceClientWireTest` (1) — the Feign client against a loopback HTTP server answering the true
  `/healthz` shape
- `ProjectServiceTest` (5), `ProjectControllerTest` (5), `UserServiceTest` (7),
  `UserRoleConverterTest` (3), `UserPlanConverterTest` (2)
- `NoFabricatedAnswersTest`, `ProjectVocabularyTest`, `ActuatorShapeTest`, `HealthServiceTest`,
  `WirePublisherFrameShapeTest`, `WirePublisherRoundTripTest`, `WireCommunityEventListenerTest` — the refusals
  guard, the actuator shape, and the realtime wire against a real local broker

The live run is the other half: create → read → delete → 404 **through the gateway**, against the real
database, evidence in `docs/ROADMAP.md` §SC 第四片 — and the five-JVM topology smoke (`npm run verify:topology`,
`npm run verify:lb`, `npm run verify:auth`, `npm run verify:actuator`), whose evidence lives in
`docs/evidence/`.

## Merged lineage (2026-11-13)

This tree is the union of two divergent lines that both started at `7cc6bb74`:

- **this line** — security filter chain (`SecurityConfig`), realtime wire (`WirePublisher` over Redis
  pub/sub), actuator honesty work (§SC-66 build-info, §SC-69 show-details: never), topology/LB/auth/actuator
  smokes, the 55433 Postgres default, the small-pool Hikari tuning.
- **the merged line** — the 2026-11-09 hardening: version alignment to Boot 3.5.16 / Java 25, the
  fabricated-answers removal with `UnimplementedOperation` + `NoFabricatedAnswersTest`, `ProjectVocabulary`,
  enum-label converters, `nexus.port-file`, the optional config-door at **18888** (8888 was measured to be a
  neighbour's), `ddl-auto: validate` as the documented strict contract, small-pool Hikari + prepared-statement
  plan cache tuning, `spring-boot-starter-security`/validation/cache/flyway starter audit.

Where the lines disagreed (security starter present with a real filter chain vs removed as "no SecurityConfig"),
the merged truth won: `SecurityConfig` exists, so the starter stays. Flyway stays removed — the schema is
drizzle's. The Redis starter stays — `WirePublisher` is real, and "no RedisTemplate anywhere" was true only on
the line that deleted it.
