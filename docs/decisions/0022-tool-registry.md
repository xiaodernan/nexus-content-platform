# 0022 — The tool registry: a declaration this service can read, and never executes

- **Status:** Accepted (v571 the three doors, the rules and the live-PostgreSQL run — landed and gated)
- **Date:** 2026-11-02
- **Milestone:** M10 (External Agent Ecosystem)

## Context

M10 names four things: API, MCP, tool registry, webhooks. ADR 0021 built the webhook half — a row this service
ACTS on: it POSTs to an endpoint on its own initiative, signs the body, records every attempt and lets its owner
rotate, redeliver, prune and read its health. The tool registry is the opposite kind of thing, and the
difference is the whole decision:

> a webhook is an INSTRUCTION this service executes. A tool registration is a DECLARATION that something
> exists, what it accepts, and who said so.

Until v571 the whole of `services/nexus-api` was inbound plus that one outbound webhook path: there was no
catalog an external agent could read to learn what tools this system offers. The unit gates could grade a
Mockito-shaped service; they could not say that a declaration committed to PostgreSQL is read back by a second
process under the same name and the same canonical schema.

Two §60 forces shape the design:

1. **A declaration must not become a capability by accident.** The moment a tool row carries a URL, a command,
   a handler reference or an invocation counter, a reader will assume the service calls it. This build does
   not: there is no execution path, no retry, no audit fact and no delivery. The row shape has to make the
   absence structural rather than documented.
2. **A registry name is a lookup key, not a private label.** If names were owner-scoped, two accounts could
   announce two different tools under one name, and a caller holding only the name would have to guess which
   one it meant. The uniqueness has to be the database's rule.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Row | An executable descriptor (endpoint, command, handler) | Every such field is a capability this build does not have; a reader would assume it was wired. An outbound tool invocation needs its own SSRF, signature and receipt decisions — the webhook ADR's work, one milestone later |
| Row | **A declaration only: name, summary, schema, owner, instant** | **Chosen** — the catalog says what exists and what it accepts; nothing here calls out, so there is nothing to secure or to receipt |
| Name | Per-owner namespace (`owner` + `name` unique) | Two accounts can announce different tools under one name; a caller with a name cannot tell which one it will get |
| Name | **GLOBALLY unique, lowercase slug, 2–64 characters** | **Chosen** — the name is the lookup key every agent shares; a duplicate is a 409 that NAMES the existing row, and the database's unique constraint states the same rule |
| Name | Accept any string the caller sends | Uppercase, spaces and punctuation are two spellings of one tool, and a leading dot or dash invites a consumer to map the name onto a path |
| Name | **`[a-z0-9][a-z0-9._-]*`, first character alphanumeric** | **Chosen** — one spelling, and a name that cannot begin with `.` or `-` |
| Schema | A string field that contains JSON | Every client double-encodes it, and `"{}"` is a value a caller can send where an object was meant |
| Schema | **A JSON OBJECT, canonicalized to compact form, ≤ 8192 bytes** | **Chosen** — shape is judged before storage, whitespace cannot inflate the row, and equal schemas are byte-identical rows |
| Schema | Validate every future call against the schema | Nothing in this build makes calls; a validator with no caller would be machinery without a subject |
| Duplicate | 400 ("bad request") | The request was legal; the registry merely already holds the name. A caller cannot tell "taken" from "malformed" |
| Duplicate | **409 `tool-name-taken`, naming the existing tool id** | **Chosen** — the conflict is the name's, and the answer says which row holds it |
| Removal | 404 for an id that names nothing | "Already gone" is a state, not an error; the same rule the webhook removal follows, so one service does not answer one absence two ways |
| Removal | **200 `removed: true` / `removed: false`** | **Chosen** — the answer is the outcome; the owner and the id travel beside it |
| Removal | Anybody may remove by naming an id | An id must not be a capability: a removal is the owner's act, and another account's row is a 403 |
| Listing | Newest first | A catalog is read by NAME; creation order is invisible to a caller choosing a tool |
| Listing | **Name ascending, optional owner filter, total narrowed with the window** | **Chosen** — the order is the only field a caller must know, and a narrowed window carries its own count |
| Ownership | Authenticated sessions | This build has none (ADR 0018); the owner is host-declared and the ADR states the bound rather than hiding it |

## Choice

`dev.nexus.api.tools` — a `tool_entry` row (`tool_id`, `owner_account_id`, `name`, `summary`, `input_schema`,
`created_at`), three doors, and no fourth:

- `POST /tools` — declare a tool. 201 with the row. The owner, name and summary are trimmed; the schema is
  canonicalized and bounded; a duplicate name is 409 naming the row that holds it.
- `GET /tools?owner=&limit=&offset=` — the catalog, NAME ascending. The optional owner narrows the window and
  the total; without it the answer is the whole registry. Default 20, cap 100, floor 1, offset floored at 0;
  the answer reports the window it applied.
- `DELETE /tools/{id}?owner=` — remove a declaration, for its owner only. 200 with `removed: true` or
  `removed: false`; another account's row is 403; a missing owner is 400.

Rules, each refused by name:

- the name is 2–64 characters of lowercase letters, digits, `.`, `_` or `-`, starting with a letter or digit,
  and GLOBALLY unique — a duplicate is `tool-name-taken` with the existing id;
