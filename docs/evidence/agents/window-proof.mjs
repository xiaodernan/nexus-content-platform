// NEXUS M2 v63 (exec-host) — A DOOR'S RATIO IS A WINDOW CLAIM, NOT A CENSUS
// (ADR 0016 amendment 63).
// v62 gave `git.status` a per-file staged/dirty split and one sentence: `git.commit records the
// INDEX: 4/7 entries differ from HEAD there`. That sentence has a DENOMINATOR, and a denominator is a
// claim about the repository. But the door reads git through v48's output budget, and v48's rule is
// that a budget may cut the pipe mid-list. Measured on this box (3 staged edits + 400 untracked
// files): git prints 403 porcelain lines, a 256-byte budget keeps 21 of them whole (the 3 staged
// rows plus 18 untracked names, `u000.txt … u017.txt`), and the sentence v62 shipped counted that
// window as the repository — `git.commit records the INDEX: 3/21 entries differ from HEAD there`,
// with 18 of 400 untracked paths named under "a granted commit records NONE of". §1 re-derives
// every one of those numbers from the read, so nothing below is remembered rather than measured.
// Worse: with a budget that lets only the staged rows through, v62's OWN rule
// (`stagedCount === files.length` means "no split to report") made the door go SILENT about a
// repository holding 400 untracked files it had not read.
// This proof does not take the new sentence on trust. It drives the SHIPPED door over the SAME
// repository at three budgets and asserts, against git's own line count and name-lists: that the
// denominator is always the number of entries read; that a window never invents a name git did not
// print; that the same parsed entries produce silence for a complete read and a sentence for a cut
// one (so the difference is the READ, not the repo); and that one real commit through the commit door
// records exactly the staged paths the window named. §5 measures WHY the cut is reachable at all:
// v46 pins `status.showUntrackedFiles=all`, which turns one untracked directory into 400 lines — the
// door is right to read them, and right to say it could not finish.
// §9 holds: throwaway repos under os.tmpdir, hooks/signing neutralized LOCALLY there, staging and
// committing done by the doors, and this repo's HEAD compared byte-wise at the end.
// Run after `npm run build`:  node docs/evidence/agents/window-proof.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry } = rt;
const { createExecHost, gitCommitPolicy, gitEnv, gitReadOnlyPolicy, registerGitCommitTool, registerGitTools, treeSplitNotice } = eh;

