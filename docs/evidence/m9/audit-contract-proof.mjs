// NEXUS M9 v273 — the client's ops model and the service's audit door must AGREE, field for field
// (ADR 0016 amendment 273).
//
// A wire contract is a PROMISE, and a promise nobody checks is a comment. v271 built the service's door
// (`GET /audit`) and shipped a client model beside it that DISAGREED with it on the two fields that
// matter most: the service sends `actorId: null` and `assurance: null` for an anonymous action, and the
// client's `AuditEntry` declared both non-null. The service refused to fake an actor to fit a type
// ("this service will not fake an actor to fit a type") — so the type was the thing that had to give.
//
// This proof is what stops the drift from coming back. It does NOT start a service or a database: the
// claim being graded is a claim about TWO SOURCE FILES, so the two source files ARE the fixture. It reads:
//
//   - `services/nexus-api/.../ops/AuditController.java` — the service's own wire record, parsed as Java;
//   - `apps/studio/src/lib/ops.ts`                  — the client's own model, parsed as TypeScript.
//
// and then asserts, for EVERY field of the wire record, that the client can hold what the service sends.
//
// What it asserts, in order:
//   §1 the service's wire record has the six fields the client expects, in order, with the right types;
//   §2 the client's model declares those same six fields — every one of them, not the ones that are
//      convenient;
//   §3 the fields that are NULLABLE on the wire are NULLABLE in the client — this is the v273 fix, and
//      it is the assertion that would have failed before it;
//   §4 the fields that are NOT nullable on the wire are NOT nullable in the client (a client that
//      widened everything would be just as wrong as one that narrowed everything);
//   §5 a REAL anonymous entry — the service's own JSON shape, taken from `publish-proof.mjs`'s §11
//      assertions — is ACCEPTED by the client's own type, checked by the TypeScript compiler itself and
//      not by a hand-written imitation of it;
//   §6 the client's own grouping helper keeps an anonymous entry out of every account's bucket, and
//      the anonymous bucket key can never collide with a real account id.
//
// Requires nothing but Node:  node docs/evidence/m9/audit-contract-proof.mjs
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const CONTROLLER = 'services/nexus-api/src/main/java/dev/nexus/api/ops/AuditController.java';
const CLIENT_MODEL = 'apps/studio/src/lib/ops.ts';
const CLIENT_ACCOUNT = 'apps/studio/src/lib/community.ts';
const CLIENT_ASSURANCE = 'apps/studio/src/lib/assurance.ts';

// ── §1 the service's own wire record ────────────────────────────────────────────────────────────────
// The wire shape is a Java `record` in the controller, so the field list and the field types are read
// OUT OF THE SOURCE rather than restated here. Restating them would make this proof assert the thing
// it is supposed to check: a proof that compares a hand-written list with a hand-written list proves
// only that two people typed the same thing.
{
  const src = readFileSync(CONTROLLER, 'utf8');
  const record = /public\s+record\s+Entry\s*\(([\s\S]*?)\)\s*\{/.exec(src);
  assert.ok(record, `the service's wire record was not found in ${CONTROLLER} — the contract this proof grades has MOVED`);
  const fields = record[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^([A-Za-z_][\w.<>\[\]]*)\s+([A-Za-z_]\w*)$/.exec(s);
      assert.ok(m, `the wire field "${s}" is not in the shape "Type name" — the proof must know how to read it`);
      return { type: m[1], name: m[2] };
    });
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
  assert.equal(fields.find((f) => f.name === 'id').type, 'String', 'the id is a String on the wire');
  assert.equal(fields.find((f) => f.name === 'targetId').type, 'String', 'the target is a String on the wire');
  assert.equal(fields.find((f) => f.name === 'action').type, 'String', 'the action is a String on the wire — a free-form verb, not an enum');
  console.log('[§1] the service\'s wire record: 6 fields (id, action, actorId, targetId, createdAt, assurance) · the instant is a long (epoch ms) · actorId and assurance are Strings, so they can carry null');
}

