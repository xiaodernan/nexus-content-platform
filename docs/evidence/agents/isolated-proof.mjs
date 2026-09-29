// NEXUS M2 v133 (docs/evidence) — a plane DOWNGRADE is a REFUSAL now, not a log line: `isolatedCheckout`
// throws `ISOLATED-PLANE-DOWNGRADE` unless the caller passes `allowArchive: true`, and §6 measures the
// refusal, the weaker plane the opt-in names, the control that keeps "refuse the downgrade" from meaning
// "refuse everything", and the one thing that makes the pair honest together — the refusal's sentence and
// the `[isolated]` fallback line are the SAME bytes, not two plausible ones.
//
// NEXUS M2 v81 (docs/evidence) — 64th tracked script: the isolated clean checkout, and what it proves.
// sweep-budget-ms: 900000
// Run after `npm run build`:  node docs/evidence/agents/isolated-proof.mjs
//
// The budget above is v85's, and it is a measured number rather than a comfortable one: this script asks
// `isolatedCheckout` for a clean-room BUILD, and the same arm on the same ref was measured at 338.5s on a
// quiet box and at 513.0s / 522.4s back-to-back under load (`isolated-arms.mjs`, `docs/evidence/agents/
// README.md`). A sweep row is given 240 000 ms, so until a row could name its own need this proof was RED
// for being long — the runner stopped asking before anything the proof asserts had happened.
//
// v80 named the sweep's third axis — the TREE a tree-walking proof reads — and measured that 27 of the 220
// files this box's proofs indexed belong to no commit. Its own bound said naming is not isolating, and
// queued the honest next step. This script runs that step and grades it on one property above all others:
//
//   THE HOME REPOSITORY'S BUILD MUST NOT MOVE.
//
// Why that is the whole game: `node_modules/@nexus/*` in this repository are ABSOLUTE symlinks into the
// working tree (measured: `agent-runtime -> /d/终极项目/agents/runtime`), so a temp checkout that simply
// reused the home install would compile the HOME sources into the HOME dist, and a sweep would be grading
// a build some other directory wrote. The isolation is proven by a digest, not asserted by a comment.
//
// It also fixes a crash found on the way: `walkedTree()` asked git for the ownership census, and a clean
// checkout staged by v81's `git archive` had no `.git` — `ls-files` exits 128, which took down the identity
// block of the first isolated run. The census there is UNAVAILABLE rather than zero: absence, not a false
// answer.
//
// M2 v132 moved the staging (and this sentence with it): `isolatedCheckout` now stages the plane with
// `git clone --shared --no-checkout` + `git checkout`, so the tree DOES hold a `.git` and the census there
// is AVAILABLE — which is the point of the change (42 rows died at `git ls-tree` exit 128 on the bare tree
// and never reached their own assertions). §1 below still grades the no-git shape, because the shape has
// not gone away: it is what the ARCHIVE FALLBACK produces, and its witness is a directory this row builds
// itself rather than whatever the runner happened to stage.
//
// M2 v133 closes the bound v132 wrote down in its own record: "nothing yet FAILS a sweep for taking the
// archive fallback, so the 42 reds can return silently on a host where the clone cannot run — the
// `[isolated]` line is the only witness". A line nothing reads is not a gate, and a summary pasted into a
// record does not carry it at all, so `isolatedCheckout` now REFUSES (code `ISOLATED-PLANE-DOWNGRADE`) with
// the price of the weaker plane spelled out; the fallback stays reachable, but only behind an explicit
// `allowArchive: true` (`--isolated --allow-archive`). §6 is the witness: three arms, and the assertion that
// the refusal and the `[isolated]` fallback line carry the same `ARCHIVE_PLANE_COST` bytes.
//
// M2 v82 closes the gap this script found in v81 by trying to quote it. The isolated build exits 1 and
// names `@nexus/studio#build`, but the runner kept only `tailOf(stdout+stderr, 4)` — and the reason line
// sits at index 35 of 55, so the verdict could say WHICH package died and not WHY. `describeBuild()` now
// selects a reason from the whole output, prefers a line the failing task itself printed, and leaves
// `null` when nothing reason-shaped exists rather than promoting the banner. §3 grades that against the
// real transcript (re-read from the build log the runner wrote, so the quote is checkable in its source);
// §3b grades the SELECTION on synthetic text, because a rule only ever tested by whatever the ref's build
// happens to do is a rule that goes untested half the time.
import assert from 'node:assert/strict';
// M2 v90: this file was MISSED by amendment 86's migration and kept importing `spawnSync` straight
// from `node:child_process` — the API that fails with EBUSY on this host. Its own git reader could
// therefore never return a byte, so the cross-drive isolation witness was red for a reason that had
// nothing to do with drives. One import line, exactly as amendment 86 prescribed for the other 33.
import { spawnSync } from '../lib/syncproc.mjs';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const sw = await import(pathToFileURL(join(root, 'docs/evidence/agents/sweep.mjs')).href);
const HOME_RUNTIME_DIST = join(root, 'agents', 'runtime', 'dist', 'index.js');

