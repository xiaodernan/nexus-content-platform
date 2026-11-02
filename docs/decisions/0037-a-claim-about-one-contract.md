# 0037 — A claim about one contract: the owner's attestation, bound to its pin

- **Status:** Accepted (v588, `POST|GET|DELETE /tools/{id}/attestation`)
- **Date:** 2026-11-03
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0022 (declare, never execute), 0023 (the owner's update), 0025 (deprecation as its own resource), 0028 (the pin), 0034–0035 (the journal and its vocabulary)

## Context

A consumer choosing a tool has two facts today: what the declaration says (summary, schema, pin) and whether the
owner says it is going away (deprecation). What it does not have is any statement that the thing was ever **tried**.
The registry cannot make that statement itself — it declares and never executes (ADR 0022), and nothing in this
build runs a tool. The owner can, but had no way to say so, and a sentence in the summary would be
indistinguishable from marketing.

The naive shape is a boolean: `tested: true` on the declaration. It fails on the fact that matters most — an
update changes what the tool accepts, and a boolean would follow the row, silently transferring a claim about old
bytes to new ones. Whatever is stored has to name **which contract** was tested.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Shape | A `tested` boolean on the declaration | It travels with the row, so an update inherits a claim nobody made about the new bytes; and it puts an unverified sentence inside the contract a consumer pins |
| Shape | A field in the summary ("tested by the owner") | Free text cannot be revoked, cannot be dated, cannot be compared with a pin, and cannot be told apart from prose |
| Shape | **Its own resource, one row per tool, naming a pin** | **Chosen** — the shape deprecation already took (ADR 0025): a separate fact with its own author, instant and withdrawal, read beside the declaration instead of inside it |
| Binding | To the declaration (tool id only) | "This tool was tested" says nothing about which bytes; after an update it is a claim about bytes nobody tested |
| Binding | **To the contract pin** | **Chosen** — the claim is true about exactly one contract, and the read can say whether that contract is still served |
| Input | Implicitly "the current contract" | The caller need not have read anything, so a claim can be made by a client that never looked; and the answer could not distinguish "tested this" from "tested whatever was there" |
| Input | **The pin is required and must be the one being served (409 otherwise)** | **Chosen** — the caller must have READ the contract to name it; a mismatch is a 409 naming the pin now served, so the fix is one re-read, and no stored claim can be about bytes nobody tested |
| Staleness | Delete the claim when the contract changes | It erases the fact that a contract WAS tested, which remains true about the bytes it named |
| Staleness | Move the claim to the new pin on update | The worst option: it is a claim about bytes nobody tested, manufactured by the registry |
| Staleness | **Keep it, and report `stillCurrent` (derived, not stored)** | **Chosen** — the claim stays true about its contract; the read says whether that is what a consumer would install today |
| History | Append a row per attestation | A claim is a current state; the revisions door already holds every contract, so the claim's history is derivable from those plus this instant |
| History | **One row per tool, replaced on re-attest** | **Chosen** — the same rule re-deprecating follows |
| Read | 404 `unknown-tool` when nobody attested | It would hide the difference between "no such tool" and "nobody has claimed this" |
| Read | **404 `not-attested`, distinct from `unknown-tool`** | **Chosen** — a consumer deciding whether to trust a contract needs to tell those two apart |
| Journal | Say nothing (a claim is metadata) | A claim is a change to a declaration, and a withdrawal deletes its own row: the journal is the only read that could still report it (the same argument as ADR 0034) |
| Journal | **Two new kinds, `attested` and `unattested`** | **Chosen** — the vocabulary grows from six to eight, explicitly; ADR 0035 closed it at six and this ADR reopens it by name rather than by drift |
| Catalog | Add `tested` to the catalog row | The seven-field declaration stays seven: the claim travels beside it. A `?tested=` filter is a separate window question for a later increment |

## Choice

`POST /tools/{id}/attestation?owner=` with `{contractSha256, note?}` records the owner's claim: the owner is
required before any read, the row's holder is checked before the pin is compared, the pin must be 64 lowercase hex
**and equal to the contract being served** (409 `stale-contract` naming the served pin otherwise), and the optional
note is trimmed and bounded at 280. Re-attesting replaces the one row. `GET` answers
`{toolId, contractSha256, note, attestedAt, stillCurrent}` with `stillCurrent` recomputed on every read, 404
`not-attested` when there is none and 404 `unknown-tool` when the id names nothing. `DELETE` answers
`{toolId, removed}`. Both writes journal `attested` / `unattested`; removing a declaration deletes its claim.

## Reason

- **The registry can keep a claim; it cannot verify one.** Naming the resource an attestation (rather than a
  "certification") keeps the service honest about what it did: it stored and dated a statement by the owner.
- **A pin is the only honest address for the claim.** It is the value a consumer holds and the value an update
  changes, so binding the claim to it makes both "is it tested" and "is that test still about what I would install"
  answerable without a second stored flag.
- **409 rather than 400.** The caller's request is well-formed and they did nothing wrong; the world moved between
  their read and their claim. A 400 would blame the caller for a race, and the message names the new pin so the fix
  is mechanical.
- **Stale claims must stay visible.** A tool whose last tested contract is old is exactly what a consumer wants to
  know. Deleting the claim, or moving it, would make an untested update look tested.

## Tradeoffs (stated, not implied)

- **It is a claim, not evidence.** Nothing checks that a test happened, what it covered, or who ran it; the note is
  the owner's own words. A consumer must weigh it like a signature, not like a result.
- **One claim per tool.** An owner cannot keep "the suite passed" beside "the fuzz run passed"; re-attesting
  replaces, and the note carries the nuance.
- **No claim history.** The instant and the pin describe the CURRENT claim only; earlier claims are gone, though
  the contracts they named live in the revisions door.
- **No catalog field or filter yet.** A catalog row is still seven fields, so finding attested tools means reading
  each one; a `?tested=` filter is the next window question.
- **The claim does not survive the declaration.** Removing a tool deletes its attestation: a claim about a row that
  no longer exists has nothing to be true about, and the journal keeps the fact that one existed.
- **The note is unverified text.** It is trimmed and bounded, and it is the only free text in this feature.

## Evidence

- `mvn -Dtest='ToolServiceTest,ToolControllerTest' test` — **166/166** (105 service, 61 controller). v588
  contributes 9 service cases (the pin and note recorded with the journal entry; a foreign pin refused with the
  served one in the message and nothing written; a pin required, malformed and uppercase each refused; re-attesting
  deleting the old row; the note trimmed, blank as null and bounded; a stranger refused; a withdrawal that removed
  nothing writing nothing; a withdrawal journalled as `unattested`; a declaration with no claim answering
  `not-attested`) and 5 controller cases (the five-field answer with `stillCurrent`; a claim kept after the contract
  moves and reported stale; a 409 naming the served pin; the `not-attested` 404; the withdrawal answer).
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5h over HTTP against a real PostgreSQL:
  seven refusals leave `tool_attestation` empty (no claim 404 `not-attested`, a foreign pin 409 naming the served
  pin, `abc` 400, no pin 400, no owner 400, a stranger 403, an unknown id 404); the accepted claim is five fields
  with the note trimmed and `stillCurrent` true while the declaration stays **seven** fields; an update moves the
  contract and the claim does **not** follow (old pin, `stillCurrent` false, note intact); the old pin is then the
  409; re-attesting the served pin replaces the one row with `note: null`; `kind=attested` counts both claims and
  `psql` agrees; the withdrawal journals `unattested` and removes the only row that could have said it; one claim
  is left on record; and §6 shows it surviving the restart with the second JVM recomputing `stillCurrent` from the
  row it serves, with `tool_attestation` holding exactly four columns.
- **Still not graded, stated:** no verification of the claim, no per-suite claims, no claim history, no catalog
  field or filter, and no evidence beyond the owner's note.

## Date

2026-11-03