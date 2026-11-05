# 0045 — A pin names CONTENT, not a row: the registry-wide lookup answers every declaration

- **Status:** Accepted (v615, `GET /tools/by-pin/{pin}`, the per-declaration match list, the 209 tools cases and
  the live-PostgreSQL run)
- **Date:** 2026-11-05
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0028 (the pin is computed, never stored), 0032 (retention), 0040 (a pin reads one
  declaration's bytes back)

## Context

A pin is the handle a consumer keeps: it hashes the summary and the canonical schema, and two doors already
read it — the conditional read of a declaration and the read at a pin, both SCOPED to a declaration the caller
names. A caller that kept a manifest of pins but not the ids that produced them has no way in: the pin may
have been recorded by any declaration, and nothing in the service answers "whose bytes are these?".

The obvious implementation is an index. The pin is derived from two columns, so it could be materialised in
`tool_revision.contract_sha256`, indexed, and written by the one path that appends revisions. ADR 0028 refused
exactly that shape for the live contract on `tool_entry`: a second place that must agree with the bytes, kept
honest only by every future writer remembering to maintain it, plus a backfill for rows that predate the
column. An expression index (`sha256` over a SQL reconstruction of the canonical JSON) trades the column for a
worse coupling: PostgreSQL and Jackson would have to agree byte for byte about a serialization, and a change
to either would silently stop matching.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Storage | A `contract_sha256` column on `tool_revision`, indexed | A second source of truth: every writer must maintain it, every existing row needs a backfill, and a drift hides rows with no way to notice |
| Storage | An expression index over `sha256(json_build_object(...)::text)` | The DB and the JVM must produce identical bytes for the same contract; a canonicalization change on either side turns the index into a silent miss |
| Storage | **No storage: scan the revision table and recompute each pin** | **Chosen** — the pin stays a property of the bytes, and the cost is one scan the answer states |
| Answer | One declaration | A pin hashes CONTENT: two declarations with the same sentence and schema share it, and one declaration can carry it twice (A → B → A). A singular answer would be a lie the first time that happens |
| Answer | **A list, one entry per declaration, newest revision carrying the pin** | **Chosen** — it is the true shape of the question, ordered by NAME, with `current` derived per entry |
| Empty | 200 with an empty list | "Nobody carries these bytes" is a distinct answer from a list, and the caller's next move differs |
| Empty | **404 `unknown-pin`** | **Chosen** — same name the scoped read uses, so one vocabulary covers both doors |
| Window | Page the match list | The size of the list is the size of the duplication, not a dataset; a page would invent an order over a set the caller asked for by value |

## Choice

`GET /tools/by-pin/{pin}`:

- Answers `{pin, total, tools:[{toolId, name, owner, revision, summary, contractSha256, recordedAt, current}]}`,
  three top-level fields and eight per match.
- One entry per DECLARATION: the newest revision of that declaration whose bytes hash to the pin. A declaration
  that moved away and back answers once, at the newer revision.
- `current` is derived on every read: true when the pin is also what that declaration serves today.
- Ordered by NAME (globally unique), so the answer is stable while nothing is written.
- Malformed pin is 400 naming the 64-hex rule; a well-formed pin nobody recorded (or retention removed every
  revision that carried it) is 404 `unknown-pin`.
- Implementation: `revisions.findAll()`, one hash per row, group by tool, keep the newest carrying revision,
  then one `findAllById` for the rows. A revision whose declaration vanished between the two reads is skipped
  rather than answered with a hole.

## Reason

- **The question is about bytes, so the answer cannot pretend a row.** Any design that returns one tool must
  break a tie it cannot justify; returning every carrier states the fact the hash already proves.
- **Not storing the pin is the cheaper promise to keep.** A column would make this door a seek, but every write
  would then be responsible for a derived value, and a drift could never be repaired by recomputation. The
  scan is slower and cannot disagree with the bytes.
- **The empty answer deserves its own name.** A caller reconciling a manifest needs to tell "these bytes exist,
  here is who has them" from "no declaration here ever recorded this" — the second is a 404, not a zero.

## Tradeoffs (stated, not implied)

- **O(revisions) per call, over the whole registry.** This is the price of a computed pin and it is the largest
  scan any public door performs. It is read-only, it computes one hash per revision, and it is stated here
  rather than hidden. If the registry ever outgrows it, the fix is the indexed column above — with its
  backfill, its writer discipline and its verification — and that would be a new ADR amending 0028, not a
  quiet optimisation.
- **The answer's size follows duplication, not a page.** Two twins make two entries; a hundred make a hundred.
  There is no `limit`, because every entry is one the caller asked for by value.
- **Pruned history is invisible.** A pin whose only revisions were removed by the owner's retention (ADR 0032)
  answers 404, and the message names that possibility.
- **`current` is per declaration.** Two matches can disagree — one still serves the bytes, one moved — and the
  flag is why the answer is useful when they do.
- **Not a verification of the contract.** Finding who recorded a pin says nothing about whether anyone tested,
  endorsed or still wants it; the attestation and deprecation doors hold those facts separately.

## Evidence

- `mvn -o -q -Dtest='ToolServiceTest,ToolControllerTest,JsonPointersTest' test` — **209/209** (132 service, 74
  controller, 3 pointer-walk): two declarations with one pin both answered in NAME order with `current` true; a
  moved declaration answered at its newest carrying revision with `current` false beside a twin still true; an
  A → B → A declaration answered once at revision 3; a revision whose row vanished skipped; a pin nobody
  recorded 404 `unknown-pin`; a malformed pin 400 before any row is read.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5m over HTTP, against PostgreSQL: two
  declarations with the same sentence and schema hashed to ONE pin and both answered; moving one left the old
  pin answering two declarations (the moved one at revision 1, `current=false`) while the new pin answered only
  the moved declaration at revision 2; `ABC` 400 and a never-recorded pin 404; the temporary declarations
  removed so §6 still counts four and still shows five `tool_revision` columns — the lookup added NO column.
- **Still not graded, stated:** no index, no window over matches, no reverse question ("which pins did this
  declaration ever serve" is the history door), no endorsement.

## Date

2026-11-05