const raw = (dir, ...argv) =>
  new Promise((resolve) => {
    execFile('git', argv, { cwd: dir, env: { ...gitEnv({}), GIT_CONFIG_NOSYSTEM: '1' }, encoding: 'utf8', maxBuffer: 1 << 23 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : null) : 0, stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });

function mkTmp(prefix) {
  const base = join(tmpdir().replace(/\\/g, '/'), prefix);
  let n = 0;
  while (existsSync(base + n)) n += 1;
  mkdirSync(base + n, { recursive: true });
  return base + n;
}

const PIN = gitEnv({});
const homeHead = (await raw('.', 'rev-parse', 'HEAD')).stdout.trim();
const workRoot = mkTmp('nexus-v63-proof');
const envInit = { ...PIN, GIT_CONFIG_NOSYSTEM: '1' };
let spawns = 0;
const counting = (cmd, args, opts) => {
  spawns += 1;
  return eh.NODE_SPAWN(cmd, args, opts);
};

/** The SHIPPED status door, at a budget the caller chooses. */
async function statusDoor(dir, maxOutputBytes, callId) {
  const host = createExecHost(gitReadOnlyPolicy(dir, { maxOutputBytes }), { spawnLike: counting });
  const reg = registerGitTools(new ToolRegistry(), host, { env: {} });
  const res = await reg.invoke({ callId: callId ?? 'v63:status', tool: 'git.status', args: {} }, { checkpoint: () => true });
  if (res.output?.ok !== true) throw new Error(`door refused: ${JSON.stringify(res.output ?? res.error)}`);
  return res.output;
}

async function commitDoor(dir, message) {
  const host = createExecHost(gitCommitPolicy(dir), { spawnLike: counting });
  const reg = registerGitCommitTool(new ToolRegistry(), host, { env: {} });
  return reg.invoke({ callId: 'v63:commit', tool: 'git.commit', args: { message } }, { checkpoint: () => true });
}

async function setup(dir, ...argv) {
  const r = await raw(dir, ...argv);
  if (r.code !== 0) throw new Error(`setup ${argv.join(' ')} → ${r.code}: ${r.stderr}`);
  return r;
}

const lines = (s) => s.split('\n').filter((l) => l.trim() !== '');
const RATIO = /git\.commit records the INDEX: (\d+)\/(\d+) (entries(?: this door READ)?) differ from HEAD there/;
const UNTRACKED_NAMES = 400;
const STAGED_NAMES = 3;
const CENSUS = STAGED_NAMES + UNTRACKED_NAMES;

async function seedBigRepo(dir) {
  mkdirSync(dir, { recursive: true });
  await raw(dir, 'init');
  await setup(dir, 'config', 'user.email', 'proof@nexus.test');
  await setup(dir, 'config', 'user.name', 'NEXUS Proof');
  await setup(dir, 'config', 'core.autocrlf', 'false');
  await setup(dir, 'config', 'commit.gpgsign', 'false');
  await setup(dir, 'config', 'core.hooksPath', join(dir, '.nohooks'));
  for (let i = 1; i <= STAGED_NAMES; i += 1) writeFileSync(join(dir, `s${i}.txt`), `seed ${i}\n`);
  await setup(dir, 'add', '.');
  await setup(dir, 'commit', '-m', 'seed');
  for (let i = 1; i <= STAGED_NAMES; i += 1) writeFileSync(join(dir, `s${i}.txt`), `staged edit ${i}\n`);
  await setup(dir, 'add', `s1.txt`, `s2.txt`, `s3.txt`);
  for (let i = 0; i < UNTRACKED_NAMES; i += 1) writeFileSync(join(dir, `u${String(i).padStart(3, '0')}.txt`), 'not tracked\n');
}

// --- §1 the same repository, two budgets, two honest sentences ---
const r1 = join(workRoot, 'r1');
await seedBigRepo(r1);
const census = lines((await raw(r1, 'status', '--short')).stdout);
assert.equal(census.length, CENSUS, `git itself prints ${census.length} porcelain lines for the tree the door reads (want ${CENSUS})`);

const whole = await statusDoor(r1, 1 << 20, 'v63:§1:whole');
const wholeRatio = RATIO.exec(whole.detail);
assert.ok(wholeRatio, 'a complete read still states the split: ' + whole.detail);
assert.equal(Number(wholeRatio[1]), STAGED_NAMES, 'a complete read names the 3 index-side entries');
assert.equal(Number(wholeRatio[2]), CENSUS, 'and the denominator is git\'s whole answer');
assert.equal(wholeRatio[3], 'entries', 'a complete read says "entries", not "entries this door READ": ' + wholeRatio[0]);
assert.ok(!whole.detail.includes('CUT at the budget'), 'no cut clause when nothing was cut: ' + whole.detail);

const cut = await statusDoor(r1, 256, 'v63:§1:cut');
const cutRatio = RATIO.exec(cut.detail);
assert.ok(cutRatio, 'a cut read still states the split, as a WINDOW: ' + cut.detail);
assert.equal(cutRatio[3], 'entries this door READ', 'the ratio must call itself a window: ' + cutRatio[0]);
assert.equal(Number(cutRatio[2]), cut.files.length, `the denominator is the read (${cut.files.length}), not git's line count (${CENSUS})`);
assert.ok(cut.files.length < CENSUS, 'and the read really is smaller than the census');
assert.ok(cut.detail.includes('the read was CUT at the budget'), cut.detail);
assert.ok(cut.detail.includes('NOT a census of the repository'), cut.detail);
assert.ok(cut.detail.includes('output truncated at budget (stdout)'), 'v56 still names WHICH pipe: ' + cut.detail);
// the window may not invent: every path it names is in git's own list
const gitNames = new Set(census.map((l) => l.slice(2).trim()));
for (const f of cut.files) assert.ok(gitNames.has(f.path), `the window named ${f.path}, which git never printed`);
const listed = (cut.detail.match(/worktree-side\/untracked read \(([^)]*)\)/)?.[1] ?? '').split(', ').filter(Boolean);
assert.ok(listed.length > 0 && listed.length < UNTRACKED_NAMES, `the cut list shows ${listed.length} of ${UNTRACKED_NAMES} untracked paths — that is the point`);
for (const name of listed) assert.ok(gitNames.has(name), `untracked name ${name} is not git's`);
// The header's numbers are measurements, not memories: 21 whole porcelain lines survive 256 bytes,
// and the sentence v62 would have built from them counts those 21 as the repository.
assert.equal(cut.files.length, 21, `a 256-byte read keeps ${cut.files.length} of ${CENSUS} lines — the header and the source comment quote this`);
assert.equal(Number(cutRatio[1]), STAGED_NAMES, 'every staged row survived: porcelain prints tracked entries first');
assert.equal(listed.length, 18, `the window names ${listed.length} of ${UNTRACKED_NAMES} untracked paths`);
assert.deepEqual([listed[0], listed[listed.length - 1]], ['u000.txt', 'u017.txt'], `the cut list runs ${listed[0]} … ${listed[listed.length - 1]}`);
assert.equal(treeSplitNotice(cut.files).includes(`records the INDEX: ${STAGED_NAMES}/${cut.files.length} entries differ from HEAD there`), true, 'called without the read fact — as v62 called it — this window still speaks as a census: ' + treeSplitNotice(cut.files));
console.log(`[window-proof] §1 git printed ${CENSUS} lines; the 256-byte door read ${cut.files.length} and says "this door READ", not "the repository"`);

