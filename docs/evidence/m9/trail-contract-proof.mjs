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
//   - `apps/studio/src/lib/trail.ts`              — the trail's input shape, parsed with the TypeScript
//     compiler's own parser;
//   - `apps/studio/src/lib/auditServer.ts`        — the server lane's declared shape, likewise.
//
// and then asserts that every field the client's trail READS is a field the service SENDS, that no field
// the client's trail reads is one the service does not send, and that the fields the service sends are
// not silently DROPPED on the way in.
//
// Requires nothing but Node:  node docs/evidence/m9/trail-contract-proof.mjs
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const CONTROLLER = 'services/nexus-api/src/main/java/dev/nexus/api/ops/AuditController.java';
const TRAIL_MODEL = 'apps/studio/src/lib/trail.ts';
const SERVER_LANE = 'apps/studio/src/lib/auditServer.ts';

/** The fields the service's wire record sends, read OUT OF THE SOURCE. */
const wireFields = (() => {
  const src = readFileSync(CONTROLLER, 'utf8');
  const record = /public\s+record\s+Entry\s*\(([\s\S]*?)\)\s*\{/.exec(src);
  assert.ok(record, `the service's wire record was not found in ${CONTROLLER} — the contract this proof grades has MOVED`);
  return record[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^([A-Za-z_][\w.<>\[\]]*)\s+([A-Za-z_]\w*)$/.exec(s);
      assert.ok(m, `the wire field "${s}" is not in the shape "Type name" — the proof must know how to read it`);
      return { type: m[1], name: m[2] };
    });
})();

/**
 * The fields an interface DECLARES, read with the TypeScript compiler's own parser.
 *
 * The compiler — not a regex — so the field list comes from the language's own understanding of the file.
 */
const declaredFields = (file, interfaceName) => {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  let found = null;
  const visit = (node) => {
    if (
      ts.isInterfaceDeclaration(node) &&
      node.name.text === interfaceName
    ) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  assert.ok(found, `the interface ${interfaceName} was not found in ${file} — the contract this proof grades has MOVED`);
  return found.members
    .filter((m) => ts.isPropertySignature(m) && m.name)
    .map((m) => m.name.getText(sf));
};

// ── §1 the service's wire record ────────────────────────────────────────────────────────────────────
{
  assert.deepEqual(
    wireFields.map((f) => f.name),
    ['id', 'action', 'actorId', 'targetId', 'createdAt', 'assurance'],
    'the service answers with exactly these six fields, in this order',
  );
  const createdAt = wireFields.find((f) => f.name === 'createdAt');
  assert.equal(createdAt.type, 'long', 'the instant travels as a long — epoch milliseconds, the client\'s own unit');
  for (const name of ['actorId', 'assurance']) {
    const f = wireFields.find((x) => x.name === name);
    assert.equal(f.type, 'String', `${name} is a String on the wire, so it can carry null`);
  }
  console.log("[§1] the service's wire record: 6 fields (id, action, actorId, targetId, createdAt, assurance) · the instant is a long (epoch ms) · actorId and assurance are Strings, so they can carry null");
}

// ── §2 the trail's INPUT shape reads exactly the wire's fields ─────────────────────────────────────
// The trail's mapping DROPS a row it cannot validate, so a field the service sends and the trail does
// not read is a field that arrives and is thrown away — silently, and in a way that looks like a fact.
{
  const trailFields = declaredFields(TRAIL_MODEL, 'TrailEntry');
  const wire = wireFields.map((f) => f.name);

  for (const name of trailFields) {
    assert.ok(
      wire.includes(name),
      `the trail reads "${name}", which the service does NOT send — the service's wire record has ${wire.join(', ')}`,
    );
  }
  // Every field the service sends is read by the trail: a field that arrives and is never looked at is a
  // field the trail silently drops.
  for (const name of wire) {
    assert.ok(
      trailFields.includes(name),
      `the service sends "${name}" and the trail never reads it — the trail would drop it without saying so`,
    );
  }
  console.log(`[§2] the trail's input shape: ${trailFields.length} fields (${trailFields.join(', ')}) — every one of them a field the service sends, and every field the service sends read`);
}

// ── §3 the server lane's declared shape agrees too ─────────────────────────────────────────────────
// The lane is the other half of the trail's reader: it types the service's answer before the mapping
// sees it. A lane that declared a field the service does not send would be typing a shape that cannot
// arrive.
{
  const laneFields = declaredFields(SERVER_LANE, 'AuditEntry');
  const wire = wireFields.map((f) => f.name);
  for (const name of laneFields) {
    assert.ok(
      wire.includes(name),
      `the server lane declares "${name}", which the service does NOT send`,
    );
  }
  for (const name of wire) {
    assert.ok(
      laneFields.includes(name),
      `the service sends "${name}" and the server lane never declares it`,
    );
  }
  console.log(`[§3] the server lane's shape: ${laneFields.length} fields (${laneFields.join(', ')}) — the same six, in the same service`);
}

// ── §4 the two client shapes agree with EACH OTHER ────────────────────────────────────────────────
// Two client types for one wire shape is one more place for the shapes to drift apart, and the drift
// would be invisible: the lane's type and the mapping's type are read by different modules.
{
  const trailFields = declaredFields(TRAIL_MODEL, 'TrailEntry');
  const laneFields = declaredFields(SERVER_LANE, 'AuditEntry');
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
  const original = readFileSync(CONTROLLER, 'utf8');
  const mutated = original.replace('String assurance)', 'String warranty)');
  assert.notEqual(mutated, original, 'the mutation did not change the source — the proof would be testing nothing');
  const dir = mkdtempSync(join(tmpdir(), 'nexus-trail-contract-'));
  const copy = join(dir, 'AuditController.java');
  writeFileSync(copy, mutated, 'utf8');

  // The same reader, run against the mutated source.
  const src = readFileSync(copy, 'utf8');
  const record = /public\s+record\s+Entry\s*\(([\s\S]*?)\)\s*\{/.exec(src);
  assert.ok(record, 'the mutated record was not found');
  const names = record[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^([A-Za-z_][\w.<>\[\]]*)\s+([A-Za-z_]\w*)$/.exec(s);
      assert.ok(m, `the mutated field "${s}" is not readable`);
      return m[2];
    });
  const trailFields = declaredFields(TRAIL_MODEL, 'TrailEntry');
  const offenders = trailFields.filter((f) => !names.includes(f));
  assert.ok(
    offenders.length > 0,
    'the reader did NOT catch the renamed wire field — the trail would read a field the service never sends',
  );
  rmSync(dir, { recursive: true, force: true });
  console.log(`[§5] the mutation was CAUGHT: renaming a wire field leaves the trail reading "${offenders.join(', ')}", which the service no longer sends`);
}

console.log('\n[summary] the service\'s wire record and the trail\'s client shapes agree, field for field — and the reader was shown to catch a rename');
