# NEXUS Domain Service

The **authoritative write path** for NEXUS's domain tables — Java Spring Boot.

Its entities map onto the SAME `projects` and `users` tables the web layer reads
(`apps/web/src/server/db/schema.ts`, drizzle). Two writers on one table is a deliberate boundary,
not an accident: the web layer writes through its own validated paths, and the DOMAIN writes go
through here.

> **Read this before believing any part of it.** The honest status of this service was, for a long
> time, *worse than it looked*. The measurements below are from 2026-11-09 and every one of them is
> reproducible.

## What was wrong, and what is fixed

| fact | before | now |
|---|---|---|
| has it ever been **compiled**? | **no** — `mvn -o test` failed with *"Cannot access central in offline mode"* for eleven artifacts | **yes** — 12 sources compile, `mvn -o -B test` → **10/10, BUILD SUCCESS** |
| Spring Boot version | **3.2.0** (Jan 2024) | **3.5.16** — the same parent as `services/nexus-api` |
| Java version | 21 | **25** — the same as every other Java service here |
| tests | **none** | **10** — 7 over the project service, 3 guarding the refusals |
| fabricated answers | **15 methods** answering with values the service never established | **0** — every one of them refuses, by name |
| unused starters | security, cache, redis, validation, flyway | **removed** — each was a behaviour nobody asked for |
| `ddl-auto` | `validate` | `validate` (unchanged) — the schema is owned by drizzle, and this service **refuses to start** if its mapping does not match the table that is there |

### The fabricated answers, in full

These are the fifteen bodies that used to sit in this service. They are quoted here because the
point of the fix is that they were **plausible**:

```java
public int getCreditBalance(String userId)  { return 0; }    // a paid user is told 0
public boolean hasEnoughCredits(String u, String k) { return false; }
public String getSubscriptionPlan(String userId) { return "free"; }   // a subscriber is told "free"
public boolean hasPermission(...)             { return false; }     // a check that never checks
public boolean isAdmin(String userId)          { return false; }
public void likeProject(String projectId, String userId) { }  // SUCCESS; nothing was liked
public void deductCredits(...)                 { }                // SUCCESS; nothing was deducted
public void grantRole(String userId, String role) { }          // SUCCESS; no role was granted
// …and seven more of the same shape
```

A `0` balance and a `false` permission are answers a caller will believe. The `void` no-ops are
worse: **the caller receives SUCCESS for a write that never happened.**

They now all refuse with `com.nexus.domain.UnimplementedOperation`, which names the operation and
says why. The refusal is not a placeholder for a shrug — each one names the place that DOES own the
write:

- **credits & subscriptions** → the web layer's `usage` table and `nexus-api`'s subscription surface;
- **social writes** → `nexus-api`'s like / comment / follow surface (901 passing cases);
- **roles & membership** → the web layer's `users` / `project_members` tables and `nexus-api`'s ownership rules.

### The guard against the lie coming back

`NoFabricatedAnswersTest` does not test any one method. It **enumerates** the public methods of the
three services that do not own their writes and requires that every one of them refuses, by name.
A "helpful" edit that restores `return 0;` fails there — whatever the new answer is. The
population is derived from the classes, so it cannot quietly shrink.

## What is REAL here today

- `ProjectService` / `ProjectController` — create, read, update, soft-delete, fork. Backed by a
  JPA repository over the real `projects` table.
- `UserService` / `UserController` — the same shape over the real `users` table.
- `ProjectServiceTest` — 7 cases over a mocked repository: the private-by-default rule, "a null
  means leave it alone", the refusal-by-name for a project that is not there, the soft delete, and
  the fork's fresh id.

## Honest bounds

- **The three unimplemented services have no HTTP controllers.** Their refusals are unreachable over
  HTTP today; they matter to the next person who wires them.
- **There is no integration test against a real database.** The unit suite runs without one, and
  this repository forbids a mock database for integration tests (the real container is the only
  acceptable substitute). Wiring a real-Postgres integration test is the next increment for this
  service, not a claim this README makes.
- **`ddl-auto: validate` means this service will not start against a database whose `projects` table
  does not match its entity.** That is deliberate: a write path that silently alters the schema
  owned by another layer is a divergence waiting to happen.
- **No authentication.** The controllers are open. This service is not a security boundary yet.
- **It is not yet in the Spring Cloud topology.** `nexus-api`, `nexus-registry` and `nexus-gateway`
  are (ADR 0054); this service is not, and this README does not pretend otherwise.

## Tech stack

- Java 25, Spring Boot 3.5.16, Maven
- Spring Web + Spring Data JPA + the Postgres driver — **only** what the code uses

## Configuration

| variable | default | meaning |
|---|---|---|
| `NEXUS_DOMAIN_PORT` | `8081` | the port this service binds |
| `NEXUS_DB_URL` | `jdbc:postgresql://127.0.0.1:5432/nexus` | the database it writes to |
| `NEXUS_DB_USER` | `nexus` | |
| `NEXUS_DB_PASSWORD` | `nexus` | |

## Running it

```bash
mvn -o -B test                    # 10/10, no database needed
mvn -o -B spring-boot:run         # needs the web layer's database to be up
```
