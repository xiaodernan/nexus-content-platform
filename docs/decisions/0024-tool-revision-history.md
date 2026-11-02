# 0024 — A declaration's history: an update records what it replaced

- **Status:** Accepted (v573, the revision table, the history door and the live-PostgreSQL run)
- **Date:** 2026-11-02
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0022 (declare, never execute) and ADR 0023 (details and the owner's update)

## Context

ADR 0023 let an owner replace a declaration's summary and schema in place. Its own tradeoffs named the
consequence without softening it:

> **No `updated_at`.** Reads cannot say when a declaration last changed; only `createdAt` exists. A caller
> that needs the edit history would need a trail fact, and ADR 0022 chose not to write one.

That leaves a real hole in an external-agent registry. A consumer builds against an input schema. Its author
is allowed to replace that schema at any moment. After the replacement there is no door that answers "what
did this declaration say when I built against it": the old bytes are gone, and `createdAt` now describes a
contract that no longer exists. `updated_at` would say THAT something changed; it would not say WHAT.

The question is therefore not whether an edit should be visible, but **where the replaced values live**.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Record | `updated_at` on `tool_entry` | Says when, never what; a consumer still cannot recover the schema it validated against. ADR 0023 already deferred this as a separate decision |
| Record | A `revision` counter on the row | Says that it changed and how many times; still overwrites the old bytes |
| Record | **An append-only `tool_revision` table, one row per accepted write** | **Chosen** — the same reasoning the audit trail uses: a row that is REPLACED cannot hold a history |
| Record | Store a diff between revisions | Reconstructing a schema from diffs is a second format with its own bugs; a schema is at most 8192 bytes, so the whole value is the honest unit |
| Numbering | A registry-wide sequence | Two declarations' revisions would be comparable and meaningless; a revision is a position in ONE contract's history |
| Numbering | **`1` at registration, then `+1` per accepted update, scoped to the tool** | **Chosen** — the first recorded state is the declaration as born |
| Scope | Record only updates | Then "revision 1" would be the first edit, and the birth contract would still disappear |
| Deduplicate | Skip a revision when the bytes did not change | A successful write that leaves no record is a write the caller cannot see; the row records WRITES, not diffs |
| Read | A history door per declaration | Without one the table is an implementation detail no consumer can use |
| Read | **`GET /tools/{id}/revisions?limit=&offset=`, newest first, public** | **Chosen** — the catalog is already public, and the history is the same fact at another address |
| Read | 404 for an unknown id | An id that names nothing has no history; "empty history" would describe a tool that does not exist |
| Retention | Keep revisions after the declaration is removed | A webhook receipt survives its subscription because it is evidence of an attempted knock; a revision is the declaration itself, and a removed declaration has no current contract to explain |
| Retention | **Delete the history with the declaration** | **Chosen** — one removal, one fact gone; no orphan rows for an id nobody can read again |
| Concurrency | Read the newest revision and add one | Two updates can both read `2` and both write `3`; the database's key would refuse one with an opaque error |
| Concurrency | **Lock the declaration row (`PESSIMISTIC_WRITE`) for the update** | **Chosen** — the parent row is the thing both writers share, and the lock serializes the numbering |
| Shape | Change `tool_entry` | The six columns ADR 0022 pins stay six; history is its own table, so a read of a declaration is still one row |

## Choice

One table and one door:

- `tool_revision(tool_id, revision, summary, input_schema, recorded_at)` — one row per accepted write,
  append-only, keyed by `(tool_id, revision)`. Registration writes revision 1 with the values the
  declaration was born with and `recorded_at = createdAt`. Every accepted `PUT` appends the next revision,
  with the values it stored and this service's clock.
- `GET /tools/{id}/revisions?limit=&offset=` — the history newest first, each revision carrying
  `{revision, summary, inputSchema, recordedAt}`, plus `toolId`, `total`, `limit` and `offset`. Public, like
  the declaration it describes. Default 20, cap 100, floor 1, offset floor 0, with the applied values
  reported back. An id that names nothing is `404 unknown-tool`.

An update locks its declaration row before reading the newest revision, so concurrent updates append 2 and 3
rather than both appending 2. Removing a declaration deletes its revisions in the same transaction.

## Reason

- **The replaced value is the fact a consumer needs.** "When did it change" is a scheduling question; "what
  did it say" is the compatibility question an agent asks before it sends a call. Only the second one can be
  answered by keeping bytes.
- **Writes, not diffs.** A revision is a recorded write. Two identical PUTs make two rows, because two
  writes happened; skipping the second would make a successful request invisible in the only place that
  records it. The history is not a changelog with an opinion about significance.
- **Birth is revision 1.** A tool declared after this slice has a complete history from its first instant. A
  tool that predates the table begins its recorded history at its next accepted write; the service does not
  invent a birth revision it did not observe (the bound is stated below).
- **The declaration read does not grow.** The six-field answer ADR 0022 and 0023 pinned is unchanged. A
  caller that only wants the current contract pays for one row; a caller that wants the history opens a
  second door.
- **Deletion is one act.** History without its declaration would be an address nobody can reach: the id
  cannot be re-used, and the name it held can be declared again as a different row. Keeping the old
  revisions would preserve a contract for a tool that no longer exists.

## Tradeoffs (stated, not implied)

- **Rows created before v573 have no birth revision.** The first accepted update of such a row records
  revision 1 with the values it then wrote. The history cannot show what such a row said before this table
  existed, and it does not pretend to.
- **No diff and no signature.** A revision carries the whole schema; there is no "changed fields" summary and
  no hash a consumer can pin. Comparing two revisions is the reader's job.
- **History is not a trail fact.** No `audit_entry` and no `webhook_delivery` is written by a revision, for
  the same reason an update writes none: editing a declaration is not an event in the world.
- **Retention is deletion-scoped.** There is no prune door and no automatic expiry. A living declaration
  keeps every accepted write; a consumer cannot ask for "revisions since".
- **Concurrency is serialized per declaration.** Two updates of the same tool cannot proceed in parallel;
  updates of different tools can.
- **Still no auth and no execution.** The owner is host-declared (ADR 0018), the body still cannot change
  name, owner or id, and the registry still has no door that calls a tool.

## Evidence

- `npm run verify:api-tests` — `mvn -B test`, **556/556 in 29 classes**, exit 0. v573 contributes 9 cases:
  6 service (registration records revision 1 with the born values and instant; an update appends revision 2
  and calls `lockById`; a history is a newest-first window translated from `limit`/`offset` with the whole
  count; an unknown id's history is a 404 with no window read; removal deletes the history; a stranger's
  update writes no revision) and 3 controller (the history window's five fields and four revision fields with
  no capability field; the applied limit is reported when 500 is asked; an unknown id's history reaches the
  same exception).
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5 registers, updates, then reads
  the history over HTTP: two revisions newest first, revision 1 still the birth sentence and schema, the
  window reaching revision 1 with `total=2`, the cap and floor reported, an unknown id's 404, and `psql`
  reading both rows while `audit_entry` stays empty. §4's removal is followed by `psql` reading zero
  revisions for the removed id. §6 restarts the service and serves both revisions, and
  `information_schema` shows `tool_revision` has exactly five columns.
- **Still not graded, stated:** no diff, no schema hash, no prune, no "since" query, no revision of the
  name/owner/id (they are not editable), and no execution.

## Date

2026-11-02
