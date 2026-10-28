// NEXUS M9 v273/v541 — the client's ops model and the service's audit door must AGREE, field for field
// AND word for word (ADR 0016 amendment 273; ADR 0016 amendment 524).
//
// A wire contract is a PROMISE, and a promise nobody checks is a comment. v271 built the service's door
// (`GET /audit`) and shipped a client model beside it that DISAGREED with it on the two fields that
// matter most: the service sends `actorId: null` and `assurance: null` for an anonymous action, and the
// client's `AuditEntry` declared both non-null. The service refused to fake an actor to fit a type
// ("this service will not fake an actor to fit a type") — so the type was the thing that had to give.
//
// v541 found the same drift one level UP: not the fields but the WORDS inside them. The client declared
// four report statuses; the service has declared five since v304 and WRITES the fifth. The client's type
// still compiled, because its unknown-string arm accepts anything — and a union containing `string` turns
// `Record<that, X>` into an index signature, so even the missing bucket was invisible to the compiler.
// What the reader saw instead was a `TypeError` from `reportsByStatus`, a summary that said "No reports"
// over a standing report, and five verbs the trail records printed as bare wire identifiers.
//
// This proof is what stops the drift from coming back. It does NOT start a service or a database: the
// claim being graded is a claim about the SOURCE FILES that DEFINE it, so those files ARE the fixture.
// How many it read is printed in its own closing line rather than restated here, because a count copied
// into a comment has no reader and rots the first time a file joins the set. It reads:
//
//   - `services/nexus-api/.../ops/AuditController.java` — the service's own wire record, parsed as Java;
//   - `services/nexus-api/.../ops/AuditService.java`    — the verbs the service RECORDS (v541);
//   - `services/nexus-api/.../social/ReportDtos.java`   — the statuses and reasons it DECLARES (v541);
//   - `apps/studio/src/lib/ops.ts`                  — the client's own model, parsed as TypeScript;
//   - `apps/studio/src/lib/community.ts` + `assurance.ts` — the two types `ops.ts` imports, which the
//     compiler needs in order to check `ops.ts` at all (v291), so they are read as the modules they are;
//   - `apps/studio/src/lib/auditLane.ts`            — the answer envelope the client actually asks with (§7).
//
// and then asserts, for EVERY field of the wire record, that the client can hold what the service sends —
// and for EVERY word any of those fields can carry, that the client counts it, buckets it and names it.
//
// What it asserts, in order:
//   §1 the service's wire record has the seven fields the client expects, in order, with the right types;
//   §2 the client's model declares those same seven fields — every one of them, not the ones that are
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
//   §7 (v385) the ANSWER ENVELOPE agrees too: the service's `Trail` record and the lane's `TrailAnswer`
//      carry the same three numbers — what this answer carried, the cap it was answered under, and how
//      many the WHOLE trail holds — because a filter the service applies is invisible to the browser,
//      and that third number is the only thing that can still say what the filter is hiding.
//   §8 (v541) the VOCABULARIES agree, read off the files that own them: the service's verbs, the statuses
//      and the reasons — the client's tables carry every one, in the service's order, and its bucket
//      functions return `Record<string, …>` precisely because the union cannot see a missing bucket;
//   §9 (v541) the client is TOTAL over that vocabulary: every status and reason the service declares, and
//      one it never has, gets its own bucket, its own count and a word that is not "Unknown" — measured by
//      RUNNING the shipped functions, not by re-implementing them;
//   §10 (v541) every verb the service RECORDS has words, and the residue that has words but is not yet
//      recorded is printed instead of silently kept.
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
const CLIENT_LANE = 'apps/studio/src/lib/auditLane.ts';
// v541 — the two files that OWN the vocabularies the client only repeats.
const AUDIT_SERVICE = 'services/nexus-api/src/main/java/dev/nexus/api/ops/AuditService.java';
const REPORT_DTOS = 'services/nexus-api/src/main/java/dev/nexus/api/social/ReportDtos.java';
// The fixture IS the files that own the claims, so the closing line COUNTS them instead of restating a
// number that rots the next time a vocabulary gains an owner.
const SOURCES = [CONTROLLER, AUDIT_SERVICE, REPORT_DTOS, CLIENT_MODEL, CLIENT_ACCOUNT, CLIENT_ASSURANCE, CLIENT_LANE];

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
  assert.equal(fields.find((f) => f.name === 'id').type, 'String', 'the id is a String on the wire');
  assert.equal(fields.find((f) => f.name === 'targetId').type, 'String', 'the target is a String on the wire');
  assert.equal(fields.find((f) => f.name === 'action').type, 'String', 'the action is a String on the wire — a free-form verb, not an enum');
  // v384 — the target's kind. A String like the rest, and NOT one of the nullable two: the service
  // refuses an entry that does not name a kind, so every entry on this wire carries one.
  assert.equal(fields.find((f) => f.name === 'targetType').type, 'String', 'the target kind is a String on the wire');
  console.log('[§1] the service\'s wire record: 7 fields (id, action, actorId, targetId, targetType, createdAt, assurance) · the instant is a long (epoch ms) · actorId and assurance are Strings, so they can carry null');
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
    ['id', 'action', 'actorId', 'targetId', 'targetType', 'createdAt', 'assurance'],
    'the client model declares exactly the seven fields the service answers with, in the same order',
  );
  for (const f of clientFields) {
    assert.ok(f.required, `AuditEntry.${f.name} is OPTIONAL in the client — the service always sends it, and a client that treats it as optional would have to invent a default`);
  }
  console.log('[§2] the client\'s model: the same seven fields, the same order, all REQUIRED — the service always sends them, so the client does not get to decide they are optional');
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
  for (const name of ['id', 'action', 'targetId', 'targetType', 'createdAt']) {
    const f = clientFields.find((x) => x.name === name);
    assert.ok(!f.nullable, `AuditEntry.${name} must NOT accept null — the service always sends it`);
  }
  console.log('[§4] the non-nullable wire fields are non-nullable in the client: id, action, targetId, targetType and createdAt are all required — the fix widened the two fields that are nullable and nothing else');
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
  targetType: 'publication',
  createdAt: 1700000000000,
  assurance: null,
};

