// NEXUS M9 v273/v541/v556 — the client's ops model and the service's audit door must AGREE, field for
// field, word for word, AND on the files that put those words on the screen (ADR 0016 amendment 273;
// amendment 524 opened the vocabulary, and the newest `### Amendment` in that record closes it: §11 here
// is the clause that grades the rendering files rather than a certificate over a copy nobody read).
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
//   - `apps/studio/src/lib/auditLane.ts`            — the answer envelope the client actually asks with (§7);
//   - `apps/studio/src/lib/trail.ts`, `apps/studio/src/components/Toolbar.tsx` and
//     `apps/studio/src/components/ReportComposer.tsx` — the three files that carry the vocabularies to the
//     SCREEN (§11). v541 certified `ops.ts` alone and the defect still reached the user: the panel beside it
//     kept its own hand-copied words. A vocabulary is graded where it is rendered, so the rendering files
//     are fixtures too — and the §11 census walks every shipped source under `apps/studio/src` rather than
//     a list this comment could quietly outgrow.
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
//      recorded is printed instead of silently kept;
//   §11 (v556) the vocabulary is graded on the files that RENDER it: one owner per table across the shipped
//      sources, the graded model has a production reader, the trail panel spells no verb itself and lays its
//      buttons by mapping the table, the report composer takes its reasons from the owner, and the shipped
//      trail module is RUN over the service's verbs. §8's certificate used to cover a copy that nothing
//      rendered while the panel kept its own words — this section is what makes that shape red.
//
// Requires nothing but Node:  node docs/evidence/m9/audit-contract-proof.mjs
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
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
// v556 — the three files that carry the vocabularies to the SCREEN: the reading module, the panel that
// lays the filters out, and the composer that writes a report back. These were the gap: §8 certified
// `ops.ts`, and none of these read it.
const CLIENT_TRAIL = 'apps/studio/src/lib/trail.ts';
const CLIENT_TOOLBAR = 'apps/studio/src/components/Toolbar.tsx';
const CLIENT_COMPOSER = 'apps/studio/src/components/ReportComposer.tsx';
// The §11 census walks the shipped client sources, so the graded files above must live inside it — a
// clause whose population does not contain the file it repairs grades nothing.
const CLIENT_SRC_ROOT = 'apps/studio/src';
// The fixture IS the files that own the claims, so the closing line COUNTS them instead of restating a
// number that rots the next time a vocabulary gains an owner.
const SOURCES = [CONTROLLER, AUDIT_SERVICE, REPORT_DTOS, CLIENT_MODEL, CLIENT_ACCOUNT, CLIENT_ASSURANCE, CLIENT_LANE, CLIENT_TRAIL, CLIENT_TOOLBAR, CLIENT_COMPOSER];

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
// §6, §9, §10 and §11 all need to RUN shipped modules rather than read their text, so they share loaders:
// `strip` writes a module and IMPORTS it in the same step, so the model's own siblings must already be in
// the box. That is the loader's ORDER lesson, the fourth time it has bitten a proof in this repo.
// Node strips the types but does not resolve an extensionless relative specifier, so every relative import
// in a copied module is rewritten to its `.mjs` twin before it can be imported.
const toMjs = (src) => src.replace(/from '(\.[^']+)'/g, "from '$1.mjs'");

async function copyIntoBox(box, rel) {
  const { stripTypeScriptTypes } = await import('node:module');
  const dest = join(box, rel.split('/').pop().replace(/\.tsx?$/, '.mjs'));
  writeFileSync(dest, toMjs(stripTypeScriptTypes(readFileSync(rel, 'utf8'), { mode: 'strip' })), 'utf8');
  return dest;
}

async function loadShippedModel(box) {
  for (const rel of [CLIENT_ACCOUNT, CLIENT_ASSURANCE]) await copyIntoBox(box, rel);
  const opsPath = await copyIntoBox(box, CLIENT_MODEL);
  return import(pathToFileURL(opsPath).href);
}

