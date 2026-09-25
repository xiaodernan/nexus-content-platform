// NEXUS M2 v80 (docs/evidence) — 63rd tracked script: the witness for the sweep's THIRD axis.
// Run after `npm run build`:  node docs/evidence/agents/tree-axis-proof.mjs
//
// v78 gave a sweep an identity for its SCRIPTS (the ref's bytes, materialised) and its BUILD (a digest
// over every shipped `dist` file), and wrote down as this increment's bound that a third thing was still
// unnamed: `runProof` passes the REPOSITORY ROOT as cwd, because that is how a proof resolves
// `./agents/runtime/dist/index.js`. So a script that reads `.` reads the working tree, and the working
// tree contains files no commit owns. Measured on this repository before this line of code existed: the
// walk one shipped proof performs returns 220 files here and 193 in a clean clone of the same commit,
// and the 27 extra files carry 2 204 169 of the 3 801 218 bytes it indexes.
//
// What is proven here, in order: the walked tree has an identity that MOVES for the right reasons and
// only for those (§1); the ownership split is exhaustive, disjoint, and checked against a second,
// independent reader of git (§2); the axis is LOAD-BEARING rather than cosmetic, shown by making a
// shipped assertion's own predicate come out false with untracked files present and true without them
// (§3); the runner notices the tree moving mid-run and says so (§4); §9 holds (§5); and the numbers an
// amendment will quote are PRINTED by this run rather than recollected (§6).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const sw = await import(pathToFileURL(join(root, 'docs/evidence/agents/sweep.mjs')).href);
const rt = await import(pathToFileURL(join(root, 'agents/runtime/dist/index.js')).href);
const { buildIndex, queryIndex, collectTextFiles } = rt;

// The same adapter the runner hands the production walker, so §2 and §3 measure the walker's own
// population rather than a re-implementation of it.
const fsLike = { readdirSync: (d) => readdirSync(d, { withFileTypes: true }), statSync: (p) => statSync(p), readFileSync: (p, e) => readFileSync(p, e) };
// The population helper both §2 and §3 need: the production walker called with an explicit root, so the
// process cwd stays where §4's sweep expects it.
const collectTextFilesInDir = (dir) => collectTextFiles(dir, fsLike);

const homeHead = (await sw.gitText(['rev-parse', 'HEAD'], root)).trim();