// An independent reader of git, so a claim about HEAD's bytes is not taken from the function under test.
function gitOut(args) {
  const r = spawnSync('git', args, { cwd: root, windowsHide: true, maxBuffer: 1 << 28, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} → ${r.status}: ${(r.stderr || '').trim().slice(0, 200)}`);
  return r.stdout;
}

// A second walker, deliberately a copy of the RULE rather than a call to the production one: §4 asks
// "is every file this tree exposes tracked at HEAD?", and answering that with the same function whose
// census behaviour is under test would confirm whatever bug it shares with it.
const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', '.turbo']);
const TEXT_EXT = /\.(ts|tsx|js|jsx|md|json|css)$/i;
function walkPaths(dir, base = '') {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${ent.name}` : ent.name;
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!SKIP.has(ent.name)) out.push(...walkPaths(abs, rel));
    } else if (ent.isFile() && TEXT_EXT.test(ent.name) && lstatSync(abs).size <= 256 * 1024) out.push(rel);
  }
  return out;
}

// --- §1 a tree with no `.git` has no census, and says so in every field ---
console.log('§1 干净目录没有 git：所有权普查是「问不了」，不是「一个也没有」');
const bare = join(tmpdir(), `nexus-v81-bare-${Date.now()}`);
mkdirSync(join(bare, 'src'), { recursive: true });
writeFileSync(join(bare, 'src/a.ts'), 'export const a = 1;\n');
writeFileSync(join(bare, 'notes.md'), '# hello\n');
const noGit = await sw.walkedTree(bare, HOME_RUNTIME_DIST);
assert.equal(noGit.gitRepo, false, 'the shape names the absence, so a reader cannot mistake it for a clean tree');
assert.equal(noGit.files, 2, 'the walk itself still happened: two text files, exactly what is on disk');
assert.equal(noGit.bytes, Buffer.byteLength('export const a = 1;\n') + Buffer.byteLength('# hello\n'), 'and the byte total is measured, not inferred');
for (const key of ['tracked', 'untracked', 'untrackedBytes', 'other']) {
  assert.equal(noGit[key], null, `${key} is null: git was not asked, so there is no number to report`);
}
assert.equal(noGit.censusUnknown, noGit.files, 'the whole population lands in the one bin that means "unknown"');
assert.deepEqual(noGit.sample, [], 'and no untracked sample can be offered from a census that does not exist');
const bareTwice = await sw.walkedTree(bare, HOME_RUNTIME_DIST);
assert.equal(bareTwice.digest, noGit.digest, 'the digest is still an identity: stable when asked twice');
writeFileSync(join(bare, 'notes.md'), '# hello!\n');
assert.notEqual((await sw.walkedTree(bare, HOME_RUNTIME_DIST)).digest, noGit.digest, 'and it moves on an edit, even where no census can say who owns the file');
// The fix must cost the repository case nothing: those numbers are the point of v80.
const home = await sw.walkedTree(root, HOME_RUNTIME_DIST);
assert.equal(home.gitRepo, true, 'a real working tree is still asked, and still answers');
assert.ok(Number.isInteger(home.untracked) && home.untracked >= 0, `the worktree's untracked count is still an integer, not a null dressed up as 0 (got ${home.untracked})`);
assert.equal(home.tracked + home.untracked + home.other, home.files, 'the three bins are still exhaustive for a tree that has them');
console.log(`  干净目录 ${noGit.files} 只 · 普查问不了 · 摘要仍是身份；工作区 ${home.files} 只 · tracked ${home.tracked} · untracked ${home.untracked} · ignored-but-read ${home.other}`);

