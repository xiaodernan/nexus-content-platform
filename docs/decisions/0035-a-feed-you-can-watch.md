# 0035 — A feed you can watch: two narrowings that never lie about what they hid

- **Status:** Accepted (v584, `GET /tools/changes?kind=&toolId=&since=&limit=&offset=`)
- **Date:** 2026-11-03
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0034 (the journal), 0027 (catalog search), 0033 (the `deprecated` filter)

## Context

v583 gave the registry a feed: one entry per accepted write, oldest first from a `seq` cursor. Every poller
that wants it now receives **the whole registry** — every update to every declaration — and filters locally.
The two changes that journal exists for are exactly the ones a watcher wants alone: a **removal** (a name it may
be holding has been released) and a **deprecation** (a contract it may be depending on is going away). Asking
for the entire feed to find those is the same mistake the catalog had before v582, when an agent had to fetch
`/tools` and `/tools/deprecations` and subtract.

There are two natural narrowings, and they are not the same question:

- **by kind** — "tell me only when something is removed" (a watcher's standing interest);
- **by declaration** — "tell me everything that ever happened to this tool" (a lifecycle view, including the
  entries whose rows state has already forgotten).

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Scope | Client-side filtering of the whole feed | The feed grows with the registry; every poller pays for every tenant's writes, and "how many removals are there" cannot be answered without paging the entire journal first |
| Scope | **Server-side `kind` and `toolId`** | **Chosen** — the reader asks for what it watches; the count comes back narrowed with it |
| Shape | Four separate repository statements (kind, tool, both, neither) | Four places to keep the same three predicates in step; a filter that narrows the window but not the count is precisely the bug this door must not have |
| Shape | **Two nullable parameters on ONE statement, used by the window and the count** | **Chosen** — the same shape the catalog already uses for `owner` / `q` / `deprecated`, so the window and the count cannot disagree about which filters applied |
| `kind` | Accept any string; an unknown word answers an empty page | An empty page is a true answer to "nothing matched" and a LIE about "you spelled it wrong". A poller that mistypes `removed` would conclude the registry is quiet |
| `kind` | **A closed set, refused BY NAME (400), case-sensitive** | **Chosen** — the six words are the protocol, not a query language; `Removed` is a typo, and the refusal names all six so the call can be fixed without reading the source |
| `kind` | Case-insensitive matching | It would accept two spellings of one word into a feed whose entries carry exactly one, so a filter would answer rows whose `kind` does not equal what the caller asked |
| `toolId` | 404 when the id names no current declaration | The journal records what **was**. An id whose row is gone — the removal case, the whole reason this feed exists — would be refused by the read that is supposed to reveal it |
| `toolId` | **An empty feed with `total: 0`** | **Chosen** — an id the journal never saw and an id whose rows are all older than the cursor answer the same true thing: nothing here |
| `toolId` | Bound its length like a search term (100) | A search term is a PATTERN and its bound limits work; an id is an equality comparison, so length costs a comparison rather than a scan. Refusing a long id would invent a rule with no cost behind it |
| Echo | Return only the rows | A caller cannot tell "narrowed to nothing" from "the filter was ignored" |
| Echo | **Echo `kind` and `toolId`, with null for the absent filter** | **Chosen** — the same rule the catalog follows for `owner`, `q` and `deprecated`; blank is the absent filter and is echoed as null, never as `""` |
| Index | None — the journal is small for now | A filter that walks the whole table per poll becomes a promise the door cannot keep as the feed grows, and a poller polls forever |
| Index | **`(kind, seq)` and `(tool_id, seq)`** | **Chosen** — both narrowings are "one value, then a range on the cursor", which is the shape these indexes serve |

## Choice

`GET /tools/changes` accepts two more optional parameters. `kind` is one of `declared`, `updated`,
`transferred`, `deprecated`, `undeprecated`, `removed`; anything else — including a different case — is a 400
whose message names all six. `toolId` is an exact id. Both narrow the page **and** `total`, compose with each
other and with `since`, and are echoed in the answer (null when absent or blank). The envelope grows from five
fields to seven: `{since, kind, toolId, changes, total, limit, offset}`. An entry is unchanged: the same six
fields, the same oldest-first order. `tool_change` gains `idx_tool_change_kind_seq` and
`idx_tool_change_tool_seq`.

## Reason

- **A watcher's question is smaller than the feed.** "Tell me when something is removed" is a standing
  subscription, and answering it with the whole registry makes the feed's cost grow with every other tenant's
  writes. A narrow read is also the only way `total` can mean anything to a watcher: `total: 3` removals is a
  fact about removals, not about the registry.
- **The refusal is the feature.** A closed vocabulary with a named refusal turns a silent "quiet registry" into
  a loud, fixable error — the same reasoning that made a malformed name a 400 rather than an empty read.
- **The journal must not answer 404 for what it exists to reveal.** An id whose declaration is gone is the most
  important thing this feed can hold; a 404 would be the read refusing its own subject.
- **One statement, so the number matches the page.** The failure mode of a filtered list is a count that
  describes a different filter than the window. Sharing the predicates is the structural fix, not a test.

## Tradeoffs (stated, not implied)

- **Two narrowings, not a query language.** There is no `sinceKind`, no OR, no negation, and no ordering choice.
  A caller that wants "removals and deprecations" makes two calls.
- **No owner filter.** The journal is public, like the catalog; there is no per-account feed, so a tenant
  watching its own tools filters by `toolId` one tool at a time.
- **The index is not a projection.** Both narrowings still read the entry rows; there is no covering index, and
  a kind filter over a very large journal still sorts by `seq` within the matching set (the composite index
  provides that order).
- **No retention still.** The journal grows unbounded; filtering makes reading it cheaper, not smaller.
- **`toolId` is not validated as a shape.** Any string is accepted and simply matches nothing; the id space is
  the service's, not a consumer's, and the journal may hold ids this build's rules would no longer mint.

## Evidence

- `mvn -Dtest='ToolServiceTest,ToolControllerTest' test` — **143/143** (91 service, 52 controller). v584
  contributes 5 service cases (a kind narrowing the window and the count; a declaration narrowing both; the two
  together, with the trims applied; a blank kind and blank id as the absent filters; an unknown kind refused
  before any query, including a capitalised one) and 4 controller cases (both narrowings echoed; absent ones
  echoed as JSON null; an unknown kind refused before the service is touched; an id that holds no entry answered
  as an empty feed).
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5f over HTTP against a real
  PostgreSQL: `kind=removed` answers exactly the removals the whole feed carried, with the narrowed count and
  `psql` counting the same rows; `toolId` answers the removed tool's whole life — `declared, updated, updated,
  removed` — as exactly the slice the whole feed carried; the two compose to one row still carrying its name; a
  cursor inside a narrowed set keeps that set's count; a blank kind or id is the absent filter (echoed null,
  whole feed again); `kind=pruned` is a 400 naming all six words and `kind=Removed` a 400 naming itself; an id
  the journal never saw is an empty feed with `total=0`; and `pg_indexes` shows both `(kind, seq)` and
  `(tool_id, seq)` indexes.
- **Still not graded, stated:** no owner-scoped feed, no OR/negation, no journal retention, no covering index.

## Date

2026-11-03