// --- §2 v62's silence is a property of a COMPLETE read, and of nothing else ---
const narrow = await statusDoor(r1, 30, 'v63:§2:narrow');
assert.ok(narrow.files.every((f) => f.staged === true), `a 30-byte window holds only the staged rows: ${narrow.files.map((f) => f.xy + f.path).join(' ')}`);
assert.ok(narrow.files.length < CENSUS, 'and it is smaller than the census');
assert.ok(!RATIO.test(narrow.detail), 'no ratio may be spoken as if it were the repository: ' + narrow.detail);
assert.ok(narrow.detail.includes(`all ${narrow.files.length} entries this door read differ from HEAD in the index`), narrow.detail);
assert.ok(narrow.detail.includes('NOT a statement that nothing unstaged or untracked exists behind it'), narrow.detail);
// the SAME parsed entries, one with the read and one without: the difference is the READ, not the repo
assert.equal(treeSplitNotice(narrow.files), '', 'for a complete read, a wholly-staged list still has no split to report');
assert.notEqual(treeSplitNotice(narrow.files, { window: true }), '', 'for a cut read, the same list must speak');
console.log(`[window-proof] §2 ${narrow.files.length} staged entries + a cut read = a sentence; the same entries + a whole read = silence`);

// --- §3 the window's claims are TRUE as far as they go — controlled by git, not by the door ---
const stagedNames = (await raw(r1, 'diff', '--name-only', '--cached')).stdout.trim().split('\n').filter(Boolean).sort();
assert.deepEqual(stagedNames, ['s1.txt', 's2.txt', 's3.txt'], 'git itself: exactly 3 paths differ from HEAD in the index');
assert.deepEqual(narrow.files.map((f) => f.path).sort(), stagedNames, 'the 30-byte window read exactly those 3');
const unseen = (await raw(r1, 'ls-files', '--others', '--exclude-standard')).stdout.trim().split('\n').filter(Boolean);
assert.equal(unseen.length, UNTRACKED_NAMES, `git lists ${UNTRACKED_NAMES} untracked files the door did not read`);
const cutUntracked = cut.files.filter((f) => f.status === 'untracked').map((f) => f.path);
assert.ok(UNTRACKED_NAMES - cutUntracked.length > 0 && unseen.filter((p) => !cutUntracked.includes(p)).length === UNTRACKED_NAMES - cutUntracked.length, 'the missed files are missed, not miscounted');
console.log(`[window-proof] §3 git's own census: ${stagedNames.length} index-side, ${unseen.length} untracked; the window read ${narrow.files.length} of ${CENSUS} and said so`);

