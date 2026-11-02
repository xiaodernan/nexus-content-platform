# 0034 — A journal of what happened, because two changes delete their own evidence

- **Status:** Accepted (v583, `GET /tools/changes?since=&limit=&offset=`)
- **Date:** 2026-11-03
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0022 (declare, never execute), 0024 (the history), 0025 (deprecation), 0029 (the chain of holders), 0031 (`since`), 0032 (retention)

## Context

By v582 the registry can answer almost any question about what IS: the catalog with three composable filters, one
declaration by id or by global name, its revision history, its deprecation, its chain of holders, its pin. Every
one of those reads is derived from a row that exists **now**.

That leaves one question unanswered, and it is the question an agent actually polls: *what changed since I last
looked?* Today a poller must re-read the whole catalog and diff it — and that diff is structurally blind to the
two writes that delete the row which would have said they happened:

- a **removal** deletes the declaration, its revisions, its deprecation and its handovers. A catalog diff sees a
  name disappear but cannot say whether it was removed, renamed, or whether the poller itself lost access.
- an **undeprecation** deletes the deprecation row. A poller diffing `/tools/deprecations` sees a row vanish and
  cannot distinguish "the owner withdrew the warning" from "the tool was removed" — two facts with opposite
  meanings for a consumer deciding whether to migrate.

The registry therefore had a gap of the same shape the account ledger closed with its own journal, and no door
could close it by reading state.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Source | Derive a feed from state on each request (diff two snapshots server-side) | Cannot see a removal or a withdrawal by construction, and needs the caller to hand back a whole snapshot to diff against |
| Source | Reuse `audit_entry` | The audit trail is a different question — who did it and from where — and every registry write deliberately does NOT knock on it (ADR 0022). Emitting audit rows for catalog writes would change the meaning of a trail other features read |
| Source | **A dedicated append-only journal table** | **Chosen** — one row per accepted write, written in the same transaction as the write it describes |
| Order | Newest first, like every other window | A poller would page backwards into the past while new writes pile up in front of it; the first page would also shift under it on every write |
| Order | **Oldest first, from a cursor** | **Chosen** — the reader is a process moving forward. Ascending order lets it advance a cursor and never skip an entry allocated before the page it holds |
| Cursor | A timestamp (`since=<instant>`) | Clock-adjacent equal timestamps and late-committing writes make "strictly after this instant" ambiguous: two writes in the same microsecond collapse, and a write allocated earlier can commit later and be skipped forever |
| Cursor | **The journal's own `seq`** | **Chosen** — monotonic per allocation, opaque to callers, echoed back so a poller can store exactly what it has processed |
| `seq` | A count read at insert (`select max+1`) | Two concurrent inserts read the same number under the default isolation; a sequence is what the database provides so this cannot happen |
| Identity | `(tool_id, changed_at)` as the key | A tool can legitimately change twice in the same microsecond; a timestamp is not a key |
| `name` | Join it from the declaration at read time | The rows a removal deletes include the one holding the name, so the most important entry would answer with a null |
| `name` | **Copy it into the entry** | **Chosen** — "declaration 8f3c… was removed" is useless without a name; the entry keeps the name the row had at the write |
| Content | Store the summary and schema in each entry | That duplicates state that revisions already hold, and makes every entry a second, silently diverging copy of the contract |
| Content | **Store the revision number for contract writes only** | **Chosen** — the journal says WHERE to look: a caller that sees `updated` at revision 7 reads revision 7 for the pin and the bytes. Non-contract changes carry no revision, because none was written |
| Kinds | A boolean `changed` flag | A poller cannot tell a warning from a transfer from a deletion, which is precisely what it needs to act on |
| Kinds | **Six named kinds: declared, updated, transferred, deprecated, undeprecated, removed** | **Chosen** — one per accepted write, the same vocabulary the doors already speak |
| Retention | Journal the retention prune (v581) as a seventh kind | A prune removes old revisions but leaves the registry declaring the same contract; a consumer's pin still answers 304 and no fact about what exists has changed. Journalling it would make the feed noisier without telling a poller anything it must act on |
| Retention | Keep the journal forever, for now | It grows unbounded exactly as revisions did before v581. Named as the next question rather than pretended away |
| Refusals | Journal refused writes (403, 404, 400) | The journal states what HAPPENED to the registry. A refusal changed nothing, and it belongs to a trail, not to a feed of state changes |
| Idempotence | Journal a removal that removed nothing | "Already gone" answers 200 `removed:false`, and nothing happened; the feed must stay silent or a poller would react to a non-event |

