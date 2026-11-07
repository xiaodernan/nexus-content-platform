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
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { javaRecordFields, tsInterfaceFields, assertSameFields } from './wire-fields.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const CONTROLLER = 'services/nexus-api/src/main/java/dev/nexus/api/ops/AuditController.java';
const TRAIL_MODEL = 'apps/studio/src/lib/trail.ts';
const SERVER_LANE = 'apps/studio/src/lib/auditServer.ts';

// ── §1 the service's wire record ────────────────────────────────────────────────────────────────────
{
  const fields = javaRecordFields(CONTROLLER, 'Entry');
  assert.deepEqual(
    fields.map((f) => f.name),
    ['id', 'action', 'actorId', 'targetId', 'targetType', 'createdAt', 'assurance'],
    'the service answers with exactly these seven fields, in this order',
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
  // v384 — the target's kind is a String like the rest, and it is NOT one of the nullable two: the
  // service refuses an entry that does not name a kind, so every entry on this wire carries one.
  assert.equal(fields.find((f) => f.name === 'targetType').type, 'String', 'the target kind is a String on the wire');
  console.log("[§1] the service's wire record: 7 fields (id, action, actorId, targetId, targetType, createdAt, assurance) · the instant is a long (epoch ms) · actorId and assurance are Strings, so they can carry null");
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
  console.log(`[§3] the server lane's shape: ${laneFields.length} fields (${laneFields.join(', ')}) — the same seven, in the same service`);
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
  console.log("[§4] the two client shapes name the same seven fields: one wire shape, one list of names");
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

// ── §6 the trail's filter list is DERIVED from the verb table, not copied ───────────────────────────
// A hand-copied list that happens to match today drifts silently when the service renames a verb.
// TRAIL_FILTER_ACTIONS must be initialized from AUDIT_ACTIONS (imported from ops).
{
  const src = readFileSync(TRAIL_MODEL, 'utf8');
  const sf = ts.createSourceFile(TRAIL_MODEL, src, ts.ScriptTarget.Latest, true);
  let found = null;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name && node.name.getText(sf) === 'TRAIL_FILTER_ACTIONS') {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  assert.ok(found, `${TRAIL_MODEL} does not declare TRAIL_FILTER_ACTIONS — the filter list the panel maps is missing`);
  assert.ok(found.initializer, `${TRAIL_MODEL}'s TRAIL_FILTER_ACTIONS has no initializer`);
  const usesAuditActions = (node) => {
    if (ts.isIdentifier(node) && node.text === 'AUDIT_ACTIONS') return true;
    let hit = false;
    ts.forEachChild(node, (child) => { if (usesAuditActions(child)) hit = true; });
    return hit;
  };
  assert.ok(
    usesAuditActions(found.initializer),
    `${TRAIL_MODEL}'s TRAIL_FILTER_ACTIONS is not initialized from AUDIT_ACTIONS — the filter row is a copy that can drift from the service's verbs`,
  );
  console.log('[§6] TRAIL_FILTER_ACTIONS is derived from AUDIT_ACTIONS (not a hand copy), so the filter row stays aligned with the service verbs');
}

// ── §7 AUDIT_ACTIONS is imported from the ops owner module ──────────────────────────────────────────
// The derivation in §6 is only as good as its source: AUDIT_ACTIONS must come from ops.ts (the single
// owner reconciled with the service), not from a local copy or another module.
{
  const src = readFileSync(TRAIL_MODEL, 'utf8');
  const sf = ts.createSourceFile(TRAIL_MODEL, src, ts.ScriptTarget.Latest, true);
  let importsFromOps = false;
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && node.importClause) {
      const spec = node.moduleSpecifier.text || '';
      if (/(^|\/)ops$/.test(spec)) {
        const bindings = node.importClause.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          if (bindings.elements.some((e) => e.name && e.name.text === 'AUDIT_ACTIONS')) importsFromOps = true;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  assert.ok(
    importsFromOps,
    `${TRAIL_MODEL} does not import AUDIT_ACTIONS from an ops module — the verb table's owner is not the one the trail reads from`,
  );
  console.log('[§7] AUDIT_ACTIONS is imported from the ops owner module, so the trail reads the reconciled vocabulary');
}

// ── §8 the trail exports the key face functions the panels rely on ─────────────────────────────────
// trailActionText, trailFilterCaption, trailFilterHint are the faces graded by audit-contract's RUN
// checks; they must exist as exports so the contract proofs and panels can read them.
{
  const src = readFileSync(TRAIL_MODEL, 'utf8');
  const sf = ts.createSourceFile(TRAIL_MODEL, src, ts.ScriptTarget.Latest, true);
  const exported = new Set();
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      exported.add(node.name.text);
    }
    if (ts.isVariableStatement(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const d of node.declarationList.declarations) {
        if (d.name && ts.isIdentifier(d.name)) exported.add(d.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  for (const name of ['trailActionText', 'trailFilterCaption', 'trailFilterHint', 'trailActionColorVar']) {
    assert.ok(exported.has(name), `${TRAIL_MODEL} does not export ${name} — the face function the panels and proofs rely on is missing`);
  }
  console.log('[§8] trail.ts exports trailActionText, trailFilterCaption, trailFilterHint, trailActionColorVar (the key face functions)');
}

console.log("\n[summary] the service's wire record and the trail's client shapes agree, field for field — the reader was shown to catch a rename, the trail's filter list is derived from AUDIT_ACTIONS, AUDIT_ACTIONS is imported from the ops owner, and the key face functions are exported");
