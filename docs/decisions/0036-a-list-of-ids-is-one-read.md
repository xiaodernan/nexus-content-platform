# 0036 — A list of ids is one read, and it names the ones that held nothing

- **Status:** Accepted (v587, `GET /tools/batch?id=&id=…`)
- **Date:** 2026-11-03
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0022 (the registry), 0034 (the journal), 0035 (the watchable feed)

## Context

The registry can answer one declaration by id, one by name, a filtered catalog, and — since v583 — a feed of
what changed. What it cannot answer is the shape a caller actually holds after reading that feed: **a list of
ids**. A poller that sees three declarations change must make three requests; a planner holding twelve candidates
must make twelve. Each request re-does the same connection, the same lookup and the same pin computation, and a
partial failure leaves the caller with no way to say which of its ids it never got.

The registry's other reads are all shaped after their answer: a catalog is a window with a total, a declaration
is a row or a 404, a history is a window facing backwards. A list is none of those, and pretending it were a
window would invent a `total` nobody asked for.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Transport | One comma-separated `?ids=a,b,c` | An id is an OPAQUE string minted by this service, and a separator would invent an escaping rule the id space does not have. A comma inside an id would silently split it into two ids nobody asked for |
| Transport | A `POST` body `{ids:[…]}` | A read should not need a body, and `GET` is cacheable, linkable and trivially retryable; a body would also invite a bigger request than a read should express |
| Transport | **Repeated `?id=` parameters** | **Chosen** — no separator, no escaping, and the framework hands the door an ordered list |
| Order | Catalog order (name ascending) | It would reorder the caller's list, so the answer could no longer be zipped with the list that was sent — the caller's order is the caller's structure |
| Order | **Request order, duplicates collapsed in first-seen order** | **Chosen** — a batch answer is the caller's list minus what held nothing, in the caller's own order |
| Unknown id | 404 | This is a read of a LIST, not of one row. Failing all of it because one id is gone turns the question "what do these ids hold" into a question the caller cannot ask |
| Unknown id | Silently omitted | The caller cannot tell a gap in its own list from an empty registry |
| Unknown id | **Omitted AND named in `missing`** | **Chosen** — the answer says which ids held nothing, so the caller learns exactly which of its own references are stale |
| Count | `tools` only | `found` alone cannot distinguish "I asked for 3 and got 2" from "I asked for 2" |
| Count | **`{requested, found, tools, missing}` with `found + missing.size() == requested`** | **Chosen** — a property the caller can check, beside the list that explains it |
| Duplicates | Refuse a duplicate id | Naming an id twice is asking for one row twice; there is nothing to refuse, and a caller building a list from a set algebra will produce duplicates routinely |
| Blanks | Treat `?id=` as an id that names nothing | A blank is not an id — the same rule every filter in this service follows; otherwise `?id=a&id=` reports a stale reference the caller never made |
| Bound | No bound | An unbounded `IN` list is a query the caller controls the size of, and a request that names ten thousand ids is a scan wearing a read's clothes |
| Bound | **At most 50 DISTINCT ids, refused by name** | **Chosen** — enough for a page of the feed, small enough to bound the query; the bound counts distinct ids, because a hundred copies of one id is still one id |
| Shape | A window with `limit`/`offset` | A list is not a window: its length is the caller's, and a `total` would mean nothing beside it |
| Pin | Omit it (a batch is a summary read) | A batch row must be the SAME declaration every other read serves, or a caller comparing two answers would see a difference the registry does not have |

## Choice

`GET /tools/batch?id=<id>&id=<id>…` answers `{requested, found, tools, missing}`. The ids are trimmed, blanks
dropped and duplicates collapsed in first-seen order; if nothing remains the door is a 400 ("a batch read names
at least one id"), and more than 50 distinct ids is a 400 that names the bound. Rows are the same seven-field
declarations the catalog and the single reads serve, pins included, in **request order**. An id that holds
nothing is listed in `missing` and does not fail the request. The door reads through one `findAllById` and one
pin computation per row.

## Reason

- **The feed creates this shape.** v583–v584 made "what changed" cheap to answer; the next question is "what are
  those now", and the honest cost of that question is one request, not one per change.
- **The caller's order carries meaning.** A planner ranks candidates; a poller correlates its own cursor
  bookkeeping with the list it sent. Re-sorting by name would destroy information the caller supplied for free.
- **`missing` is the answer, not an error.** The registry's most important fact about an id can be that it no
  longer holds a row. A 404 for the list would hide that behind a failed request; naming it beside the found
  rows states it exactly.
- **One statement per batch.** `findAllById` is one `IN` query, so the cost is one round trip and one pin per
  row — the same work the single read does, without the per-request overhead multiplied by the list's length.

## Tradeoffs (stated, not implied)

- **No partial windows.** There is no `limit`/`offset` and no `total`: the answer is exactly as long as the list
  the caller named (minus what held nothing). A caller that wants a window wants the catalog.
- **`missing` does not say WHY.** An id can name nothing because it was removed, because it never existed, or
  because the caller mistyped it. The journal can answer the first; this door only says that it holds nothing.
- **No ETag.** A list answer is not one contract, so there is no single pin to compare. Each row carries its own
  pin, which a caller can compare row by row.
- **Bounded at 50, not paged.** A caller with more than 50 ids makes more than one request; there is no cursor
  for a list, because the list is the caller's, not the registry's.
- **Not a subscription.** The door reads once; a caller that wants to be told about changes uses the feed.

## Evidence

- `mvn -Dtest='ToolServiceTest,ToolControllerTest' test` — **152/152** (96 service, 56 controller). v585
  contributes 5 service cases (trim/dedupe/first-seen order; the answer in request order though the repository
  answers in its own; an id that holds nothing omitted; no id at all refused, twice, before any query; the bound
  counting DISTINCT ids so a hundred copies of one id pass) and 4 controller cases (order and `missing` echoed
  with blanks dropped and a duplicate collapsed; every row still the seven-field declaration with its pin; no id
  refused before the service is touched; over the bound refused before the service is touched).
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5g over HTTP against a real
  PostgreSQL: three distinct ids asked for (a duplicate collapsed) answer two declarations in the order asked,
  each field for field identical to what `/tools` serves including the pin, with the third named in `missing`;
  a removed id answers `found: 0` with itself in `missing` rather than failing; every id the feed ever updated
  is answered as a row or a name in `missing`, so nothing is silently dropped; a batch of blanks is a 400 naming
  "at least one id"; 51 ids are a 400 naming the cap of 50; and a query string with no `id` at all is refused
  the same way.
- **Still not graded, stated:** no partial windows, no `total`, no ETag, no reason for a `missing` id, and no
  paging beyond the 50-id bound.

## Date

2026-11-03