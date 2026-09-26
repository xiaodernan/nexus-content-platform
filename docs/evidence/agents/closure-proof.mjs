#!/usr/bin/env node
// NEXUS M2 v88 (docs/evidence) — THE SWEEP STAGED A DIRECTORY WHEN IT NEEDED A CLOSURE
// (ADR 0016 amendment 88).
//
// What the previous sweep measured, before this file existed: ref `e04e3ae`, 68 rows, 35 red, 0 killed —
// and 32 of those reds were the SAME staging fault, `ERR_MODULE_NOT_FOUND`. Since amendment 86 the proof
// population imports a SHARED file (`docs/evidence/lib/syncproc.mjs`, the shim around this box's broken
// synchronous spawn API) that lives OUTSIDE the proof directory, while `trackedProofs` lists only the proof
// directory and `materialize` wrote every blob FLAT into a temp directory. The import therefore failed
// twice over: the file was never fetched, and `../lib` from a flat copy points outside the copy anyway.
//
// And the report hid the cause. Each of those rows printed `:: ` followed by an EMPTY stdout and then three
// lines of stderr — `node:internal/modules/esm/resolve:271 | throw new ERR_MODULE_NOT_FOUND( | ^` — because
// Node's `Cannot find module '…' imported from …` sentence is the FOURTH line and the runner quoted three.
// So a reader could not distinguish "32 proofs broke" from "the runner cannot stage a proof", which is
// amendment 86's mistake one level up: an excerpt of where something tripped is not a reason why.
//
// Sections: §1 the resolver · §2 the ref's real closure · §3 the same bytes in two layouts, run for real ·
// §4 the reason line and the window it beats · §5 what did not move.
//
// §9/§60 bounds: read-only against the home repository; writes confined to os.tmpdir(); the runner is
// imported by the population's own idiom (`join(process.cwd(), …)`, resolved by the CHILD's cwd as
// amendment 83 measured); nothing here uses the synchronous child-process API this box cannot do.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const root = process.cwd();
const sw = await import(pathToFileURL(join(root, 'docs/evidence/agents/sweep.mjs')).href);
const LIB = 'docs/evidence/lib/syncproc.mjs';
/** Preferred subjects for §3, in this fixed order: real shim-importing proofs, cheapest known first. */
const PREFERRED = ['policyaudit-proof.mjs', 'door-kill-proof.mjs', 'verdict-proof.mjs'];
const firstLines = (s, n) => String(s ?? '').split(/\r?\n/).filter((l) => l.trim()).slice(0, n).join('\n');

/** One real process, async only — the synchronous API answers EBUSY on this host (amendment 86). */
const sh = (cmd, argv, cwd = root) => new Promise((res) => {
  const p = spawn(cmd, argv, { cwd, shell: false });
  let out = '';
  let err = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (err += d));
  p.on('close', (code) => res({ code, out, err }));
});

// M2 v93 named this row as a blind spot of its own prediction: its git calls reach the repository through THIS
// file's wrapper, whose program position holds a PARAMETER, and through a helper in ANOTHER FILE — so no
// call-site scan of these bytes can see a spawn of git at all. v94 lets the row state the reach itself.
// sweep-asks-repository: git rev-parse HEAD (twice) · git show HEAD:docs/evidence/lib/syncproc.mjs — all three through the sh(cmd, argv) wrapper whose program position is a PARAMETER · git ls-tree + git cat-file --batch via sw.proofCorpus, which is a call in sweep.mjs
const homeHead = (await sh('git', ['rev-parse', 'HEAD'])).out.trim();

