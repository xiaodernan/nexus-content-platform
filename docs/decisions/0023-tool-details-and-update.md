# 0023 — Details and the owner's update: what a declaration SAYS can change, what it IS cannot

- **Status:** Accepted (v572 the details door, the update door and the live-PostgreSQL run — landed and gated)
- **Date:** 2026-11-02
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0022 (the registry that declares without executing)

## Context

ADR 0022 shipped the registry with three doors and named the missing one explicitly:

> **No update or details door.** A declaration is created, listed and removed. Changing a summary or schema
> would need an ownership-checked update with its own conflict rules; v571 does not pretend to have one.

A caller who holds an id could list the whole catalog to find the row, but could not ask for ONE row; and an
owner who mistyped a sentence or learned that a tool accepts one more field had to remove the declaration and
declare it again — which changes the id, frees the globally unique name for anybody to take, and makes a
typo look like a new tool. Both absences push a reader toward re-declaration as the only edit, which is the
one operation that destroys a declaration's identity.

The question this slice answers is not "should there be a PUT" but **which fields an update may rewrite**.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Read | No details door; find the row in `GET /tools` | A caller with an id has to page a catalog to answer a question about one row; a 20-row default window can hide the row it already named |
| Read | **`GET /tools/{id}`, public, 404 for an id that names nothing** | **Chosen** — the catalog is already public, so a detail read is the same fact at a narrower address; an id that names nothing is the 404 it is |
| Read | 200 with an empty body for an unknown id | "No such tool" and "a tool with no fields" are different facts; one of them is a lie about a row that does not exist |
| Update | `PATCH` with optional fields | A missing field and a field set to null become the same request, and "leave it alone" versus "clear it" needs a sentinel the wire does not have |
| Update | **`PUT` replacing summary and schema, both required** | **Chosen** — the body is the whole of what a declaration SAYS; a missing field is the field's own 400, not a hidden no-op |
| Update | Allow `name` in the body | The name is the registry's GLOBAL lookup key. Renaming would either need the duplicate rule a second time or silently move a key other callers already hold |
| Update | Allow `owner` in the body | An assignment door would let one account hand a declaration to another; that is a transfer, with its own consent question, not an edit |
| Update | New `updated_at` column | It would make the row seven columns and change the shape ADR 0022 and its live proof pin as six; v572 edits what a row SAYS, and a modification instant is a separate decision |
| Missing owner | Reach the service and let it refuse | The door's own rule is that an owner is required before anything is read; a controller that asks the service first would read a row for an anonymous caller |
| Stranger | 404 as if the row did not exist | The catalog is public: the row's existence is not a secret, and the honest reason is ownership. The same 403 the removal door uses |
| Field rules | Validate the body first, then ownership | A stranger could learn which summary or schema the owner would accept; ownership is checked before either field |
| Bounds | New schema/summary limits | A second set of numbers would drift from the registration rules; the SAME `requireSummary` and `requireSchema` are called |

## Choice

Two doors on `dev.nexus.api.tools`, beside the three ADR 0022 shipped:

- `GET /tools/{id}` — one declaration, the same six fields every read answers, with no owner check (the
  catalog is public). An id that names nothing is `404 unknown-tool`.
- `PUT /tools/{id}?owner=` — replace `summary` and `inputSchema`, for the owner only. 200 with the updated
  row. The owner is required before any read; an unknown id is `404 unknown-tool`; another account's row is
  `403 not-your-tool`; a broken summary or schema is the same `400 invalid-tool` registration raises, and
  nothing is saved. The row's name, id, owner and creation instant cannot be changed: an update changes what
  a declaration SAYS, never which declaration it is.

The update stores the canonical compact schema, measured against the same 8192-byte bound, and it writes no
`audit_entry` and fires no `webhook_delivery`: editing a declaration is not a fact about the world.

## Reason

- **Identity is not an editable field.** Name, id, owner and creation instant are the four things a caller
  uses to find, own and trust a row. Leaving them out of the body makes "which declaration is this" a
  question an update cannot change — and it means the global name never moves under a caller who holds it.
- **One set of rules, called twice.** `update` calls `requireOwner`, `requireSummary` and `requireSchema`
  rather than restating them, so a registration and an update cannot disagree about the bound, the trim or
  the object rule.
- **Refusal order is part of the answer.** Owner missing → before any read. Unknown id → 404. Not the owner →
  403 before field validation. Only then a 400 about the body. Each refusal names exactly one cause.
- **The row shape does not grow.** The six columns ADR 0022 pinned are still the six columns; an update
  rewrites two of them. A modification instant would be a seventh fact, and this slice does not pretend to
  know when an edit happened.
- **PUT is honest about absence.** Both fields are required, so a caller cannot send `{summary}` and have the
  schema silently cleared; the absent schema is the same named 400 a declaration gets.

## Tradeoffs (stated, not implied)

- **No `updated_at`.** Reads cannot say when a declaration last changed; only `createdAt` exists. A caller
  that needs the edit history would need a trail fact, and ADR 0022 chose not to write one. **The history
  half of this tradeoff is closed by ADR 0024 (v573):** every accepted write is recorded as a revision and
  `GET /tools/{id}/revisions` answers what the declaration said at each one. The row still gains no
  `updated_at`.
- **No rename.** Freeing a name still means removing the row and declaring again, with a new id — the one
  operation ADR 0022 described as "a name is not an id". A rename door would need the duplicate rule again.
- **No transfer of ownership.** The owner field cannot be updated. Handing a declaration to another account
  is not built.
- **No partial update.** `PUT` requires both fields; a caller that wants to change only the summary must
  resend the schema it already has. That is the price of not inventing a null-versus-absent rule.
- **Still no auth and no execution.** ADR 0018 keeps the owner host-declared, and the registry still
  validates nothing about a call it never makes.

## Evidence

- `npm run verify:api-tests` — `mvn -B test`, **547/547, 29 classes**, exit 0. v572 contributed 11 cases:
  7 service (an unknown id is a 404 read; a read answers the stored row without a save; a missing owner is
  refused before any read; an unknown id's update is a 404 and saves nothing; a stranger's update is 403 and
  leaves the summary; the owner replaces summary and schema while id/name/owner/instant stay; the 281-byte,
  non-object and 8193-byte refusals save nothing) and 4 controller (a detail read's six fields and no
  capability field; an update answers the replaced row; a missing owner touches the service not at all; the
  404 handler names `unknown-tool`).
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5 is the live run: a tool read
  back by id, an unknown id's 404, a stranger's 403, a missing owner's 400, an unknown id's 404, an
  8193-byte update's 400 (with `psql` reading the untouched sentence after all four refusals), then the
  owner's 200 replacing the summary and storing the canonical schema at 74 bytes while the name, id, owner
  and `createdAt` do not move, the row count still four, and `audit_entry` still empty; §6 restarts the
  service and serves the UPDATED schema, and `information_schema` still shows exactly six columns.
- **Still not graded, stated:** no MCP advertisement, no tool execution, no schema validation of a call, no
  rename, no ownership transfer and no edit instant. The tradeoffs above name each; ADR 0018 keeps the
  owner host-declared.

## Date

2026-11-02
