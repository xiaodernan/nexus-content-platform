# 0025 — Deprecation is its own fact: a warning, a withdrawal, and a public list

- **Status:** Accepted (v575, the `tool_deprecation` table, three doors and the public list)
- **Date:** 2026-11-02
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0022 (declare, never execute), ADR 0023 (the update) and ADR 0024 (the history)

## Context

A tool catalog that can only say what EXISTS cannot tell an agent what is about to stop existing. An owner
who intends to retire `weather.lookup` has no way to warn its consumers; an agent choosing between two tools
has no way to know that one of them is on its way out. The catalog would stay truthful about the present and
silent about the only fact that changes a consumer's decision.

The design question is where that warning lives. ADR 0022 pinned six declaration columns; ADR 0023 kept the
six-field read; ADR 0024 added a separate history table rather than growing the row. Deprecation has the same
shape as history — a fact ABOUT a declaration, written at a different time, with its own author — but it is a
current STATE rather than an append-only past.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Where | Columns on `tool_entry` | Breaks the six-column shape ADR 0022 pins, and a live proof reads `information_schema`; a warning is not part of what a tool accepts |
| Where | **A separate `tool_deprecation` table, one row per tool** | **Chosen** — the same separation the history and the audit trail use: a declaration says what exists, a warning says it is going away |
| Cardinality | Append every deprecation | A deprecation is a state a reader asks "is it deprecated NOW", not a trail; re-deprecating replaces the sentence and the instant |
| Wire | A seventh field on every declaration read | Every consumer of the six-field shape would have to change, and a `GET /tools` page would carry a second fact per row that most readers do not need |
| Wire | **Its own resource: `GET/POST/DELETE /tools/{id}/deprecation`** | **Chosen** — the declaration shape stays stable; a reader that cares opts into one more request |
| Discovery | Only the per-tool door | A catalog reader would have to ask once per tool; the whole point is to see what is going away across the catalog |
| Discovery | **`GET /tools/deprecations?limit=&offset=`, newest first, with each tool's NAME** | **Chosen** — one public request answers "which tools are going away, and what replaces them" |
| Live tool read | `404 unknown-tool` | It would claim the tool does not exist; the reader needs to tell "live" from "absent" |
| Live tool read | **`404 not-deprecated`, a distinct error name** | **Chosen** — the tool exists and is fine; that is a different fact from an unknown id |
| Replacement | A foreign key to an existing tool | Forces the successor to be published before the warning; a retirement announcement may precede the replacement's declaration |
| Replacement | **A validated name that need not hold a row, and cannot name the tool itself** | **Chosen** — the hint is honest about being a hint; the name rule stops a typo being stored as a plausible address |
| Withdrawal | `404` when the tool is live | "Already live" is not an error, the same rule removal uses for an id that names nothing |
| Withdrawal | **`200 {removed:false}`** | **Chosen** — idempotent from the caller's point of view |
| Missing owner | Reach the service and let it refuse | The door's own rule is that an owner is required before anything is read; a controller that asks first would read a row for an anonymous caller |
| Removal of the tool | Keep the warning | The id cannot be re-used and the name can be declared again as a different row; a warning for a tool that no longer exists is an address nobody can act on |

## Choice

One table and four doors:

- `tool_deprecation(tool_id, message, replacement_name, deprecated_at)` — one row per declaration, keyed by
  `tool_id`. `message` is one trimmed sentence bounded like a summary (280 characters); `replacement_name`
  is optional and must be a legal tool name other than the tool's own, but need not hold a row;
  `deprecated_at` is this service's clock at the write. Re-deprecating replaces all three.
- `POST /tools/{id}/deprecation?owner=` — owner only. Missing owner is 400 before any read; unknown id 404;
  another account 403 before either field; a blank or over-long message 400; a malformed or self-replacement
  400. 200 with the deprecation.