// --- §2 build the clean checkout, and prove where the build went ---
console.log('§2 隔离的第一条判据：主仓库的 dist 一个字节都不能动');
const before = sw.distDigest(root);
// v84: §3's REASON gate needs a build that FAILS. Asking for `os.tmpdir()` by name rather than letting
// the runner choose keeps that transcript reachable now that the DEFAULT dest sits on the repository's own
// drive — where v84 measured this same ref compiling GREEN. The drive is then an argument this witness
// states, not an accident it inherits.
const iso = await sw.isolatedCheckout({ ref: 'HEAD', cwd: root, dest: mkdtempSync(join(tmpdir(), 'nexus-isolated-crossdrive-')), log: (l) => console.log(`  ${l}`) });
const after = sw.distDigest(root);
assert.equal(after.digest, before.digest, `HOME dist digest MOVED while building the isolated tree (${before.digest.slice(0, 16)} → ${after.digest.slice(0, 16)}) — the workspace links point back at the home repo and the isolation is fake`);
assert.equal(after.files, before.files, 'and its population is unchanged too');
const cleanRuntimeLink = join(iso.root, 'node_modules', '@nexus', 'agent-runtime');
const linkResolvesTo = resolve(realpathSync(cleanRuntimeLink));
assert.ok(linkResolvesTo.startsWith(resolve(iso.root)), `the temp tree's @nexus/agent-runtime resolves to ${linkResolvesTo}, outside ${iso.root} — a proof run there would import the home build`);
const homeLink = resolve(realpathSync(join(root, 'node_modules', '@nexus', 'agent-runtime')));
assert.equal(relative(resolve(root), homeLink).split(sep).join('/'), 'agents/runtime', `and the HOME link still resolves to the home sources (got ${homeLink}): nothing here re-pointed it`);
assert.ok(iso.workspace.length >= 5, `the archived package.json declares workspaces; ${iso.workspace.length} links is fewer than the packages that exist (${iso.workspace.join(', ')})`);
assert.equal(iso.linkFailures.length, 0, `third-party junctions failed to build: ${iso.linkFailures.slice(0, 3).join('; ')}`);

