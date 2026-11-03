# 0042 — A patch is the bytes an author wrote, and the service does not run it

- **Status:** Accepted (v595, `POST /incidents/{incidentId}/patches`, `GET /incidents/{incidentId}/patches`,
  `GET /patches/{patchId}`, the 26 unit cases and the live-PostgreSQL run)
- **Date:** 2026-11-03
- **Milestone:** M9 (NEXUS Ops)
- **Builds on:** ADR 0041 (an incident is a record with a life), ADR 0018 (no accounts), ADR 0032 (a table
  is its owner's right)

## Context

M9's row reads "observability, incident→patch→PR→approve→deploy". ADR 0041 built the first word: a record
that can be opened, read and closed. The second word is the change someone proposes after reading it. In a
system with a repository and a patcher, that word would be a diff plus the machinery that applies it. This
service has neither a checkout nor a patcher, and inventing one would mean claiming to know facts about a
tree it does not own.

What it CAN hold is the proposal: the bytes the author wrote, a title that says what they propose, an
optional reason, an optional author name, the incident they are about, and the instant the service recorded
it. Whether those bytes apply, whether they are a valid diff, whether they fix the incident — none of that
is decided here, and the record says so by storing exactly what arrived.

The hard question is what a "diff" is at this boundary. It is bytes, not a sentence: leading spaces are
context lines, a trailing newline is the last line's end, and a parser that normalizes them produces a
different patch. So the column keeps the bytes verbatim, refuses a diff that is only whitespace, and
refuses a diff longer than its column rather than cutting it. A record that silently edits the thing it
records is worse than one that refuses it.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Shape | A URL to a real commit or pull request | A pointer to a place this service cannot verify, and the bytes are lost when the link rots; the proposal would be a rumor about another system's state |
| Shape | Parsed hunks (files, line numbers, replacements) | Parsing is a format opinion; a diff format outlives any parser, and the record would then be this service's reading of the change rather than the change |
| Shape | **The diff as a bounded text column, verbatim** | **Chosen** — the record is the author's bytes, and a reader can apply them elsewhere |
| Whitespace | Trim the diff | Trimming edits context lines and the final newline; the bytes the author vouched for would no longer be the bytes stored |
| Whitespace | **Refuse a diff with no non-whitespace byte** | **Chosen** — zero bytes propose nothing, and an empty patch in a list is a row that exists only to be counted |
| Length | Truncate a diff over the column | A cut diff is a different change and silently invalid; truncation is the one edit a patch record must never make |
| Length | **Refuse by number, never cut** | **Chosen** — the caller learns the bound and decides what to send |
| Parent | Store `incidentId` without checking it | A proposal against nothing is a row no reader can place; the incident door already owns what "no incident" means |
| Parent | **Check the incident at the door (404 `unknown-incident`)** | **Chosen** — a malformed proposal is 400, but a proposal for a parent that does not exist is a question about nothing |
| Parent state | Require the incident to still be open | The fix for what happened can arrive after the record was closed; refusing it then would make the record's state cheaper than the work |
| Parent state | **Do not read the status at all** | **Chosen** — a patch is a proposal, not a transition; the later words will decide what a status allows |
| Status | No status column | The chain's later words need a place to start, and a reader of a proposal should see that nothing has happened to it yet |
| Status | **One word, `proposed`, written here and moved only by later slices** | **Chosen** — honest about how far the chain has come |
| Listing | A summary shape without bytes, plus a detail read | Two shapes drift, and a caller must remember which one carries the payload; the window cap already bounds the cost |
| Listing | **One record, bytes included, in every answer** | **Chosen** — one shape, one meaning; ask for fewer rows if the payload matters |
| Order | `createdAt` alone | Two proposals written in the same microsecond would have an order the database chooses |
| Order | **`createdAt DESC, patchId DESC`** | **Chosen** — a stable total order the proof checks against the values it was given |
| Apply | Parse and apply the patch, or check it fits | This service owns no checkout and runs no patcher; claiming a patch applies would be a verdict it cannot defend |
| Trail | Write an audit entry for every proposal | The patch table IS the record; the trail's vocabulary belongs to the publication verbs |

## Choice

Propose one:

```json
// POST /incidents/{incidentId}/patches — 201
{
  "title": "clamp the drift at read time",
  "summary": "the ledger is corrected when it is read, not rewritten",
  "diff": "  context line\n\tdetail line\n\n",
  "author": "acct-ada"
}
```

The 201 answers the record as written:

```json
{
  "id": "5b0c…",
  "incidentId": "0d5e…",
  "title": "clamp the drift at read time",
  "summary": "the ledger is corrected when it is read, not rewritten",
  "diff": "  context line\n\tdetail line\n\n",
  "author": "acct-ada",
  "status": "proposed",
  "createdAt": 1793697600000
}
```

A listing:

```json
// GET /incidents/{incidentId}/patches?limit=20&offset=0 — 200
{
  "patches": [ … ],
  "count": 3,
  "total": 3,
  "limit": 20,
  "offset": 0
}
```

- `POST /incidents/{incidentId}/patches` — the incident must exist (404 `unknown-incident`, checked before
  the fields). The title is trimmed to 1..120. The diff is required, stored verbatim, refused when it is
  only whitespace, and refused when it is longer than 20000 characters — never truncated, never trimmed.
  The summary is trimmed, bounded at 2000, blank → null. The author is trimmed, bounded at 120, blank →
  null. Status is `proposed`; the id is a UUID minted here; `createdAt` is the service's clock, truncated
  to microseconds. A malformed proposal is 400 `invalid-patch` naming the rule.
- `GET /incidents/{incidentId}/patches?limit=&offset=` — newest first by `(createdAt DESC, patchId DESC)`,
  scoped to one incident, with `count` (the window) and `total` (the incident's whole set). The window rule
  is the incident listing's, called rather than copied: default 20, cap 100, floor 1, offset floored down
  to the page boundary and reported as applied. An id that names no incident is 404 `unknown-incident`,
  never an empty window.
- `GET /patches/{patchId}` — 200 with the record and its bytes; 404 `unknown-patch` when the id names
  nothing.
- No other door: nothing applies, approves, requests review of, edits, deletes or deploys a patch.
- No audit entry and no webhook delivery. The patch table is the record.

## Reason

- **A proposal is bytes, not a description of bytes.** Parsing or normalizing a diff would make the record
  this service's reading of the change rather than the change itself.
- **A patch that is silently cut is a different patch.** The length bound is refused by number, because
  truncation would leave a record that looks complete and applies differently.
- **The parent is checked because a proposal against nothing cannot be placed.** The door reuses the
  incident door's 404 rather than inventing a second meaning for "missing parent".
- **The incident's status is not consulted because a patch is not a transition.** A fix can arrive after
  the incident was resolved; refusing it would punish the work for the record's timing.
- **`proposed` exists so the chain's progress is visible.** A reader can tell that nothing has been
  reviewed, approved or deployed without consulting another table.
- **One record shape keeps the listing and the read honest.** A summary shape would drift from the detail
  shape, and the window cap already bounds the payload.
- **The window rule is called from the incident listing rather than copied.** Two caps that must agree by
  hand are a drift waiting to happen.

## Tradeoffs (stated, not implied)

- **Nothing is applied, parsed, or validated.** A patch that does not apply is stored exactly like one
  that does; a reader who applies it elsewhere owns that outcome.
- **No review, no approval, no deployment.** Status is `proposed` for the life of every row in this slice.
  The chain's later words are absent and this ADR makes no claim about when they arrive.
- **A proposal cannot be edited, deleted or superseded.** A second attempt is a second patch; the record
  keeps both, including the one that was wrong.
- **The incident's status is not checked.** A patch can be filed against a resolved incident, and this
  service will not stop it or mark the incident reopened.
- **Bytes travel in every answer, including a listing.** A window of 100 maximal patches is a large
  response; the cap is the mitigation, and a client that wants headings should ask for fewer rows.
- **The bound counts Java characters, so a diff of surrogate pairs is refused before the column would
  overflow.** The column is never exceeded; the refusal is earlier than strictly necessary, and it is
  stated rather than hidden.
- **A diff is required even when a one-line description would do.** A proposal without bytes is a note,
  and this table is not the notes table.
- **No author identity is verified.** ADR 0018: `author` is a host-declared name, not an account.
- **No audit entry and no delivery.** Automation must poll the listing; the webhook vocabulary stays the
  publication verbs'.

## Evidence

- `mvn -Dtest='PatchServiceTest,PatchControllerTest' test` — **26/26** (18 service,
  8 controller): the verbatim diff (leading spaces, a tab, trailing newlines), the whitespace-only
  refusal, the bound accepted at 20000 and refused at 20001, the parent check, the window's cap and
  floored offset, the incident-scoped count, and the three tokens; the controller pins exactly eight
  record fields, the listing's five, the applied cap and offset, and the bytes through JSON.
- **`docs/evidence/m9/patch-proof.mjs`** (`npm run verify:patches`) — the live run against a throwaway
  `pgvector/pgvector:pg16` and the built jar. Its readings are quoted in amendment 548 and are not typed
  from memory here.
- `npm run verify:evidence-census` — this proof is a ROW in the population the census counts.

## Date

2026-11-03