// ── §1 the resolver: git's slash space, the importer's own directory as the base ──
assert.equal(sw.resolveRelative('docs/evidence/agents/x.mjs', '../lib/syncproc.mjs'), LIB, '§1 the shim must resolve to the path the ref stores it at');
assert.equal(sw.resolveRelative('docs/evidence/agents/x.mjs', './y.mjs'), 'docs/evidence/agents/y.mjs', '§1 a sibling stays inside the population');
assert.equal(sw.resolveRelative('a/b/c.mjs', '../lib/./d.mjs'), 'a/lib/d.mjs', '§1 a "." segment names nothing and must not survive');
assert.equal(sw.resolveRelative('docs/evidence/agents/x.mjs', '../lib/../lib/s.mjs'), 'docs/evidence/lib/s.mjs', '§1 ".." collapses left to right, like a filesystem');
assert.deepEqual(sw.relativeSpecs(`import a from 'node:fs';\nimport b from '../lib/s.mjs';\nconst m = await import('./x.mjs');\nimport c from '../lib/s.mjs';`), ['../lib/s.mjs', './x.mjs'], '§1 bare specifiers are not relative, and a repeated edge counts once');
console.log(`[1] resolver: 5 shapes including the shim's own path · bare and duplicate forms both rejected`);

// ── §2 the ref's closure, measured from the ref's BYTES ──
const corpus = await sw.proofCorpus('HEAD', root);
const closure = await sw.closureOf('HEAD', root, corpus);
const byText = corpus.rows.filter((r) => sw.relativeSpecs(r.text).length > 0).map((r) => r.name);
assert.equal(closure.importers, byText.length, '§2 the importer count must equal an independent scan of the same bytes, not a number this file remembers');
assert.ok(closure.total > 60, `§2 the census is the tracked ref, not a hand-picked few (${closure.total} proofs)`);
const dep = closure.deps.find((d) => d.name === LIB);
assert.ok(dep, `§2 the shim must come back as a fetched dependency; deps: ${closure.deps.map((d) => d.name).join(', ') || 'NONE'}`);
assert.equal(dep.importers.length, closure.importers, '§2 every importer must be attributed, so a reader sees how many rows one file carries');
assert.deepEqual(closure.missing, [], `§2 nothing the population imports may be outside every commit (${closure.missing.map((m) => m.name).join(', ')})`);
assert.equal(dep.bytes.toString('utf8').replace(/\r\n/g, '\n'), readFileSync(join(root, LIB), 'utf8').replace(/\r\n/g, '\n'), '§2 the fetched bytes must be the working copy\'s CONTENT — line endings are normalised because git stores LF and this checkout may not, so the comparison is about the file, not about a working-tree filter');
const refBlob = (await sh('git', ['show', `HEAD:${LIB}`])).out;
assert.equal(closure.nestedDeps.length, 0, '§2 a depth-1 closure is honest ONLY while the dependency imports nothing itself; if it starts, this row must say so');
assert.equal(Buffer.byteLength(refBlob), dep.bytes.length, '§2 the batch read and `git show` must agree byte-for-byte about the ref\'s copy');
console.log(`[2] closure of HEAD: ${closure.total} proofs · ${closure.importers} import a relative path · deps fetched: ${closure.deps.map((d) => `${d.name} ← ${d.importers.length} proof(s)`).join(', ')} · unsatisfiable: ${closure.missing.length} · nested: ${closure.nestedDeps.length}`);

