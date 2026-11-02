# 0033 — The catalog can name the rows that are going away: a `deprecated` filter, not a column

- **Status:** Accepted (v582, `GET /tools?deprecated=true|false`, the echoed flag and the narrowed count)
- **Date:** 2026-11-03
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0022 (the catalog), 0025 (deprecation as its own resource), 0027 (search narrows the count)

## Context

Deprecation became its own resource so that a declaration's row would not grow a field for it. The consequence
was measured at the time and left as a bound: an agent browsing the catalog cannot tell which rows are going
away, and an agent that needs to know must fetch `GET /tools` AND `GET /tools/deprecations` and subtract them
client-side. That is a second request, a client-side join, and a window that cannot say "of these twenty, four
are leaving".

The obvious repair — a `deprecated: true` boolean on every declaration row — was refused, and for the same reason
the field was refused the first time: the row would then carry a fact that lives in another table, and a reader
could not tell which of the two is true after a partial write.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Shape | A `deprecated` boolean on each catalog row | The row would state a fact stored in `tool_deprecation` — two places to keep true, and the declaration's seven fields were deliberately kept free of it |
| Shape | **A QUERY filter: `?deprecated=true\|false`** | **Chosen** — it answers the question the agent actually has ("show me the ones leaving", "hide them") without changing what a row SAYS |
| Shape | A separate `GET /tools/deprecated` door | A second catalog with its own paging, ordering and bounds would have to be kept in step with this one; the filter reuses all of it |
| Polarity | Only `true` (a "departing" view) | Half the question. An agent choosing a capability wants the live ones; an agent auditing wants the other half |
| Polarity | **Both, with the absent flag meaning both** | **Chosen** — the same three-state shape `owner` and `q` already have |
| Query | One query with a nullable polarity (`(:deprecated = true) = exists(...)`) | Harder to read and easy to get wrong in either direction; the polarity is a small closed set, so two explicit statements say what they mean |
| Query | **Two statements: one `exists`, one `not exists`** | **Chosen** — each query says exactly one thing, and both are correlated subqueries over `tool_deprecation` |
| Composition | The filter replaces `owner`/`q` | They answer different questions; an agent may want "this owner's departing tools about images" |
| Composition | **All three compose, narrowing the window AND the count** | **Chosen** — the rule every filter here follows |
| Echo | Nothing | A window of departing tools that did not say so could be mistaken for the whole registry |
| Echo | **`deprecated` in the envelope, null when absent** | **Chosen** — false must be echoed as false, not as absent, or a live-only window looks unfiltered |

## Choice

`GET /tools?owner=&q=&deprecated=&limit=&offset=`:

- `deprecated=true` answers only declarations that carry a deprecation row; `false` only those that do not;
  absent answers both, and the envelope echoes `null`.
- The flag composes with `owner` and `q`, and all three narrow the returned window AND the `total`.
- Order stays NAME ascending and paging is unchanged; the list envelope gains one field, `deprecated`.
- The rows themselves are unchanged: the filter decides WHICH declarations come back, never what one says.

## Reason

- **The question is a filter, not a field.** "Which of these are leaving" is a query over the catalog, and a
  query keeps the single-source rule that put deprecation in its own table.
- **Two requests to answer one question is a cost the caller pays forever.** An agent choosing a tool does this
  on every choice; the join is trivial for the service and awkward for every client.
- **The three-state flag is already the house shape.** `owner` and `q` are absent-or-present with the absent
  meaning "no filter"; adding a fourth rule for the third filter would be an exception with no reason.

## Tradeoffs (stated, not implied)

- **`deprecated=true` names the tool, not why.** The message and the replacement hint live on the deprecation
  resource; a caller that wants them still reads `GET /tools/{id}/deprecation` or the public list.
- **A join per row.** The filter is a correlated `exists` over another table; with an index on
  `tool_deprecation(tool_id)` (the primary key is the tool id) it is a lookup, but it is not free.
- **Two statements instead of one.** The composed queries are longer than a single nullable-parameter query, in
  exchange for each one saying exactly one thing.
- **The catalog is still not a change feed.** "What changed in the last hour" is not answerable here, and this
  filter does not pretend to answer it.
- **A wrong value is a framework 400.** `?deprecated=maybe` is refused by type conversion rather than by a rule
  of this service, the same as `?limit=abc` — an inconsistency this increment does not fix.

## Evidence

- `mvn -Dtest='ToolServiceTest,ToolControllerTest' test` — **122/122** (78 service, 44 controller). v582
  contributes 4 service cases and 3 controller cases: the deprecated and live queries never falling back to the
  unfiltered derivations; the flag composing with owner and search in ONE call rather than a second pass; an
  absent flag being the unfiltered catalog; and the envelope echoing `true`, `false` and `null` with the row
  shape unchanged at seven fields.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5d over HTTP: `deprecated=true` answers
  one row (`weather.lookup`) with `total=1`; `deprecated=false` the other three; an absent flag is `null` and all
  four; the flag composes with `owner` (1 and 0) and with the search (1 and 0 for the departing set, 3 for the
  live one); every answer echoes the flag it applied and every row keeps its seven declaration fields; and psql
  reads exactly one deprecation row. The live catalog also exercises the composed JPQL against PostgreSQL, which
  is where a nullable-parameter query would have failed if it were going to.
- **Still not graded, stated:** no "changed recently" feed, no deprecation text in the catalog rows, no
  framework-level rejection of a malformed boolean.

## Date

2026-11-03