# 0027 — A catalog you can search: substring over name and summary, with wildcards taken literally

- **Status:** Accepted (v577, the `q` filter, the literal-wildcard rule and the echoed term)
- **Date:** 2026-11-02
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0022 (the catalog), ADR 0023 (details), ADR 0024 (history), ADR 0025 (deprecation)

## Context

The registry can be read by id, by global name, by owner and as a name-ordered catalog. Every one of those
reads assumes the caller already knows what it is looking for. An agent choosing a capability usually does
not: it knows a word — "weather", "image", "summarize" — and must page a catalog sorted by names it cannot
guess. The catalog was complete and unusable for discovery.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Where | Filter in the client after fetching pages | The total would describe the page, not the catalog; a caller could not tell whether it had seen every match |
| Field | Search names only | A tool's name is a slug chosen by its author; the summary is where a capability is described in words |
| Field | **Case-insensitive substring of NAME or SUMMARY** | **Chosen** — the two fields a caller can see, matched the way a person searches |
| Matching | Prefix / tokenized / full-text index | A second tokenizer and an index are a larger decision; the catalog is small and a substring is the rule a reader can predict |
| Case | Case-sensitive | "Weather" and "weather" are the same intent; refusing one is a trap |
| Wildcards | Pass `%` and `_` through to SQL `LIKE` | A search for "%" would answer EVERY row while claiming to search for a percent sign — a lie about what was asked |
| Wildcards | **Escape `\`, `%` and `_`; declare the escape in the query** | **Chosen** — the term is searched for literally, and the database's dialect is not assumed |
| Composition | `q` replaces `owner` | They answer different questions; an agent may want "this owner's tools about images" |
| Composition | **`q` AND `owner` both narrow the window and the count** | **Chosen** — the same rule the owner filter already followed |
| Echo | Do not report the search | A window must say which catalog it is a window of; `owner` is echoed for exactly this reason |
| Echo | **`query` in the list envelope, trimmed, or null** | **Chosen** — the answer names the term it applied, and a blank term is reported as no filter |
| Bounds | No length bound | A pattern is work; 100 characters is far more than a capability word and bounds it. Over the bound is a named 400 |

## Choice

`GET /tools?q=&owner=&limit=&offset=`:

- `q` is trimmed; blank is the absent filter and is echoed as `null`. Over 100 characters is `400
  invalid-tool` naming the length.
- A search matches a declaration when the lowercased term is a substring of its lowercased NAME **or**
  SUMMARY. Wildcards are escaped, so `%`, `_` and `\` match only themselves.
- The search and the owner filter compose: both narrow the returned window and the `total`.
- The order stays NAME ascending; paging is the same limit/offset arithmetic as the unfiltered catalog.
- The list envelope gains one field, `query`, beside `owner`, so an answer always says which search it
  applied.

## Reason

- **Discovery is a different question from lookup.** A caller that knows a name uses `/tools/by-name`; a
  caller that knows a word needs a search, and the summary is where the word usually is.
- **The count must be the catalog's, not the window's.** Narrowing the query without narrowing the count
  would make a window claim to be complete. Both filters are applied to both numbers.
- **Literal wildcards are honesty.** A search is a search for text the caller typed. If `%` silently means
  "anything", the answer contradicts the request; escaping makes the rule predictable without a second
  syntax.
- **The echo is not decoration.** `owner` is echoed because a 20-row window of one account's tools must not
  be mistaken for the registry; a search term deserves the same treatment.

## Tradeoffs (stated, not implied)

- **Substring, not relevance.** Results are name-ordered; a summary match ranks where its name puts it. There
  is no scoring, stemming, tokenization or phrase syntax.
- **No index.** The query is a scan over `lower(name)`/`lower(summary)`; the catalog is small in this build,
  but the rule does not scale to a very large registry without a trigram or full-text index.
- **Schemas are not searched.** A capability described only inside `inputSchema` is invisible to `q`.
- **Case folding is `lower()`.** A locale-specific case rule is not applied; names are ASCII slugs and
  summaries are expected to be too.
- **Still public and unauthenticated.** The search narrows a public catalog and reveals nothing a full read
  would not.

## Evidence

- `mvn -Dtest='dev.nexus.api.tools.*' test` — **68/68** (45 service, 23 controller). v577 contributes 8
  cases: a name/summary match with case folding; the owner and search narrowing together; the count narrowed
  the same way; a blank search is the absent filter and never reaches the search query; a 101-character term
  is refused before any query; `likePattern` escaping `%`, `_` and `\`; the controller echoes the trimmed
  term; the controller refuses an over-bound term without touching the service.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §3 over HTTP: `q=weather` answers
  one row and echoes `weather`; `q=WEATHER` the same; `q=last` matches a SUMMARY; `q=tool` answers three;
  `q=tool&owner=` narrows both to two; `q=tool&limit=1&offset=2` answers `z.tool` with `total=3`; `q=%25` and
  `q=_` answer zero; a blank `q` echoes `null` with the whole catalog; a 101-character `q` is a 400. The
  list envelope is asserted to carry exactly six fields.
- **Still not graded, stated:** no relevance ranking, no index, no schema search, no locale-aware folding.

## Date

2026-11-02