// --- §3 what the clean tree built, said out loud rather than smoothed over ---
console.log('§3 干净检出里编译了什么、没编译什么，由 runner 自己说');
assert.ok(iso.build, 'a build was requested, so there is a result to report');
const cleanRuntimeDist = join(iso.root, 'agents', 'runtime', 'dist', 'index.js');
assert.ok(existsSync(cleanRuntimeDist), 'the clean checkout built its OWN agents/runtime/dist — otherwise §4 would grade the home build and prove nothing');
// M2 v90: the sentence above this line used to ASSERT the two dists were different — "the home build
// carries this lane's uncommitted edits, the clean one is HEAD's" — as if dirty-ness were a property of
// the repository rather than of the moment. On this lane `agents/runtime` has no uncommitted edit at all
// (the increment touches exec-host and docs/evidence), so a clean-room build of HEAD reproduced the home
// build BYTE FOR BYTE and the assertion failed for being true. So the expectation is derived from git,
// not from memory, and both directions are load-bearing: dirty home sources with EQUAL bytes is exactly
// v81's failure mode (the isolated build would have read the home tree), and clean home sources with
// DIFFERENT bytes has no source to explain it.
const homeRuntimeDirty = gitOut(['status', '--porcelain', '--', 'agents/runtime']).trim();
const cleanRuntimeBytes = readFileSync(cleanRuntimeDist, 'utf8');
const homeRuntimeBytes = readFileSync(HOME_RUNTIME_DIST, 'utf8');
const distsAgree = cleanRuntimeBytes === homeRuntimeBytes;
if (homeRuntimeDirty) {
  assert.ok(
    !distsAgree,
    `agents/runtime is DIRTY against HEAD (${homeRuntimeDirty.split('\n').length} path(s), e.g. ${homeRuntimeDirty.split('\n')[0]}), so the two dists MUST differ — equal bytes here would mean the clean-room build read the home working tree instead of the ref (v81's isolation failure, stated rather than assumed)`,
  );
} else {
  assert.ok(
    distsAgree,
    'agents/runtime is CLEAN against HEAD and the clean-room build of HEAD still produced different bytes — a difference with no source to explain it is the finding here, not a pass',
  );
}
console.log(`  home agents/runtime 对 HEAD ${homeRuntimeDirty ? `有 ${homeRuntimeDirty.split('\n').length} 处未提交改动` : '干净'} → 两份 dist ${distsAgree ? '逐字节相同（干净重建，可复现）' : '不同（主仓库带着未提交的改动）'} · §4 仍以各自树上跑出来的判定为准`);
// v82: the verdict must be a claim about bytes someone can go and look at. The runner wrote the whole
// build output to `<dest>/build.log`, OUTSIDE the checked-out tree, so re-reading it here re-derives
// every number the runner printed from the file rather than from the same in-memory string.
const rawLog = readFileSync(iso.build.logFile, 'utf8');
assert.ok(iso.build.logFile.startsWith(iso.dir) && !iso.build.logFile.startsWith(iso.root), `the build log is at ${iso.build.logFile}: it must live in the temp DEST and not inside ${iso.root}, or §4 would count a file the runner wrote as a file the ref owns`);
const rederived = sw.describeBuild(rawLog);
assert.equal(Buffer.byteLength(rawLog), iso.build.bytes, 'the log on disk is not the byte count the runner reported writing');
assert.equal(rederived.lines, iso.build.lines, `the runner said ${iso.build.lines} non-empty output lines; the file holds ${rederived.lines}`);
assert.deepEqual(rederived.failed, iso.build.failed, 're-reading the log does not reproduce the failed-package list the runner printed');
assert.equal(rederived.reason, iso.build.reason, 're-reading the log does not reproduce the REASON line the runner printed');
if (iso.build.code !== 0) {
  assert.ok(iso.build.failed.length > 0, `build exited ${iso.build.code} but the runner named NO package — a failure nobody can locate is not a finding`);
  // The gate v81 left open: naming WHICH package died is not naming WHY. A reason of `null` here would
  // mean the runner had the whole output on disk and still reported only a banner.
  assert.ok(iso.build.reason, `build exited ${iso.build.code} naming ${iso.build.failed.join(', ')} and the runner captured NO reason line out of ${iso.build.lines} output lines — the summary banner is not a reason (v82)`);
  assert.ok(rawLog.includes(iso.build.reason), 'the reason the runner prints is not one of the bytes the build wrote — a quote must be findable in its source');
  assert.ok(iso.build.failed.some((f) => iso.build.reason.includes(f.replace('#', ':'))), `the reason line ${JSON.stringify(iso.build.reason.slice(0, 90))} was not printed by a FAILING task (${iso.build.failed.join(', ')}): an error from a package that built fine is not this build's reason, and neither is the summary that only counts`);
  console.log(`  build exit ${iso.build.code} in ${(iso.build.ms / 1000).toFixed(1)}s · ${iso.build.lines} 行输出 · 失败包：${iso.build.failed.join(', ')} · 缓存：${rawLog.includes('Cached:') ? rawLog.match(/Cached:[^\n]*/)[0].trim() : 'not reported'}`);
  console.log(`  原因行（逐字取自 ${iso.build.logFile.split(/[\\/]/).pop()}）：${iso.build.reason.slice(0, 150)}`);
  // v84: the reason above is a sentence about a DRIVE as much as about the ref — `relative()` cannot name a
  // path across drives, so a checkout on another volume gets a `./<drive>…` request that resolves to
  // nothing. Printed beside the quote so a reader of this transcript cannot take it for a ref defect.
  console.log(`  dest ${iso.dir} on ${iso.destDrive} vs repository on ${iso.repoDrive} — ${iso.driveMismatch ? 'CROSS-DRIVE: isolated-arms.mjs measured this same ref GREEN on the repository drive, so this reason is a fact about where the checkout was put' : 'SAME DRIVE: a failure here is not the cross-drive junction'}`);
} else {
  assert.deepEqual(iso.build.failed, [], 'a green build names nothing as failed');
  console.log(`  build exit 0 in ${(iso.build.ms / 1000).toFixed(1)}s · ${iso.build.lines} 行输出 · 全部包通过 · tailOf(4)=${iso.build.tail.slice(0, 90)}`);
}

