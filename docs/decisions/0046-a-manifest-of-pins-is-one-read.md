# 0046 — A manifest of pins is ONE read, and an unrecorded pin is named

- **Status:** Accepted (v616, `GET /tools/pins?pin=&pin=…`, the `requested/found/tools/missing` answer, the 218
  tools cases and the live-PostgreSQL run)
- **Date:** 2026-11-05
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0028 (the computed pin), 0036 (a batch of ids names what it did not find), 0045 (the
  registry-wide pin lookup and its scan)

## Context

v615 answered "who carries this pin" for ONE pin, by scanning the revision table once. The consumer this is for
does not hold one pin: it holds a manifest — a lockfile, a deployment's dependencies, a cache keyed by contract
— and the natural loop is one call per line. At the scan cost v615 states, a hundred-line manifest would scan
the history a hundred times for one answer each, and every pin that was never recorded here would come back as
a 404 the caller has to catch, one at a time.

The batch-of-ids door (v587) already settled the shape of this kind of question: several handles in one
request, an answer that keeps the caller's order, and the handles that resolved to nothing NAMED rather than
turned into a request failure. A manifest of pins needs the same shape with one difference the pin forces:
one pin can name SEVERAL declarations, so the count of matches is not the count of questions.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Shape | Call the single-pin door per line | One full scan per pin, and one unrecorded pin is a 404 that aborts a loop the caller wrote to tolerate it |
| Shape | **One request, one scan, every pin answered from it** | **Chosen** — the scan is the expensive part, and it does not depend on how many pins are asked |
| Missing | 404 for the whole request | A manifest is a list of questions; one unrecorded line must not hide the answers to the others |
| Missing | **Name it in `missing`, in request order** | **Chosen** — the caller learns which lines to drop without catching and losing the rest |
| Counts | `found` = number of matches | Breaks the invariant when one pin names two declarations; the caller could no longer check the answer |
| Counts | **`found` = number of PINS that resolved; `found + missing.size() == requested`** | **Chosen** — one property that holds no matter how much duplication the content has |
| Order | One NAME order across every match | Destroys the zip with the manifest, which is the reason the caller sent its order |
| Order | **Request order, then NAME within one pin** | **Chosen** — stable, checkable, and the caller keeps its own order |
| Bound | Unbounded | One scan is bounded, but the answer and the request line still grow without limit |
| Bound | **At most 50 DISTINCT pins, the same cap the batch of ids carries** | **Chosen** — one rule for "a list is not a scan", used twice |
| Duplicates | Ask twice | Naming a pin twice is asking one question twice; the scan already deduplicated it |

## Choice

`GET /tools/pins?pin=<64 hex>&pin=…`:

- Blanks are dropped, duplicates collapse in first-seen order, every pin is validated as a pin before the scan
  (400 naming the 64-hex rule), and at most 50 DISTINCT pins are accepted.
- One `revisions.findAll()` serves every pin; hits are grouped by (pin, declaration), keeping the newest
  revision that carries each pin; the declarations behind the hits are loaded in one `findAllById`.
- Answers `{requested, found, tools, missing}`: `requested` counts distinct pins, `found` counts the pins that
  resolved, `missing` names the pins that resolved to nothing in request order, and `tools` lists matches in
  (request order, NAME) with the same eight fields the single-pin door serves.
- No pin at all (absent, empty, or only blanks) is 400 `invalid-tool` "at least one pin".
- A revision whose declaration vanished between the scan and the row read is skipped, as in v615.

## Reason

- **The caller's unit is the manifest, so the door's unit should be the manifest.** Asking a hundred questions
  one at a time is a shape the service pays for, not the caller.
- **The invariant must survive duplication.** A pin names content, so `found` could not be a row count without
  making `requested = found + missing` false; counting resolved PINS keeps one arithmetic promise true.
- **Naming the miss is the difference between a report and a failure.** A reconciler wants to know what its
  manifest holds that this registry does not; a 404 tells it that by refusing to answer anything else.

## Tradeoffs (stated, not implied)

- **The same declaration can appear more than once.** Two requested pins may both be carried by one
  declaration; both are answered, because dropping one would delete a question the caller asked. De-duplication
  across pins would need a second index over the caller's intent, which the caller already has.
- **The answer is not a page.** Its size is the duplication of the requested content, not a dataset; `missing`
  and `tools` are both bounded by the 50-pin cap.
- **One scan, still O(revisions).** The pass is shared, not free; the ADR for the index (0045) still applies,
  and this door does not change that trade.
- **Order is the caller's, so two callers asking the same set can get different sequences.** That is the point
  of keeping it; a caller that wants name order sorts the answer it already has.
- **No per-pin status object.** A pin that resolved does not carry a flag saying so; it is present in `tools`
  with its pin, and the absence from `missing` is the statement. One shape, not two.

## Evidence

- `mvn -o -q -Dtest='ToolServiceTest,ToolControllerTest,JsonPointersTest' test` — **218/218** (138 service, 77
  controller, 3 pointer-walk): three pins answered from ONE `findAll` in request order, with a pin that names
  two declarations contributing two matches; a repeated pin collapsed and a blank dropped; null, empty and
  all-blank manifests refused before the scan; a malformed pin refused before the scan; 51 distinct pins
  refused naming the cap; a stale pin resolving at its older revision with `current=false`; the four-field
  wire shape and eight fields per match.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5n over HTTP, against PostgreSQL:
  five `pin=` parameters (one duplicated) answered `requested: 4, found: 3`, named the unrecorded pin in
  `missing`, and returned m.tool at revision 1 (`current=false`), m.tool at revision 2 (`current=true`) and
  z.tool at revision 2 (`current=true`) in request order; no pin, `ABC` and 51 distinct pins each refused by
  name. No rows were written, so §6 still counts four and five revision columns.
- **Still not graded, stated:** no cross-pin de-duplication, no cursor over matches, no per-pin error status,
  no index.

## Date

2026-11-05