// ── §2 the client's own model ───────────────────────────────────────────────────────────────────────
// The client's model is read with the TypeScript COMPILER's own parser, so the field list and the
// nullability come from the language's own understanding of the file rather than from a regex.
const clientFields = (() => {
  const src = readFileSync(CLIENT_MODEL, 'utf8');
  const file = ts.createSourceFile(CLIENT_MODEL, src, ts.ScriptTarget.Latest, true);
  let model = null;
  const visit = (node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === 'AuditEntry') model = node;
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(model, 'the client model AuditEntry was not found in ops.ts — the contract this proof grades has MOVED');
  return model.members.map((m) => {
    assert.ok(ts.isPropertySignature(m), `AuditEntry.${m.name?.text} is not a property`);
    const type = m.type;
    let nullable = false;
    let text = '';
    if (type) {
      text = type.getText(file);
      // "T | null" — a union that names null. A union with a branded alias (`AccountId | null`) is the
      // same shape, and the alias is irrelevant to the wire: what matters is that null is IN the union.
      nullable =
        ts.isUnionTypeNode(type) &&
        type.types.some(
          (t) => t.kind === ts.SyntaxKind.NullKeyword || (ts.isLiteralTypeNode(t) && t.literal.kind === ts.SyntaxKind.NullKeyword),
        );
    }
    return { name: m.name.getText(file), nullable, text, required: m.questionToken === undefined };
  });
})();
{
  assert.deepEqual(
    clientFields.map((f) => f.name),
    ['id', 'action', 'actorId', 'targetId', 'createdAt', 'assurance'],
    'the client model declares exactly the six fields the service answers with, in the same order',
  );
  for (const f of clientFields) {
    assert.ok(f.required, `AuditEntry.${f.name} is OPTIONAL in the client — the service always sends it, and a client that treats it as optional would have to invent a default`);
  }
  console.log('[§2] the client\'s model: the same six fields, the same order, all REQUIRED — the service always sends them, so the client does not get to decide they are optional');
}

// ── §3 the nullable wire fields are nullable in the client ──────────────────────────────────────────
// This is the v273 fix, asserted. Before it, `actorId: AccountId` and `assurance: Assurance` were
// non-null, and the service's null for an anonymous action did not fit the client's own type.
{
  for (const name of ['actorId', 'assurance']) {
    const f = clientFields.find((x) => x.name === name);
    assert.ok(f.nullable, `AuditEntry.${name} must accept null — the service sends null for an anonymous action, and a type that refuses null is a type the service has to lie to satisfy`);
  }
  console.log('[§3] the nullable wire fields are nullable in the client: actorId and assurance both accept null — the service no longer has to fake an actor to fit a type');
}

// ── §4 the non-nullable wire fields are NOT nullable in the client ───────────────────────────────────
// Widening everything would be just as wrong as narrowing everything: a client that treats the id as
// optional would have to invent one, and an invented id is a row nobody can address.
{
  for (const name of ['id', 'action', 'targetId', 'createdAt']) {
    const f = clientFields.find((x) => x.name === name);
    assert.ok(!f.nullable, `AuditEntry.${name} must NOT accept null — the service always sends it`);
  }
  console.log('[§4] the non-nullable wire fields are non-nullable in the client: id, action, targetId and createdAt are all required — the fix widened the two fields that are nullable and nothing else');
}

// ── §5 a REAL anonymous entry is accepted by the client's own type ───────────────────────────────────
// The proof above compared two source files. This one asks the TypeScript COMPILER whether the client's
// own type accepts what the service actually sends — the shape `publish-proof.mjs`'s §11 reads off the
// wire, with `actorId: null` and `assurance: null` in it. The check is a real `tsc` run over a file
// that imports the SHIPPED model, so a widening of the type is what makes it pass, and a re-narrowing
// makes it fail.
{
  const box = mkdtempSync(join(tmpdir(), 'nexus-audit-contract-'));
  try {
    const opsPath = join(process.cwd(), CLIENT_MODEL).replace(/\\/g, '/');
    const accountPath = join(process.cwd(), CLIENT_ACCOUNT).replace(/\\/g, '/');
    // The probe imports the SHIPPED modules by absolute path, and TypeScript resolves them for real —
    // so this grades the file on disk, not a copy of it.
    const probe = `
import type { AuditEntry } from '${opsPath}';
import type { AccountId } from '${accountPath}';

// The service's own shape for an ANONYMOUS publish: nobody was named, so both travel as null.
const anonymous: AuditEntry = {
  id: '1',
  action: 'publish',
  actorId: null,
  targetId: 'pub-1',
  createdAt: 1700000000000,
  assurance: null,
};

// The service's own shape for a NAMED publish: the account and the assurance both travel.
const named: AuditEntry = {
  id: '2',
  action: 'publish',
  actorId: 'acct-ada' as AccountId,
  targetId: 'pub-1',
  createdAt: 1700000000000,
  assurance: 'unsigned-local' as NonNullable<AuditEntry['assurance']>,
};

// A verb this build has never heard of must still FIT — the service is a separate deployable.
const future: AuditEntry = { ...named, action: 'stake' };

export const probe = [anonymous, named, future];
`;
    const probePath = join(box, 'probe.ts');
    writeFileSync(probePath, probe, 'utf8');
    const program = ts.createProgram([probePath], {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    });
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.file && (d.file.fileName.endsWith('probe.ts') || d.file.fileName.endsWith('ops.ts')));
    const messages = diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '));
    assert.deepEqual(messages, [], `the client's own type REJECTS what the service sends:\n  ${messages.join('\n  ')}`);
    console.log("[§5] the client's own type ACCEPTS the service's real entries: an anonymous one (actorId null, assurance null), a named one, and a verb this build has never heard of — checked by the compiler, not by an imitation of it");
  } finally {
    rmSync(box, { recursive: true, force: true });
  }
}

