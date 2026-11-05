# 0050 — A warning list can be selected by replacement state

- **Status:** Accepted (v620, `GET /tools/deprecations?replacementStatus=`, the filter composed with owner and the
  pair cursor, the 241 tools cases and the live-PostgreSQL run)
- **Date:** 2026-11-06
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0047 (the pair cursor), 0048 (the owner filter), 0049 (the derived replacement state)

## Context

By v619 every deprecation row said whether its replacement hint was `none`, `unresolved`, `live` or
`deprecated`. A consumer could therefore read the warning list and see which substitutions were actionable — but
it had to read every warning first and discard the rows in the other three states. That is the same failure the
owner filter closed in v618: the page and the count would describe a set larger than the question.

The state is derived, not stored (ADR 0049), so a filter over it cannot be a plain indexed column. It has to be
the same rule the read already resolves, applied to the window and the count, and it has to compose with the
current owner filter and the pair cursor without changing the order.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Existence | No filter; the client discards rows | A page can be filled by warnings the caller cannot use, and `total` answers a set the caller did not ask for |
| Existence | A second resource for each state | Four lists would drift in order, cursor grammar, row shape and count semantics from the one public warning list |
| Existence | **`replacementStatus=` on the existing list** | **Chosen** — one list, one order, one pair cursor, and a filter that narrows both the window and the count |
| Storage | Store the state on `tool_deprecation` | It would drift the moment the target is declared, removed, handed over, deprecated or un-deprecated; ADR 0049 deliberately computes it |
| Storage | **Use the derived predicate in SQL** | **Chosen** — the filter and the row's own `replacementStatus` read the same current rows and cannot disagree |
| Vocabulary | Accept any string and answer an empty page | A typo would look like "no warning is in that state"; the four words are a closed protocol |
| Vocabulary | **Refuse anything outside `none`, `unresolved`, `live`, `deprecated`, case-sensitively** | **Chosen** — the 400 names the vocabulary, the same rule the journal's `kind` follows |
| Absence | Treat a blank state as `none` | `none` is a real state (the warning names no successor), not the absence of a filter |
| Absence | **Null when absent or blank** | **Chosen** — a blank statement is no filter, echoed as null like every other list filter |
| Composition | Replace the pair cursor with a status cursor | Status is a membership test, not a position; the pair already names the total order exactly |
| Composition | **AND the predicates; keep the pair cursor and offset paths** | **Chosen** — every filter is an `AND`, every answer reports the narrowed whole count, and the cursor remains a value |
| Cost | Resolve all warnings in memory and filter | Unbounded work and a count that is only true for the page; the predicate belongs in the statement |

## Choice

`GET /tools/deprecations?owner=&replacementStatus=&before=&limit=&offset=`:

- `replacementStatus` is trimmed and one of `none`, `unresolved`, `live`, `deprecated`; a blank or absent value
  is null and means every state. Anything else is 400 `invalid-tool`, naming all four accepted words.
- The predicate is the SAME derived rule the row carries:
  - `none` — `replacement_name is null`.
  - `unresolved` — a non-null hint with no declaration holding that name.
  - `live` — a declaration holds the name and does not carry a deprecation.
  - `deprecated` — a declaration holds the name and carries a deprecation.
- `owner` and `replacementStatus` are independent `AND` filters; both narrow the window and the whole count.
- The pair cursor composes: `before=<epochMillis>:<toolId>` resumes inside the selected owner and state, with
  the same `date_trunc('milliseconds', deprecated_at) DESC, tool_id ASC` order. The offset path keeps the same
  filters and order.
- The envelope grows to seven fields: `{owner, replacementStatus, deprecations, total, limit, offset, before}`.
  The row shape does not change; it already carries the same state that selected it.
- Two API-facing reads share one predicate: `firstPageFiltered` and `pageAfterFiltered`, plus
  `countFiltered`. Existing unfiltered and owner-only repository paths remain for callers that ask no state
  question.

## Reason

- **A filter should select, not decorate.** If the window hid three states while `total` counted all four, a
  caller could page past rows it would never see. Narrowing both is the rule every other list already follows.
- **The filter and the row must use one definition.** Computing the state in Java for display but filtering in a
  different query would let an answer contain a row whose `replacementStatus` is not the requested one. The
  predicate is one string used by the window and its count.
- **Status is not a cursor.** `live` is a set of rows whose targets currently carry no warning; it has no place
  in the total order. The pair `(deprecatedAt, toolId)` remains the only cursor, and composition keeps both
  correct.
- **A closed vocabulary is kinder than an empty page.** Four words are the protocol. A caller that spells
  `LIVE` or `gone` is told what the protocol accepts instead of being told, falsely, that no warning matches.
- **Nothing is stored.** `tool_deprecation` stays four columns. A successor declared later moves a warning from
  `unresolved` to `live` on the next read and needs no migration.

## Tradeoffs (stated, not implied)

- **The predicate is a correlated set of `EXISTS` subqueries.** It cannot use a plain index on
  `replacement_name`, and the page is sorted by an expression that already cannot use a plain index. The
  deprecation table is bounded at one row per deprecated declaration, and the cost is stated rather than hidden
  behind a materialized state column.
- **A state can change between pages.** Declaring, removing or deprecating a successor can move a row into or
  out of the selected state. The pair cursor still resumes at a value, so paging under an unchanged state
  filter neither repeats nor skips a row that stays in the set; a row that leaves the set is simply absent.
- **`none` is not "no filter".** It selects warnings with no replacement hint. An absent `replacementStatus`
  is the only way to ask for all four states, and it is echoed as null.
- **No free-text replacement-name filter and no multi-state selection.** This increment answers one state at a
  time. Selecting two states or matching a hint by text would be separate questions with their own count rules.
- **No chain following.** `deprecated` means the immediate successor carries its own warning. It does not ask
  whether that successor's successor is safe.

## Evidence

- `mvn -o -q -Dtest='ToolServiceTest,ToolControllerTest,JsonPointersTest' test` — **241/241** (154 service, 84
  controller, 3 pointer-walk): the state narrowing the window and the count; owner and state composing with the
  pair cursor; a blank state reading as absent; an unknown or uppercase state refused before any query; the
  controller echoing the trimmed state and emitting a seven-field envelope.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5r over HTTP, against PostgreSQL: one
  warning in each of `none`, `unresolved`, `live` and `deprecated` answered its own filter with `total=1` and the
  other states answered nothing; the filter was echoed and a blank was the absent filter returning all four;
  owner and state narrowed together (1 and 0 on real state); after re-pointing a second warning at a live target,
  the pair cursor walked the two `live` rows one page at a time with `total=2` and no repeat; `gone` was 400
  `invalid-tool` naming the closed vocabulary; all temporary warnings and the temporary live target were removed,
  so §6 still counted one deprecation and four declarations.
- **Full service checkpoint after v620:** **877/877** across 43 classes (871 after v619 plus this increment's six
  new cases), exit 0. The targeted 241/241 above is the tools package's number for v620.
- **Still not graded, stated:** no multi-state selection, no hint-text filter, no stored state, and no
  notification when a warning changes state.

## Date

2026-11-06