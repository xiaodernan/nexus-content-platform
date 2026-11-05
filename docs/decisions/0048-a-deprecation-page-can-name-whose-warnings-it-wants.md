# 0048 — A deprecation page can name whose warnings it wants

- **Status:** Accepted (v618, `GET /tools/deprecations?owner=`, the filtered count, the sixth envelope field, the
  228 tools cases and the live-PostgreSQL run)
- **Date:** 2026-11-06
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0025 (deprecation as its own resource), 0043 (the catalog's owner filter and keyset cursor),
  0047 (the deprecation list's pair cursor)

## Context

`GET /tools/deprecations` is registry-wide. That is the right default for a consumer scanning for warnings, but
an owner asking "which of MY declarations are going away?" had to read every deprecation and discard the rows
whose `toolId` they did not hold. That is not a filter: it makes the caller's page size depend on other owners'
writes, and the `total` it receives describes a set it did not ask for.

The catalog already answers the same ownership question with `owner=` (ADR 0043). The deprecation list also
gained a pair cursor in ADR 0047. The new narrowing must compose with that cursor rather than introduce a second
door with its own pagination rules.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Existence | No filter; the client fetches all and discards | The caller's page can be filled by rows it cannot use, and the count answers a different set; a filtered mirror would be wrong in a way the response does not disclose |
| Existence | A second resource, `/owners/{id}/deprecations` | Two lists would drift: the same order, cursor, count and row shape would need a second implementation and a second set of tests |
| Existence | **`owner=` on the existing list** | **Chosen** — one resource, one order, one cursor grammar, and the same filter spelling the catalog already uses |
| Count | Narrow only the returned window | `total` would claim the registry-wide size while the rows belong to one owner; the caller would page past an end it cannot reach |
| Count | **Narrow both the window and `total`** | **Chosen** — `total` describes the set the caller selected, and a short page remains the end of that set |
| Cursor | Put the owner inside `before=` | The owner is a filter, not a position. A cursor must remain a value a caller can build from the row it read; changing its shape would break ADR 0047 for no gain |
| Cursor | **Keep the pair cursor; compose the two** | **Chosen** — `owner=` selects the set, `before=` resumes inside it, exactly as the catalog composes `owner=` with `after=` |
| Blank | Treat a blank owner as an account named "" | No account has an empty id; an absent filter is the honest reading |
| Blank | **Trim, and read blank or absent as `null`** | **Chosen** — the same normalization the catalog and every owner-gated write use |
| Storage | Denormalize the owner onto the deprecation row | A second copy can disagree with the declaration after a handover; the deprecation belongs to the tool, whose current holder is a fact in `tool_entry` |
| Storage | **Join `tool_entry` on `tool_id` for the filtered paths** | **Chosen** — one source of truth; the deprecation table is bounded at one row per deprecated tool, so the join is a bounded read, and the cost is stated rather than hidden |

## Choice

`GET /tools/deprecations?owner=&limit=&offset=&before=<epochMillis>:<toolId>`:

- `owner` is trimmed. A blank or absent owner is `null` and means the registry-wide list; the envelope echoes the
  owner it actually selected, never the raw spacing the caller sent.
- The filter is the declaration's **current holder** in `tool_entry`. A tool handed to another account appears
  under the new holder, not the former one; ownership history is a separate chain (ADR 0029), not a second way to
  select this list.
- `owner` narrows **both** the page window and `total`. The count is the number of deprecations held by that
  owner, not the whole table.
- `owner` composes with the pair cursor. `before=` still bounds the window by `(deprecatedAt, toolId)` inside the
  selected owner; a cursor built from another owner's row is a valid bound, so the page can be empty while
  `total` remains the selected owner's whole count. A cursor is never interpreted as an owner filter.
- `owner` composes with `offset`. The offset path remains an absolute position inside the filtered set and keeps
  the same `date_trunc('milliseconds', deprecated_at) DESC, tool_id ASC` order.
- The envelope gains its sixth field, `owner`, first: `{owner, deprecations, total, limit, offset, before}`. The
  row shape does not grow; the caller already has `toolId` and `deprecatedAt` in each row.
- The repository has three filtered reads — `firstPageByOwner`, `pageAfterByOwner`, `countByOwner` — all joining
  `tool_entry` on `tool_id`. The unfiltered overloads still serve callers that ask for the whole list.

## Reason

- **A filter should select, not merely annotate.** Narrowing the window while leaving `total` registry-wide makes
  the count disagree with the only rows the caller can reach; narrowing both is the same rule the catalog's
  owner filter already follows.
- **The cursor and the filter answer different questions.** "Whose warnings?" is a set; "after which pair?" is a
  position inside that set. Keeping them separate lets either be used alone and lets both compose without a new
  grammar.
- **The declaration owns the deprecation.** Reading the holder from `tool_entry` means a handover immediately
  moves the warning to the new owner's filtered list, with no migration and no stale copy to reconcile.
- **Blank is absent.** Trimming and treating an empty owner as no filter matches the rest of the registry and
  prevents a query for an account that cannot exist from looking like an empty account.

## Tradeoffs (stated, not implied)

- **The filtered paths join.** `tool_deprecation` has no owner column, deliberately. The join is against a
  primary-key lookup on a table bounded by "one row per deprecated tool"; if this list ever grows enough for the
  join to be measurable, a materialized owner key would be the alternative, not a second source of truth.
- **Ownership is current, not historical.** A deprecation follows the tool through a handover. Asking for the
  former owner's warnings does not return it; the handover chain is the record of where it went.
- **`total` is filtered, so it changes with the selection.** That is the point: two different `owner=` values
  describe two different sets. A caller that needs the registry-wide count omits the filter.
- **A foreign cursor is still a bound.** The pair names a position, not a membership test. This is deliberate:
  a cursor must survive the withdrawal or handover of the row it came from without becoming an invalid request.
- **No replacement filter and no multi-owner selection.** This increment answers one holder at a time; those
  would be separate questions with their own cursor and count semantics.

## Evidence

- `mvn -o -q -Dtest='ToolServiceTest,ToolControllerTest,JsonPointersTest' test` — **228/228** (145 service, 80
  controller, 3 pointer-walk): the owner narrowing the window and the count; the owner composing with the pair
  cursor; a blank owner read as absent; the controller echoing a trimmed owner and emitting six fields; the
  existing offset and cursor paths still reaching their repositories.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5p over HTTP, against PostgreSQL:
  three deprecations across two accounts, `owner=<other>` answering `total=2` and `owner=<owner>` answering
  `total=1`; the filter echoed trimmed; a blank owner returning all three; the pair cursor walking one owner's
  two rows without a repeat while a cursor from the other owner left that owner's count at 1 and the page
  empty; the offset path keeping the same filter and order; the temporary deprecations withdrawn so §6 still
  counts one.
- **Still not graded, stated:** no replacement filter, no multi-owner selection, no historical-owner filter, and
  no index dedicated to the filtered ordering expression.

## Date

2026-11-06