// ── §6 an anonymous entry belongs to no account ──────────────────────────────────────────────────────
// The type can now say "nobody", but a type alone does not keep a nobody out of somebody's bucket. The
// client's own grouping helper does, and the bucket key it uses for "nobody" must be a key no real
// account id can ever be.
{
  const box = mkdtempSync(join(tmpdir(), 'nexus-audit-contract-'));
  try {
    const { stripTypeScriptTypes } = await import('node:module');
    const toMjs = (src) => src.replace(/from '(\.[^']+)'/g, "from '$1.mjs'");
    // The client model imports TWO siblings (`community` and `assurance`) — and `strip` writes a module
    // and IMPORTS it in the same step, so its own siblings must already be in the box. This is the
    // loader's ORDER lesson, the fourth time it has bitten a proof in this repo.
    for (const rel of [CLIENT_ACCOUNT, CLIENT_ASSURANCE]) {
      const p = join(box, rel.split('/').pop().replace(/\.ts$/, '.mjs'));
      writeFileSync(p, toMjs(stripTypeScriptTypes(readFileSync(rel, 'utf8'), { mode: 'strip' })), 'utf8');
    }
    const opsPath = join(box, 'ops.mjs');
    writeFileSync(opsPath, toMjs(stripTypeScriptTypes(readFileSync(CLIENT_MODEL, 'utf8'), { mode: 'strip' })), 'utf8');
    const ops = await import(pathToFileURL(opsPath).href);
    assert.equal(typeof ops.ANONYMOUS_ACTOR, 'string', 'the client must name its anonymous bucket');
    assert.ok(ops.ANONYMOUS_ACTOR.startsWith('__'), `the anonymous bucket key "${ops.ANONYMOUS_ACTOR}" must be a reserved key, not something an account id could be`);
    assert.ok(!ops.ANONYMOUS_ACTOR.startsWith('acct-'), 'and it must not look like an account id at all');

    const entry = (over) => ({ id: 'e', action: 'publish', actorId: null, targetId: 'pub-1', createdAt: 1, assurance: null, ...over });
    const byActor = ops.auditEntriesByActor([
      entry({ id: 'e-1', actorId: 'acct-ada' }),
      entry({ id: 'e-2' }),
      entry({ id: 'e-3' }),
    ]);
    assert.deepEqual((byActor['acct-ada'] ?? []).map((e) => e.id), ['e-1'], "the named entry is in its own account's bucket");
    assert.deepEqual((byActor[ops.ANONYMOUS_ACTOR] ?? []).map((e) => e.id), ['e-2', 'e-3'], 'the anonymous entries are in the anonymous bucket');
    assert.equal((byActor['acct-ada'] ?? []).length, 1, "and NOT in the account's bucket — a nobody is not a somebody");
    assert.equal(ops.isAuditEntryOwnedBy(entry({ id: 'e-2' }), 'acct-ada'), false, 'an anonymous entry is owned by no account');
    console.log(`[§6] an anonymous entry belongs to NO account: it lands in the reserved bucket "${ops.ANONYMOUS_ACTOR}", never in a real account's, and no account id can ever be that key`);
  } finally {
    rmSync(box, { recursive: true, force: true });
  }
}

console.log('\n[summary] M9 v273: the service answers with 6 fields (id, action, actorId, targetId, createdAt, assurance) · the instant is a long, so epoch MILLISECONDS, the client\'s own unit · actorId and assurance are NULLABLE on the wire and NULLABLE in the client, and the other four are nullable in neither · the client\'s own type ACCEPTS a real anonymous entry, a named entry and an unknown verb, checked by the TypeScript compiler itself · and an anonymous entry belongs to no account');
console.log('[m9-audit-contract-proof] ALL ASSERTIONS PASSED (two source files, read as the languages that define them, and one of them compiled)');