// ── §3 the same bytes in two layouts, run for real ──
const pick = PREFERRED.map((p) => `docs/evidence/agents/${p}`).find((p) => byText.includes(p)) ?? byText[0];
const row = corpus.rows.find((r) => r.name === pick);
assert.ok(row, '§3 the chosen subject must come from the ref itself');
const scratch = mkdtempSync(join(tmpdir(), 'nexus-v88-closure-'));
try {
  const faithful = join(scratch, 'faithful');
  const flat = join(scratch, 'flat');
  mkdirSync(flat, { recursive: true });
  const landed = await sw.materialize('HEAD', faithful, root, corpus, closure.deps);
  const staged = landed.find((l) => l.name === pick);
  const slashed = (p) => String(p).split(/[\\/]/).join('/');
  assert.ok(slashed(staged.target).endsWith('/' + pick), `§3 the materialiser must lay the proof at its repo-relative path, not its basename (got ${staged.target})`);
  assert.ok(existsSync(join(faithful, LIB)), '§3 the dependency has to be on disk at exactly the relative path the import names');
  assert.ok(!existsSync(join(faithful, pick.split('/').pop())), '§3 and the flat basename must be GONE — a stale extra copy would let a red arm pass by accident');
  const good = await sw.runProof(staged.target, root, 180_000);

  // The pre-v88 shape, rebuilt honestly: basename only, no dependency file.
  const flatCopy = join(flat, pick.split('/').pop());
  writeFileSync(flatCopy, row.bytes);
  assert.ok(!existsSync(join(scratch, 'lib', 'syncproc.mjs')), '§3 the flat arm must really lack the file, not resolve it by luck');
  const bad = await sw.runProof(flatCopy, root, 180_000);

  assert.equal(good.code, 0, `§3 the same bytes in the ref's shape must pass; exit ${good.code}: ${good.errTail}`);
  assert.notEqual(bad.code, 0, '§3 the flat shape must fail for the reason this amendment is about, not accidentally pass');
  assert.match(bad.err, /ERR_MODULE_NOT_FOUND/, '§3 the flat failure must be the measured class, not just any failure');
  console.log(`[3] one proof, two layouts, same bytes (${pick.split('/').pop()}): faithful exit ${good.code} in ${good.ms}ms · flat exit ${bad.code} in ${bad.ms}ms · ${/Cannot find module/.test(bad.err) ? 'the missing-module sentence IS in its stderr' : 'no such sentence'}`);

  // ── §4 the reason line, and the window that used to hide it ──
  assert.ok(bad.reason, '§4 a red row must carry a named reason');
  assert.match(bad.reason, /Cannot find module/, '§4 the reason must be Node\'s own cause sentence, not a paraphrase of it');
  assert.match(bad.reason, /syncproc\.mjs/, '§4 and it must NAME the file whose absence decided the row');
  assert.ok(!/Cannot find module/.test(firstLines(bad.err, 3)), '§4 the cause must sit BELOW the three lines the old window quoted, or this section proves nothing about the window');
  const nodeStream = "node:internal/modules/esm/resolve:271\n    throw new ERR_MODULE_NOT_FOUND(\n          ^\nError [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\\x\\lib\\s.mjs' imported from C:\\x\\p.mjs\n    at new Promise (<anonymous>)";
  assert.equal(sw.failureReason(nodeStream), "Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\\x\\lib\\s.mjs' imported from C:\\x\\p.mjs", '§4 the FOURTH line is the one that gets quoted, which is the whole defect');
  assert.equal(sw.failureReason('AssertionError [ERR_ASSERTION]: the door said 3 and git said 4'), 'AssertionError [ERR_ASSERTION]: the door said 3 and git said 4', '§4 an assertion is the subject\'s OWN verdict line, so it is quoted bare');
  assert.equal(sw.failureReason('Error: the file vanished while the child was reading it'), 'Error: the file vanished while the child was reading it (no named cause: reported what the stream DID say)', '§4 an error SHAPE is not a cause, and the difference has to survive into the words');
  assert.equal(sw.failureReason('node:internal/process/task_queues:95\n    ^\n'), null, '§4 NO NAMED CAUSE is a lawful answer and must be reported as one, not filled with a stack header');
  const silent = join(scratch, 'silent.mjs');
  writeFileSync(silent, 'process.exit(1);');
  const quiet = await sw.runProof(silent, root, 30_000);
  assert.equal(quiet.code, 1, '§4 control: the silent child really did fail');
  assert.equal(String(quiet.tail).trim(), '', '§4 control: it printed nothing, which is the field this section exists for');
  assert.equal(quiet.reason, null, '§4 a red with no stderr at all is reported as cause-less, not as a blank field');
  console.log(`[4] reason: quoted from line 4 of a 5-line stream · absent → null · an empty stdout is now a stated finding (${(bad.reason ?? '').slice(0, 72)}…)`);
} finally {
  // ── §5 what did not move ──
  const nowHead = (await sh('git', ['rev-parse', 'HEAD'])).out.trim();
  assert.equal(nowHead, homeHead, '§5 this proof never writes in the repository it grades (§9)');
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
  assert.ok(!existsSync(scratch), '§5 teardown reaped its own scratch');
  console.log(`[5] home HEAD ${homeHead.slice(0, 7)} unchanged · scratch removed · zero synchronous spawns issued by this file`);
}
console.log('\n[closure-proof] ALL GREEN — the population is a closure, the ref\'s SHAPE is part of its bytes, and a red row names its cause instead of its stack');
