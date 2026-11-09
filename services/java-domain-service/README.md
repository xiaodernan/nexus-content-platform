# NEXUS Java Domain Service

The Java write-path service. It maps onto the **schema the web layer owns** (`apps/web/src/server/db/schema.ts`
and its Drizzle migrations) and serves it over `/api/v1/{users,projects}`. Through `nexus-gateway` that
surface is published as `/domain/**` (SC-6).

## What is real, and what is not

| area | state |
| --- | --- |
| `User` — lifecycle, profile, guest claim, plan, role listing | **real**: entity + repository + service + controller + tests |
| `Project` — lifecycle, soft delete, fork, by-owner | **real**: entity + repository + service + controller + tests |
| `Community` (likes, comments, follows, remixes, saves) | **stub**: service class only, no controller, not reachable |
| `Permission` (roles, permissions, access control) | **stub**: service class only, not reachable |
| `Billing` (credits, subscriptions, consumption) | **stub**: service class only, not reachable |

The stubs are scaffolding, not features: nothing routes to them and nothing claims they work (§159). They are
listed here so a reader knows the difference between "not built" and "built and broken".

## Tech stack

- Java 25, Spring Boot 3.5.16
- Spring Cloud 2025.0.3 — Eureka client for the `nexus-domain-service` service id
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
  a generated password; `SecurityConfig` permits the API surface on purpose. Authentication is a gateway
  slice that has not been built yet, so **deployments must not expose this service's port**.

## Tests

`mvn -f services/java-domain-service/pom.xml test` — 22 tests, all green (2026-11-09):

- `ProjectServiceTest` (5) — defaults, not-found, soft delete, fork, deleted-not-readable
- `ProjectControllerTest` (5) — 200/404/201/array/204 contract without a Spring context
- `UserServiceTest` (7) — handle derivation, handle conflict, self-handle, guest claim, soft delete
- `UserRoleConverterTest` (3), `UserPlanConverterTest` (2) — the lowercase labels, null-safe

The live run is the other half: create → read → delete → 404 **through the gateway**, against the real
database, evidence in `docs/ROADMAP.md` §SC 第四片.
