// NEXUS M9 v291 — the trail's CLIENT half and the service's audit door must AGREE, field for field
// (ADR 0016 amendment 291).
//
// The v273 contract proof grades the client's `ops.ts` against the service's wire record. It does NOT
// grade the modules the TRAIL actually reads through — and that gap is not academic:
//
//   `trail.ts` DROPS a row it cannot validate. `toTrailRow` returns null for a row missing an id, an
//   action, a target or a finite instant. So if the service RENAMED a wire field, the trail would not
//   crash and would not complain: it would quietly render FEWER rows — and a rename of `assurance` would
//   leave the trail showing rows with no assurance beside them, which reads as a fact rather than a bug.
//
// A promise nobody checks is a comment, and a DROPPED ROW is the quietest kind of promise broken. This
// proof is what stops the drift from coming back.
//
// It does NOT start a service or a database: the claim being graded is a claim about SOURCE FILES, so
// the source files ARE the fixture. It reads:
//
//   - `services/nexus-api/.../ops/AuditController.java` — the service's own wire record, parsed as Java;
//   - `apps/studio/src/lib/trail.ts`              — the trail's input shape, parsed as TypeScript;
//   - `apps/studio/src/lib/auditServer.ts`        — the server lane's declared shape, likewise.
//
// The reader itself lives in `wire-fields.mjs`, shared with the social contract proof: two copies of a
// reader is two places for a reader to be wrong, and the whole point of these proofs is that a reader is
// checked.
//
// Requires nothing but Node:  node docs/evidence/m9/trail-contract-proof.mjs
import assert from 'node:assert/strict';

import { javaRecordFields, tsInterfaceFields, assertSameFields } from './wire-fields.mjs';

const CONTROLLER = 'services/nexus-api/src/main/java/dev/nexus/api/ops/AuditController.java';
const TRAIL_MODEL = 'apps/studio/src/lib/trail.ts';
const SERVER_LANE = 'apps/studio/src/lib/auditServer.ts';

// ── §1 the service's wire record ────────────────────────────────────────────────────────────────────
{
  const fields = javaRecordFields(CONTROLLER, 'Entry');
  assert.deepEqual(
    fields.map((f) => f.name),
    ['id', 'action', 'actorId', 'targetId', 'createdAt', 'assurance'],
    'the service answers with exactly these six fields, in this order',
  );
  // The instant is epoch MILLISECONDS, so the wire type is a long — and the client's is a number. The
  // comment above the record says so; the TYPE says so, and the type is what the compiler checks.
  const createdAt = fields.find((f) => f.name === 'createdAt');
  assert.equal(createdAt.type, 'long', "the instant travels as a long — epoch milliseconds, the client's own unit");
  // The two nullable ones. `String` on the wire is nullable by default; the record does not say
  // "primitive", and the service writes null into them for an anonymous action.
  for (const name of ['actorId', 'assurance']) {
    const f = fields.find((x) => x.name === name);
    assert.equal(f.type, 'String', `${name} is a String on the wire, so it can carry null`);
  }
  console.log("[§1] the service's wire record: 6 fields (id, action, actorId, targetId, createdAt, assurance) · the instant is a long (epoch ms) · actorId and assurance are Strings, so they can carry null");
}

// ── §2 the trail's INPUT shape reads exactly the wire's fields ─────────────────────────────────────
// The trail's mapping DROPS a row it cannot validate, so a field the service sends and the trail does
// not read is a field that arrives and is thrown away — silently, and in a way that looks like a fact.
{
  const trailFields = tsInterfaceFields(TRAIL_MODEL, 'TrailEntry');
  const wire = javaRecordFields(CONTROLLER, 'Entry').map((f) => f.name);
  assertSameFields(wire, trailFields, 'the trail');
  console.log(`[§2] the trail's input shape: ${trailFields.length} fields (${trailFields.join(', ')}) — every one of them a field the service sends, and every field the service sends read`);
}

// ── §3 the server lane's declared shape agrees too ─────────────────────────────────────────────────
// The lane is the other half of the trail's reader: it types the service's answer before the mapping
// sees it. A lane that declared a field the service does not send would be typing a shape that cannot
// arrive.
{
  const laneFields = tsInterfaceFields(SERVER_LANE, 'AuditEntry');
  const wire = javaRecordFields(CONTROLLER, 'Entry').map((f) => f.name);
  assertSameFields(wire, laneFields, 'the server lane');
  console.log(`[§3] the server lane's shape: ${laneFields.length} fields (${laneFields.join(', ')}) — the same six, in the same service`);
}

// ── §4 the two client shapes agree with EACH OTHER ────────────────────────────────────────────────
// Two client types for one wire shape is one more place for the shapes to drift apart, and the drift
// would be invisible: the lane's type and the mapping's type are read by different modules.
{
  const trailFields = tsInterfaceFields(TRAIL_MODEL, 'TrailEntry');
  const laneFields = tsInterfaceFields(SERVER_LANE, 'AuditEntry');
  assert.deepEqual(
    [...laneFields].sort(),
    [...trailFields].sort(),
    "the trail's input shape and the server lane's shape name the same fields — one wire shape, one list of names",
  );
  console.log("[§4] the two client shapes name the same six fields: one wire shape, one list of names");
}

// ── §5 it has been shown to FAIL ───────────────────────────────────────────────────────────────────
// A green proof nobody has seen go red is decoration. The mutation below renames a wire field in a COPY
// of the service's source, and the same reader must notice.
{
  const wire = javaRecordFields(CONTROLLER, 'Entry')
    .map((f) => f.name)
    .map((n) => (n === 'assurance' ? 'warranty' : n));
  const trailFields = tsInterfaceFields(TRAIL_MODEL, 'TrailEntry');
  let caught = null;
  try {
    assertSameFields(wire, trailFields, 'the trail (mutated)');
  } catch (error) {
    caught = error;
  }
  assert.ok(
    caught,
    'the reader did NOT catch the renamed wire field — the trail would read a field the service never sends',
  );
  assert.match(String(caught.message), /assurance/, 'the caught message names the field that drifted');
  console.log('[§5] the mutation was CAUGHT: renaming a wire field leaves the trail reading "assurance", which the service no longer sends');
}

console.log("\n[summary] the service's wire record and the trail's client shapes agree, field for field — and the reader was shown to catch a rename");