## Choice

Every accepted write appends one `tool_change` row in the same transaction: `register` (declared, the revision it
wrote), `update` (updated, the revision it wrote), `transfer` (transferred), `deprecate` (deprecated),
`undeprecate` (undeprecated, only when a deprecation row was actually deleted) and `remove` (**before** the
deletes, so the entry outlives every row that could have named it). `GET /tools/changes?since=&limit=&offset=`
answers `{since, changes, total, limit, offset}` with entries `{seq, toolId, name, kind, revision, at}` **oldest
first**, `total` equal to the whole number of entries newer than the cursor, a default `limit` of 20, a cap of 100
reported in the answer, and a negative offset floored to 0. An absent `since` is 0 — the beginning of the journal,
echoed as a real cursor rather than an absent filter. A negative cursor is a 400 that names "0 or more".

## Reason

- **Two facts have no row of their own.** Removal deletes the declaration; undeprecation deletes the warning. A
  feed derived from state would omit exactly the changes a consumer most needs, and it would omit them silently.
  The journal is the only read in this registry that can name a declaration whose row is gone.
- **A feed is read forward.** Every other window here is read backwards by a person asking "what did it say
  before". This one is read by a process asking "what is new", so the order, the cursor and the count all face
  the other way. Making it consistent with the others would have made it wrong for its only reader.
- **The journal duplicates no state.** It carries a name and a revision NUMBER, not a contract: the bytes live in
  the revision the number points at. What it adds is the only thing that cannot be recomputed — that a thing
  happened, and in what order.
- **Refusals stay out.** A feed that mixed 403s and 404s into "what changed" would make every poller filter it
  back out, and would put attempts into a table whose rows are facts.

## Tradeoffs (stated, not implied)

- **`seq` is allocated in order, not committed in order.** Two concurrent transactions can be handed 41 and 42
  and commit in the other order; a poller that has processed 42 may not yet see 41. Writes to the SAME
  declaration are serialized by the row lock every writing door takes, so one tool's entries are always in
  order, and the intended reader — a poller that re-asks from the last `seq` it processed and tolerates a
  re-read — is unaffected. A strict global commit order would need a serialized append or a visibility
  watermark, and neither is worth it for a catalog feed.
- **The journal grows unbounded.** Same shape as revisions before v581, and the same owner-names-the-bound
  remedy is the next increment, not this one.
- **A journal entry is not an audit entry.** It says a change happened, not who made it, from where, or with
  what credential. `audit_entry` stays empty for registry writes.
- **No filter by kind or by tool yet.** A poller receives every change in the registry and filters locally; a
  `kind=` filter is a window question this door does not answer yet.
- **A removal is not a revision.** The entry says the declaration is gone and carries its name; nothing records
  what its last contract was. A caller that needed the bytes should have read them before the removal.

## Evidence

- `mvn -Dtest='ToolServiceTest,ToolControllerTest' test` — **134/134** (86 service, 48 controller). v583
  contributes 8 service cases and 4 controller cases: each accepted write journalling its kind (and revision for
  the two contract writes); a removal journalling BEFORE its deletes (verified with `InOrder`); a transfer and a
  deprecation journalling with no revision; an undeprecation journalling only when a row was actually removed;
  the forward read from a cursor and its narrowed count; a negative cursor refused; the envelope echoing the
  cursor it applied, an absent cursor read as 0, the cap and floor reported; and a removal's entry carrying a
  null revision.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5e over HTTP against a real
  PostgreSQL: the journal answers every entry oldest first, walked forward seven at a time across the whole feed
  with a narrowing count on each page and no entry twice; six kinds appear and only `declared` / `updated` name a
  revision; the tool pruned and removed in §5c reads back as `declared, updated, updated, removed` with
  revisions `1, 2, 3, null` while its declaration is a 404 and `tool_entry` holds zero rows — the entry still
  carries the name; a retention prune wrote no entry; the one withdrawal sits between the deprecation it
  withdrew and the new one left on record; an already-gone removal wrote nothing; a negative cursor is a 400
  naming "0 or more", `limit=500` is reported as 100 and `offset=-3` as 0; a cursor at the newest entry answers
  an empty set with `total=0`; `psql` reads the same count the answer claimed; and §6 shows the journal survives
  the restart entry for entry, with `tool_change` holding exactly six columns (`changed_at, kind, name,
  revision, seq, tool_id`).
- **Still not graded, stated:** no journal retention, no `kind=` filter, no per-tool feed, no audit entry, and
  no strict global commit order for `seq`.

## Date

2026-11-03