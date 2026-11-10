# NEXUS Java Domain Service

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

Nothing in the table is a stub any more. The two "service only" rows are deliberate: their logic is real and
tested, but no controller routes to them — exposing a route before anything needs it is how dead endpoints
accumulate (§159: never claim reachable what nothing reaches).

## Tech stack

- Java 25, Spring Boot 3.5.16
- Spring Cloud 2025.0.3 — Eureka client for the `nexus-domain-service` service id; OpenFeign for the one real
  cross-service leg (`AiServiceClient` → ai-service `/healthz`). resilience4j was deliberately **not** added:
  nothing in the tree consumes a breaker yet, and the SC 仍欠 list keeps that debt visible instead of decorating
  the pom with an unused dependency.
- PostgreSQL (the shared `nexus` database; connection is pool-configured, see below)
- Redis starter present, not yet used by this surface

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
  mapped by converters (`UserRoleConverter`, `UserPlanConverter`) — measured errors:
  *"invalid input value for enum user_role: «CREATOR»"* and *"No enum constant …UserPlan.free"*.
- **`jsonb` is not `varchar`.** `projects.brand_kit`/`visual_dna`/`modes` are `jsonb`; without
  `@JdbcTypeCode(SqlTypes.JSON)` an insert that omits them binds NULL as varchar and fails. Declaring the JDBC
  type is what makes an insert with those fields absent actually work.
- **No DDL and no migration tool here.** The schema belongs to the web layer. `ddl-auto` is `none` and
  Flyway was removed: a second writer of DDL is how two systems disagree about the same table.
- **Explicit security posture.** `spring-boot-starter-security` with no filter chain locks everything behind
  a generated password; `SecurityConfig` permits the API surface on purpose. Authentication moved to the
  gateway's AuthFilter (SC-13, default off); this service still performs none itself, so **deployments must
  not expose this service's port**.

## Tests

`mvn -f services/java-domain-service/pom.xml test` — 90 tests, all green offline (2026-11-10):

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

The live run is the other half: create → read → delete → 404 **through the gateway**, against the real
database, evidence in `docs/ROADMAP.md` §SC 第四片.
