# 0051 — A journal is pruned only from the front

- **Status:** Accepted (v621, `DELETE /tools/changes?before=`, the oldest retained `seq` on every prune answer, the
  410 `journal-pruned` for a cursor behind it, the 253 tools cases and the live-PostgreSQL run)
- **Date:** 2026-11-06
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0034 (the journal and its `seq` cursor), ADR 0035 (its narrowings), ADR 0032 (owner-scoped
  revision retention, whose "keeps the newest" rule this door follows)

## Context

`tool_change` has grown since v583 with one row per accepted write and nothing removed any of it. Unlike a
revision table, the journal is not state that a consumer can reconstruct: it is a FEED read forward from a
`seq` cursor, and ADR 0034 promised that a poller can advance the cursor without skipping an entry allocated
before the page it holds.

A plain `DELETE ... WHERE changed_at < ...` would break exactly that promise. A poller holding `seq` 40 could
find every entry between 40 and whatever survived gone, with no way to tell "nothing happened" from "the
middle was removed". A middle-range delete is worse: the feed would still look contiguous while silently
missing entries a watcher was entitled to see. The audit trail sets the precedent that a record of what
happened is append-only, and a retention door that pretends otherwise is a truncation with extra steps.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Existence | No prune; growth bounded only by write volume | Unbounded storage is a real operational cost, and "the table is bounded by writes" is a non-answer for a long-lived registry |
| Existence | Delete a middle range or by instant | A forward cursor cannot describe a hole; a poller would resume inside a gap and never know |
| Existence | TTL by `changed_at` | The cursor is a `seq`, not an instant; an instant bound can delete an entry above a caller's cursor while keeping one below it |
| Existence | **A PREFIX prune below a named `seq`, reporting the oldest entry retained** | **Chosen** — the only delete shape a forward cursor can describe: everything below the boundary is gone, and the boundary is a value every read can name |
| Authority | An operator identity | This build has none; inventing one for a single door would be a second auth model nobody else uses |
| Authority | **No owner, no auth; the door names its boundary explicitly** | **Chosen** — the same honest bound every write door already states (anyone who can reach the service can act). The answer says exactly what it removed |
| Bound | Allow a bound above the newest entry | It would empty the feed and leave no boundary to describe; the next reader could not tell a pruned journal from one that never wrote |
| Bound | **Refuse a bound above the newest entry; every prune keeps at least one entry** | **Chosen** — the same "a prune keeps the newest" rule ADR 0032 set for revisions, and it guarantees a boundary always exists |
| Cursor | Make every read below the boundary a 410 | A fresh reader that never held a cursor would be told it missed something it never asked for |
| Cursor | **`since=0` reads the oldest entry still held; only a POSITIVE cursor below the boundary is 410** | **Chosen** — seqs start at 1, so 0 is "from the beginning", not a position any poller can hold; a real cursor that is behind is told so by name |

## Choice

`DELETE /tools/changes?before=<seq>`:

- Removes every entry with `seq < before` — one prefix, never a middle range.
- Refuses `before` below 1 (`400 invalid-tool`, "1 or more").
- Refuses `before` above the newest entry (`400 invalid-tool`, naming the newest), so at least one entry and a
  describable boundary always survive.
- A bound that removes nothing answers `pruned: 0`: already gone is not a failure, and the boundary does not
  move backward.
- The answer is four fields: `{before, pruned, oldest, remaining}` — the bound applied, how many entries went,
  the oldest `seq` still retained (null only when the journal was already empty), and the whole count after.

`GET /tools/changes`:

- `since=0` (the default) still means "from the beginning"; after a prune it means the oldest entry still held.
- A POSITIVE `since` below `oldest - 1` is `410 journal-pruned`, naming the oldest retained `seq` and the
  cursor that resumes (`oldest - 1`). A cursor exactly at `oldest - 1` is caught up and answers normally.
- The check is the same for every filter: `kind` and `toolId` narrow the page, not the retained prefix, so a
  filter cannot hide a cursor that is behind it.

## Reason

- **A prefix is the only shape a forward cursor can describe.** Everything below the boundary is gone and the
  boundary is one number. A middle delete would leave a feed that looks complete and is not.
- **The answer must name what survives, not only what left.** `pruned` alone tells the operator what it cost;
  `oldest` tells every consumer where the feed now starts, which is the fact the 410 quotes back.
- **Keeping the newest entry keeps the boundary real.** A door that could empty the table would leave nothing
  to compare a cursor against, and "the journal is empty" would become indistinguishable from "the journal was
  erased".
- **0 is not a cursor.** The journal's seqs start at 1, so no poller can hold 0. Treating 0 as "from the
  beginning" lets a fresh reader start against a pruned journal without a false accusation, while a real
  cursor that is behind is refused by name.
- **Silence would be the only alternative, and it is worse.** A poller whose range was pruned must be told;
  a 410 with the surviving boundary lets it decide whether to accept the gap or restart.

## Tradeoffs (stated, not implied)

- **No auth.** Anyone who can reach the service can prune the journal, exactly as they can already delete a
  declaration or withdraw a warning. The door names its bound; the answer names what it did.
- **A prune concurrent with a read can strand one page.** The oldest `seq` is read without a lock; a prune that
  commits between that check and the page can remove entries the page would have carried. The NEXT read
  answers 410 rather than silently resuming mid-prefix. A table lock on every poll would close the window at a
  cost this feed does not justify.
- **Pruned entries are gone for every consumer.** Retention is not per-subscriber: an entry below the boundary
  cannot be replayed by anyone, including a consumer that would have wanted it. That is what a single shared
  feed means.
- **No time-based retention.** The door names a `seq`, because the cursor is a `seq`. "Prune everything older
  than an instant" would be a different rule that can cut above a live cursor and is deliberately not offered.
- **The 410 cannot restore.** It tells the truth about the gap; it does not reconstruct the entries. A caller
  that needs the missing range must have stored what it read.

## Evidence

- `mvn -o -q -Dtest='ToolServiceTest,ToolControllerTest,JsonPointersTest' test` — **253/253** (163 service, 87
  controller, 3 pointer-walk): the prefix delete and its four-field answer; the newest-entry refusal; the
  below-1 refusal; `pruned: 0` on the same bound; a 410 naming the boundary for a positive cursor behind it,
  on both the page and the count; a cursor one below the boundary caught up; `since=0` reading the retained
  prefix; an empty journal with no boundary to be below; the controller echoing the answer and refusing a
  missing bound before the service is touched; the 410 handler's `journal-pruned` body.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5s over HTTP, against PostgreSQL: a
  forward walk read the whole journal without a repeat, a prefix of 3 entries was removed below `seq` 4, the
  answer named the 57 that survived and their oldest `seq` 4, `psql` counted the same rows and the same
  minimum; a cursor at 3 was caught up while 2 was `410 journal-pruned` naming the boundary and the resume
  cursor, even with a `kind` and a `toolId` filter; a bound past the newest entry (60) was 400 naming it,
  `before=0` was 400 "1 or more", no `before` was 400 "the before parameter is missing", and re-pruning the
  same prefix answered `pruned: 0` with the boundary unchanged.
- **Still not graded, stated:** no auth or operator identity, no time-based retention, no per-consumer
  retention, no restore of pruned entries.

## Date

2026-11-06