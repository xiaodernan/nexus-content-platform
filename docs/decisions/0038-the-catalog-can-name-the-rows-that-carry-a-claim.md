# 0038 — The catalog can name the rows that carry a claim: a `tested` filter, and what it refuses to mean

- **Status:** Accepted (v589, `GET /tools?tested=true|false`, the echoed flag and the narrowed count)
- **Date:** 2026-11-03
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0022 (the catalog), 0028 (the computed pin), 0033 (the deprecated filter), 0037 (the attestation)

## Context

v588 gave an owner a place to say "this contract was tested", pinned to the 64-hex contract it names. The
consequence was measured then and left as a bound: the attestation is its own resource, so an agent that wants
the tested tools reads the catalog, reads every declaration's attestation, and subtracts. That is exactly the
join `?deprecated=` removed in v582, on a question asked just as often — "of these, which has anybody tested?"

The obvious repair — a `tested` boolean on each declaration row — is the repair 0033 already refused for
deprecation, and it fails harder here. A boolean on the row would be copied from `tool_attestation`, so an
update that moves the contract would leave a `tested: true` beside bytes nobody tested, and the row would carry
a claim about a contract it no longer serves with no way to say which.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Shape | A `tested` boolean on each catalog row | Two places to keep true, and the flag would silently transfer a claim to a contract nobody tested — the exact failure ADR 0037 exists to prevent |
| Shape | **A QUERY filter: `?tested=true\|false`** | **Chosen** — it answers the question without changing what a row SAYS, and the claim stays in its own table |
| Shape | A separate `GET /tools/tested` door | A second catalog with its own paging, ordering and bounds, kept in step with this one forever; the filter reuses all of it |
| Polarity | Only `true` | Half the question: an agent choosing a capability also wants the unclaimed ones, and a curator wants to find them |
| Polarity | **Both, absent meaning both** | **Chosen** — the same three-state shape `owner`, `q` and `deprecated` already have |
| Meaning | `tested=true` means "the claim is still about the served contract" | **Refused, and this is the important refusal.** The pin is computed from the row and never stored (ADR 0028), so SQL cannot compare `contract_sha256` to the contract being served. The only way to make this true would be a stored, derived pin column — the column v578 deliberately did not add |
| Meaning | **`tested=true` means "a claim EXISTS for this declaration"** | **Chosen** — the honest question SQL can answer, with the gap named in the response, the ADR and the proof instead of implied away |
| Query | Four explicit statements (claimed/unclaimed x departing/live) plus four counts | Four hand-written queries and four counts to keep in step with one rule; 0033 chose two statements when there was ONE axis and said so |
| Query | **Two statements with a 0/1 polarity flag per axis** | **Chosen** — every combination is the same statement read with different arguments; this narrows the two-statement choice of 0033 to the one-axis case it was made for |
| Echo | Nothing | A window of claimed tools that did not say so could be mistaken for the whole registry |
| Echo | **`tested` in the envelope, null when absent** | **Chosen** — false must be echoed as false, not as absent, or an unclaimed-only window looks unfiltered |

## Choice

`GET /tools?owner=&q=&deprecated=&tested=&limit=&offset=`, with `tested` on the same footing as the other three:

- `tested=true` answers only declarations that carry an attestation row; `false` only those that do not;
  absent answers both, and the envelope echoes `null`.
- The flag composes with `owner`, `q` and `deprecated`, and all four narrow the window AND the `total`.
- Order stays NAME ascending and paging is unchanged; the list envelope gains one field, `tested` (eight now).
- The rows themselves are unchanged: seven declaration fields, and no attestation column among them.
- The repository answers any polarity combination with ONE statement parameterised by two 0/1 flags per axis.

## Reason

- **The question is a filter, not a field**, for the third time: a query keeps the single-source rule that put
  the claim in its own table, and it cannot drift from the row it describes.
- **"Which of these has anybody tested?" is asked on every choice**, and a client-side join is a cost every
  caller pays forever for a join the service already has the tables to do.
- **The flag's name is the claim's existence, and that is exactly what the registry knows.** The registry does
  not run tools (ADR 0022) and does not verify tests (ADR 0037); pretending the filter could certify currency
  would be the one thing this feature must not do. What it can do is narrow honestly and point at the door
  that answers the harder question.

## Tradeoffs (stated, not implied)

- **`tested=true` can include a STALE claim.** A claim survives the update that moves its contract, so a row
  can match while `stillCurrent` is false. The filter names the claim; the verdict is one request away at
  `GET /tools/{id}/attestation`. This is the single most important bound of this increment, and §5i of the
  live proof asserts it rather than leaving it to prose.
- **No attestation time in the catalog.** "Tested recently" is not answerable here: the window is ordered by
  name, and `attestedAt` lives on the claim. Sorting by it would be a different door with a different index.
- **A correlated `exists` per row, twice when both flags are present.** With the primary key on `tool_id`
  each is a lookup, but it is not free.
- **0/1 parameters are less self-describing than two named queries.** The Javadoc and the service's
  `polarity(...)` helper carry the meaning; the trade is accepted to avoid an 8-combination method family.
- **ADR 0033's "two statements" choice is narrowed, not overturned.** It remains the right shape for one axis;
  with two axes the closed set is four combinations, and one statement per combination would be four places to
  disagree.
- **A wrong value is a framework 400.** `?tested=maybe` is refused by type conversion rather than by a rule of
  this service, the same as `?deprecated=maybe` and `?limit=abc`.

## Evidence

- `mvn -Dtest='ToolServiceTest,ToolControllerTest' test` — **173/173** (109 service, 64 controller), including the v589 cases: the tested
  polarity reaching ONE repository statement with the other three flags zero; the untested polarity reaching
  the opposite side; `deprecated=false&tested=true` composed into a single call with `(0,1,1,0)`; an absent
  pair never reaching the composed query; and the envelope echoing `true`, `false` and `null` at eight fields
  while a row keeps seven.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5i over HTTP, against PostgreSQL:
  `tested=true` is the one claimed row with `total=1` and `tested=false` the other three; an absent flag is
  `null` and all four; the four directions composed with `deprecated` answer 1/1/0/2 on real state; `owner` and
  `q` narrow both window and count; a claim on `z.tool` survives an update that MOVES its contract, so
  `tested=true` still answers two rows while the attestation read reports `stillCurrent=false`; withdrawing
  the claim takes the row back out; and every row keeps its seven declaration fields.
- **Still not graded, stated:** no "tested recently" ordering, no attestation text in catalog rows, no
  currency filter (it needs a stored pin, which ADR 0028 refused), no framework-level rejection of a malformed
  boolean.

## Date

2026-11-03