// --- §4 one REAL commit through the commit door: both sentences pointed at the same 3 paths ---
const committed = await commitDoor(r1, 'v63 window-proof: the 3 staged edits');
assert.equal(committed.output?.ok, true, 'the commit door ran: ' + JSON.stringify(committed.output ?? committed.error));
const headNames = lines((await raw(r1, 'show', '--format=', '--name-only', 'HEAD')).stdout).sort();
assert.deepEqual(headNames, stagedNames, 'HEAD recorded exactly the index-side paths both windows named');
const afterCommit = await statusDoor(r1, 1 << 20, 'v63:§4:after');
const afterRatio = RATIO.exec(afterCommit.detail);
assert.ok(afterRatio, 'the split sentence survives the commit: ' + afterCommit.detail);
assert.equal(Number(afterRatio[1]), 0, 'nothing is staged any more — the 3 became HEAD');
assert.equal(Number(afterRatio[2]), UNTRACKED_NAMES, `and the ${UNTRACKED_NAMES} untracked paths are still there, named`);
assert.ok(afterCommit.detail.includes('a granted commit records NONE of'), afterCommit.detail);
console.log(`[window-proof] §4 a granted commit recorded ${headNames.join(', ')}; the door then says 0/${UNTRACKED_NAMES}`);

// --- §5 WHY the cut is reachable: v46's pin makes one directory 400 lines (measured, not assumed) ---
const r2 = join(workRoot, 'r2');
mkdirSync(join(r2, 'dropzone'), { recursive: true });
await raw(r2, 'init');
await setup(r2, 'config', 'user.email', 'proof@nexus.test');
await setup(r2, 'config', 'user.name', 'NEXUS Proof');
await setup(r2, 'config', 'commit.gpgsign', 'false');
await setup(r2, 'config', 'core.hooksPath', join(r2, '.nohooks'));
writeFileSync(join(r2, 'keep.txt'), 'tracked\n');
await setup(r2, 'add', '.');
await setup(r2, 'commit', '-m', 'seed');
for (let i = 0; i < UNTRACKED_NAMES; i += 1) writeFileSync(join(r2, 'dropzone', `d${String(i).padStart(3, '0')}.txt`), 'x\n');
const collapsed = lines((await raw(r2, '-c', 'status.showUntrackedFiles=normal', 'status', '--short')).stdout);
const pinned = lines((await raw(r2, 'status', '--short')).stdout); // PIN's forced config sets `all`
assert.equal(collapsed.length, 1, `unpinned, git collapses a 400-file directory into: ${collapsed[0]}`);
assert.ok(collapsed[0].endsWith('dropzone/'), 'one line, and it is a PREFIX, not a path to any file');
assert.equal(pinned.length, UNTRACKED_NAMES, 'the shipped pin makes the same directory ' + UNTRACKED_NAMES + ' lines — which is why a budget can cut a status list');
const wideDoor = await statusDoor(r2, 1 << 20, 'v63:§5:wide');
assert.equal(wideDoor.files.filter((f) => f.status === 'untracked').length, UNTRACKED_NAMES, 'the door reads every one of them when the budget allows');
assert.notEqual(treeSplitNotice(wideDoor.files, { window: true }), '', 'the same entries still speak of a window when told the read was cut');
assert.equal(treeSplitNotice(wideDoor.files), treeSplitNotice(wideDoor.files, { window: false }), 'and the flag defaults to "the read was whole"');
console.log(`[window-proof] §5 one directory = ${collapsed.length} line unpinned, ${pinned.length} pinned; the door pays ${pinned.length} and must say what it read`);

// --- §6 §9: this repository's HEAD is untouched ---
const finalHead = (await raw('.', 'rev-parse', 'HEAD')).stdout.trim();
assert.equal(finalHead, homeHead, "this repository's HEAD was not touched");
assert.ok(spawns > 0, 'every claim above came through a real door spawn');
console.log(`[window-proof] §6 HEAD ${homeHead.slice(0, 7)} unchanged, ${spawns} door spawns, all writes inside os.tmpdir`);
console.log('[window-proof] ALL GREEN');