/** The trail's reading module, RUNNING — which means `ops.mjs` is already in the box when it imports it. */
async function loadShippedPanel(box) {
  await loadShippedModel(box);
  const trailPath = await copyIntoBox(box, CLIENT_TRAIL);
  return import(pathToFileURL(trailPath).href);
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
  const aliases = new Map();
  const cases = new Map();
  const returns = new Map();
  const bodies = new Map();
  const visit = (node) => {
    if (ts.isTypeAliasDeclaration(node)) aliases.set(node.name.text, node.type.getText(file));
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
  for (const name of ['AUDIT_ACTIONS', 'REPORT_STATUSES', 'REPORT_REASONS']) {
    assert.ok(arrays.has(name), `the client model no longer exports a ${name} table — the bucket functions and the panels would have to hand-copy the vocabulary`);
  }
  return { serverVerbs, serverStatuses, serverReasons, unions, arrays, aliases, cases, returns, bodies };
})();

{
  // The verbs.
  //
  // v541 read them out of the `AuditAction` UNION's quoted arms. v556 moved the vocabulary into the
  // `AUDIT_ACTIONS` table that the panel maps, and made the union DERIVE from it — so the union's literal
  // arms are now `remix`/`follow`/`tip` plus nothing, and a proof still reading them would report all nine
  // recorded verbs as unheard of. That reading was always the weaker one anyway: it certified a type no
  // rendered code imports, which is exactly how v541's certificate came to cover a copy while the panel
  // kept its own words (§11). The TABLE is what reaches the screen, so the table is what gets reconciled.
  const clientVerbs = vocab.arrays.get('AUDIT_ACTIONS');
  const dropped = vocab.serverVerbs.filter((v) => !clientVerbs.includes(v));
  const invented = clientVerbs.filter((v) => !vocab.serverVerbs.includes(v));
  assert.deepEqual(
    dropped,
    [],
    `the service records ${vocab.serverVerbs.length} verbs and the client's AUDIT_ACTIONS table is missing ${dropped.length} of them: ${dropped.join(', ')} — a verb with no row in the table gets no filter button and no words, and the trail prints the wire token`,
  );
  assert.deepEqual(
    invented,
    [],
    `the client's AUDIT_ACTIONS table offers ${invented.join(', ')} — the service records no such verb, so the panel would be laying out a filter for rows that can never exist`,
  );
  assert.deepEqual(
    clientVerbs,
    vocab.serverVerbs,
    "the client's verb table must be in the order the service DECLARES its constants — the panel lays its filter buttons out in this order",
  );
  // The union still COVERS the table, but by derivation rather than by a second hand-written list:
  // `AuditedAction` is `(typeof AUDIT_ACTIONS)[number]`, and `AuditAction` names `AuditedAction` as an arm.
  // A proof that only checked the values would pass a client whose type had silently stopped accepting one
  // of them, and one that only checked the type would pass a table no runtime reads.
  assert.match(
    vocab.aliases.get('AuditedAction') ?? '(no such alias)',
    /^\(\s*typeof\s+AUDIT_ACTIONS\s*\)\[\s*number\s*\]$/,
    "the client's AuditedAction is no longer `(typeof AUDIT_ACTIONS)[number]` — the verb type and the verb table are two lists again, which is the drift this section exists to stop",
  );
  assert.ok(
    (vocab.aliases.get('AuditAction') ?? '').includes('AuditedAction'),
    'the AuditAction union no longer names AuditedAction, so the exported verb type has stopped covering the table the panels read',
  );
  assert.ok(
    (vocab.aliases.get('AuditAction') ?? '').includes('Record<never, never>'),
    'the AuditAction union lost its unknown-string arm — a verb added by a newer service would stop the client compiling instead of passing through',
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

// ── §10 the label table covers the verbs the service RECORDS (v541) ───────────────────────────────
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
    // IS a claim the table might outgrow the type, so every label must at least be a name the client knows:
    // either a quoted arm of the `AuditAction` union or a row of the verb TABLE (v556 — the nine live in the
    // table and reach the union through `AuditedAction`, so reading only the union's arms would call all
    // nine untypable, which is this proof's own v541 reading gone stale on the repair).
    const known = [...new Set([...vocab.unions.get('AuditAction'), ...vocab.arrays.get('AUDIT_ACTIONS')])];
    const untypable = vocab.cases.get('auditEntryLabel').filter((v) => !known.includes(v));
    assert.deepEqual(untypable, [], `the label table has cases for verbs the client's own verb vocabulary does not declare: ${untypable.join(', ')}`);
    const ahead = vocab.cases.get('auditEntryLabel').filter((v) => !vocab.serverVerbs.includes(v));
    assert.equal(ops.auditEntryLabel('stake'), 'stake', 'a verb neither side has heard of still passes through rather than being invented');
    console.log(`[§10] every recorded verb has words: ${labels.join(' · ')} — and the disclosed residue (labelled here, not yet recorded server-side) is ${ahead.length} verbs: ${ahead.join(', ')}`);
  } finally {
    rmSync(box, { recursive: true, force: true });
  }
}