// --- §3b the SELECTION rule, graded on text this witness wrote ---
// §3 can only grade the rule against whatever the ref's build happens to do. Measured on v81's first
// isolated run, `tailOf(4)` sat 19 lines short of the reason and lost it — so the case that matters is
// synthetic and deterministic here: reason far above the banner, two tasks, a banner with no reason, a
// clean pass. Without this section the rule is only ever tested by an accident.
console.log('§3b 选取规则本身：banner 不是原因，别包的红也不是');
const BANNER = 'Tasks:    4 successful, 5 total\nCached:    0 cached, 5 total\nFailed:    @nexus/studio#build\n ERROR  run failed: command  exited (1)';
const dBanner = sw.describeBuild(BANNER);
assert.deepEqual(dBanner.failed, ['@nexus/studio#build'], 'a banner-only transcript still names the package');
assert.equal(dBanner.reason, null, 'and reports that it captured NO reason, instead of promoting the banner to one — `null` is the honest answer here, as it was for v80\'s census');
const FILLER = Array.from({ length: 33 }, (_, i) => `@nexus/studio:build:  \u001b[2m info  - compiling route ${i}\u001b[0m`).join('\n');
const deep = `@nexus/studio:build: Module not found: Error: Can't resolve './x.js' in 'R:\\apps\\studio'\n${FILLER}\n${BANNER}`;
const dDeep = sw.describeBuild(deep);
// Measured, not remembered: how far the reason sits ABOVE the banner, i.e. how far out of reach the
// 4-line tail is. The real v81 transcript had the reason at line 35 of 55.
const deepLines = deep.split('\n').filter((l) => l.trim());
const reasonAt = deepLines.indexOf(deepLines[0]);
const bannerAt = deepLines.findIndex((l) => l.startsWith('Failed:'));
assert.ok(bannerAt - reasonAt > 4, `the fixture must put the reason out of the tail's reach to test anything (banner ${bannerAt} - reason ${reasonAt} = ${bannerAt - reasonAt})`);
assert.equal(dDeep.reason, deepLines[reasonAt], `a reason ${bannerAt - reasonAt} lines above the banner is still the reason (got ${JSON.stringify(String(dDeep.reason).slice(0, 80))}) — this is exactly what tailOf(4) loses`);
assert.notEqual(dDeep.reason, dDeep.tail, 'and the reported reason is not the 4-line tail the runner used to keep as the whole verdict');
const twoTasks = `@nexus/ai-providers:build: error TS2307: Cannot find module 'gone'\n@nexus/studio:build: Module not found: Error: Can't resolve './y.js'\nFailed:    @nexus/studio#build`;
assert.equal(sw.describeBuild(twoTasks).reason, "@nexus/studio:build: Module not found: Error: Can't resolve './y.js'", 'the reason comes from the package that FAILED, not from the first error-looking line in the log');
const green = sw.describeBuild('Tasks:    5 successful, 5 total\nCached:    0 cached, 5 total');
assert.deepEqual(green.failed, [], 'a passing run fails nothing');
assert.equal(green.reason, null, 'and has no reason to report');
assert.equal(green.lines, 2, 'the line count counts non-empty lines, which is what §3 prints and a reader compares');
console.log(`  合成样本 ${deepLines.length} 行：原因在第 ${reasonAt + 1} 行、banner 在第 ${bannerAt + 1} 行，相距 ${bannerAt - reasonAt} 行 —— tailOf(4) 只够看见 banner，所以这条规则在这里量`);

