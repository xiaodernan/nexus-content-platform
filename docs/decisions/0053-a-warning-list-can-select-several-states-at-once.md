# 0053 — A warning list can select several states at once

- **Status:** Accepted (v623, `replacementStatus=none,unresolved`, the canonical echo, the 265 tools cases and the
  live-PostgreSQL run)
- **Date:** 2026-11-06
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0049 (the derived state), ADR 0050 (selecting one state), ADR 0047 (the pair cursor)

## Context

v620 let a caller ask the warning list for one derived state at a time. The questions a migrating consumer
actually has are frequently unions: "every warning that is actionable or dangling" (`unresolved` plus
`live`), or "every warning that still needs a decision" (`none` plus `unresolved`). Asking twice answers two
pages whose counts cannot be added, because the pages are windows of two different sets ordered by one shared
pair cursor — and a client that concatenates them cannot page the union safely: the next page of one set does
not know where the other set ended.

The state is derived (ADR 0049), so the selection cannot be a stored enum column. It is one SQL expression used
by the window and the count, and it has to compose with the owner filter and the pair cursor exactly as the
single state does.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Existence | Two requests, one per state | Two counts cannot be added into the count of the union, and the shared pair cursor cannot page the union |
| Existence | One endpoint per combination | Four states make fifteen non-empty combinations, each with its own order, cursor and count rule |
| Existence | Repeated `replacementStatus` parameters | Legal HTTP, but the existing single-value contract would silently start meaning "AND" or "last one wins" depending on the binder — an ambiguity nobody can see in the URL |
| Existence | **A comma-separated list in the existing parameter** | **Chosen** — one request, one count, one cursor, and a single value keeps its exact v620 meaning |
| Grammar | A boolean expression (`none+unresolved`, `!live`) | A query-string grammar with precedence is a language; the four words are a closed set and a union is all a caller needs |
| Grammar | **Split on commas, trim, drop blanks, collapse duplicates, validate each word** | **Chosen** — the same normalisation the batch door gives ids, and the echo says exactly what was applied |
| Echo | An array | The envelope is a fixed seven fields and every other echo is a string; an array would change the field's type for a caller that asked one state |
| Echo | **The canonical comma-joined list, first-seen order** | **Chosen** — `unresolved,none` says the same set as `none,unresolved` in a stable form the caller can compare |
| SQL | One predicate per combination | Fifteen statements to keep in step with one rule |
| SQL | **One `case` expression, membership by `= any(string_to_array(:status, ','))`** | **Chosen** — the same expression serves the window, the cursor page and both counts |

## Choice

`GET /tools/deprecations?replacementStatus=none,unresolved`:

- `replacementStatus` is trimmed, split on commas, each segment trimmed; blank segments are dropped, duplicates
  collapse in first-seen order, and every surviving word must be one of `none`, `unresolved`, `live`,
  `deprecated` (case-sensitive). An unknown word is `400 invalid-tool` naming that word and the vocabulary.
- A parameter that is absent, blank, or made only of blanks is the absent filter, echoed as null — the whole
  warning list, exactly as before.
- The selection narrows BOTH the window and the whole count, and composes with `owner` and with the pair cursor
  `(deprecatedAt, toolId)`; the offset path keeps the same selection and order.
- The envelope stays seven fields; `replacementStatus` echoes the canonical comma-joined list, or null.
- The SQL is one `case` expression deriving the same four states the row reports, tested for membership in the
  selected set. One string is used by `firstPageFiltered`, `pageAfterFiltered` and `countFiltered`.

## Reason

- **A union needs one count.** Two requests give two totals that cannot be added into the total of the union,
  and no page of either can be resumed against the other. One request is the only shape where `total` describes
  what the caller selected.
- **The parameter already exists; only its grammar grows.** A single word means exactly what it meant in v620,
  so every existing caller keeps its answer and its echo.
- **Canonical form makes answers comparable.** Two spellings of the same set echo identically, so a client can
  cache or compare the answer without normalising the query itself.
- **A closed vocabulary keeps the error honest.** An unknown word inside a list is named, rather than silently
  dropped into a smaller set the caller did not ask for.
- **One CASE is one definition.** The SQL derives the state once and tests membership; the row's displayed
  status uses the same rule. A per-state disjunction would repeat the rule four times.

## Tradeoffs (stated, not implied)

- **The comma is syntax in this one parameter.** It is safe because the vocabulary is four lowercase words and
  none contains a comma; this is not a general escaping rule and does not spread to other parameters.
- **The echo is a string, not an array.** A caller that wants the set must split on commas, which is the same
  grammar it sent. Keeping the field's type was worth more than a typed array in a seven-field envelope.
- **No negation and no boolean grammar.** "Every state except live" is not expressible; it is three words.
  A real expression language would be a different design with its own parse errors.
- **The CASE duplicates the Java derivation.** The same tension ADR 0050 stated: SQL cannot call the Java
  method, so the rule exists twice and is kept in step by the tests and the live proof.
- **A state can still change between pages.** Selecting several states does not freeze them; a successor
  declared between two pages moves a row out of `unresolved` into `live`, and the pair cursor simply resumes.

## Evidence

- `mvn -o -q -Dtest='ToolServiceTest,ToolControllerTest' test` — **262/262** (172 service, 90 controller): a
  selection canonicalised in first-seen order, repeated words collapsed, blanks dropped, an unknown word
  inside a list refused by name, and the canonical string reaching the window and the count; the controller
  echoing the canonical list and refusing a bad word before the service is touched.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5u over HTTP, against PostgreSQL:
  `none,unresolved` answered the two temporary warnings with `total=2`; `unresolved, none` echoed in first-seen
  order; `none,none` collapsed to one; a trailing comma was punctuation; a selection of blanks was the absent
  filter returning all three warnings; naming all four states was the whole list; owner and the selection
  narrowed together (2 and 0); the pair cursor walked the two selected rows with `total=2` and no repeat; an
  unknown word inside the selection was `400 invalid-tool` naming `gone`; the fixtures were withdrawn, so §6
  still counted one warning and four declarations.
- **Still not graded, stated:** no negation, no boolean grammar, no array echo, no cross-page snapshot.

## Date

2026-11-06