// ── §11 the vocabulary is graded WHERE IT IS RENDERED (v556) ─────────────────────────────────────────
// §8 certified `ops.ts` and was RIGHT to, and the defect still reached the screen: `ops.ts` had exactly ONE
// importer in the whole client tree, and that importer was its own test. Meanwhile `Toolbar.tsx` spelled the
// verbs in nine hand-written filter buttons — 37 quoted verb literals, in an order that had already drifted
// from `AuditService.ACTIONS` — `trail.ts` re-implemented the label table as a nine-case switch, and
// `reportBar.ts` declared a SECOND `REPORT_REASONS` which is the one the report composer actually built its
// chips from. So the gate was reconciling a copy with the service while the rendered copies went uncheckd:
// edit the panel's words to anything and every section of this proof stays green. That is a different hole
// from v541's (there the vocabulary was wrong; here the right vocabulary had no reader) and it needs a
// different clause: the graded file must be the file the panels read, and the panels must not carry a copy.
//
// The population is the SHIPPED client sources — every `.ts`/`.tsx` under `apps/studio/src` that is not a
// test — because a census over a population that excludes the offender proves nothing. Tests are out: a
// test may spell a verb to check a panel, and charging it would push the vocabulary into the fixtures.
{
  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(e.name)) out.push(p.split('\\').join('/'));
    }
    return out;
  };
  const shipped = walk(CLIENT_SRC_ROOT).filter((p) => !/\.(test|spec)\.tsx?$/.test(p));
  assert.ok(shipped.length >= 20, `the §11 census found ${shipped.length} shipped sources under ${CLIENT_SRC_ROOT} — a population read that thin is a walking bug, not a contract`);
  const parse = (rel) =>
    ts.createSourceFile(rel, readFileSync(rel, 'utf8'), ts.ScriptTarget.Latest, true, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  // Every verb-shaped STRING in a file: a single quote, a double quote or a bare backtick. A census that
  // matched only `'publish'` would miss the JSX attribute `data-trail-filter="publish"` it exists to catch.
  const spellings = (rel, wanted) => {
    const out = [];
    const visit = (n) => {
      if ((ts.isStringLiteral(n) || (ts.isNoSubstitutionTemplateLiteral && ts.isNoSubstitutionTemplateLiteral(n))) && wanted.includes(n.text)) {
        out.push(n.text);
      }
      ts.forEachChild(n, visit);
    };
    visit(parse(rel));
    return out;
  };
  const names = (rel, pred) => {
    const out = [];
    const visit = (n) => {
      if (pred(n)) out.push(n);
      ts.forEachChild(n, visit);
    };
    visit(parse(rel));
    return out;
  };
  // A file that only NAMES a table in an import statement does not READ it. v556's own arm proved the
  // difference: re-copy the nine buttons by hand, leave the import behind, and a name-census still reports
  // a reader — the certificate would be green over a panel that had walked away from it, which is the
  // precise hole this section was written to close. So a reader is a VALUE reference: an identifier that is
  // not a binding inside an import or a re-export.
  const usesIn = (root, name) => {
    const out = [];
    const visit = (n, bound) => {
      const insideBinding = bound || ts.isImportDeclaration(n) || ts.isExportDeclaration(n);
      if (!insideBinding && ts.isIdentifier(n) && n.text === name) out.push(n);
      ts.forEachChild(n, (c) => visit(c, insideBinding));
    };
    visit(root, false);
    return out;
  };
  const usesOf = (rel, name) => usesIn(parse(rel), name);
  const tables = ['AUDIT_ACTIONS', 'REPORT_STATUSES', 'REPORT_REASONS'];

  // 11.1 — ONE owner per vocabulary table, counted on the DECLARATION (an exported array literal whose name
  // is one of the tables), not on occurrences of the name.
  const declared = [];
  for (const rel of shipped) {
    for (const node of names(rel, (n) => ts.isVariableDeclaration(n) && n.initializer)) {
      const arr = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (ts.isArrayLiteralExpression(arr) && tables.includes(node.name.getText())) declared.push({ rel, name: node.name.getText() });
    }
  }
  // The carrier of every absence claim below: the three tables must be FOUND. A parse that read nothing
  // would make "no file declares a second copy" true of an empty census.
  for (const name of tables) {
    assert.ok(declared.some((d) => d.name === name), `${CLIENT_MODEL} no longer declares ${name} as an array literal — §11 has lost the thing it is protecting, and the absence clauses below would pass on nothing`);
  }
  const copies = declared.filter((d) => d.rel !== CLIENT_MODEL);
  assert.deepEqual(
    copies,
    [],
    `these files declare a second copy of a vocabulary table the service is reconciled against: ${copies.map((c) => `${c.rel}:${c.name}`).join(', ')} — a gate that reads ${CLIENT_MODEL} cannot see a table that lives elsewhere, and the panel that reads the other copy is the one the user sees`,
  );

  // 11.2 — the graded tables have PRODUCTION READERS: shipped sources that USE them as values, `ops.ts`
  // itself excluded. This is the clause v541's certificate could not have failed and should have.
  const readersOf = (table) => shipped.filter((rel) => rel !== CLIENT_MODEL && usesOf(rel, table).length > 0);
  const verbReaders = readersOf('AUDIT_ACTIONS');
  const reasonReaders = readersOf('REPORT_REASONS');
  assert.ok(verbReaders.length >= 1, `nothing outside ${CLIENT_MODEL} USES AUDIT_ACTIONS as a value — the verb table would again be a certificate with no reader, which is the shape that let the panel keep its own nine buttons (an import nobody reads does not count: v556's own arm left one behind and stayed green)`);
  assert.ok(reasonReaders.length >= 1, `nothing outside ${CLIENT_MODEL} USES REPORT_REASONS as a value — the reason table would be graded while the composer builds its chips from whatever it has instead`);
  assert.ok(verbReaders.includes(CLIENT_TRAIL), `the trail's reading module (${CLIENT_TRAIL}) does not use AUDIT_ACTIONS, so the filter bar is back to a hand-copied list`);

  // 11.2b — and the list the panel maps must be DERIVED from the table, not merely matched to it today.
  // An identical hand-copy passes 11.5 (same nine words, same order) and drifts the moment the service
  // renames a verb, which is exactly the failure this increment was measured with.
  const derivedDecl = names(CLIENT_TRAIL, (n) => ts.isVariableDeclaration(n) && n.name.getText() === 'TRAIL_FILTER_ACTIONS');
  assert.equal(derivedDecl.length, 1, `${CLIENT_TRAIL} does not declare exactly one TRAIL_FILTER_ACTIONS — §11 has lost the derived list the panel maps, and the clause below would grade nothing`);
  assert.ok(derivedDecl[0].initializer, `${CLIENT_TRAIL}'s TRAIL_FILTER_ACTIONS has no initializer — the filter list is declared and empty of meaning`);
  assert.ok(
    usesIn(derivedDecl[0].initializer, 'AUDIT_ACTIONS').length > 0,
    `${CLIENT_TRAIL}'s TRAIL_FILTER_ACTIONS is not initialized from AUDIT_ACTIONS — the filter row is a copy that happens to agree with the table today, and a verb renamed server-side would leave it behind in silence`,
  );

  // 11.3 — the panel that renders the trail spells NO verb itself, and lays its buttons by MAPPING the table.
  const panelVerbs = spellings(CLIENT_TOOLBAR, vocab.serverVerbs);
  assert.deepEqual(
    panelVerbs,
    [],
    `${CLIENT_TOOLBAR} spells ${panelVerbs.length} audit verb${panelVerbs.length === 1 ? '' : 's'} as a literal (${panelVerbs.join(', ')}): a button written by hand is a verb that can be renamed server-side, re-ordered or dropped with nothing in this proof going red — lay the buttons out of the trail's derived filter list instead`,
  );
  // The buttons must be DERIVED, not merely wordless: a panel that renders nothing would satisfy the clause
  // above. The derivation point is the `.map()` over the list `trail.ts` exports FROM the table, which 11.5
  // then pins to the service's own verbs — so a hand-copied list can neither return nor hide.
  const mapsTable = names(CLIENT_TOOLBAR, (n) =>
    ts.isCallExpression(n) &&
    ts.isPropertyAccessExpression(n.expression) &&
    n.expression.name.text === 'map' &&
    ts.isIdentifier(n.expression.expression) &&
    n.expression.expression.text === 'TRAIL_FILTER_ACTIONS',
  );
  assert.ok(
    mapsTable.length >= 1,
    `${CLIENT_TOOLBAR} does not call .map() on TRAIL_FILTER_ACTIONS — the filter row is not being derived from the verb table, whatever its imports say`,
  );

  // 11.4 — the composer's reasons come from the OWNER, by IMPORT SPECIFIER and not by name alone: a file
  // could import the right name from the wrong copy (which is precisely what it did before v556).
  const composerReasonImports = names(CLIENT_COMPOSER, (n) => {
    if (!ts.isImportDeclaration(n) || !n.moduleSpecifier || !n.importClause) return false;
    if (!/(^|\/)ops$/.test(n.moduleSpecifier.text)) return false;
    const bindings = n.importClause.namedBindings;
    return !!bindings && ts.isNamedImports(bindings) && bindings.elements.some((e) => e.name.text === 'REPORT_REASONS');
  });
  assert.ok(
    composerReasonImports.length >= 1,
    `${CLIENT_COMPOSER} does not import REPORT_REASONS from a module named ops — the reason menu the reporter clicks is built from some other list than the one §8 reconciles with ReportDtos`,
  );

  // 11.5–11.6 — the shipped reading module, RUNNING over the SERVICE's verbs.
  const box = mkdtempSync(join(tmpdir(), 'nexus-audit-contract-'));
  try {
    const trail = await loadShippedPanel(box);
    assert.deepEqual(
      [...trail.TRAIL_FILTER_ACTIONS],
      vocab.serverVerbs,
      `the filter list the panel maps is not the service's verb list: ${[...trail.TRAIL_FILTER_ACTIONS].join(', ')} vs ${vocab.serverVerbs.join(', ')} — the buttons and the trail have diverged, which is the drift v556 was measured with`,
    );
    const faces = [['row', trail.trailActionText], ['button', trail.trailFilterCaption], ['tooltip', trail.trailFilterHint]];
    for (const [face, fn] of faces) {
      assert.equal(typeof fn, 'function', `${CLIENT_TRAIL} no longer exports a ${face} word function — the census below would throw instead of reporting, and a crash is not a verdict`);
    }
    const raw = [];
    for (const verb of vocab.serverVerbs) {
      for (const [face, fn] of faces) {
        if (fn(verb) === verb) raw.push(`${verb} (${face})`);
      }
    }
    assert.deepEqual(raw, [], `these recorded verbs reach a reader as bare wire tokens: ${raw.join(', ')}`);
    assert.equal(trail.trailActionText('stake'), 'stake', 'a verb neither side has heard of still passes through rather than being invented');
    assert.equal(trail.trailFilterCaption('stake'), 'stake', 'and a button for it wears its own name rather than a neighbour\'s');

    // The tally is still a hand-copied chain — disclosed below, not pretended away. What IS pinned is that
    // its verb set EQUALS the table: the chain cannot quietly lose a verb (v541's exact failure shape) or
    // gain one the service never records.
    const tallyLiterals = (() => {
      const sf = parse(CLIENT_TRAIL);
      let fn = null;
      const visit = (n) => {
        if (ts.isFunctionDeclaration(n) && n.name && n.name.text === 'trailSummaryOf') fn = n;
        ts.forEachChild(n, visit);
      };
      visit(sf);
      assert.ok(fn, `${CLIENT_TRAIL} no longer declares trailSummaryOf — §11 has lost the tally it is pinning`);
      const out = [];
      const collect = (n) => {
        if (ts.isStringLiteral(n) && vocab.serverVerbs.includes(n.text)) out.push(n.text);
        ts.forEachChild(n, collect);
      };
      collect(fn);
      return out;
    })();
    const tallySeen = [...new Set(tallyLiterals)];
    const tallyMissing = vocab.serverVerbs.filter((v) => !tallySeen.includes(v));
    assert.deepEqual(
      tallyMissing,
      [],
      `the trail's tally counts every verb except these: ${tallyMissing.join(', ')} — a recorded verb with no bucket is counted as "other", which is how v541 lost five of them`,
    );
    console.log(`[§11] the vocabulary is graded where it is rendered: ${shipped.length} shipped sources carry ${declared.length} vocabulary tables, all in ${CLIENT_MODEL} · AUDIT_ACTIONS has ${verbReaders.length} production reader(s) (${verbReaders.join(', ')}) and REPORT_REASONS has ${reasonReaders.length} (${reasonReaders.join(', ')}) · ${CLIENT_TOOLBAR} spells 0 of the ${vocab.serverVerbs.length} verbs and maps the table instead · ${CLIENT_COMPOSER} imports its reasons from the owner · the shipped trail module RUN gives all ${vocab.serverVerbs.length} recorded verbs a row word, a button word and a tooltip · and its hand-copied tally still tiles exactly the table's ${tallySeen.length} verbs`);
    // Disclosed, not charged: the shipped sources left in this list spell a recorded verb for their OWN
    // request or route — a `publish` in a lane's action field, not a word painted beside a trail row.
    // v556's rule is about the labels the panels render, so the remainder is printed as measured residue
    // and handed to the next increment, instead of living in a skip list no reader ever re-checks.
    const spelled = shipped
      .filter((rel) => rel !== CLIENT_MODEL && rel !== CLIENT_TOOLBAR && rel !== CLIENT_TRAIL)
      .map((rel) => ({ rel, n: spellings(rel, vocab.serverVerbs).length }))
      .filter((s) => s.n > 0);
    console.log(`[§11] disclosed residue — ${spelled.length} shipped source(s) spell a recorded verb for their own request or route rather than for a label: ${spelled.map((s) => `${s.rel} (${s.n})`).join(', ') || 'none'}`);
  } finally {
    rmSync(box, { recursive: true, force: true });
  }
}

