# 0043 — A keyset page is a NAME, not an offset

- **Status:** Accepted (v613, `GET /tools?after=`, the 400s `invalid-tool` for a non-name and for
  `after` beside `offset`, the ninth envelope field, the 185 tools cases and the live-PostgreSQL run)
- **Date:** 2026-11-05
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0027 (the catalog and its search), 0033 (`deprecated`), 0038 (`tested`), 0023 (the row
  has a global unique name)

## Context

`GET /tools?limit=&offset=` walks the catalog in NAME order. An offset is a POSITION in a list, and this list
is written to: a registration that sorts before the page already read pushes every row after it one place
forward, so the next `offset` answers a row the caller has already seen; a removal does the opposite and the
row that moved into the hole is never served. Neither failure is visible in the answer — the page is full,
`total` is right, and the callers most likely to page (an agent mirroring the catalog) are exactly the ones
whose window is most likely to move. The registry already has the value this needs: the name is globally
unique and the order is by name, so the last name a caller saw names the same position in the set no matter
what is inserted or deleted behind it.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Cursor | Keep `offset` and document the hazard | A correct-looking page that repeats or skips a row is the failure mode a caller cannot detect; documenting it does not fix a mirror |
| Cursor | The row `id` as the cursor | An id is opaque and unordered: "after this id" would need a second lookup to turn it into a position, and a removed row leaves the caller holding a value that no longer names a place in the set |
| Cursor | **The last NAME seen, `after=<name>`** | **Chosen** — the name IS the sort key and the unique key, so the cursor is the position, survives the row's removal, and needs no extra read |
| Validity | Accept any string and compare it | An uppercase or spaced string still orders in the database, but it slices the catalog at a point no name can occupy; a mistyped cursor would silently answer a window whose edges the caller cannot see |
| Validity | **Refuse anything that is not a tool NAME; a blank cursor is the absent one** | **Chosen** — the same rule registration follows, refused by name before the query runs |
| Combination | Let `after` and `offset` compose | Two cursors over one window: the database would apply an offset to an already-sliced set, which is how a page skips a row while looking correct |
| Combination | **Refuse a non-zero `offset` beside `after`, naming both** | **Chosen** — one window, one cursor |
| Count | Narrow `total` by the cursor | The count is what the caller uses to know how much of the set remains unseen; narrowing it would make `total` agree with the page and lie about the set |
| Count | **`total` stays the whole FILTERED set** | **Chosen** — the same rule every filter here follows; a page shorter than `limit` is the end of the set |

## Choice

`GET /tools?owner=&q=&deprecated=&tested=&after=<name>&limit=&offset=`:

- Rows are still NAME ascending. `after` answers the rows whose name sorts strictly after it; a name that
  holds no row still bounds the window (the cursor is a VALUE, so removing the row does not break paging).
- The cursor is trimmed, validated as a tool name, and echoed in the envelope as `after`; blank or absent is
  `null`, and the envelope is now nine fields.
- A non-name is 400 `invalid-tool` with a message containing "not a tool name". `after` beside a non-zero
  `offset` is 400 naming both and containing "offset".
- `total` is the whole set the four filters select, never narrowed by the cursor.
- The composed statement gains one clause, `and (:afterKey is null or t.name > :afterKey)`; `countCatalog`
  deliberately does not take a cursor. The plain derivations (`findAllByOrderByNameAsc`, `count`,
  `countByOwner`, the search counts) are used only when all four filters and the cursor are absent.
- No new column, no new index: the unique index on `tool_entry.name` is already the order the range scan
  needs, and the cursor is a name the caller already carries.

## Reason

- **The cursor should be the same value the order is made of.** A page is a slice of a set; a position in a
  list is not, because writes renumber it. Remembering the last name is something a caller already does to
  render the page, so the fix costs the caller nothing new to track.
- **A value cursor survives what an id cursor does not.** The row may be removed between pages (that is one
  of the two writes that made offsets unsafe); the name still orders, so the next page is still well defined.
- **Refusing a non-name is the same honesty as refusing a malformed pin.** A cursor that no name can equal
  is not a smaller page, it is a different question; the 400 names the rule instead of answering it.

## Tradeoffs (stated, not implied)

- **No `before` and no reverse order.** This is a forward cursor for a set that only grows at the end of the
  reader's walk; a backward page needs its own comparison and is not built.
- **A name is not a composite key.** The order is `name` alone, so a future order by another column (owner,
  creation instant) cannot reuse this cursor; that would be a different keyset with a different tuple.
- **The comparison is the database's collation.** Names are a lowercase ASCII slug, so the collation orders
  them the same way byte order does; a name alphabet outside that shape would make the cursor and the
  visible order disagree, which is one more reason the name rule is fixed (ADR 0023).
- **`total` does not shrink as the caller pages.** That is the point, but it means the end of the set is
  signalled by a short page, not by `total == offset + rows`. A caller that wants the remaining count
  computes it from what it has read.
- **Offsets are still served** for callers that want an absolute position, and they still carry the hazard;
  `after` is the door that does not.
- **No cursor for the journal or the revision history.** Their cursors are ordered integers (`seq`,
  `revision`), which are already immutable values rather than positions in a mutable list.

## Evidence

- `mvn -Dtest='ToolServiceTest,ToolControllerTest' test` — **185/185** (117 service, 68 controller): the
  cursor reaching the composed query while `countOf` stays the whole set, a cursor with a non-zero offset
  refused before the repository is asked, a non-name refused, a blank cursor reading as absent, the echo
  trimmed, and the nine-field envelope.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5k over HTTP, against PostgreSQL:
  two rows at a time from `after=` walked big.tool → m.tool → weather.lookup → z.tool with no row twice and
  `total=4` on every page, a page past the last name empty; registering `a.tool` before the first page made
  `offset=2` repeat `m.tool` while `after=m.tool` still resumed at `weather.lookup` and `total` grew to 5; an
  uppercase cursor 400 `invalid-tool`, `after` beside `offset=1` 400 naming the offset, a blank cursor
  `null` and starting at the first name; the temporary row removed so §6 still counts four.
- **Still not graded, stated:** no `before`, no reverse order, no composite keyset, no cursor for the
  journal or the revision history (their integer cursors are already immutable).

## Date

2026-11-05