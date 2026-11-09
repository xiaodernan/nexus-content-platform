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
| has it ever been **compiled**? | **no** — `mvn -o test` failed with *"Cannot access central in offline mode"* for eleven artifacts | **yes** — 22 sources compile, `mvn -o -B test` → **39/39, BUILD SUCCESS** |
| has it ever been **started against the real database**? | **no** | **yes** — measured: it starts on 8081 against the repository's own PostgreSQL with `ddl-auto: validate` passing, reads a real `projects` row (200) and answers 404 for an id that is not there |
| does its **write path** work? | **no** — every insert of a user failed: `ERROR: invalid input value for enum user_role: "CREATOR"` | **yes** — the labels the schema stores are carried by the constants, and a converter writes them |
| Spring Boot version | **3.2.0** (Jan 2024) | **3.5.16** — the same parent as `services/nexus-api` |
| Java version | 21 | **25** — the same as every other Java service here |
| tests | **none** | **39** — the project service, the vocabulary, the HTTP mapping, the health measurement, and the guard over the refusals |
| fabricated answers | **15 methods** answering with values the service never established | **0** — every one of them refuses, by name |
| unused starters | security, cache, redis, validation, flyway | **removed** — each was a behaviour nobody asked for |
| `ddl-auto` | `validate` | `validate` (unchanged) — the schema is owned by drizzle, and this service **refuses to start** if its mapping does not match the table that is there |
| health | none | `GET /health` and `GET /health/live` — the same shape as `services/nexus-api`'s doors |
| port reporting | "read it out of the log" | `nexus.port-file` — the port is written as DATA once the server is listening |
| discovery | not in the topology | it is now: `nexus-api` reaches it **by name** over OpenFeign (ADR 0055) |

### The write path was broken, and the schema's vocabulary is the lesson

`users.role` is a **PostgreSQL enum** whose labels are `'creator'` and `'admin'` — lowercase.
`users.plan` is a `text` column the platform writes and compares in lowercase as well
(`apps/web/src/server/domain/roles.ts`: `row?.role === 'admin'`). The Java side wrote the
**constant names**: `CREATOR`, `FREE`, `PUBLIC`.

So every user this service created was rejected by the database:

```
ERROR:  invalid input value for enum user_role: "CREATOR"
```

Measured with a rolled-back probe against the repository's own PostgreSQL, 2026-11-09. Nothing in
the unit suite noticed, because the unit suite never touched the vocabulary — the repository's mock
cannot refuse a value the way a database can.

The fix is not "spell the constants in lowercase". The fix is that the **label is carried by the
constant** and a converter writes it:

- `User.UserRole.CREATOR.label()` → `"creator"`, `User.UserPlan.FREE.label()` → `"free"`;
- `UserRoleLabelConverter` / `UserPlanLabelConverter` store the label and read it back, so there is
  exactly **one** place in this service that has to agree with the schema;
- `fromLabel(String)` doubles as the Jackson factory, so a body carrying `"free"` deserializes —
  Jackson's default enum reader would have demanded `"FREE"`;
- `MODERATOR` is **gone**. The schema has never had that role, so it was a role this service could
  promise and never deliver; it is now refused by name.

`projects.kind` and `projects.visibility` are enum columns too, and a bad word used to travel all
the way to the database and come back as a constraint violation — which Spring's default handler
turned into a **500**, telling the caller the server was broken when the truth was that the caller
sent a word that is not a kind. `ProjectVocabulary` now checks the word against the schema's own
list (eleven kinds, three visibilities, copied from `schema.ts`) and the answer is a **400 that
names the accepted words**.

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
- **social writes** → `nexus-api`'s like / comment / follow surface (907 passing cases);
- **roles & membership** → the web layer's `users` / `project_members` tables and `nexus-api`'s ownership rules.

### The guard against the lie coming back

`NoFabricatedAnswersTest` does not test any one method. It **enumerates** the public methods of the
three services that do not own their writes and requires that every one of them refuses, by name.
A "helpful" edit that restores `return 0;` fails there — whatever the new answer is. The
population is derived from the classes, so it cannot quietly shrink.

## What is REAL here today

- `ProjectService` / `ProjectController` — create, read, update, soft-delete, fork. Backed by a
  JPA repository over the real `projects` table, and measured against the real database.
- `UserService` / `UserController` — the same shape over the real `users` table, writing the
  labels the schema actually stores.
- `GET /health` — the process fact and the database measurement, kept apart: 200 when the database
  answers, 503 when it does not, and a liveness door that never touches the pool.
- `ProjectVocabulary` — the eleven kinds and three visibilities the schema holds, checked at the
  boundary so a bad word is a 400 and not a 500.
- `ResourceNotFoundException` — a missing row is a **404**, a bad word is a **400**, and a request
  that contradicts the row it names is a **409**. Before this, all three arrived as a 500.
- 39 tests: the project service, the vocabulary, the HTTP mapping, the health measurement, and the
  guard over the refusals.

## Honest bounds

- **The three unimplemented services have no HTTP controllers.** Their refusals are unreachable over
  HTTP today; they matter to the next person who wires them.
- **There is no `mvn test` integration test against a real database.** The unit suite runs without
  one, and this repository forbids a mock database for integration tests (the real container is the
  only acceptable substitute). The real-database evidence for this service is the topology proof
  (`docs/evidence/java/spring-cloud-proof.mjs`), which starts this service against a throwaway
  database carrying the **real schema** and reads a row back through it.
- **`ddl-auto: validate` means this service will not start against a database whose `projects` table
  does not match its entity.** That is deliberate: a write path that silently alters the schema
  owned by another layer is a divergence waiting to happen. Measured: it starts against the
  repository's own schema.
- **No authentication.** The controllers are open. This service is not a security boundary yet.
- **The topology it now joins is a development topology.** The registry accepts a registration from
  anyone who can reach the port; the edge has no auth, no rate limit, no TLS (ADR 0054).

## Tech stack

- Java 25, Spring Boot 3.5.16, Maven
- Spring Web + Spring Data JPA + the Postgres driver — **only** what the code uses
- Spring Cloud 2025.0.3: the **Eureka client**, opt-in at runtime (ADR 0054/0055)

## Configuration

| variable | default | meaning |
|---|---|---|
| `NEXUS_DOMAIN_PORT` | `8081` | the port this service binds |
| `NEXUS_DB_URL` | `jdbc:postgresql://127.0.0.1:5432/nexus` | the database it writes to |
| `NEXUS_DB_USER` | `nexus` | |
| `NEXUS_DB_PASSWORD` | `nexus` | |
| `NEXUS_DOMAIN_PORT_FILE` | *(empty)* | where to write the port it actually bound |
| `NEXUS_EUREKA_ENABLED` | `false` | register with the registry, and fetch it |
| `NEXUS_EUREKA_URL` | `http://127.0.0.1:8761/eureka/` | the registry's address |

## Running it

```bash
mvn -o -B test                    # 39/39, no database needed
mvn -o -B spring-boot:run         # needs the web layer's database to be up
```

Against the repository's own container, that is:

```bash
NEXUS_DB_URL=jdbc:postgresql://127.0.0.1:55433/nexus \
NEXUS_DB_USER=nexus NEXUS_DB_PASSWORD=nexus_dev_only \
mvn -o -B spring-boot:run
```

and then, on the same machine:

```bash
curl -s http://127.0.0.1:8081/health
# {"service":"nexus-domain-service","version":"1.0.0-SNAPSHOT","startedAt":…,"uptimeSeconds":…,
#  "database":{"reachable":true,"latencyMs":3}}
```
