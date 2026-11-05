# 0049 — A replacement hint is resolved on every read, not stored as a reference

- **Status:** Accepted (v619, `replacementStatus` and `replacementToolId` on deprecation answers, the batched page
  resolution, the 235 tools cases and the live-PostgreSQL run)
- **Date:** 2026-11-06
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0025 (the replacement is a hint), 0029 (handover), 0048 (the owner-narrowed warning list)

## Context

A deprecation says "this tool is going away" and may name what replaces it. ADR 0025 deliberately made that name
a HINT: the successor may be declared after the warning, so a foreign key would force an authoring order the
registry has no reason to enforce. The hint is validated as a legal tool name and cannot name its own tool, but
until v619 every read returned only the string.

That leaves the reader with three unanswered questions: is there actually a declaration under that name now,
what is its id, and is that successor itself about to go away? Answering them one row at a time would make a
warning list of twenty rows cost twenty extra lookups, and a client could not distinguish "no successor named"
from "successor not declared yet" without inventing that distinction locally.

The registry already has a global name lookup and a public by-id read. The new fact is not another resource; it
is a derived verdict that belongs beside the hint on the answers that already carry it.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Resolution | Leave the string and let the caller call `/tools/by-name/{name}` | A list read then costs one request per row; callers that do not resolve see an ambiguous label, and an unresolved hint is indistinguishable from "no hint" without client-side convention |
| Resolution | Enforce a foreign key on write | A retirement announcement may precede the successor's declaration; ADR 0025 rejected this and the reason has not changed |
| Resolution | Store the resolved id and status on the deprecation row | The target can be removed, re-declared under the same name, handed over, deprecated or un-deprecated after the warning is written; a stored copy would drift or need triggers across four other doors |
| Resolution | **Resolve on every read and store nothing** | **Chosen** — the hint stays a hint, and every answer describes the registry as it is at read time |
| Shape | Add a nested `replacement` object | It changes the existing field from a string to an object, breaking every client for no semantic gain; the name the caller wrote should keep its type |
| Shape | **Add `replacementStatus` and `replacementToolId` beside the existing string** | **Chosen** — additive fields, all three facts visible, and the old string still means exactly what it meant |
| States | A boolean `resolved` | It cannot tell "no hint" from "hint with no row", which are different facts for a caller deciding whether to wait for a declaration |
| States | **`none`, `unresolved`, `live`, `deprecated`** | **Chosen** — absent, not yet declared, declared and live, declared and itself departing |
| Cost | Resolve each row separately | A page of twenty hints would issue up to forty reads; one page should be one batch |
| Cost | **Two reads for a whole page: names, then deprecation presence** | **Chosen** — duplicate hints collapse, missing names stay in the answer as `unresolved`, and the cost is proportional to the page rather than to a request per row |

## Choice

Every deprecation answer now carries two derived fields beside `replacement`:

- `replacementStatus` is one of `none`, `unresolved`, `live`, `deprecated`.
  - `none` — no hint was stored (the `replacement` field is null).
  - `unresolved` — the hint is a legal tool name, but no declaration currently holds it.
  - `live` — the hint resolves to a declaration that does not currently carry a deprecation.
  - `deprecated` — the hint resolves to a declaration that currently carries its own deprecation.
- `replacementToolId` is the resolved declaration's id in the last two states, and null in `none` and
  `unresolved`.
- The single-deprecation answer grows from four to six fields:
  `{toolId, message, replacement, replacementStatus, replacementToolId, deprecatedAt}`.
- The public-list row grows from five to seven fields:
  `{toolId, name, message, replacement, replacementStatus, replacementToolId, deprecatedAt}`.
- `GET /tools/deprecations` resolves the whole page in two reads: the live declarations behind the distinct
  hints, then which of those rows are themselves deprecated. A hint that names nothing is not an error and does
  not disappear from the page; it is `unresolved` on the row that made it.
- `POST` and `GET` on one deprecation resolve the single hint the same way. An absent hint returns `none`
  without querying either table.
- Nothing is stored and `tool_deprecation` keeps its four columns. The resolution follows the current global
  name: a removed name that is declared again later resolves to the NEW row, and a handover does not change the
  verdict (it changes the target's owner, not its existence).

## Reason

- **A warning should be actionable without a second request per row.** The migration question is "what do I use
  instead?"; a legal name that holds nothing is not an answer the caller can act on, and the response can say so.
- **The absence of a hint and the absence of a successor are different.** A client that renders both as null
  cannot tell the author's intent from a broken address. Four named states make that difference explicit.
- **A successor can itself be departing.** Returning only an id would let a caller migrate onto another warning.
  The `deprecated` state states the trap in the same answer that recommends the address.
- **Derived state cannot drift.** The deprecation row has no id to reconcile when the successor is removed,
  re-declared, handed over or warned; the next read computes the truth from the rows that exist.
- **Additive fields keep the old contract.** `replacement` remains the string the owner wrote. A client that
  ignores the new fields behaves exactly as it did before v619.

## Tradeoffs (stated, not implied)

- **The verdict is a snapshot.** A successor can be deprecated or removed immediately after the read; the answer
  was true when it was produced. There is no watcher and no stored state to notify later.
- **Resolution is current-name resolution.** A name is not an id. If a declaration is removed and the same name
  is later declared by another account, the hint resolves to the new declaration; history is not consulted.
- **The page costs two extra reads.** A page with no hints skips both. A page with hints reads the distinct
  names once and their deprecation ids once; it never issues a query per row.
- **No chain following.** `deprecated` names the successor's own state. It does not follow that successor's
  replacement, detect cycles, or decide whether a migration path is safe beyond one hop.
- **A self-replacement remains impossible at write time.** Name uniqueness makes a later collision impossible,
  and the write rule still rejects the tool's own name; this read does not add a second check.
- **No visibility filter on the target.** Declarations are public, so resolving a successor reveals nothing that
  `/tools/by-name` would not already answer.

## Evidence

- `mvn -o -q -Dtest='ToolServiceTest,ToolControllerTest,JsonPointersTest' test` — **235/235** (150 service, 82
  controller, 3 pointer-walk): no hint reads `none` without a query; a legal name with no row reads `unresolved`;
  a live target reads `live` with its id; a target with its own deprecation reads `deprecated`; a page's
  duplicate hints collapse into one batch and one deprecation lookup; the single answer emits six fields and the
  list row seven.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5q over HTTP, against PostgreSQL: the
  kept warning's `m.tool` answered `live` with that row's id; `successor.not.declared` answered `unresolved` and
  a null id; an absent hint answered `none`; making `m.tool` itself departing made the caller's hint read
  `deprecated` while the owner-filtered list resolved both rows in one page; withdrawing `m.tool`'s warning made
  the hint `live` again with the one-deprecation fixture restored and psql reading one row.
- **Still not graded, stated:** no chain following or cycle detection, no stored/resolved column, no notification
  when a hint starts or stops resolving, and no filter that selects rows by replacement state.

## Date

2026-11-06