// --- §4 the proof, run where nothing is untracked ---
console.log('§4 让读工作树的 proof 在干净检出里跑：语料小了多少，判定变不变');
const proofRel = 'docs/evidence/agents/code-index-proof.mjs';
assert.ok(new Set(gitOut(['ls-tree', '-r', '--name-only', 'HEAD']).split(/\r?\n/)).has(proofRel), `${proofRel} is tracked at HEAD, so the ref's own copy is what runs`);
const cleanTree = await sw.walkedTree(iso.root, cleanRuntimeDist);
const cleanPaths = walkPaths(iso.root).sort();
// ORDERING IS LOAD-BEARING: the first mutation probe dropped an untracked file into the tree HERE and the
// witness stayed GREEN, because `cleanPaths` had already been walked. A probe that cannot reach the line
// which grades it is not a refutation — poison before the walk, or do not claim the walk is guarded.
const trackedAll = new Set(gitOut(['ls-tree', '-r', '--name-only', 'HEAD']).split(/\r?\n/).filter(Boolean));
const notInRef = cleanPaths.filter((p) => !trackedAll.has(p));
assert.deepEqual(notInRef.slice(0, 5), [], `${notInRef.length} files the clean checkout exposes are not tracked at HEAD, e.g. ${notInRef.slice(0, 3).join(', ')} — the CONTENT of the staged checkout is supposed to be the ref and nothing else (v132 stages it as a clone, so the clone's own .git is the repository rather than content, and walkPaths skips it the way it skips node_modules)`);
assert.ok(!cleanPaths.some((p) => p.startsWith('.scratch/')), 'no .scratch/ path is in the corpus: the files that reached a shipped top-5 assertion in the worktree cannot reach one here');
// The standing tree does not always HAVE files no commit owns, and which shape is true is a census question
// rather than a guess about which plane this row happens to run on. On the home plane the census reads 63
// untracked + 0 ignored (measured 2026-09-29) and the strict claim below is the whole point: a clean checkout
// walks strictly fewer files. On the isolated plane this row STANDS in a clone the runner just staged — census
// 230 tracked · 0 untracked · 0 ignored (measured on the failed run this branch replaces) — the comparison is
// two clean checkouts of the same ref, and `<` reduced to 230 < 230 and could only fail. The honest claim on
// that plane is IDENTITY, count AND bytes, which is strictly stronger than "smaller", so the census picks the
// sentence.
const standingUnowned = (home.untracked ?? 0) + (home.other ?? 0);
if (standingUnowned > 0) {
  assert.ok(cleanTree.files < home.files, `a clean checkout walks ${cleanTree.files} files against this worktree's ${home.files}: isolation removed ${home.files - cleanTree.files} files no commit owns`);
} else {
  assert.ok(cleanTree.files === home.files && cleanTree.digest === home.digest, `the standing tree owns every file it walks (census tracked ${home.tracked} · untracked ${home.untracked} · ignored ${home.other}), so isolation removed nothing and the claim becomes IDENTITY — and it broke: the clean checkout walks ${cleanTree.files} files / digest ${cleanTree.digest.slice(0, 16)} against the standing tree's ${home.files} / ${home.digest.slice(0, 16)}`);
}
const cleanRun = await sw.runProof(join(iso.root, proofRel), iso.root, 240_000);
const dirtyRun = await sw.runProof(join(root, proofRel), root, 240_000);
console.log(`  干净检出：ok=${cleanRun.ok} exit=${cleanRun.code} ${cleanRun.ms}ms :: ${cleanRun.tail}${cleanRun.ok ? '' : ' || ' + cleanRun.errTail}`);
console.log(`  工作区：  ok=${dirtyRun.ok} exit=${dirtyRun.code} ${dirtyRun.ms}ms`);
assert.equal(cleanRun.ok, true, `the committed proof is RED against a clean checkout of its own ref — ${cleanRun.tail} || ${cleanRun.errTail}: that is a reproducibility finding this increment must report, not a pass`);
assert.equal(cleanRun.ok, dirtyRun.ok, 'and the VERDICT does not depend on which tree it ran in — the honest shape of this claim: same answer, smaller and wholly owned corpus');

// --- §5 the numbers an amendment will quote ---
console.log('§5 引用这次跑出来的数字，而不是复述');
console.log(`  干净检出语料 ${cleanTree.files} 只 / ${cleanTree.bytes} 字节 · 工作区 ${home.files} 只 / ${home.bytes} 字节 · 差 ${home.files - cleanTree.files} 只 / ${home.bytes - cleanTree.bytes} 字节`);
console.log(`  隔离目录 ${iso.dir} · 主仓库 HEAD ${gitOut(['rev-parse', 'HEAD']).trim().slice(0, 12)} · 主仓库 dist 全程 ${before.digest.slice(0, 16)} / ${after.digest.slice(0, 16)}`);

