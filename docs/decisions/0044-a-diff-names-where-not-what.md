# 0044 — A diff names WHERE, not WHAT: two pins compared in one pointer vocabulary

- **Status:** Accepted (v614, `GET /tools/{id}/diff?from=&to=`, the RFC 6901 path answer, the 201 tools cases
  and the live-PostgreSQL run)
- **Date:** 2026-11-05
- **Milestone:** M10 (External Agent Ecosystem)
- **Builds on:** ADR 0028 (the computed pin), 0032 (retention bounds a history), 0040 (a pin reads its bytes back)

## Context

v590 made a pin a way back to the bytes it named, so a consumer holding a stale pin can fetch what it had and
what is served now. It still cannot see what CHANGED: that is two reads, a JSON diff the consumer writes
itself, a pointer syntax it chooses, and a decision about arrays it may make differently from the next
consumer. Two clients comparing the same two contracts can therefore disagree about the answer while both are
right about the bytes.

The registry has both contracts already: every accepted write records a revision, the schema is stored in one
canonical compact form, and the pin is computed from the summary and that schema. The missing piece is a
reading of the difference in a vocabulary the service already owns.

## Options

| Axis | Option | Why not / why |
| --- | --- | --- |
| Answer | Both full schemas, side by side | Up to 16 KB of bytes the caller can already read by pin, and a diff that doubles as a read invites being used as one |
| Answer | The changed VALUES with their paths | Same duplication, and a value quoted in a diff is a second copy that can drift from the revision it claims to quote |
| Answer | **The differing paths only, in three lists** | **Chosen** — the answer names WHERE; the two echoed pins are the way to WHAT |
| Paths | A bespoke dotted syntax | Every consumer would have to learn it and escape it; JSON Pointer is a published rule with an escaping rule already |
| Paths | **RFC 6901 JSON Pointers** | **Chosen** — `""` is the document, `/properties/city` a field, `/required/1` an array element; `~` and `/` in a name escape to `~0` and `~1` |
| Compare | Whole-document equality | Says "different" and stops; the caller still has to diff, which is the work this door removes |
| Compare | **Objects by KEY, arrays by INDEX, leaves by value** | **Chosen** — a JSON array is positional, so an insertion near the front reads as a change at every later index; stated rather than guessed |
| `to` | Required | The question a consumer with a stale pin asks is "what differs from what is served NOW"; requiring it makes the caller fetch a pin it does not have |
| `to` | **Optional: absent means the contract served now; present-but-blank is refused** | **Chosen** — absence is a decision, a blank parameter is a typo |
| `identical` | Walk the two schemas and compare | A pin already hashes the summary and the canonical schema together, so equal pins are equal contracts |
| `identical` | **Decided by the pins; equal pins skip the walk** | **Chosen** — one fact, computed where it is already computed |

## Choice

`GET /tools/{id}/diff?from=<pin>&to=<pin>`:

- Answers `{toolId, from, to, identical, summaryChanged, schema:{added, removed, changed}}`, six top-level
  fields; each side is `{revision, summary, contractSha256, recordedAt}`.
- `from` is required: absent or blank is 400 naming `from`; malformed is 400 naming the 64-hex rule; a pin this
  declaration never recorded (or retention removed) is 404 `unknown-pin` whose message names the `from` end.
- `to` absent compares against the newest recorded revision, which is the contract served now. A present but
  blank `to` is 400, and a malformed or never-held `to` is refused under its own end.
- The id is settled before either pin: an unknown id is 404 `unknown-tool` even when both pins are nonsense.
- `identical` is true exactly when the two pins are equal, and then the three lists are empty without walking.
- The schema walk is `JsonPointers.diff`: objects by key, arrays by index, leaves by value, with RFC 6901
  escaping. The walk is bounded by the 8192-byte schema bound the write path already enforces.
- No new column, no index, no migration: each pin is found by recomputing the pins of one declaration's
  revisions, the same bounded scan as v590.

## Reason

- **A diff is a reading, and a reading should not carry the thing it reads.** The pins already address the
  bytes; repeating up to 8 KB per side would make the answer expensive and tempt callers to treat a diff as a
  second read door with its own caching rules.
- **One path vocabulary beats two client-side diffs.** A pointer is checkable, printable and comparable; a
  consumer can store the list, count it, or show it without owning a diff implementation.
- **"What is different from what I have?" is the question, so `to` should default to now.** Requiring both pins
  makes the caller perform a read whose only purpose is to name the current contract, one line before asking
  what changed to it.

## Tradeoffs (stated, not implied)

- **Array insertions cascade.** A new first element reports a change at every later index; positional arrays
  have no identity to follow, and inventing one (an `id` field) would be a claim about the schema's meaning.
- **Paths, not values.** A caller that wants to show the old and new text must read each pin; that is one more
  request, and it is the request that keeps the two answers from disagreeing.
- **No move detection.** A key removed from one place and added in another is one removed path and one added
  path, not a move.
- **O(history) per side.** Each named pin is found by hashing the revisions of one declaration; naming both
  ends costs two scans, an absent `to` costs one scan plus one primary-key read. Retention is the owner's
  bound (ADR 0032), and the cost is stated rather than indexed away.
- **Same declaration only.** Two tools' contracts cannot be compared here; a pin is a pin of a revision, and a
  cross-tool diff would need a different question (and a different authorization story).
- **Special float values** compare through Jackson's node equality, the same rule the pin's canonical form
  already obeys; the registry does not invent a second numeric comparison.

## Evidence

- `mvn -o -q -Dtest='ToolServiceTest,ToolControllerTest,JsonPointersTest' test` — **201/201** (126 service, 72
  controller, 3 pointer-walk): one field added, one removed and one array element appended named as three
  paths in document order; a summary-only change with an empty schema diff; the same pin identical without a
  walk; absent/blank/malformed/never-held pins refused by name with the end named; an absent `to` resolved to
  the newest revision; the id settled first; the six/four/three wire shapes; and the escape of `~` and `/`.
- `docs/evidence/m10/tool-registry-proof.mjs` (`npm run verify:tools`) — §5l over HTTP, against PostgreSQL: a
  temporary declaration moved once, its stale pin compared against the served contract (both sides field for
  field, `summaryChanged` true, `added` = `/properties/city/maxLength`, `/required/1`, `removed` =
  `/properties/note`, nothing changed), both pins naming the same comparison, one pin against itself identical with
  three empty lists, and every refusal (no `from`, `abc`, a never-held pin, `to=abc`, `to=` blank, unknown id)
  answered by its own name; the temporary row removed so §6 still counts four.
- **Still not graded, stated:** no move detection, no array element identity, no cross-tool comparison, and no
  rendering of values (the pins are the way to those).

## Date

2026-11-05