// The service's own shape for a NAMED publish: the account and the assurance both travel.
const named: AuditEntry = {
  id: '2',
  action: 'publish',
  actorId: 'acct-ada' as AccountId,
  targetId: 'pub-1',
  targetType: 'publication',
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

// ── the client model, RUNNING ────────────────────────────────────────────────────────────────────────
// §6 and §9 both need to RUN the shipped module rather than read its text, so they share one loader:
// `strip` writes a module and IMPORTS it in the same step, so the model's own siblings must already be in
// the box. That is the loader's ORDER lesson, the fourth time it has bitten a proof in this repo.
async function loadShippedModel(box) {
  const { stripTypeScriptTypes } = await import('node:module');
  const toMjs = (src) => src.replace(/from '(\.[^']+)'/g, "from '$1.mjs'");
  for (const rel of [CLIENT_ACCOUNT, CLIENT_ASSURANCE]) {
    const p = join(box, rel.split('/').pop().replace(/\.ts$/, '.mjs'));
    writeFileSync(p, toMjs(stripTypeScriptTypes(readFileSync(rel, 'utf8'), { mode: 'strip' })), 'utf8');
  }
  const opsPath = join(box, 'ops.mjs');
  writeFileSync(opsPath, toMjs(stripTypeScriptTypes(readFileSync(CLIENT_MODEL, 'utf8'), { mode: 'strip' })), 'utf8');
  return import(pathToFileURL(opsPath).href);
}