// --- §6 降级是一条拒绝，不是一行日志（M2 v133）---
// v132’s own bound, quoted so this section is visibly closing it: “nothing yet FAILS a sweep for taking the
// archive fallback, so the 42 reds can return silently on a host where the clone cannot run — the
// `[isolated]` line is the only witness”. A line nothing reads is not a gate: a summary pasted into a record
// never carries it. The three arms below make the downgrade a REFUSAL by default, prove the opt-in still
// stages the weaker plane (a host where a clone truly cannot run is not stranded), and prove the refusal and
// the fallback line are the SAME sentence instead of two plausible ones.
console.log('§6 平面降级是拒绝：默认拒绝，书面开口才降级，而且拒绝与 [isolated] 行说同一句话');
// The injected failure is the NATURAL one, not a mock: `git clone` refuses a destination that is not empty,
// so one stray file makes the repository plane genuinely unstowable while everything the archive arm needs
// (a ref to archive) stays intact. The stray file is also the evidence for the next arm, where the fallback
// must EMPTY the tree before extracting: a half-staged directory answers differently from a bare one.
const refusalDest = mkdtempSync(join(tmpdir(), 'nexus-isolated-refusal-'));
mkdirSync(join(refusalDest, 'repo'), { recursive: true });
writeFileSync(join(refusalDest, 'repo', 'not-a-ref.txt'), 'this file must not survive the fallback\n');
let refusal = null;
const refusedMs = Date.now();
try {
  await sw.isolatedCheckout({ ref: 'HEAD', cwd: root, dest: refusalDest, build: false, log: () => {} });
} catch (e) {
  refusal = e;
}
assert.ok(refusal, 'a clone that cannot run and an archive nobody asked for must not produce a plane: the call returned instead of refusing');
assert.equal(refusal.code, 'ISOLATED-PLANE-DOWNGRADE', `the refusal is not named as one (code=${refusal.code}), so a caller cannot tell a plane downgrade from a broken ref`);
assert.ok(refusal.message.includes('git clone'), `the refusal does not carry the clone’s OWN cause (${refusal.message.slice(0, 160)}) — a refusal that hides why it refused is the silent fallback with extra steps`);
assert.ok(refusal.message.includes(sw.ARCHIVE_PLANE_COST), 'the refusal does not state what the weaker plane costs, which is the one thing that makes it a refusal rather than a crash');
assert.ok(refusal.message.includes('allowArchive'), 'the refusal does not name the opt-in, so a caller on a host where the clone cannot run has no way forward from the message alone');
assert.ok(refusal.message.includes(refusalDest), `the refusal does not name the staging directory it is talking about (${refusalDest})`);
assert.ok(existsSync(refusalDest), 'the caller supplied this dest, so the refusal must LEAVE it for them to look at — and the sentence above said so, which is the only reason a reader can trust that it is still there');
const refusalMs = Date.now() - refusedMs;
console.log(`  拒绝 ${refusalMs} ms · code ${refusal.code} · 目录保留=true · 拒绝文本里带着 clone 自己的原因与选项名`);

// --- §6b the opt-in stages the weaker plane, and it is visibly the weaker plane ---
const fallbackLines = [];
const archived = await sw.isolatedCheckout({ ref: 'HEAD', cwd: root, dest: refusalDest, build: false, allowArchive: true, log: (l) => { fallbackLines.push(String(l)); } });
assert.equal(archived.usedClone, false, 'the opt-in did not actually take the weaker plane');
assert.ok(archived.archiveBytes > 0, `the fallback reported ${archived.archiveBytes} bytes of tar: the ref’s tracked bytes are the one thing it does deliver`);
assert.equal(existsSync(join(archived.root, '.git')), false, 'a `.git` survived into the archive plane: a HALF-staged repository answers differently from none, which is the one thing this fallback must not do');
assert.equal(existsSync(join(archived.root, 'not-a-ref.txt')), false, 'the stray file survived the fallback, so the tree was not emptied before extraction and the clone’s leavings are now readable as files the ref owns');
// Ask the plane the question its own rows ask, rather than inferring the answer from a missing directory.
const askedOnFallback = spawnSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], { cwd: archived.root, windowsHide: true, encoding: 'utf8' });
assert.notEqual(askedOnFallback.status, 0, 'git ANSWERED inside the archive plane: either the staging is not what this section says it is, or a parent directory is a repository and the “no git” claim needs re-measuring');
const fallbackTracked = new Set(gitOut(['ls-tree', '-r', '--name-only', 'HEAD']).split(/\r?\n/).filter(Boolean));
const fallbackPaths = walkPaths(archived.root);
const fallbackStrangers = fallbackPaths.filter((p) => !fallbackTracked.has(p));
assert.deepEqual(fallbackStrangers.slice(0, 5), [], `${fallbackStrangers.length} files in the archive plane are not tracked at HEAD, e.g. ${fallbackStrangers.slice(0, 3).join(', ')}`);
assert.ok(fallbackPaths.length > 100, `the archive plane walked ${fallbackPaths.length} text files: the fallback is supposed to stage the ref, not a stub`);
const fallbackLine = fallbackLines.find((l) => l.startsWith('[isolated] the repository plane could not be staged'));
assert.ok(fallbackLine, `the fallback ran without saying so on an [isolated] line — the lines were: ${fallbackLines.map((l) => l.slice(0, 60)).join(' | ') || 'none'}`);
assert.ok(fallbackLine.includes(sw.ARCHIVE_PLANE_COST), 'the [isolated] fallback line and the refusal do not carry the same sentence: two mouths, two claims, and a reader of the transcript would be reading a different price from the one the refusal charges');
console.log(`  降级 ${archived.usedClone ? 'CLONE' : 'ARCHIVE'} · ${archived.archiveBytes} 字节 tar · 走查 ${fallbackPaths.length} 只全部属于 HEAD · 平面内 git 拒绝作答 · [isolated] 行与拒绝共用同一句话`);
rmSync(refusalDest, { recursive: true, force: true });

