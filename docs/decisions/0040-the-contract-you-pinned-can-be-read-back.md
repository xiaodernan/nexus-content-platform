# 0040 — The contract you pinned can be read back: a lookup by pin, scoped to one declaration

- **Status:** Accepted (v590, `GET /tools/{id}/at?pin=`, the 404 `unknown-pin` and the derived `current`)
- **Date:** 2026-11-03
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0028 (the computed pin), 0031 (a history narrowed by `since`), 0032 (retention is the owner's)

## Context

v578 gave every contract a 64-hex pin and taught two reads to answer a conditional `If-None-Match`, so a
consumer can hold a pin and be told when it stops being served. v573 records every accepted write as a
revision, with its own pin. v580 lets a caller ask for what came after a revision NUMBER.

The gap is between those two handles. A consumer holds a PIN; the revision number is this service's
bookkeeping, and the caller never chose it. When the consumer is told its pin went stale, it can read the
declaration as it stands today — but not the bytes it pinned, unless it stored the whole schema. The history
does hold them, yet finding the right row requires the number the caller does not have. So the registry can
say "this changed" and cannot say "and here is what you had", which is the half a reconciliation needs.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Storage | A `contract_sha256` COLUMN on `tool_revision`, indexed, so the lookup is a seek | The pin becomes stored derived state that every write must maintain; two places can disagree, and ADR 0028 refused exactly this for `tool_entry` |
| Storage | **No column: recompute each revision's pin and scan ONE declaration's history** | **Chosen** — the pin stays a property of the bytes, and the scan is bounded by the scope and by retention |
| Scope | A GLOBAL `GET /tools/by-pin/{pin}` over every declaration | An unbounded scan of the whole registry per request, with nothing to index; it is a different decision that would need the derived column, and this build does not make it |
| Scope | **`GET /tools/{id}/at?pin=`, scoped to the declaration the caller named** | **Chosen** — the declaration is the unit a consumer already knows (it calls the tool by id), and the scan never leaves its rows |
| Answer | The bare revision row | The question behind the read is "is this what I would install today?", so the answer carries it |
| Answer | **The revision's fields plus `current`, derived on every read** | **Chosen** — same rule as the attestation's `stillCurrent`: a stored flag would drift, a derived one cannot |
| Missing pin | 200 with an empty body | A read by pin either finds the bytes or does not; an empty answer would have to be read as a failure anyway |
| Missing pin | **404 under its own name, `unknown-pin`** | **Chosen** — distinct from `unknown-tool`: "this declaration never recorded that contract (or retention removed it)" is not "there is no such tool" |

## Choice

`GET /tools/{id}/at?pin=<64 lowercase hex>`:

- Answers `{toolId, revision, summary, inputSchema, contractSha256, recordedAt, current}`, field for field what
  the history row said, plus `current` (true when this pin is the contract being served now).
- The id is settled FIRST: an unknown id is 404 `unknown-tool` whether or not the pin is well formed. Then the
  pin: absent is 400 "a read by pin must name the contract pin it wants", malformed is 400 naming the 64-hex
  rule (uppercase is a malformed pin — a pin is a value, not a spelling).
- A well-formed pin the declaration never recorded is 404 `unknown-pin`, and the message names the two ways
  that happens: never written here, or removed by retention.
- A pruned revision is therefore unreadable by its pin. That is the honest answer: the bytes are gone, and a
  200 would have to invent them.
- The lookup is one SQL statement for the history, then a hash per row in this process. No new column, no
  index, no migration.

## Reason

- **The pin is the caller's handle, so the pin should be enough to get the bytes back.** A handle that only
  tells you something changed, and not what it was, is half a handle.
- **Scanning is the price of the pin not being a column, and the price is bounded here.** It never crosses a
  declaration, and an owner can bound a declaration's history with retention (ADR 0032). The unbounded version
  is deliberately not built, and saying which scan this is keeps the next increment honest.
- **`current` belongs in this answer because it is the decision the reader is making.** Two requests would be
  a race between them; one answer is a snapshot of one instant.

## Tradeoffs (stated, not implied)

- **O(history) per read.** A declaration with a long retained history costs one hash per revision. It is a
  read of one tool, usually a handful of rows; the cost is stated rather than hidden behind an index that does
  not exist.
- **A pruned contract is unreachable by its pin.** Retention is the owner's right and it deletes bytes; a
  consumer holding a pruned pin learns that it is gone, not what it said.
- **No global pin lookup.** "Which declaration serves this pin" stays a scan outside this build, and v591's
  note about a derived column is still the open question.
- **Two reads of the declaration.** The service settles existence, then the controller compares against the
  current row; both are primary-key reads, and the second is what makes `current` a fact rather than a guess.
- **The pin is case-sensitive.** An uppercase hex string is a different value, refused rather than folded,
  the same rule the journal's kind words follow.

## Evidence

- `mvn -Dtest='ToolServiceTest,ToolControllerTest' test` — **179/179** (113 service, 66 controller): the pin
  finding revision 1 of 2, a pin the history never held naming `unknown-pin`, a malformed pin refusing before
  the history is scanned, the id settled before the pin is judged, and the wire answer at seven fields with
  `current` derived.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5j over HTTP, against PostgreSQL: the
  newest revision read back field for field with `current=true` and the older with `current=false`; no pin 400,
  `abc` 400 naming 64, the same pin in uppercase 400, a never-held pin 404 `unknown-pin`, an unknown id 404
  `unknown-tool` even with a malformed pin; and after the owner pruned revision 1, the old pin answers 404
  while the newest contract still answers 200/`current=true`.
- **Still not graded, stated:** no global lookup, no index, no "read at an instant", no diff between two pins
  (a caller can now fetch both sides and diff them itself).

## Date

2026-11-03