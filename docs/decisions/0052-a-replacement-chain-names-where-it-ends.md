# 0052 — A replacement chain names where it ends

- **Status:** Accepted (v622, `GET /tools/{id}/replacement-chain`, the five outcomes, the 20-step bound, the
  261 tools cases and the live-PostgreSQL run)
- **Date:** 2026-11-06
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0025 (deprecation as its own resource), ADR 0049 (the derived replacement state),
  ADR 0050 (selecting warnings by that state)

## Context

Since v619 every warning row says what its immediate successor is and whether that successor is `live` or
itself `deprecated`. A consumer that reads `replacementStatus=deprecated` knows only that the NEXT tool is also
going away; it does not know whether following the hints reaches a live declaration, dangles at a name nobody
declared, stops at a warning with no successor, or loops. The question a migrating consumer actually asks —
"if I move to the suggested tool, where do I end up?" — takes one request per hop today, and the caller has to
implement cycle detection itself.

The registry can create every one of those shapes: two owners may point at each other, a successor may be
declared long after the hint that names it, and a warning may name nothing at all. A read that assumed the
walk terminates would hang on the first loop.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Existence | Leave it to the client | Every consumer would re-implement the same walk, and each would choose its own bound and its own cycle answer — or hang |
| Existence | A recursive CTE over `tool_deprecation` | The database can do it, but cycles must still be stopped and named, the answer still needs the same vocabulary, and a 20-row walk does not justify a dialect-specific statement |
| Existence | **A bounded walk in the service, one read per hop** | **Chosen** — at most 20 hints, each an indexed lookup by name and one warning read; the loop is visible in code and testable without SQL |
| Start | Any declaration | A tool with no warning has no chain; answering an empty chain would blur "live" with "nothing to follow" |
| Start | **Only a declaration that carries a warning; a live tool is the existing 404 `not-deprecated`** | **Chosen** — the same distinction the deprecation read already draws, one door away |
| Key | Follow hint to ROW ID | A hint stores a NAME, not an id; the name is the registry's global key and the only thing a hint contains |
| Key | **Resolve each hint by name, and read that declaration's warning once** | **Chosen** — the row fetched for the status is the row the next step describes, so the walk does not read the same warning twice |
| Cycle | Stop silently | A consumer that asked where it ends must be told the walk repeats |
| Cycle | **Name the repeated step in `cycleTo`, stop before re-entering it** | **Chosen** — the shape is legal state, not an error; the answer describes it |
| Bound | Walk until it ends | A loop or a very long chain would run without limit |
| Bound | **Stop at 20 steps with outcome `depth`** | **Chosen** — a stated bound, distinct from every terminal state, and far longer than a real migration chain |
| Outcome | One word per answer | The caller needs to branch: migrate, ask the owner for a successor, declare the missing tool, or break a loop |

## Choice

`GET /tools/{toolId}/replacement-chain`:

- The first step is the declaration the id names; it must carry a warning (`404 unknown-tool` when the id names
  nothing, `404 not-deprecated` when the tool is live).
- Each step is `{toolId, name, deprecated, replacement, replacementStatus}`. `replacementStatus` is the SAME
  derived vocabulary the warning list uses (`none`, `unresolved`, `live`, `deprecated`), and null for a live
  declaration — a tool with no warning has no hint state to name.
- The walk follows the hint by NAME. A hint that names nothing ends the walk as `unresolved` and is NOT a step:
  steps are declarations, and a name nobody declared is not one.
- A name already walked ends the walk as `cycle`, with the repeated name in `cycleTo`; the repeated step is not
  appended a second time.
- A warning with no hint ends the walk as `none`; a declaration with no warning ends it as `live`.
- A walk that reaches 20 steps with another deprecated hop pending ends as `depth`.
- The envelope is five fields: `{toolId, name, outcome, cycleTo, steps}`; `cycleTo` is null for every outcome
  except `cycle`.

## Reason

- **One answer for a question every consumer has.** The chain is the difference between "the successor also
  has a warning" and "the successor's successor is live"; the first is a row, the second is a walk.
- **A cycle is state, not a failure.** Two owners can point at each other through legal hints. Refusing the read
  would hide a fact the registry itself allowed; naming the repeated step lets a consumer see the loop.
- **The bound must be visible.** `depth` is a fifth outcome rather than a silent truncation, so a caller can
  tell "the chain is longer than this read follows" from "the chain ended here".
- **The answer reuses the vocabulary that already exists.** `none`, `unresolved`, `live` and `deprecated` mean
  exactly what they meant on the warning row; only the chain-level outcomes (`cycle`, `depth`) are new.
- **A live tool is not an empty chain.** "This tool is live" and "there is no such tool" are different facts,
  and both are different from "this warning's successor is live".

## Tradeoffs (stated, not implied)

- **One read per hop, bounded at 20.** A chain of N costs N name lookups and N warning reads. The bound is the
  reason this is acceptable; a recursive statement would be one round trip but would move the cycle rule into
  SQL and still need the same answer shape.
- **The walk is not a snapshot.** Each hop is its own read under READ COMMITTED, so a concurrent update,
  withdrawal or declaration can change a later step between two hops. The answer is what the registry said
  while the walk ran; it is not a transactionally consistent history.
- **Names are the key, so a chain is only as stable as names.** Names are globally unique and cannot be
  renamed, which is what makes this safe; a future rename door would have to revisit the walk.
- **No message, owner or instant on a step.** The chain answers "where do I end up", not "why"; each step's id
  still opens the deprecation and declaration doors for the rest.
- **A self-hint cannot be created.** The deprecation door refuses a replacement that names the tool itself, so
  the shortest cycle this read can meet is two declarations. The walk still handles a one-step cycle
  defensively rather than assuming the door is the only writer.

## Evidence

- `mvn -o -q -Dtest='ToolServiceTest,ToolControllerTest' test` — **258/258** (170 service, 88 controller):
  a chain ending at a live declaration; at a warning with no successor; at a hint nobody declared; a two-step
  loop naming the repeated step; a defensive self-cycle; the 20-step bound answering `depth`; a live tool
  refused as `not-deprecated`; the controller's five-field envelope and five-field steps.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5t over HTTP, against PostgreSQL:
  `chain.one → chain.two → chain.three` read back as three steps ending `live`, with the live step's status
  null; re-pointing the last warning at `chain.one` made the walk a `cycle` named in `cycleTo`; a hint naming
  `chain.ghost` made it `unresolved` and was not counted as a step; a warning with no successor made it `none`
  after two steps; a live tool was `404 not-deprecated` and an unknown id `404 unknown-tool`; every fixture was
  removed, so §6 still counted one warning and four declarations.
- **Still not graded, stated:** no message/owner/instant on a step, no depth beyond 20, no snapshot isolation,
  no rename handling.

## Date

2026-11-06