console.log('\n[summary] M9 v273/v384/v385/v541/v556: the service answers with 7 fields (id, action, actorId, targetId, targetType, createdAt, assurance) · the instant is a long, so epoch MILLISECONDS, the client\'s own unit · actorId and assurance are NULLABLE on the wire and NULLABLE in the client, and the other five are nullable in neither · the client\'s own type ACCEPTS a real anonymous entry, a named entry and an unknown verb, checked by the TypeScript compiler itself · an anonymous entry belongs to no account · the answer envelope carries the whole-trail count a service-side filter needs · and the WORDS inside the fields — the service\'s verbs, statuses and reasons — are the client\'s tables, in the service\'s order, with every one of them bucketed, counted and labelled rather than dropped · and since v556 those tables have ONE owner across the shipped sources, that owner has a PRODUCTION reader, and the panel that paints the trail is RUN over the service\'s verbs instead of being re-described — a certificate over a copy nobody rendered is what let the panel keep its own words');
const javaSources = SOURCES.filter((p) => p.endsWith('.java')).length;
const tsSources = SOURCES.length - javaSources;
console.log(
  `[m9-audit-contract-proof] ALL ASSERTIONS PASSED (${SOURCES.length} source files — ${javaSources} Java, ${tsSources} TypeScript — read as the languages that define them, and the client's model RUN rather than re-described)`,
);