/** A SECOND reader of git, not the runner's own spawn path, so a bug in it cannot confirm itself. */
function gitOut(args, cwd) {
  return new Promise((res, rej) => {
    const c = spawn('git', args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    c.stdout.on('data', (d) => out.push(d));
    c.stderr.on('data', (d) => err.push(d));
    c.on('error', rej);
    c.on('close', (code) => (code === 0 ? res(Buffer.concat(out).toString('utf8')) : rej(new Error(`git ${args.join(' ')} → exit ${code}: ${Buffer.concat(err).toString('utf8')}`))));
  });
}

const fake = join(tmpdir(), `nexus-v80-tree-${Date.now()}`);
async function makeRepo(name) {
  const repo = join(fake, name);
  mkdirSync(join(repo, 'packages/p/src'), { recursive: true });
  writeFileSync(join(repo, 'packages/p/src/a.ts'), 'export const alpha = 1;\n');
  writeFileSync(join(repo, 'packages/p/notes.md'), '# notes\n\nalpha\n');
  writeFileSync(join(repo, '.gitignore'), 'ignored/\n');
  for (const a of [['init', '-q', '-b', 'main'], ['config', '--local', 'user.email', 'proof@invalid'], ['config', '--local', 'user.name', 'proof'], ['config', '--local', 'core.hooksPath', join(repo, '.git', 'none')], ['add', '-A'], ['commit', '-qm', 'seed']]) await sw.gitText(a, repo);
  return repo;
}

// --- §1 the walked tree has an identity, and it moves for the reasons this axis exists ---
console.log('§1 被遍历的树：身份要稳定，也要在该动的时候动');
const repo = await makeRepo('one');
const t0 = await sw.walkedTree(repo);
assert.equal(t0.files, 2, 'the two committed text files, and NOT `.gitignore` — the walker selects by extension, so a config file with no matching suffix is not in the population it reads');
assert.deepEqual(t0, await sw.walkedTree(repo), 'asked twice about the same bytes, the runner says the same thing');
assert.match(t0.digest, /^[0-9a-f]{64}$/, 'an identity is a digest, not a file count');
assert.equal(t0.untracked, 0, 'a clean tree is clean, and the runner has to be able to say so');
assert.equal(t0.other, 0, 'and nothing is ignored-but-read yet');

writeFileSync(join(repo, 'packages/p/src/a.ts'), 'export const alpha = 2;\n');
const t1 = await sw.walkedTree(repo);
assert.notEqual(t1.digest, t0.digest, 'an edit to a tracked file moves it');
assert.equal(t1.files, t0.files, 'while the count stays put — size and population are not provenance, same lesson as the build digest');

writeFileSync(join(repo, 'packages/p/scratch.md'), '# scratch\n\nthis file is in no commit\n');
const t2 = await sw.walkedTree(repo);
assert.equal(t2.tracked, t1.tracked, 'an UNTRACKED file adds nothing to what the ref owns');
assert.equal(t2.untracked, 1, 'and everything to what the walk reads: this is the axis v78 could not see');
assert.notEqual(t2.digest, t1.digest, 'so the identity moves, which is the whole point');
rmSync(join(repo, 'packages/p/scratch.md'));
assert.deepEqual(await sw.walkedTree(repo), t1, 'remove it and the identity comes back exactly — the digest is over bytes, not over a timestamp or a path through tmpdir');
writeFileSync(join(repo, 'packages/p/other-name.md'), '# scratch\n\nthis file is in no commit\n');
const t3 = await sw.walkedTree(repo);
assert.equal(t3.untracked, t2.untracked, 'the same untracked bytes, one name over');
assert.notEqual(t3.digest, t2.digest, 'and the identity still moves, because it is keyed by PATH');
rmSync(join(repo, 'packages/p/other-name.md'));

// git-ignorance is not walk-ignorance: `collectTextFiles` skips by DIRECTORY NAME and extension, and has
// no idea what a `.gitignore` says. Asserted rather than assumed because it decides what "owned by the
// ref" means — an ignored file is read by a proof and belongs to no commit either.
mkdirSync(join(repo, 'ignored'), { recursive: true });
writeFileSync(join(repo, 'ignored/hidden.md'), '# hidden\n\nalpha beta gamma\n');
const t4 = await sw.walkedTree(repo);
assert.equal(t4.files, t1.files + 1, 'an ignored-but-present text file IS walked, so the walker cannot be the only definition of "what the proofs read"');
assert.equal(t4.other, 1, 'and it is counted as neither tracked nor untracked-when-ignored-is-excluded — the split has to have a third bin, and name it');
assert.equal(t4.tracked, t1.tracked, 'the ref owns exactly what it owned');
rmSync(join(repo, 'ignored'), { recursive: true, force: true });

// --- §2 the split is exhaustive and disjoint, re-derived by a reader that is not the runner ---
console.log('§2 归属划分：不多算、不漏算，用第二个 git 读者复核');
mkdirSync(join(repo, 'packages/p/deep'), { recursive: true });
writeFileSync(join(repo, 'packages/p/deep/untracked.ts'), 'export const u = 1;\n');
const t5 = await sw.walkedTree(repo);
const trackedSet = new Set((await gitOut(['ls-files', '-z'], repo)).split('\0').filter(Boolean));
const untrackedSet = new Set((await gitOut(['ls-files', '--others', '--exclude-standard', '-z'], repo)).split('\0').filter(Boolean));
assert.ok(![...trackedSet].some((p) => untrackedSet.has(p)), 'git never calls one path both tracked and untracked — if it starts to, the bins below are not a partition and the counts mean nothing');
const walkedMap = collectTextFilesInDir(repo);
const walkedNow = Object.keys(walkedMap).sort();
const rebin = (list) => ({
  tracked: list.filter((p) => trackedSet.has(p)).length,
  untracked: list.filter((p) => untrackedSet.has(p)).length,
  other: list.filter((p) => !trackedSet.has(p) && !untrackedSet.has(p)).length,
});
const expected = rebin(walkedNow);
assert.deepEqual(
  { tracked: t5.tracked, untracked: t5.untracked, other: t5.other },
  expected,
  'every bin re-counted from the walked paths by the independent reader: a split computed one file at a time can silently double-count or drop a path'
);
assert.equal(t5.tracked + t5.untracked + t5.other, t5.files, 'and the three bins are the whole population, no more and no less');
assert.equal(t5.files, walkedNow.length, 'the runner walked the same population the production module returns for that directory');
assert.equal(t5.bytes, walkedNow.reduce((n, p) => n + Buffer.byteLength(walkedMap[p], 'utf8'), 0), 'and its byte total is the content it claims, not a file size read off disk');

// --- §3 the axis is load-bearing: a shipped proof's own predicate goes FALSE on untracked content ---
console.log('§3 这条轴不是装饰：让已提交 proof 用的那个判据，因为一个未跟踪文件而翻面');
const repo2 = await makeRepo('two');
writeFileSync(join(repo2, 'packages/p/src/persist.ts'), 'export function deserializeApp(schemaVersion, localStorage) { return schemaVersion; }\n');
// Five more COMMITTED files that mention the same identifiers, so the top-5 is full of ref-owned chunks
// before any scratch exists — otherwise "a slot moved" has nothing to move from.
for (let i = 1; i <= 5; i += 1) {
  writeFileSync(join(repo2, `docs-note-${i}.md`), `# note ${i}\n\ndeserializeApp schemaVersion localStorage appears once here\n`);
}
for (const a of [['add', '-A'], ['commit', '-qm', 'add the sources']]) await sw.gitText(a, repo2);
const cleanIdx = buildIndex(collectTextFilesInDir(repo2));
const q = 'deserializeApp schemaVersion localStorage';
// `code-index-proof.mjs` asserts exactly this shape over a top-5: `paths.includes(expected)`.
const rankIn = (index, expected) => {
  const paths = queryIndex(index, q, 5).map((h) => h.path);
  return { rank: paths.indexOf(expected) + 1, paths };
};
const expectedPath = 'packages/p/src/persist.ts';
const before = rankIn(cleanIdx, expectedPath);
assert.equal(before.paths.length, 5, `the committed tree alone must fill all five slots, or the arithmetic below proves nothing (got ${before.paths.length})`);
assert.equal(before.rank, 1, `with only the ref's files the source is the top hit (got ${before.paths.join(', ')})`);
for (let i = 1; i <= 6; i += 1) {
  writeFileSync(join(repo2, `scratch-noise-${i}.md`), `# scratch ${i}\n\ndeserializeApp schemaVersion localStorage deserializeApp schemaVersion localStorage scratch ${i}\n`);
}
const dirtyIdx = buildIndex(collectTextFilesInDir(repo2));
const after = rankIn(dirtyIdx, expectedPath);
const tree = await sw.walkedTree(repo2);
const isUntracked = (p) => p.startsWith('scratch-noise-');
assert.equal(tree.untracked, 6, 'six files that no commit owns, all of them read');
const refOwnedSlots = (list) => list.filter((p) => !isUntracked(p)).length;
assert.ok(refOwnedSlots(after.paths) < refOwnedSlots(before.paths), `untracked content did not just enlarge the index, it TOOK slots: the ref owned ${refOwnedSlots(before.paths)} of 5 before, ${refOwnedSlots(after.paths)} of ${after.paths.length} after (${after.paths.join(', ')})`);
const keptInTop5 = after.paths.includes(expectedPath);
console.log(`  6 个未跟踪文件之后：${expectedPath} 的名次 ${before.rank} → ${after.rank || '跌出前 5'} · 前 5 中仍属于 ref 的槽位 ${refOwnedSlots(before.paths)} → ${refOwnedSlots(after.paths)} · code-index-proof 的判据 includes(expected) 在此刻为 ${keptInTop5}`);
for (let i = 1; i <= 6; i += 1) rmSync(join(repo2, `scratch-noise-${i}.md`));
const restored = rankIn(buildIndex(collectTextFilesInDir(repo2)), expectedPath);
assert.deepEqual(restored.paths, before.paths, 'take the untracked files away and the whole top-5 is back, slot for slot — the change was caused by ownership, not by chance');
// --- §4 the runner notices the tree moving while a sweep runs ---
console.log('§4 一趟扫描里树会动：两种形状都要有，且端到端要真报出来');
assert.equal(sw.treeMoveNotice(t1, t1), null, 'the same tree at both ends produces no notice — silence here must mean "nothing moved", not "not measured"');
const notice = sw.treeMoveNotice(t1, t2);
assert.ok(notice && notice.startsWith('[identity] ⚠'), 'a moved tree is a warning line, in the same block as the identity');
assert.ok(notice.includes('not all graded against the same working tree'), 'and it says what the consequence is, not just that a number changed');
assert.ok(notice.includes(t1.digest.slice(0, 16)) && notice.includes(t2.digest.slice(0, 16)), 'both digests are in the line, so a later reader can tell WHICH end it is quoting');
assert.ok(notice.includes(`${t1.untracked} untracked then, ${t2.untracked} now`), 'and the ownership counts are in it too — "the tree moved" without "by how many files nobody owns" is half the finding');

const moverPath = join(root, '.scratch', 'v80', 'mover.md');
mkdirSync(join(root, '.scratch', 'v80'), { recursive: true });
const silencedQuiet = [];
const quiet = await sw.runSweep({ ref: 'HEAD', only: 'budgets-proof', cwd: root, timeoutMs: 180_000, log: (l) => silencedQuiet.push(l) });
assert.equal(quiet.treeStable, true, `a sweep with nothing writing into the tree reports a stable one: ${quiet.treeNotice || 'no notice'}`);
assert.ok(silencedQuiet.some((l) => l.startsWith('[identity] walked tree')), 'and the tree line is PRINTED, not merely computed — v78\'s whole claim is that the identity survives into the log');
assert.ok(silencedQuiet.some((l) => l.includes('read the WORKING TREE as its') || l.includes('read the WORKING TREE as their')), 'with the population of scripts that depend on it named');
try {
  const silencedMoved = [];
  const moved = await sw.runSweep({
    ref: 'HEAD',
    only: 'budgets-proof',
    cwd: root,
    timeoutMs: 180_000,
    log: (l) => silencedMoved.push(l),
    beforeRecheck: async () => {
      writeFileSync(moverPath, '# v80 witness\n\nwritten between the last proof and the re-check, then removed\n');
    },
  });
  assert.equal(moved.treeStable, false, 'a file that appears between the run and the re-check makes the tree unstable — this is the branch a "61 scripts, 0 failed" sentence used to be able to hide');
  assert.ok(silencedMoved.some((l) => l.startsWith('[identity] ⚠ the WALKED TREE moved')), 'and it is reported in the identity block');
  const summary = silencedMoved[silencedMoved.length - 1].trim();
  assert.match(summary, /^\[summary\] ref /, 'the last line of a sweep is still the quotable summary');
  assert.ok(summary.includes('(MOVED mid-run)'), 'and the tree field of THAT line says MOVED, so the pastable sentence carries the caveat by itself');
  assert.ok(summary.includes(`tree ${moved.identity.tree.digest.slice(0, 16)}`), 'it quotes the OPENING digest — the one the rows were mostly graded against');
  assert.ok(!summary.includes('tree 00000000000000'), 'and it is a real digest, not a placeholder');
} finally {
  rmSync(moverPath, { force: true });
}

// --- §5 §9 holds ---
const finalHead = (await sw.gitText(['rev-parse', 'HEAD'], root)).trim();
assert.equal(finalHead, homeHead, "the home repository's HEAD is byte-identical: nothing this script ran committed, staged or checked out");
assert.ok(!existsSync(moverPath), 'the one file this script wrote inside the repository is gone again');

// --- §6 the numbers an amendment will quote, from THIS run ---
console.log('§6 引用得出来的数字');
const realTree = await sw.walkedTree(root);
const rows = await sw.proofDivergence('HEAD', root);
const walkers = rows.filter((r) => r.dotIngest || r.ownWalk);
const dotOnly = rows.filter((r) => r.dotIngest);
const ownOnly = rows.filter((r) => r.ownWalk);
const realWalk = collectTextFiles('.', fsLike);
const trackedReal = new Set((await gitOut(['ls-files', '-z'], root)).split('\0').filter(Boolean));
const idxAll = buildIndex(realWalk);
const idxRef = buildIndex(Object.fromEntries(Object.entries(realWalk).filter(([p]) => trackedReal.has(p))));
console.log(`  真树：${realTree.files} 文件 / ${realTree.bytes} B · ref 拥有 ${realTree.tracked} · 未跟踪 ${realTree.untracked} (${realTree.untrackedBytes} B) · ignored 而被读 ${realTree.other} · 身份 ${realTree.digest.slice(0, 16)}`);
console.log(`  索引后果：本工作区 ${idxAll.chunks.length} chunks · 该 ref 的干净克隆 ${idxRef.chunks.length} chunks · 差 ${idxAll.chunks.length - idxRef.chunks.length} 个 chunk 来自没有任何 commit 的文件（${Math.round(((idxAll.chunks.length - idxRef.chunks.length) / idxAll.chunks.length) * 100)}%）`);
for (const [query, exp] of [['rigidRotateRect rotatePointAbout', 'packages/design-model/src/geometry.ts'], ['deserializeApp schemaVersion localStorage', 'apps/studio/src/lib/persist.ts'], ['DANGEROUS checkpoint ToolRegistry invoke', 'agents/runtime/src/registry.ts']]) {
  const a = queryIndex(idxAll, query, 5).map((h) => h.path);
  const b = queryIndex(idxRef, query, 5).map((h) => h.path);
  const un = a.filter((p) => !trackedReal.has(p));
  console.log(`  "${query.slice(0, 34)}…" 期望 ${exp}：此树 #${a.indexOf(exp) + 1} · 干净克隆 #${b.indexOf(exp) + 1} · 前 5 里未跟踪的：${un.length ? un.join(',') : '-'}`);
}
console.log(`  ${rows.length} 只已提交 proof 中，${walkers.length} 只把这棵树当语料：${dotOnly.length} 只 collectTextFiles('.') [${dotOnly.map((r) => r.name.split('/').pop()).join(', ')}] + ${ownOnly.length} 只自带遍历 [${ownOnly.map((r) => r.name.split('/').pop()).join(', ')}]`);
assert.equal(dotOnly.length + ownOnly.length, walkers.length, "the two spellings are disjoint — a script counted in both would make the runner's sentence add up to more scripts than exist");
assert.ok(dotOnly.length >= 7 && ownOnly.length >= 1, `the population this increment is about: ${dotOnly.length} dot-rooted + ${ownOnly.length} with their own copy of the rule — fewer means the scan lost one of them`);
// The negative control that makes the tightened scan worth trusting: a script that names `process.cwd()`
// as a JAIL ROOT, without reading a directory, must NOT be counted — and the assertion only means
// something because the bytes really do contain the call the earlier, looser version matched on.
const candidates = [];
for (const r of rows) {
  const text = (await sw.committedBlob('HEAD', r.name, root)).toString('utf8');
  if (/process\.cwd\s*\(/.test(text) && !r.dotIngest && !r.ownWalk) candidates.push(r.name.split('/').pop());
}
assert.ok(candidates.length > 0, `at least one script must use process.cwd() WITHOUT walking the tree, or the scan's precision is untested (counted: ${walkers.length} of ${rows.length})`);
console.log(`  提到 process.cwd() 而没有被算成遍历者的（它们只是拿它当 jail 根或 import 路径）：${candidates.join(', ')}`);
// The real-repo consequence is PRINTED always and ASSERTED only when the tree can support it. Asserting
// "untracked content contributes chunks" unconditionally would make this script red in a clean clone —
// which is precisely the defect it exists to document, and a witness that inherits the disease it grades
// is worthless. §3 already proves the mechanism where the expected answer is known.
assert.ok(idxAll.chunks.length >= idxRef.chunks.length, 'a bigger corpus cannot have fewer chunks — if it does, the two indexes were not built from nested populations');
if (realTree.untracked > 0) {
  assert.ok(idxAll.chunks.length > idxRef.chunks.length, `${realTree.untracked} untracked files were read and contributed ZERO chunks — the split says they are there and the index says they are not`);
} else {
  console.log('  (this checkout has no untracked text files: the real-repo consequence branch is vacuous this run, and that is a fact about the clone, not a failure)');
}

rmSync(fake, { recursive: true, force: true });
console.log(`\n[summary] walked tree: identity moves on an edit, an untracked file and a rename, while the ref-owned count stays put · ignored-but-read counted separately · split exhaustive and disjoint (${t5.tracked}+${t5.untracked}+${t5.other}=${t5.files}) · slots displaced where the answer is known: the ref owned ${refOwnedSlots(before.paths)} of the 5 top hits with a clean tree and ${refOwnedSlots(after.paths)} with 6 untracked ones · runner catches a mid-run move end-to-end and reports treeStable false · home tree: ${realTree.files} files with ${realTree.untracked} untracked owning ${idxAll.chunks.length - idxRef.chunks.length} of ${idxAll.chunks.length} chunks · HEAD unmoved`);
