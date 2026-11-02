# 0031 — A history narrowed to what you do not have: `since`, and why it is refused where an offset is clamped

- **Status:** Accepted (v580, `since` on `GET /tools/{id}/revisions`, the narrowed count and the echoed slice)
- **Date:** 2026-11-03
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0024 (the history), 0027 (a filter narrows the count too), 0028 (the pin)

## Context

A consumer that recorded revision 5 and wants to know what happened since had one way to ask: walk
`GET /tools/{id}/revisions` page by page until it recognised a revision it already had. With twenty revisions a
page and a declaration updated often, that is a page and a half of reading to learn that nothing changed — and
the caller cannot even stop early, because the answer's order is newest first and its `total` describes the
whole history.

The history could always be sliced by position (`limit`/`offset`). Position is the wrong key for this question:
a caller does not know how many revisions were added since it last looked, which is precisely what it is asking.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Door | A new `/tools/{id}/changes` endpoint | The facts are the same revisions; a second door would be a second paging rule, a second wire shape and a second set of bounds for one question |
| Door | **`since` on the existing history door** | **Chosen** — one shape, one rule, and every existing assertion about the window still applies |
| Key | An instant (`since=2026-11-03T10:00:00Z`) | Two writes can share a microsecond, a caller's clock is not this service's clock, and "the revision recorded at exactly T" would be ambiguous at the boundary |
| Key | **A revision number: everything with `revision` > `since`** | **Chosen** — the number cannot tie with itself, and it is the identifier the consumer already holds |
| Boundary | Inclusive (>= since) | The caller already has `since`; answering it again makes every consumer re-read one revision it pinned |
| Boundary | **Exclusive (> since)** | **Chosen** — "what came after the thing I have" |
| Count | The whole history's count beside a narrowed window | A window must not claim to be the whole. The count narrows WITH the window, the rule the catalog search already follows |
| Count | **The narrowed count** | **Chosen** |
| Negative | Floor to 0, like a negative offset | `limit` and `offset` describe the SHAPE of an answer, so clamping them and echoing the clamp keeps the answer honest. `since` describes WHICH FACTS are being asked for; flooring -3 to 0 would answer "everything" to a question that meant something else. There is no revision -3 |
| Negative | **A 400 that names the rule** | **Chosen** — the difference from `offset` is stated in the refusal and in the ADR, not left for a reader to infer |
| Echo | Nothing | A reader could not tell a narrowed history from a short one |
| Echo | **`since` in the envelope, null when absent** | **Chosen** — the same reason `owner` is echoed by the catalog and `query` by the search: an answer says which slice it applied |
| Scope | A registry-wide change feed (`GET /changes?since=<n>`) | A different and much larger thing: it needs a global sequence that spans tools, including deletions — and a deletion has no row left to name. Out of scope here, stated |

## Choice

`GET /tools/{id}/revisions?since=<n>&limit=&offset=`:

- `since` absent: the whole history, and the envelope echoes `since: null`.
- `since` present: only revisions with `revision` > `since`, newest first, paged as before; the envelope echoes
  `since` and reports the count of the NARROWED set.
- A `since` above the newest revision is an empty window with `total: 0` — an answer, not an error.
- A negative `since` is `400 invalid-tool` naming the rule ("0 or more"), unlike a negative `offset`, which is
  floored to 0 and reported.

## Reason

- **The consumer's question is a delta, and the history could only be asked in positions.** `since` turns "how
  many pages until I find revision 5" into one request that costs what changed, not what exists.
- **The revision number is the right key because it cannot tie.** An instant filter would push the ambiguity of
  two writes in one microsecond onto every caller, and would make the answer depend on clock skew.
- **The count must describe the same set as the window.** A narrowed window with a whole-history count would
  claim eleven revisions behind an answer of one; the two numbers must move together.
- **Refusing is different from clamping, and the difference is about meaning.** A page position is a hint about
  the shape of an answer; a filter bound is part of the question. Silently answering the whole history to
  `since=-3` would be answering a question nobody asked.

## Tradeoffs (stated, not implied)

- **Per tool, not the registry.** There is no way to ask "what changed anywhere since I last looked". That needs
  a global sequence and a story for deletions, which is a separate decision.
- **The history is unbounded.** Nothing prunes it: a declaration updated ten thousand times keeps ten thousand
  revisions, and `since` makes reading them cheap but not the row count. Retention is a policy with its own
  consequences (a pruned revision is a pin that can no longer be explained) and is not decided here.
- **A pin is not a revision number.** A caller that holds a `contractSha256` but not a revision number cannot use
  `since`; it can ask `since=0` and compare pins, or use `If-None-Match` for the current state.
- **No compaction of identical writes.** Two identical PUTs are two revisions, so `since` can answer a revision
  whose content equals the caller's. That is deliberate (a revision is a recorded write, ADR 0024).
- **The narrowed count costs a second query.** Both numbers are asked of the database rather than one being
  derived from the other, the same shape every other window in this service has.

## Evidence

- `mvn -Dtest='ToolServiceTest,ToolControllerTest' test` — **104/104** (66 service, 38 controller). v580
  contributes 4 service cases and 3 controller cases: `since` reaching the filtered query and the filtered count
  while never touching the whole-history count; no `since` using the whole-history query and count; a narrowed
  window and a narrowed count moving together; a negative `since` refused before any query; the echo carrying
  the value asked for, `null` when none was, and the six-field envelope; and a negative `since` refused before
  the window is reported.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5 over HTTP: the whole window echoes
  `since: null` and carries exactly six fields; `since=1` answers one revision with `total=1` and that revision's
  pin equals the one served now; `since=2` is empty with `total=0`; `since=0` is both revisions; a page inside
  the narrowed set still reports the narrowed count; and `since=-1` is a 400 naming "0 or more" while a negative
  offset on the same door was floored to 0 and reported.
- **Still not graded, stated:** no registry-wide change feed, no retention or pruning, no lookup by pin.

## Date

2026-11-03