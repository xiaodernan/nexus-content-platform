# 0047 — A deprecation page is ordered by a PAIR

- **Status:** Accepted (v617, `GET /tools/deprecations?before=`, the 400s `invalid-tool` for a malformed pair and
  for `before` beside `offset`, the fifth envelope field, the 224 tools cases and the live-PostgreSQL run)
- **Date:** 2026-11-06
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0025 (deprecation as its own resource with a public list), 0043 (the catalog's keyset cursor)

## Context

`GET /tools/deprecations?limit=&offset=` walks the public warning list newest first. An offset is a POSITION in a
list, and this list is written to: an owner can deprecate another declaration, withdraw one, or remove the
declaration and take its deprecation with it. A write before the page already read renumbers every later
position, so the next offset can repeat a row or skip one while the answer still looks full and `total` still
looks right.

The catalog solved the same problem in ADR 0043 by naming the last NAME it saw. The deprecation list cannot
reuse that cursor: its order is TIME, not name. Nor is the instant alone unique — two owners can deprecate in
the same millisecond — so a cursor carrying only `deprecatedAt` would leave a tie with no deterministic place to
resume. The public row exposes `deprecatedAt` as epoch milliseconds and the database stores microseconds, so the
cursor must use the precision the caller can actually see and reproduce from the row.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Cursor | Keep `offset` and document the hazard | A page that repeats or skips a row is the failure the caller cannot detect; documenting it does not make a mirror correct |
| Cursor | The tool id alone | The id is unordered and unrelated to the list's meaning: "after this id" is not "older than this deprecation" |
| Cursor | The instant alone | Instants tie; a cursor at a tie has no unique place to resume and can replay or skip the rest of the tie |
| Cursor | **The pair `(deprecatedAt, toolId)`, as `before=<epochMillis>:<toolId>`** | **Chosen** — the exact sort key, the id breaks ties deterministically, and the caller can build it from `deprecatedAt` and `toolId` in the row it just read |
| Precision | Compare the raw database microseconds while the row prints milliseconds | The cursor would name precision the response never carried; a caller could not reproduce it, and truncation could leave the next page empty at a tie |
| Precision | **Truncate the ORDER to the row's millisecond, then break ties by id** | **Chosen** — the order is exactly what the wire exposes, so the echoed cursor and the visible rows agree |
| Validity | Accept any string and let the database compare | An arbitrary string slices the list at a point no row can occupy; a typo becomes a silent different question |
| Validity | **Refuse anything but `<digits>:<toolId>`; blank is absent** | **Chosen** — the 400 names the shape before the query runs |
| Combination | Compose `before` with `offset` | Two cursors over one window is how a page skips a row while looking correct |
| Combination | **Refuse a non-zero `offset` beside `before`, naming both** | **Chosen** — one window, one cursor |
| Count | Narrow `total` by the cursor | The caller uses `total` to know the size of the whole warning list; narrowing it would make the count agree with the page and lie about the set |
| Count | **`total` stays the whole deprecation table** | **Chosen** — the same rule the other list doors follow |

## Choice

`GET /tools/deprecations?limit=&offset=&before=<epochMillis>:<toolId>`:

- Rows are ordered `date_trunc('milliseconds', deprecatedAt) DESC, toolId ASC`. The millisecond is the value the
  response carries; the id makes a tie total.
- `before` is trimmed. A blank or absent cursor is `null` and reads the first page. A cursor that is not
  `<non-negative digits>:<toolId>` — no colon, an empty half, non-digits, an id over 64 characters, or an
  instant outside Java's range — is 400 `invalid-tool` naming the shape.
- A valid cursor is echoed in the envelope as the canonical pair, or `null`; the envelope is now
  `{deprecations, total, limit, offset, before}`. The row shape does not grow: the caller already has both
  values needed to make the next cursor.
- `before` beside a non-zero `offset` is 400 naming the offset. A cursor path always asks for page 0 of the
  remaining rows; the offset path still exists for callers that want an absolute position and keeps its hazard.
- `total` is `count()` over the whole deprecation table, never narrowed by the cursor or the window.
- The two repository paths use the same order: `firstPage(Pageable)` for offset reads and `pageAfter(at, id,
  Pageable)` for cursor reads. Both truncate with PostgreSQL `date_trunc('milliseconds', deprecated_at)`, so the
  database's microseconds cannot disagree with the millisecond the wire prints.
- No new column and no new index. The ordering expression is not indexable, so both paths sort the deprecation
  table; that table is bounded by "one row per deprecated tool", not by the number of declarations or revisions,
  and the cost is stated rather than hidden behind a second stored key.

## Reason

- **A cursor should be the same value the order is made of.** The caller renders `deprecatedAt` and `toolId`;
  carrying those two values back is a cursor it can construct without a hidden field or another read.
- **A tie needs a second component.** Instants are not unique, and a list of one row per tool gives no natural
  tiebreaker except the tool id. Using it makes the order total and the page boundary exact.
- **Visible precision must equal ordering precision.** The row prints milliseconds. Ordering on microseconds
  would create a cursor that cannot be reconstructed from the response and can appear to lose rows at the edge
  of a millisecond.
- **Refusing a malformed pair is the same honesty as refusing a malformed pin or name.** A cursor no row could
  carry is not a smaller page; it is a different question, and the 400 says which shape is accepted.

## Tradeoffs (stated, not implied)

- **The order is millisecond-granular.** Two deprecations in the same millisecond are ordered by tool id, not by
  the microseconds stored underneath. That is deliberate: the wire does not expose the finer value, so pretending
  it does would make the cursor unreproducible.
- **The cursor path is a sort, not a range scan.** `date_trunc` cannot use a plain index on `deprecated_at`.
  The table is one row per deprecated tool and the bound is stated; a materialized normalized key would be the
  alternative if this list ever grows to a size where the sort is measurable.
- **No forward `after` and no reverse order.** This is the newest-first list's only cursor. A reverse page would
  need its own comparison and is not built.
- **A well-formed pair that names no row still bounds the window.** The cursor is a value, not a foreign key;
  that is the property that lets a row be withdrawn between pages without invalidating the next request.
- **Offsets remain served.** They are still positions writes can renumber; `before` is the door that is not.
- **`total` does not shrink as the caller pages.** The end of the set is a short page, not `total == offset +
  rows`, because `total` describes the whole warning list.

## Evidence

- `mvn -o -q -Dtest='ToolServiceTest,ToolControllerTest,JsonPointersTest' test` — **224/224** (142 service, 79
  controller, 3 pointer-walk): the cursor reaching `pageAfter` while the offset path stays on `firstPage`; a
  cursor with a non-zero offset refused before either query; a malformed cursor refused by shape; a blank cursor
  reading as absent; the echo in canonical form; the five-field envelope with `before: null` on the first page.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5o over HTTP, against PostgreSQL:
  three deprecations tied to one instant in psql, ordered by tool id, walked one row at a time from `before=`
  with no repeat and `total=3` on every page; an empty tail past the last pair; `before` beside `offset=1` 400
  `invalid-tool` naming the offset; `not-a-pair` and `abc:<id>` 400 naming `<epochMillis>:<toolId>`; a blank
  cursor reading as absent and returning the first rows; the two temporary deprecations withdrawn so §6 still
  counts one.
- **Still not graded, stated:** no forward `after`, no reverse order, no index for the ordering expression, no
  cursor carrying owner or name, and no narrowing of `total` by the cursor.

## Date

2026-11-06