- `GET /tools/{id}/deprecation` — public. 200 with the deprecation; `404 not-deprecated` for a live tool;
  `404 unknown-tool` for an id that names nothing.
- `DELETE /tools/{id}/deprecation?owner=` — owner only. 200 `{toolId, removed}`; `removed:false` when the
  tool was not deprecated; unknown id 404; another account 403.
- `GET /tools/deprecations?limit=&offset=` — public list, newest first, each row carrying the declaration's
  NAME beside `{message, replacement, deprecatedAt}`; default 20, cap 100, floor 1, offset floor 0, with the
  whole count beside the window.

Removing a declaration deletes its deprecation in the same transaction. The declaration's six-field read is
unchanged; a deprecation is not one of its fields.

## Reason

- **A warning is not a capability.** Nothing about what the tool accepts changes when it is deprecated; the
  declaration row keeps saying exactly what it said. Putting the warning elsewhere keeps both facts honest.
- **The reader opts in.** Most catalog reads want the current catalog; a caller deciding whether to adopt a
  tool asks one more question. The list door answers it for the whole registry at once.
- **"Live" and "absent" are different.** Two named 404s let a reader tell a tool that is fine from an id that
  names nothing. The distinction is the same one the publication and subscription doors make.
- **The hint is honest about being a hint.** A successor may not exist yet; requiring one would make the
  registry force a declaration order it has no reason to enforce. The name is still validated so a warning
  cannot point at a string that could never be a tool.
- **Idempotent withdrawal.** A second `DELETE` answers `removed:false` instead of an error: the caller's goal
  (the tool is not deprecated) is already true.

## Tradeoffs (stated, not implied)

- **No verification of the replacement.** The hint may name a tool that never exists; no door checks it, and
  no door rewrites the warning when such a tool is declared.
- **No deprecation history.** Re-deprecating replaces the sentence and moves the instant; the previous
  warning is not kept. A history of warnings would be a second trail, and nothing has asked for it.
- **No automatic expiry and no grace period.** A deprecation stays until its owner withdraws it or the tool
  is removed; the service does not count down, and does not refuse reads of a deprecated tool (the registry
  never executes or refuses a declaration based on its warning).
- **No catalog filter.** `GET /tools` does not exclude deprecated tools and does not mark them; a caller
  joins the list door by id. A query parameter would be a second reading of the same fact.
- **Still no auth.** The owner is host-declared (ADR 0018); the doors check the same claim every other tool
  door checks.

## Evidence

- `mvn -Dtest='dev.nexus.api.tools.*' test` — **60/60** (39 service, 21 controller). v575 contributes 16
  cases (11 service, 5 controller, including the handler case): trimming and the hint; an absent hint stored as null; re-deprecation replacing the one row;
  a self-replacement and a malformed replacement refused before saving; the message's blank and 281-character
  bounds; a stranger writing nothing; withdrawal answering true then false; a live tool's distinct 404; the
  warning and the history both deleted with the declaration; the deprecation window's count; the controller's
  four-field wire, owner gate, withdrawal shape, list-with-name and `not-deprecated` handler. The whole service
  suite reads 596/596 in 31 classes at this working tree, but 20 of those cases are an untracked MCP lane's
  tests that this commit does not carry; the tool package's own 60/60 is the number this slice owns.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — the live run: a live tool's 404
  `not-deprecated`; a stranger's 403; a missing owner's 400; an unknown id's 404; blank/281-byte messages and
  malformed/self replacements refused with psql reading zero; the owner's 200 with trimmed message and hint;
  the declaration still exactly six fields; `GET /tools/deprecations` naming `weather.lookup`; re-deprecation
  replacing one row; withdrawal `removed:true` then `false`; psql zero; a kept warning surviving the restart;
  `information_schema` showing `tool_deprecation` has exactly four columns; and §4's removal deleting the
  warning with the declaration.
- **Still not graded, stated:** no replacement verification, no warning history, no expiry, no filter, no
  auth.

## Date

2026-11-02