// --- §6c the control: when the clone runs, the weaker plane is never consulted ---
const controlDest = mkdtempSync(join(tmpdir(), 'nexus-isolated-control-'));
const controlLines = [];
const clonedPlane = await sw.isolatedCheckout({ ref: 'HEAD', cwd: root, dest: controlDest, build: false, log: (l) => { controlLines.push(String(l)); } });
assert.equal(clonedPlane.usedClone, true, 'the control arm could not stage a repository, so “refuse the downgrade” cannot be told apart from “refuse everything” on this host');
assert.equal(clonedPlane.archiveBytes, null, `a clone has no archive to measure, and ${clonedPlane.archiveBytes} is a number that means nothing`);
assert.ok(controlLines.some((l) => l.includes('staged as a REPOSITORY')), 'the control arm did not report the plane it staged');
assert.ok(!controlLines.some((l) => l.includes(sw.ARCHIVE_PLANE_COST)), 'the control arm printed the downgrade’s price on a run that did not downgrade');
const askedOnClone = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: clonedPlane.root, windowsHide: true, encoding: 'utf8' });
assert.equal(askedOnClone.status, 0, `git did not answer inside the clone plane (${(askedOnClone.stderr || '').trim().slice(0, 120)}) — the whole point of the v132 staging`);
assert.equal(askedOnClone.stdout.trim(), gitOut(['rev-parse', 'HEAD']).trim(), 'the repository plane answers with a different HEAD than the repository it was cloned from');
rmSync(controlDest, { recursive: true, force: true });
console.log(`  对照 CLONE：${clonedPlane.workspace.length} 个 workspace 链接 · 平面内 git rev-parse 与主仓库一致 ${askedOnClone.stdout.trim().slice(0, 12)} · allowArchive 未被询问`);

rmSync(bare, { recursive: true, force: true });
rmSync(iso.dir, { recursive: true, force: true });
console.log(`\n[summary] home dist UNMOVED (${before.digest.slice(0, 16)}, ${before.files} files) across an isolated build · clean checkout walks ${cleanTree.files} of ${home.files} worktree files, every one tracked at HEAD · ${proofRel.split('/').pop()} green in both trees · census-without-git reported as null not 0 · §6 the downgrade REFUSES (${refusal.code} in ${refusalMs} ms) and the archive plane is reachable only behind allowArchive, where its own git answers nothing (${fallbackPaths.length} files staged, every one tracked at HEAD; ${archived.archiveBytes} bytes of tar) · build exit ${iso.build.code}${iso.build.failed.length ? ` naming ${iso.build.failed.join(', ')}` : ''}${iso.build.code !== 0 ? ` with a REASON quoted from its own log (${iso.build.reason ? `“${iso.build.reason.slice(0, 88)}…”` : 'NONE captured out of ' + iso.build.lines + ' lines'})` : ''}`);