- the summary is required, trimmed, and at most 280 characters;
- the input schema is a JSON OBJECT (not a string that contains JSON, not an array, not absent), stored as
  canonical compact JSON of at most 8192 bytes — the bound is measured AFTER canonicalization because that is
  what the row stores; a body that is not JSON at all is refused by the framework as a 400 before this
  service sees it;
- the owner is required, trimmed, at most 200 characters, and host-declared (ADR 0018);
- a removal requires the owner, a row owned by another account is 403, and an id that names nothing is an
  honest `removed: false`;
- registering is NOT an audit action: it writes no trail entry and fans out to no webhook. A declaration is
  not a fact.

`information_schema` at the live run shows exactly six columns: `created_at`, `input_schema`, `name`,
`owner_account_id`, `summary`, `tool_id`. There is nowhere to store an endpoint, a command or an invocation.

## Reason

- **The absence is structural.** No endpoint column, no command, no counter, no audit entry: a build that
  cannot store a capability cannot accidentally execute one. The webhook package remains the only place that
  POSTs on this service's own initiative.
- **One name, one row.** The global unique constraint makes "which tool did the caller mean" a question the
  database already answered; the service checks first so the refusal can name the row instead of surfacing as
  a constraint violation.
- **The schema is stored, not enforced.** Canonicalization makes two spellings one row, and the byte bound is
  judged on the exact text the row holds. The service does not pretend to validate future calls, because it
  makes none.
- **The name is freed, the id is not reused.** Removing a row lets another account declare the same name as a
  NEW row with a new id. A name is a lookup key; an id is a row's identity, and the two are not interchangeable.
- **A read of the catalog needs no owner.** Tools are shared declarations; the optional filter is a convenience
  for one account's own view, not an access rule. A blank filter is treated as absent rather than as an empty
  account that would answer an empty catalog.

## Tradeoffs (stated, not implied)

- **No execution, no MCP wire face.** This slice registers tools; it does not advertise them over MCP, does not
  invoke them and does not validate a call against the schema. Those are later decisions and each needs its own
  security and receipt work.
- **No update or details door.** A declaration is created, listed and removed. Changing a summary or schema
  would need an ownership-checked update with its own conflict rules; v571 does not pretend to have one.
- **The schema bound is canonical bytes, not source bytes.** A caller cannot inflate the row with whitespace,
  but a canonical form can be LARGER than a compact input with unusual escaping (for example, characters
  Jackson escapes). The bound describes the row, which is what the database stores.
- **Malformed JSON is the framework's 400, not this service's named error.** A body that does not parse never
  reaches the controller, so the answer is the framework's error shape rather than `invalid-tool`. A valid JSON
  value that is not an object IS this service's named 400. The live run asserts both statuses and the named
  message for the latter.
- **Global names are one shared namespace.** Two accounts cannot both own `search`; the first declaration
  holds it until its owner removes it. That is the cost of a lookup key that every agent shares.
- **No auth.** The owner is host-declared like every other account id in this build; anyone who can reach the
  service can list the catalog, and a removal is only as private as the owner id. ADR 0018 is the reason.
- **`ddl-auto: update`.** The table joins the same no-migrations regime as the rest of the service (README
  bound, unchanged by this ADR).

## Evidence

- `npm run verify:api-tests` — `mvn -B test`, **536/536, 29 classes**, exit 0. v571 contributed 20 cases: 12
  service (the trimmed fields and canonical schema, the global duplicate naming its row, every name refusal,
  owner/summary bounds, the schema's object rule and its 8192/8193 byte boundary, the whole-or-narrowed catalog,
  the narrowed count, unknown-id false without a delete, a stranger refused before any delete, the owner's
  delete) and 8 controller (the 201 row, the catalog's window/count/filter, the reported clamp and floor, the
  trimmed filter echo, `removed` both ways, a missing owner touching nothing, and the 400/409/403 handlers).
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — the live run. The service is built in an
  isolated copy, started against a throwaway `pgvector/pgvector:pg16` container through command-line arguments,
  and graded over HTTP and `psql`: three declarations with trimmed fields and a schema read back as canonical
  compact JSON; a GLOBAL duplicate refused by the id that holds it; uppercase / one-character / spaced /
  65-character names, a blank and a 281-character summary, a string schema and a missing schema refused BY NAME;
  a malformed body refused as a 400 before the service; the byte bound accepted at exactly 8192 and refused at
  8193; `audit_entry` and `webhook_delivery` still empty after every declaration; the catalog by name with the
  owner filter narrowing both window and count, `limit=1&offset=1` answering exactly the second name with the
  whole total beside it, and `limit=500&offset=-10` reported as 100/0; a stranger's removal 403 with the row
  intact, an unknown id 200 `removed:false`, a missing owner 400, the owner's removal deleting the row before
  `psql` read zero, and the freed NAME declared again as a NEW row under another owner; and a second JVM serving
  the same four rows field for field while `information_schema` showed exactly six declaration columns. Teardown
  removes the container and the isolated build.
- **Still not graded, stated:** no MCP advertisement, no tool execution, no schema validation of a call, and no
  update door — the tradeoffs above name each. The catalog is public by design; ownership is enforced only on
  removal, and ADR 0018 keeps that bound.

## Date

2026-11-02