// ── §6 an anonymous entry belongs to no account ──────────────────────────────────────────────────────
// The type can now say "nobody", but a type alone does not keep a nobody out of somebody's bucket. The
// client's own grouping helper does, and the bucket key it uses for "nobody" must be a key no real
// account id can ever be.
{
  const box = mkdtempSync(join(tmpdir(), 'nexus-audit-contract-'));
  try {
    const ops = await loadShippedModel(box);
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

// ── §7 the answer ENVELOPE agrees (v385) ─────────────────────────────────────────────────────────────
// The entry is one half of the contract; the envelope around it is the other. v385 moved the panel's
// action filter into the service, which means the browser no longer sees the rows the filter excluded —
// so the envelope grew a third number (`total`: how many the whole trail holds, narrowed or not) and
// that number is now part of the promise. A rename on either side would leave the panel stating a
// whole it never received, which is the kind of quiet lie this proof exists to catch.
{
  const src = readFileSync(CONTROLLER, 'utf8');
  const trail = /public\s+record\s+Trail\s*\(([\s\S]*?)\)\s*\{/.exec(src);
  assert.ok(trail, `the service's answer record was not found in ${CONTROLLER} — the contract this proof grades has MOVED`);
  const wireFields = trail[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^([A-Za-z_][\w.<>\[\]]*)\s+([A-Za-z_]\w*)$/.exec(s);
      assert.ok(m, `the envelope field "${s}" is not in the shape "Type name" — the proof must know how to read it`);
      return { type: m[1], name: m[2] };
    });
  assert.deepEqual(
    wireFields.map((f) => f.name),
    ['entries', 'count', 'limit', 'total'],
    'the envelope carries the entries and the three numbers',
  );
  // The three numbers are NUMBERS on the wire — a count typed as a string would render as text.
  for (const f of wireFields.filter((x) => x.name !== 'entries')) {
    assert.ok(f.type === 'int' || f.type === 'long', `the envelope's ${f.name} is a ${f.type} on the wire — the panel states it as a number`);
  }

  const lane = readFileSync(CLIENT_LANE, 'utf8');
  const answer = /export\s+interface\s+TrailAnswer\s*\{([\s\S]*?)\n\}/.exec(lane);
  assert.ok(answer, `the lane's answer shape was not found in ${CLIENT_LANE} — the contract this proof grades has MOVED`);
  const laneFields = answer[1]
    .split('\n')
    .map((l) => /^\s{2}([A-Za-z]+)\s*[?]?:/.exec(l))
    .filter(Boolean)
    .map((m) => m[1]);
  for (const name of ['count', 'limit', 'total']) {
    assert.ok(laneFields.includes(name), `TrailAnswer.${name} is missing — the service sends it, and a lane that drops it is a panel that cannot say what it is showing`);
  }
  for (const name of ['count', 'limit', 'total']) {
    const optional = new RegExp(`\\n\\s{2}${name}\\?\\s*:`).test(answer[1]);
    assert.ok(!optional, `TrailAnswer.${name} must be REQUIRED — the service always sends it, and an optional field is a field the panel would have to invent a default for`);
  }
  console.log('[§7] the answer envelope agrees: entries · count · limit · total on the wire, and count/limit/total REQUIRED in the lane — the whole-trail number a filtered window needs travels both ways');
}

// ── §8 the VOCABULARIES agree (v541) ─────────────────────────────────────────────────────────────────
// §1–§4 grade the SHAPE of a row. They are blind to the WORDS that travel inside it — and the words are
// where v541's damage lived. `Report['status']` declared four values, the service names five
// (`ReportDtos.STATUS_ACKNOWLEDGED`, written by `ReportEntry.markAcknowledged` since v304), and the type
// still COMPILED because its unknown-string arm accepts anything: §4 would have passed a client that
// enumerated one status out of a hundred. So this section reads the words out of the two Java files that
// OWN them and refuses a client whose word list stops covering them.
//
// The Java is read off its DECLARATIONS (`public static final String NAME = "value";`), and the TypeScript
// off its own syntax tree, for the same reason §2 reads the interface with the compiler: a proof that
// compares two lists it typed by hand proves only that two people typed the same thing.
const vocab = (() => {
  // A Java `public static final String` table, in declaration order. Keyed on the declaration's full shape
  // because a probe that searched for `String NAME` alone once matched a method's PARAMETER.
  const javaStringConstants = (src, prefix) => {
    const out = new Map();
    for (const m of src.matchAll(new RegExp(`public\\s+static\\s+final\\s+String\\s+(${prefix}[A-Z_0-9]*)\\s*=\\s*"([^"]*)"\\s*;`, 'g'))) {
      out.set(m[1], m[2]);
    }
    return out;
  };

  const auditSrc = readFileSync(AUDIT_SERVICE, 'utf8');
  const reportSrc = readFileSync(REPORT_DTOS, 'utf8');

  // The nine verbs: `ACTIONS = List.of(ACTION_PUBLISH, …)` — the LIST is the vocabulary, and each name is
  // resolved against the same file's own constants rather than assumed to spell its lower-case form.
  const actionsList = /List<String>\s+ACTIONS\s*=\s*List\.of\(([\s\S]*?)\)\s*;/.exec(auditSrc);
  assert.ok(actionsList, `the service's verb list was not found in ${AUDIT_SERVICE} — the contract this proof grades has MOVED`);
  const verbConstants = javaStringConstants(auditSrc, 'ACTION_');
  const serverVerbs = actionsList[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => {
      const value = verbConstants.get(name);
      assert.ok(value !== undefined, `${AUDIT_SERVICE} lists ${name} in ACTIONS but never DECLARES it — the proof cannot read a verb it cannot resolve`);
      return value;
    });
  assert.ok(serverVerbs.length >= 2, `the verb list resolved to ${serverVerbs.length} names — a vocabulary read that thin is a reading bug, not a contract`);

  const serverStatuses = [...javaStringConstants(reportSrc, 'STATUS_').values()];
  const serverReasons = [...javaStringConstants(reportSrc, 'REASON_').values()];
  assert.ok(serverStatuses.length >= 2, `the status table read ${serverStatuses.length} values out of ${REPORT_DTOS}`);
  assert.ok(serverReasons.length >= 2, `the reason table read ${serverReasons.length} values out of ${REPORT_DTOS}`);

  // The client, parsed by the language that defines it: the union's literals, the exported arrays, the
  // switch's case labels, and every declared return type and body.
  const clientSrc = readFileSync(CLIENT_MODEL, 'utf8');
  const file = ts.createSourceFile(CLIENT_MODEL, clientSrc, ts.ScriptTarget.Latest, true);
  const strip = (text) => text.replace(/^['"]|['"]$/g, '');
  const unions = new Map();
  const arrays = new Map();
  const cases = new Map();
  const returns = new Map();
  const bodies = new Map();
  const visit = (node) => {
    if (ts.isTypeAliasDeclaration(node) && ts.isUnionTypeNode(node.type)) {
      // The `string & Record<never, never>` arm is parenthesized, so it is NOT a LiteralTypeNode and the
      // known set is exactly the quoted arms — which is the whole point of the arm.
      unions.set(node.name.text, node.type.types.filter(ts.isLiteralTypeNode).map((t) => strip(t.literal.getText(file))));
    }
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const arr = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (ts.isArrayLiteralExpression(arr)) {
        arrays.set(node.name.getText(file), arr.elements.map((e) => strip(e.getText(file))));
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      const name = node.name.text;
      if (node.type) returns.set(name, node.type.getText(file));
      bodies.set(name, node.body.getText(file));
      const labels = [];
      for (const s of node.body.statements) {
        if (!ts.isSwitchStatement(s)) continue;
        for (const c of s.caseBlock.clauses) {
          if (ts.isCaseClause(c) && ts.isStringLiteral(c.expression)) labels.push(strip(c.expression.getText(file)));
        }
      }
      cases.set(name, labels);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  for (const name of ['AuditAction', 'ReportStatus', 'ReportReason']) {
    assert.ok(unions.has(name), `the client model no longer declares a ${name} union — the contract this proof grades has MOVED`);
  }
  for (const name of ['REPORT_STATUSES', 'REPORT_REASONS']) {
    assert.ok(arrays.has(name), `the client model no longer exports a ${name} table — the bucket functions would have to hand-copy the vocabulary`);
  }
  return { serverVerbs, serverStatuses, serverReasons, unions, arrays, cases, returns, bodies };
})();

{
  // The verbs: every one the service RECORDS must be a name the client has heard of. The unknown-string
  // arm means this is not a claim about the type checking — it is a claim about the label table below it.
  const knownVerbs = vocab.unions.get('AuditAction');
  const missingVerbs = vocab.serverVerbs.filter((v) => !knownVerbs.includes(v));
  assert.deepEqual(
    missingVerbs,
    [],
    `the service records ${vocab.serverVerbs.length} verbs and the client's AuditAction has never heard of ${missingVerbs.length} of them: ${missingVerbs.join(', ')} — they pass the type check through the unknown-string arm and then fall out of the label table as raw wire tokens`,
  );

  // The statuses and the reasons: the client's exported tables are the SERVICE's words, in the service's
  // order, and nothing else. One direction would let the client invent a disposition; the other would let
  // it drop one (v541's actual bug was the dropping).
  for (const [label, server, client] of [
    ['status', vocab.serverStatuses, vocab.arrays.get('REPORT_STATUSES')],
    ['reason', vocab.serverReasons, vocab.arrays.get('REPORT_REASONS')],
  ]) {
    const dropped = server.filter((v) => !client.includes(v));
    const invented = client.filter((v) => !server.includes(v));
    assert.deepEqual(
      dropped,
      [],
      `the service names a report ${label} the client's table does not carry: ${dropped.join(', ')} — a row that arrives with it has no bucket, and the client would read it as "that ${label} never happened"`,
    );
    assert.deepEqual(
      invented,
      [],
      `the client's ${label} table carries ${invented.join(', ')} — no ${label} the service declares has that name, so the client would be counting a disposition nobody can put on a row`,
    );
    assert.deepEqual(client, server, `the client's ${label} table must be in the order the service DECLARES its constants — the buckets and the summary are shown in this order`);
  }

  // The type-layer blind spot that hid the crash. `Report['status']` carries an unknown-string arm, and a
  // union containing `string` makes `Record<that, X>` an INDEX SIGNATURE: `out[r.status].push(r)` type
  // checks over a bucket that does not exist, and the failure moves to the runtime of whoever calls it.
  // So the bucket functions must key their return on `string` and guarantee the bucket in CODE.
  for (const [fn, table] of [
    ['reportsByStatus', 'REPORT_STATUSES'],
    ['reportsByReason', 'REPORT_REASONS'],
  ]) {
    const shape = vocab.returns.get(fn);
    assert.ok(shape, `${fn} has no declared return type — the proof cannot read what it promises`);
    assert.match(
      shape,
      /^Record<\s*string\s*,\s*Report\[\]\s*>$/,
      `${fn} returns "${shape}" — keyed on the report's own union, which collapses to an index signature and lets a missing bucket compile cleanly (this is how v541's TypeError survived three shipped versions of this proof)`,
    );
    assert.ok(
      vocab.bodies.get(fn).includes(table),
      `${fn} does not build its buckets from ${table}, so the table above is a decoration and the two can drift apart in silence`,
    );
  }
  console.log(`[§8] the vocabularies agree, read off the files that own them: ${vocab.serverVerbs.length} verbs (${vocab.serverVerbs.join(', ')}) · ${vocab.serverStatuses.length} statuses (${vocab.serverStatuses.join(', ')}) · ${vocab.serverReasons.length} reasons (${vocab.serverReasons.join(', ')}) — all present in the client's tables, in the service's order, and the bucket functions return Record<string, Report[]> because the union's unknown arm makes the compiler blind to a missing bucket`);
}

// ── §9 the client is TOTAL over its own vocabulary (v541) ────────────────────────────────────────────
// A word list that merely EXISTS on both sides is half the contract. The other half is what the client
// DOES with a row it carries: v541 measured three answers on shipped bytes — a `TypeError` for
// `acknowledged` from `reportsByStatus`, the string "No reports" from `reportStatsText` over a standing
// acknowledged report (`undefined + 1 = NaN`, and `NaN > 0` is false, so the row vanished without an
// error), and "Unknown" from `reportStatusText` for a status the service itself names. These run the
// SHIPPED functions, not a re-implementation of them.
{
  const box = mkdtempSync(join(tmpdir(), 'nexus-audit-contract-'));
  try {
    const ops = await loadShippedModel(box);
    const NEVER_SEEN_STATUS = 'quarantined-by-a-service-this-build-does-not-have';
    const NEVER_SEEN_REASON = 'copyright-when-the-law-that-needs-it-does-not-exist';
    const row = (over) => ({
      id: 'r',
      reporterId: 'acct-ada',
      targetId: 'pub-1',
      reason: 'spam',
      detail: '',
      status: 'open',
      createdAt: 1,
      ...over,
    });

    for (const status of [...vocab.serverStatuses, NEVER_SEEN_STATUS]) {
      const declared = vocab.serverStatuses.includes(status);
      const byStatus = ops.reportsByStatus([row({ status })]);
      // `deepEqual` on an undefined bucket throws its own TypeError; name the bucket so a red says which.
      assert.ok(Array.isArray(byStatus[status]), `reportsByStatus gave no bucket for "${status}"${declared ? ' — a status the service DECLARES' : ''}; the caller that reads it dies on \`undefined.push\` (measured on the shipped file before v541)`);
      assert.deepEqual(byStatus[status].map((r) => r.id), ['r'], `the row with status "${status}" is not in its own bucket`);
      for (const other of vocab.serverStatuses.filter((s) => s !== status)) {
        assert.equal(byStatus[other].length, 0, `a row with status "${status}" was counted into the "${other}" bucket — a fold is a claim the service never made`);
      }
      const stats = ops.reportStatsText([row({ status })]);
      assert.equal(stats, `${status}: 1`, `reportStatsText over one "${status}" report answered "${stats}" — a row that is not counted is a row the panel says does not exist`);
      assert.ok(!stats.includes('NaN'), `reportStatsText printed NaN for "${status}"`);
      const words = ops.reportStatusText(status);
      assert.ok(typeof words === 'string' && words.length > 0, `reportStatusText("${status}") returned ${JSON.stringify(words)}`);
      if (declared) {
        assert.notEqual(words, 'Unknown', `reportStatusText calls "${status}" Unknown — the service's own ${REPORT_DTOS} declares that constant, so the client is claiming a word it is wired to has never said`);
        // Pass-through is honest ONLY for a value nobody declared. A status the service DOES declare that
        // renders as its own wire token means the label table lost a row: the panel would print "open"
        // where it means "Open", which is §10's rule for verbs applied to the field that has a summary.
        assert.notEqual(
          words,
          status,
          `reportStatusText answers "${words}" — the wire token itself — for a status the service declares: the label table has no row for it, so an ops screen shows an identifier where it means a word`,
        );
      } else {
        assert.equal(words, status, `reportStatusText turned a status it has never heard of into "${words}" — passing it through unchanged is the only answer that claims nothing (the shipped sibling reportBar.ts already does this)`);
      }
    }

    // Totality as a NUMBER: a summary over the whole declared vocabulary must account for every row.
    const all = vocab.serverStatuses.map((status, i) => row({ id: `r-${i}`, status }));
    const stats = ops.reportStatsText(all);
    assert.equal(
      stats,
      vocab.serverStatuses.map((s) => `${s}: 1`).join(', '),
      'the summary lists every status the service declares, in the service\'s order, one row each',
    );
    const counted = [...stats.matchAll(/([a-z-]+): (\d+)/g)].reduce((sum, m) => sum + Number(m[2]), 0);
    assert.equal(counted, all.length, `reportStatsText printed "${stats}" over ${all.length} rows and sums to ${counted} — the silent drop that made v541 answer "No reports"`);

    for (const reason of [...vocab.serverReasons, NEVER_SEEN_REASON]) {
      const byReason = ops.reportsByReason([row({ reason })]);
      assert.ok(Array.isArray(byReason[reason]), `reportsByReason gave no bucket for "${reason}"`);
      assert.equal(byReason[reason].length, 1, `the row with reason "${reason}" is not in its own bucket`);
      for (const other of vocab.serverReasons.filter((r) => r !== reason)) {
        assert.equal(byReason[other].length, 0, `a row with reason "${reason}" was counted into the "${other}" bucket`);
      }
    }

    // The three named counts do NOT tile the vocabulary, and that is the honest answer: an acknowledged
    // report is neither "still waiting" nor "handled", because the service calls acknowledgement "a smaller
    // claim than a resolution" (ReportDtos). Coverage is the summary's job — asserted above.
    const ack = row({ status: 'acknowledged' });
    assert.equal(ops.reportOpenCount([ack]), 0, 'an acknowledged report is not "still waiting" — the owner has acted');
    assert.equal(ops.reportResolvedCount([ack]), 0, 'and it is not "handled" either: the service says acknowledgement is a smaller claim than a resolution, so counting it as one would be the client inflating a disposition');
    assert.equal(ops.isReportClosed(ack), false, 'and it is not CLOSED — a report the owner has merely seen still stands, and its re-report door must stay open');
    assert.equal(ops.reportStatsText([ack]), 'acknowledged: 1', 'but the summary still shows it — nothing vanishes because two counts decline to claim it');
    console.log(`[§9] the client is TOTAL over the vocabulary: every one of the ${vocab.serverStatuses.length} statuses the service declares — and one it has never heard of (${NEVER_SEEN_STATUS}) — gets its own bucket, its own count, and a word of its own (not "Unknown", not the wire token back); a never-declared value is passed through rather than folded into a neighbour; the summary over all ${vocab.serverStatuses.length} sums to ${all.length}; and "acknowledged" is deliberately neither open nor resolved`);
  } finally {
    rmSync(box, { recursive: true, force: true });
  }
}

// ── §10 the label table covers the verbs the service RECORDS (v541) ───────────────────────────────────
// Five of the nine verbs the service has recorded since v385 fell through `auditEntryLabel`'s default and
// were shown to a reader as raw wire tokens, while three verbs the service has never recorded had Chinese
// labels. The type could not see this (the unknown-string arm accepts all nine), so the check is on the
// OUTPUT: a recorded verb must come back as something other than itself.
{
  const box = mkdtempSync(join(tmpdir(), 'nexus-audit-contract-'));
  try {
    const ops = await loadShippedModel(box);
    const raw = vocab.serverVerbs.filter((v) => ops.auditEntryLabel(v) === v);
    assert.deepEqual(
      raw,
      [],
      `the trail would print these verbs the service recorded as bare wire tokens, with no words for them: ${raw.join(', ')} — the reader gets the service's identifier instead of an explanation`,
    );
    const labels = vocab.serverVerbs.map((v) => `${v}→${ops.auditEntryLabel(v)}`);
    // A label for a verb nobody records is not a lie — it is a design that has not been paid for yet. It
    // IS a claim the table might outgrow the type, so every label must at least be a name the union carries.
    const known = vocab.unions.get('AuditAction');
    const untypable = vocab.cases.get('auditEntryLabel').filter((v) => !known.includes(v));
    assert.deepEqual(untypable, [], `the label table has cases for verbs the client's own AuditAction union does not declare: ${untypable.join(', ')}`);
    const ahead = vocab.cases.get('auditEntryLabel').filter((v) => !vocab.serverVerbs.includes(v));
    assert.equal(ops.auditEntryLabel('stake'), 'stake', 'a verb neither side has heard of still passes through rather than being invented');
    console.log(`[§10] every recorded verb has words: ${labels.join(' · ')} — and the disclosed residue (labelled here, not yet recorded server-side) is ${ahead.length} verbs: ${ahead.join(', ')}`);
  } finally {
    rmSync(box, { recursive: true, force: true });
  }
}

console.log('\n[summary] M9 v273/v384/v385/v541: the service answers with 7 fields (id, action, actorId, targetId, targetType, createdAt, assurance) · the instant is a long, so epoch MILLISECONDS, the client\'s own unit · actorId and assurance are NULLABLE on the wire and NULLABLE in the client, and the other five are nullable in neither · the client\'s own type ACCEPTS a real anonymous entry, a named entry and an unknown verb, checked by the TypeScript compiler itself · an anonymous entry belongs to no account · the answer envelope carries the whole-trail count a service-side filter needs · and the WORDS inside the fields — the service\'s verbs, statuses and reasons — are the client\'s tables, in the service\'s order, with every one of them bucketed, counted and labelled rather than dropped');
const javaSources = SOURCES.filter((p) => p.endsWith('.java')).length;
const tsSources = SOURCES.length - javaSources;
console.log(
  `[m9-audit-contract-proof] ALL ASSERTIONS PASSED (${SOURCES.length} source files — ${javaSources} Java, ${tsSources} TypeScript — read as the languages that define them, and the client's model RUN rather than re-described)`,
);
