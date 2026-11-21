# 0054 — A warning list can name the successor it wants

- **Status:** Accepted (v624, `GET /tools/deprecations?hint=`, the eighth envelope field, the 269 tools cases
  and the live-PostgreSQL run)
- **Date:** 2026-11-06
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0049 (the derived state), ADR 0050/0053 (the state selection), ADR 0047 (the pair cursor),
  ADR 0048 (the owner filter)

## Context

The warning list could be asked whose warnings these are (`owner=`), what state their successor is in
(`replacementStatus=`, one word or several) and where to resume (`before=`). None of those answers the
successor side: "who is being told to move to MY tool?" A consumer about to deprecate a tool needs to know who
points at it before it pulls the trigger, and an operator replacing a successor needs to know every warning
that names the old one.

The hint is stored on the warning row, so this is not a derived value: it is the exact text of a name. The
filter therefore has to be a VALUE filter rather than a resolution, and it has to compose with the three
filters already on the list without changing the order or the count semantics.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Existence | Read the whole list and filter client-side | The count would describe every warning while the caller asked about one successor, the same failure v618 closed for the owner |
| Existence | A dedicated `/tools/deprecations/by-successor/{name}` | A second door with its own cursor and count rules for one predicate |
| Existence | **`hint=` on the existing list** | **Chosen** — one statement, one order, one cursor, and the fourth `AND` filter |
| Match | Contains / LIKE with wildcards | A name is an opaque key; a partial match would select warnings that name a DIFFERENT tool, and `q` already covers text search over the catalog |
| Match | **Exact equality on `replacement_name`** | **Chosen** — "points at this name" is a precise question, and a prefix answering rows is a wrong answer that looks right |
| Match | Resolve the name first and filter by resolved id | The hint is a hint: it may name a declaration that does not exist, and "who points at a name nobody declared" is exactly the interesting case |
| Grammar | Validate the name rule and refuse an illegal value | The value is a filter, not a name being declared; a name that holds nothing simply matches nothing |
| Grammar | **Trim and use the value as-is** | **Chosen** — the same rule the keyset cursor follows: a value that holds nothing still bounds the window |

## Choice

`GET /tools/deprecations?owner=&replacementStatus=&hint=&before=&limit=&offset=`:

- `hint` is trimmed; absent or blank is null and means every hint. It is echoed as the eighth envelope field.
- The predicate is `d.replacement_name = :hint`, an `AND` beside the owner, the state selection and the pair
  cursor. It narrows BOTH the window and the whole count, and the offset path keeps the same filters and order.
- The filter is exact: `hint=m` does not answer warnings that name `m.tool`.
- A value nobody stored selects nothing and is still echoed, so a caller can tell "no warning points there"
  from "the filter was dropped".
- The three repository statements that already carried owner + state gain one more nullable parameter:
  `firstPageFiltered`, `pageAfterFiltered`, `countFiltered`. The unfiltered and owner-only paths are untouched,
  so a caller asking no successor question pays for nothing new.

## Reason

- **A warning list has two sides and only one was askable.** Whose warnings these are and what state their
  successors are in were both filters; who points at a given successor was not. Adding it makes the list
  symmetric.
- **Exact is the only honest match.** A prefix filter would answer rows the caller did not ask about, and the
  consequence — a migration that misses a consumer — is invisible.
- **The hint is a value, not a reference.** Filtering by the resolved id would silently drop the
  `unresolved` warnings, which are the ones a registry most needs to surface before a successor is declared.
- **One statement, one count.** The filter lives in the same three statements as the owner and the state, so
  the window and `total` cannot disagree about it.

## Tradeoffs (stated, not implied)

- **No name-grammar validation.** A malformed hint is an empty page rather than a 400. That is consistent with
  the keyset cursor and with `toolId` on the journal, and it keeps the filter a pure value test.
- **The comma is not syntax here.** Unlike `replacementStatus`, this parameter takes one name; a caller wanting
  several successors asks several times, because a name may legitimately contain characters a separator would
  have to escape.
- **No negation and no cross-state hint.** "Every warning that does not point at X" is not expressible; it is
  the other three-quarters of the list.
- **Case-sensitive.** Tool names are case-sensitive everywhere in this registry, and a filter that folded case
  would answer rows a caller could not reproduce.

## Evidence

- `mvn -o -q -Dtest='ToolServiceTest,ToolControllerTest' test` — **262/262** (175 service, 87 controller): the
  hint reaching the window and the count; the hint and the state composing on the cursor path; a blank hint
  reading as the absent filter; the controller echoing the trimmed value and refusing nothing it did not name.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5v over HTTP, against PostgreSQL:
  `hint=m.tool` answered the two warnings that name it with `total=2` and echoed trimmed; the same value
  composed with `replacementStatus=live` (2) and with `owner` (1 each); `hint=ghost.tool` selected nothing and
  was still echoed; `hint=m` was 0 because the match is exact; a blank hint was the absent filter; the pair
  cursor walked the hinted set with `total=2` and no repeat; the fixture was withdrawn, so §6 still counted one
  warning and four declarations.
- **Still not graded, stated:** no negation, no multi-successor selection, no prefix or case-insensitive match.

## Date

2026-11-06