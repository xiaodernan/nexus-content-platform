// NEXUS M2 v78 (docs/evidence) — 62nd tracked script: the sweep runner's own witness.
// Run after `npm run build`:  node docs/evidence/agents/provenance-proof.mjs
//
// What is being proven, and why the runner alone proves nothing: `sweep.mjs` exists because amendments
// v34–v77 kept writing "the N-proof sweep is this increment's 'nothing else moved' assertion" without
// naming the bytes — and because amendment 76's bookkeeping sentence claimed a sweep ran "against this
// commit's own tree", which was true of the scripts and UNVERIFIABLE of the build (a compiled artifact
// carries no provenance stamp; `agents/exec-host/dist/execHost.js` had been rewritten 2½ hours after
// that run, and now contains another lane's uncommitted reaper). So this script grades the runner on
// the two properties the sentence depends on: (a) an identity that changes when the bytes change, and
// (b) a run path where a red cannot be read as green. Everything it measures is PRINTED, so an
// amendment can quote a number that this run produced rather than paraphrase one.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const sw = await import(pathToFileURL(join(root, 'docs/evidence/agents/sweep.mjs')).href);

const homeHead = (await sw.gitText(['rev-parse', 'HEAD'], root)).trim();

// An INDEPENDENT reader of git's object store: the point is to check the runner's numbers without
// calling the runner's function, so a bug in `committedBlob` cannot be confirmed by itself.
function show(path) {
  return new Promise((res, rej) => {
    const c = spawn('git', ['show', path], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const buf = [];
    c.stdout.on('data', (d) => buf.push(d));
    c.stderr.on('data', (d) => process.stderr.write(d));
    c.on('error', rej);
    c.on('close', (code) => (code === 0 ? res(Buffer.concat(buf)) : rej(new Error(`git show ${path} → exit ${code}`))));
  });
}
const sha = (b) => createHash('sha256').update(b).digest('hex');

// --- §1 the build digest is an identity, not a size ---
console.log('§1 dist 摘要：改一个字节要动，改名字也要动');
const fake = join(tmpdir(), `nexus-v78-dist-${Date.now()}`);
mkdirSync(join(fake, 'agents', 'one', 'dist'), { recursive: true });
mkdirSync(join(fake, 'agents', 'two', 'dist'), { recursive: true });
writeFileSync(join(fake, 'agents/one/dist/index.js'), 'export const a = 1;\n');
writeFileSync(join(fake, 'agents/two/dist/extra.js'), 'export const b = 2;\n');
const first = sw.distDigest(fake);
assert.equal(first.files, 2, 'two shipped files, counted — an identity over nothing would satisfy every later assertion');
assert.match(first.digest, /^[0-9a-f]{64}$/, 'an identity is a hex digest, not a length');
assert.deepEqual(sw.distDigest(fake), first, 'asked twice about the same bytes, the runner says the same thing');
writeFileSync(join(fake, 'agents/one/dist/index.js'), 'export const a = 2;\n');
assert.notEqual(sw.distDigest(fake).digest, first.digest, 'one byte changed in one shipped file → the identity moved');
const renamed = sw.distDigest(fake);
rmSync(join(fake, 'agents/one/dist/index.js'));
writeFileSync(join(fake, 'agents/one/dist/renamed.js'), 'export const a = 2;\n');
const afterRename = sw.distDigest(fake);
assert.equal(afterRename.files, renamed.files, 'a rename moves no bytes');
assert.notEqual(afterRename.digest, renamed.digest, 'and still the identity moves: the digest is keyed by PATH, so a file that vanishes cannot hide inside a same-size rewrite');
writeFileSync(join(fake, 'agents/two/dist/extra.js'), 'export const b = 2;\n// trailing newline\n');
const grew = sw.distDigest(fake);
assert.notEqual(grew.digest, afterRename.digest, 'an edit to the LAST file in the walk counts too — a digest that only saw the first would pass this by accident');
assert.equal(grew.files, afterRename.files, 'and the count stays put while the identity moves, which is the whole point: size and population are not provenance');
// This is how the runner first met the real repository: `agents/README.md` sits beside the packages and
// `statSync(<root>/README.md/dist)` threw ENOENT. The unit-shaped tree above could not have found that.
mkdirSync(join(fake, 'agents', 'unbuilt'), { recursive: true });
writeFileSync(join(fake, 'agents', 'README.md'), '# notes\n');
const withStrays = sw.distDigest(fake);
assert.equal(withStrays.files, grew.files, 'a non-directory among the packages, and a package with no build, add nothing to the count');
assert.equal(withStrays.digest, grew.digest, 'and they move nothing that is counted: the identity is over build bytes, and a missing build is a fact about the tree rather than an error');

// --- §2 committed vs worktree, checked by a second reader ---
console.log('§2 「跑的是 ref 的字节」：两个方向都验');
const rows = await sw.proofDivergence('HEAD', root);
assert.ok(rows.length >= 60, `${rows.length} tracked proofs — the runner must enumerate the same population the amendments count`);
let disagrees = 0;
let identical = 0;
for (const r of rows) {
  const mine = sha(await show(`HEAD:${r.name}`));
  assert.equal(r.committed, mine, `${r.name}: the runner's committed sha must be the object store's bytes, not a hash of something else`);
  const worktreeMatches = r.worktree !== null && r.worktree === mine;
  if (worktreeMatches) identical += 1;
  else disagrees += 1;
  const onDisk = (() => {
    try {
      return sha(readFileSync(join(root, r.name)));
    } catch {
      return null;
    }
  })();
  assert.equal(r.worktree, onDisk, `${r.name}: the reported worktree sha is the file that is actually there`);
}
console.log(`  ${rows.length} 只：${identical} 只与 worktree 相同 · ${disagrees} 只不同（不同者即「ref 的字节」与「工作区的字节」不是一回事的那些）`);
assert.ok(identical > 0, 'at least one proof must be checked in its committed form, or §2 has only measured the dirty half');

// --- §3 what materialize() lays down is the ref's bytes ---
console.log('§3 落到临时目录的，是那个 ref 的字节');
const dir = join(fake, 'mat');
mkdirSync(dir, { recursive: true });
const landed = await sw.materialize('HEAD', dir, root);
assert.equal(landed.length, rows.length, 'the same population the divergence table counted');
for (const l of landed.slice(0, 8)) {
  const mine = sha(await show(`HEAD:${l.name}`));
  assert.equal(sha(readFileSync(l.target)), mine, `${l.name}: the file that runs is the committed blob`);
  assert.equal(l.bytes, readFileSync(l.target).length, 'and its length is reported as what landed, not as what was asked for');
}
const divergentName = rows.find((r) => r.worktree !== r.committed);
if (divergentName) {
  const landedFor = landed.find((l) => l.name === divergentName.name);
  assert.notEqual(sha(readFileSync(landedFor.target)), sha(readFileSync(join(root, divergentName.name))), 'a rewritten worktree proof is NOT what a sweep of the ref runs — this is the sentence the runner exists to make checkable');
} else {
  console.log('  (worktree currently matches the ref for every proof: the branch above is vacuous this run, and says so)');
}

// --- §4 a red cannot be read as green ---
console.log('§4 红不能被读成绿：真退出码、真超时、真崩溃');
const mk = (name, src) => {
  const p = join(fake, name);
  writeFileSync(p, src);
  return p;
};
const green = await sw.runProof(mk('green.mjs', "console.log('fine');\n"), fake, 30_000);
assert.equal(green.ok, true, `a script that exits 0 is OK (exit ${green.code}, stderr ${JSON.stringify(green.errTail)})`);
const red = await sw.runProof(mk('red.mjs', "console.log('before the throw');\nthrow new Error('measured failure');\n"), fake, 30_000);
assert.equal(red.ok, false, 'a throwing script is FAIL');
assert.notEqual(red.code, 0, 'and the exit code says so, rather than the runner deciding');
assert.match(red.errTail, /measured failure/, "the tail carried the reason — a FAIL nobody can read is a FAIL nobody will fix");
const slow = await sw.runProof(mk('slow.mjs', "setTimeout(() => console.log('too late'), 4000);\n"), fake, 400);
assert.equal(slow.ok, false, 'a script that outruns its budget is FAIL, not a silent skip');
assert.equal(slow.timedOut, true, 'and it is labelled a TIMEOUT, because "it hung" and "it failed" are different findings');
const signalless = await sw.runProof(mk('exit7.mjs', 'process.exit(7);\n'), fake, 30_000);
assert.equal(signalless.code, 7, 'the code a proof exits with is reported verbatim, not normalised to 1');

// Which END of each stream a FAIL row reads is load-bearing, and it was measured, not assumed: the
// first version of the runner tailed both streams, and a thrown error's message is its FIRST stderr
// line — the row printed `Node.js v24.15.0` instead of the reason.
const chatter = await sw.runProof(
  mk('chatter.mjs', "for (let i = 1; i <= 9; i += 1) console.log(`progress ${i}`);\nconsole.error('REASON: the fixture failed on purpose');\nfor (let i = 1; i <= 6; i += 1) console.error(`    at fake stack frame ${i}`);\nprocess.exit(3);\n"),
  fake,
  30_000,
);
assert.match(chatter.tail, /progress 9/, "a proof's stdout is read from the END, because a passing proof prints its [summary] last");
assert.match(chatter.errTail, /REASON: the fixture failed on purpose/, "and its stderr from the BEGINNING, because that is where a failure says what happened");
assert.ok(chatter.errTail.includes('stack frame 1'), 'the head read starts at the reason and the line under it');
assert.ok(!chatter.errTail.includes('stack frame 6'), 'and a stack tail cannot crowd the reason out of the row — with seven lines of stderr, a tail-read loses the one that matters');
assert.equal(chatter.ok, false, 'a nonzero exit with chatter on both streams is still FAIL');

// --- §5 the runner, run for real, on one committed proof ---
console.log('§5 真跑一只已提交的 proof，走的是同一条物化路径');
const smallest = landed.reduce((a, b) => (b.bytes < a.bytes ? b : a));
const realRun = await sw.runProof(smallest.target, root, 180_000);
assert.equal(realRun.ok, true, `the smallest committed proof (${smallest.name.split('/').pop()}, ${smallest.bytes} bytes) must pass through the same path a sweep uses: exit ${realRun.code} ${realRun.timedOut ? 'TIMEOUT' : ''} :: ${realRun.tail} || ${realRun.errTail}`);
console.log(`  ${smallest.name.split('/').pop()} · ${smallest.bytes} 字节 · exit 0 · ${realRun.ms}ms`);
// The entry point a human actually types, exercised on one proof: `runSweep` is what writes the
// `[summary]` line an amendment quotes, so its own identity plumbing must be run, not just read.
const silenced = [];
const swept = await sw.runSweep({ ref: 'HEAD', only: smallest.name.split('/').pop(), cwd: root, timeoutMs: 180_000, log: (l) => silenced.push(l) });
assert.equal(swept.results.length, 1, 'the --only filter selected exactly the one committed proof asked for');
assert.equal(swept.failed.length, 0, `and it came back green through the sweep path: ${swept.results[0].tail} || ${swept.results[0].errTail}`);
assert.equal(swept.identity.sha, homeHead, 'the sweep names the commit it materialised its scripts from');
assert.equal(swept.distStable, true, 'a two-second sweep must report a stable build — otherwise the flag reports nothing');
assert.ok(silenced.some((l) => l.startsWith('[identity] scripts:')), 'and the divergence between ref and worktree is printed, not merely computed');
console.log(`  runSweep(--only ${smallest.name.split('/').pop()}) · 1 脚本 · failed 0 · dist 稳定 · 身份行 ${silenced.filter((l) => l.startsWith('[identity]')).length} 条`);

// --- §6 the numbers an amendment will quote ---console.log('§6 引用得出来的数字，而不是复述');
const id = await sw.identityBlock('HEAD', root);
assert.equal(id.sha, homeHead, 'the identity block reports the commit that is actually checked out');
assert.equal(id.ref, 'HEAD');
assert.ok(id.distFiles > 100, `${id.distFiles} shipped dist files — a digest over two files would not cover what the proofs import`);
assert.ok(Array.isArray(id.dirtySources), 'the dirty-source list is data, so a "clean tree" claim can be checked against it');
console.log(`  HEAD ${id.sha.slice(0, 12)} · build ${id.distFiles} files / ${id.distDigest.slice(0, 16)} · dirty tracked sources ${id.dirtySources.length}${id.dirtySources.length ? ' → ' + id.dirtySources.join(', ') : ''}`);
// A non-empty guard the real repository cannot supply: whether its sources are dirty right now is not
// this script's to decide, so the positive control is a synthetic repo where the answer is known. The
// first version of `dirtySources` sliced ONE character off porcelain's two status columns, which glued
// `M ` to the path and made every real modification fail the filter — it answered `0` about a tree with
// two dirty sources, and only this kind of control catches that in whichever state the repo is in.
const repo = join(fake, 'repo');
mkdirSync(join(repo, 'packages/p/src'), { recursive: true });
mkdirSync(join(repo, 'packages/q'), { recursive: true });
writeFileSync(join(repo, 'packages/p/src/a.ts'), 'export const a = 1;\n');
writeFileSync(join(repo, 'packages/q/notes.md'), 'hello\n');
for (const a of [['init', '-q', '-b', 'main'], ['config', '--local', 'user.email', 'proof@invalid'], ['config', '--local', 'user.name', 'proof'], ['config', '--local', 'core.hooksPath', join(repo, '.git', 'none'),], ['add', '-A'], ['commit', '-qm', 'seed']]) await sw.gitText(a, repo);
writeFileSync(join(repo, 'packages/p/src/a.ts'), 'export const a = 2;\n');
writeFileSync(join(repo, 'packages/p/src/untracked.ts'), 'export const u = 1;\n');
writeFileSync(join(repo, 'packages/q/notes.md'), 'changed, but not a source file\n');
const synthetic = await sw.dirtySources(repo);
assert.deepEqual(synthetic, ['packages/p/src/a.ts'], 'exactly the tracked-and-modified source path: not the untracked sibling under src/, not the modified file outside src/');

// --- §7 §9 holds ---
rmSync(fake, { recursive: true, force: true });
const finalHead = (await sw.gitText(['rev-parse', 'HEAD'], root)).trim();
assert.equal(finalHead, homeHead, 'the home repository\'s HEAD is byte-identical: nothing this script ran committed, staged or checked out');
// --- §8 which plane each row says it stood on (M2 v103) ---
// The runner reports, per row, whether the row's own first stdout lines disclose the plane it ran on — the tree with
// an index, or a disk walk. Amendment 102 is why that sentence is worth a line of the log: a row gained an
// unconditional `git rev-parse HEAD`, the isolated checkout has no index, and five siblings plus a standalone run were
// all green on the bug because a verdict cannot tell the two trees apart. This section grades the reader, not the log.
{
  const say = (head) => head;
  const cases = [
    [say('[§0] plane GIT · 75 tracked .mjs, 73 scored rows'), 'GIT', 'a row that names the plane in its banner is read as disclosing it'],
    [say('[§0] plane NO-GIT · the population comes off disk'), 'NO-GIT', 'the other plane is a different word, not a substring of the first'],
    [say('[closure-proof] ALL GREEN — nothing about a plane here'), 'mute', 'a verdict, however confident, says nothing about the tree it stood on'],
    [say('we graded the plane GIT claim elsewhere in the run'), 'GIT', 'PINNED OVER-DISCLOSURE: prose that happens to write the two words is read as a self-report, because the reader scans the first lines for a token and cannot tell a banner from a sentence about one — recorded rather than narrowed, since a row that lies about its plane is still evidence that someone should check it'],
  ];
  let exactP = 0;
  for (const [head, want, why] of cases) {
    const c = sw.planeCensus([{ name: 'fixture/x-proof.mjs', head }]);
    const got = c.GIT.length ? 'GIT' : c['NO-GIT'].length ? 'NO-GIT' : 'mute';
    if (got === want) exactP++;
    console.log(`  ${got === want ? 'ok  ' : 'MISS'} ${why} → ${got} (want ${want})`);
  }
  assert.equal(exactP, cases.length, `the plane reader answered ${cases.length - exactP} of ${cases.length} shapes differently than this row predicts`);
  const pop = [
    { name: 'a/x-proof.mjs', head: 'plane GIT ·' }, { name: 'b/y-proof.mjs', head: 'plane NO-GIT ·' },
    { name: 'c/z-proof.mjs', head: 'no report' }, { name: 'd/w-proof.mjs', head: 'also none' },
    { name: 'e/v-proof.mjs', head: 'plane GIT again' },
  ];
  const five = sw.planeCensus(pop);
  assert.equal(five.GIT.length + five['NO-GIT'].length + five.mute.length, pop.length, 'a row can be lost between the three buckets, and a census that loses one is how a self-report channel goes silently empty');
  assert.deepEqual(five.mute.sort(), ['w-proof.mjs', 'z-proof.mjs'], 'the silent rows are named (by basename, as the census reports them), not counted as a remainder — the log line has to be able to point at them');
  const confessing = (await sw.gitText(['show', `HEAD:docs/evidence/agents/confession-proof.mjs`], root)).replace(/\r\n/g, '\n');
  assert.ok(/\[§0\] plane \$\{gitPlane\}/.test(confessing), 'the row whose banner this channel reads no longer prints a plane token, so §8 is grading a fixture and the live line in the sweep is measuring nobody');
  console.log(`[§8] plane self-report reader: ${exactP}/${cases.length} shapes exact (one recorded as an over-disclosure) · five rows split ${five.GIT.length}/${five['NO-GIT'].length}/${five.mute.length} with the mutes named by file, and the channel is anchored to a live banner in confession-proof.mjs`);
}

console.log('\n[summary] identities checked: dist digest (2 files, path-keyed, moves on a byte and on a rename) · proof population ' + rows.length + ' with ' + disagrees + ' ref/worktree divergences re-hashed by a second reader · run-path outcomes exercised: green/red/timeout/exit-7 + ' + smallest.name.split('/').pop() + ' through the materialised path · HEAD unmoved');
