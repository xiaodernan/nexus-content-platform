// NEXUS M2 v65 (exec-host) — A REPOSITORY CAN DELETE THE PREFIX EVERY DIFF READER NAMES FILES BY
// (ADR 0016 amendment 65).
// Four doors read a unified diff and one thing decides whether they can name a file in it: git's own
// `a/`/`b/` on the `diff --git` line. Nothing in this package ever SAID those prefixes out loud — v32
// through v64 read them as a given. But four keys in the repository's OWN `.git/config` choose them:
// `diff.noprefix`, `diff.mnemonicPrefix` (which renders `c/`/`i/`), `diff.srcPrefix` and `diff.dstPrefix`.
// Measured on this box (git 2.52) in a throwaway repo with a four-change index — an add, a modify, a
// rename to a path containing a space, a delete: with ANY of those keys set, `git diff --no-ext-diff
// --no-textconv --cached` still exits 0, still prints FOUR `diff --git` sections, and still carries every
// hunk; the headers just stop saying which half is which. `parseDiffHeader` matches none of them, so
// `parseStagedDiff` returned ZERO files and the pre-commit intent window — the text a human is asked to
// approve at §28 — answered `the index is EMPTY — nothing is staged` about an index git's own footer
// called `4 files changed, 4 insertions(+), 2 deletions(-)`.
// v46 pinned the environment to stop git EXECUTING a configured helper; this is the same hole in the
// other layer — a repository deciding what a READ PRINTS. The fix is the argv, not the env table, and
// measurement picked it: `--src-prefix=a/ --dst-prefix=b/` on the command line restores all four keys
// (§0), is byte-identical to git's own default answer in a repo that sets nothing (§4), covers `git show`
// and `--stat` bodies too, and — unlike a forced-config slot — a command-line flag OUTRANKS the config
// file, so it also covers the prefix key git has not invented yet (§3). `diff.external` stayed out of
// both layers for the reason v46 recorded: it has no inert value.
// Then the door refuses to GUESS, and says so. Under `diff.noprefix=true` git prints `diff --git x.ts
// x.ts`; a parser that stripped two characters off each name would report `ts` — a path that exists
// nowhere — while on `diff --git q/bin.dat b/bin.dat` (srcPrefix) the same strip returns `bin.dat`,
// correct. A rule that is wrong on fact and right by luck is why the reader now counts git's sections
// instead of trusting itself: `diff --git` is the one line whose only job is "a section begins here", so
// it can be counted WITHOUT reading a name. A reader that names fewer sections than git printed has
// failed to read, and says so on real bytes through the v46 shape (§1, §2) — including the harm v64
// found in the same family: an unread section's body used to be counted into the file BEFORE it, which
// made a tally wrong as well as short (§5).
// §9 holds: throwaway repos under os.tmpdir, hooks/signing neutralized LOCALLY there, staging done by
// this proof playing the human (§28 keeps staging human), every command this proof runs is read-only, and
// this repository's HEAD is compared byte-wise at the end.
// Run after `npm run build`:  node docs/evidence/agents/prefix-proof.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry, planExec } = rt;
const {
  GIT_DIFF_FLAGS,
  createExecHost,
  gitEnv,
  gitReadOnlyPolicy,
  gitShowPolicy,
  gitStagedPolicy,
  parseDiffHeader,
  parseDiffStat,
  parseStagedDiff,
  registerGitShowTool,
  registerGitStagedTool,
  registerGitTools,
  unnamableDiffSections,
} = eh;

// v46's shipped shape, transcribed — the bytes that used to arrive. Not derived from the source, so this
// finding survives a future rewrite of it.
const OLD_FLAGS = ['--no-ext-diff', '--no-textconv'];
assert.deepEqual(GIT_DIFF_FLAGS, [...OLD_FLAGS, '--no-color', '--src-prefix=a/', '--dst-prefix=b/'], 'the shape this proof compares against IS v46 plus v65 plus the v67 color pin, and nothing else');

const PIN = gitEnv({});
const raw = (dir, ...argv) =>
  new Promise((resolve) => {
    execFile('git', argv, { cwd: dir, env: { ...PIN, GIT_CONFIG_NOSYSTEM: '1' }, encoding: 'utf8', maxBuffer: 1 << 23 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : null) : 0, stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
const setup = async (dir, ...argv) => {
  const r = await raw(dir, ...argv);
  if (r.code !== 0) throw new Error(`setup ${argv.join(' ')} → ${r.code}: ${r.stderr}`);
  return r;
};
function mkTmp(prefix) {
  const base = join(tmpdir().replace(/\\/g, '/'), prefix);
  let n = 0;
  while (existsSync(base + n)) n += 1;
  mkdirSync(base + n, { recursive: true });
  return base + n;
}
const w = (dir, name, text) => writeFileSync(join(dir, name), (Array.isArray(text) ? text.join('\n') : text) + '\n');
const heads = (text) => text.split('\n').filter((l) => l.startsWith('diff --git '));
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
const homeHead = (await raw('.', 'rev-parse', 'HEAD')).stdout.trim();

let spawns = 0;
const spawnedArgv = [];
const counting = (cmd, args, opts) => {
  spawns += 1;
  spawnedArgv.push(args.join(' '));
  return eh.NODE_SPAWN(cmd, args, opts);
};
/**
 * v46's PROCESS, replayed: the shipped door builds the shipped argv (so the gate sees, and allows,
 * exactly what this package ships), and this stand-in drops v65's two prefix flags AND the v67 color pin on
 * the way to git — so what reaches git is v46's argv token for token. That is
 * the only honest way to hand today's reader yesterday's bytes — the door cannot be asked to run a shape
 * its own policy no longer names, and a hand-written argv here would be this file's claim, not the door's.
 */
const dropV65 = (cmd, args, opts) => {
  spawns += 1;
  const kept = args.filter((a) => !/^--(src|dst)-prefix=/.test(a) && a !== '--no-color');
  spawnedArgv.push(`[v46 process] ${kept.join(' ')}`);
  return eh.NODE_SPAWN(cmd, kept, opts);
};
const big = 1 << 20; // a budget no fixture here reaches, so every read below is whole, not a window (v63)

async function door(registry, tool, args, callId) {
  const res = await registry.invoke({ callId, tool, args }, { checkpoint: () => true });
  const o = res.output ?? res.error;
  if (o?.ok !== true) throw new Error(`${tool} refused: ${JSON.stringify(o)}`);
  return o;
}
const stagedDoor = (dir, callId, args = {}, spawn = counting) => door(registerGitStagedTool(new ToolRegistry(), createExecHost(gitStagedPolicy(dir, { maxOutputBytes: big }), { spawnLike: spawn }), { env: {} }), 'git.staged', args, callId);
const diffDoor = (dir, callId, spawn = counting) => door(registerGitTools(new ToolRegistry(), createExecHost(gitReadOnlyPolicy(dir, { maxOutputBytes: big }), { spawnLike: spawn }), { env: {} }), 'git.diff', {}, callId);
const showDoor = (dir, path, callId, spawn = counting) => door(registerGitShowTool(new ToolRegistry(), createExecHost(gitShowPolicy(dir, { maxOutputBytes: big }), { spawnLike: spawn }), { env: {} }), 'git.show', { path }, callId);

/** git's OWN census of a diff, read with `-z` so a rename's two names need no guessing. */
async function census(dir, extra) {
  const z = (await setup(dir, 'diff', ...GIT_DIFF_FLAGS, ...extra, '--numstat', '-z')).stdout.split('\0').filter((f) => f !== '');
  const rows = [];
  for (let i = 0; i < z.length; i += 1) {
    const [a, d, p = ''] = z[i].split('\t');
    if (p === '') { rows.push({ path: z[i + 2], add: Number(a), del: Number(d) }); i += 2; }
    else rows.push({ path: p, add: Number(a), del: Number(d) });
  }
  return { rows, tally: (await setup(dir, 'diff', ...GIT_DIFF_FLAGS, ...extra, '--shortstat')).stdout.trim() };
}

// --- the repository: a four-change index (add, modify, rename with a SPACE, delete) + one unstaged edit --
const r = mkTmp('nexus-v65-prefix');
await setup(r, 'init', '-q', '-b', 'main');
await setup(r, 'config', 'user.email', 'proof@nexus.test');
await setup(r, 'config', 'user.name', 'NEXUS Proof');
await setup(r, 'config', 'commit.gpgsign', 'false');
await setup(r, 'config', 'core.hooksPath', join(r, '.nohooks'));
mkdirSync(join(r, 'docs'), { recursive: true });
w(r, 'docs/keep.md', ['one', 'two']);
w(r, 'docs/gone.md', ['bye']);
w(r, 'from.md', ['a', 'b']);
await setup(r, 'add', '.');
await setup(r, 'commit', '-q', '-m', 'human seed (v65)');
w(r, 'notes.md', ['hello', 'world']); // staged: ADDED
w(r, 'docs/keep.md', ['one', 'TWO', 'three']); // staged: MODIFIED
rmSync(join(r, 'docs/gone.md')); // staged: DELETED
await setup(r, 'mv', 'from.md', 'docs/renamed here.md'); // staged: RENAMED, and its new name has a space
await setup(r, 'add', '-A');
w(r, 'notes.md', ['hello', 'world', 'and one more line nobody staged']); // unstaged: git.diff's own section
const FOUR = 4; // the index's four changes, counted by git below and never by this file's hope

// --- §0 git HONOURS four repository keys, and every one of them deletes the names this package reads --
const c0 = await census(r, ['--cached']);
assert.equal(c0.rows.length, FOUR, `git's own -z census of the index: ${JSON.stringify(c0.rows.map((x) => x.path))}`);
assert.equal(c0.tally, '4 files changed, 4 insertions(+), 2 deletions(-)', "git states the index in its OWN footer — this is the sentence the door used to contradict");
const defaultHeads = heads((await setup(r, 'diff', ...GIT_DIFF_FLAGS, '--cached')).stdout);
for (const [key, what] of [
  ['diff.noprefix=true', 'no prefix at all'],
  ['diff.mnemonicPrefix=true', 'git renders the pair as `c/` and `i/`'],
  ['diff.srcPrefix=q/', 'the pre-image says `q/`, the post-image keeps `b/`'],
  ['diff.dstPrefix=z/', 'the post-image says `z/`, the pre-image keeps `a/`'],
]) {
  const k = key.slice(0, key.indexOf('='));
  await setup(r, 'config', k, key.slice(key.indexOf('=') + 1));
  const old = await setup(r, 'diff', ...OLD_FLAGS, '--cached');
  const neu = await setup(r, 'diff', ...GIT_DIFF_FLAGS, '--cached');
  assert.equal(old.code, 0, `${key}: git still answers a read with exit 0`);
  assert.equal(heads(old.stdout).length, FOUR, `${key}: git still prints ALL ${FOUR} sections — the changes are in the bytes, only the NAMES are gone (${what})`);
  assert.ok(heads(old.stdout).every((h) => parseDiffHeader(h) === null), `${key}: parseDiffHeader names NONE of ${JSON.stringify(heads(old.stdout))}`);
  assert.deepEqual(unnamableDiffSections(old.stdout), heads(old.stdout), `${key}: the census sees every section the reader cannot name`);
  assert.equal(parseStagedDiff(old.stdout).totals.files, 0, `${key}: the reader returns 0 files from a diff git printed in full`);
  // the lie, transcribed as the door's own 0-file branch stood before v65 — held here so the finding is a
  // fact about these bytes, not about a source file a later rewrite will change.
  const liedByThePreV65Door = (text) => (parseStagedDiff(text).files.length === 0 ? 'the index is EMPTY — nothing is staged, so a granted git.commit right now would have nothing to record' : 'named');
  assert.equal(liedByThePreV65Door(old.stdout), 'the index is EMPTY — nothing is staged, so a granted git.commit right now would have nothing to record', `${key}: that is what the v43 door said about those bytes, while git's footer said ${JSON.stringify(c0.tally)}`);
  assert.ok(heads(neu.stdout).every((h) => parseDiffHeader(h) !== null), `${key}: the shipped shape prints a namable header for all ${FOUR}: ${JSON.stringify(heads(neu.stdout))}`);
  assert.deepEqual(heads(neu.stdout), defaultHeads, `${key}: and the shipped shape's headers do not move at all`);
  assert.deepEqual(parseStagedDiff(neu.stdout).files.map((f) => f.path), c0.rows.map((x) => x.path), `${key}: the reader's paths ARE git's -z census, rename-with-a-space included`);
  await setup(r, 'config', '--unset-all', k);
}
console.log(`[prefix-proof] §0 4 keys × git's own census (${c0.tally}): v46 shape → 0 named files out of ${FOUR} sections (the transcribed door said EMPTY), v65 shape → exactly the ${FOUR} paths git lists`);

// --- §1 the SAME repository through the DOOR: v46's shape says "unread", v65's shape says what is staged --
await setup(r, 'config', 'diff.noprefix', 'true');
const oldStaged = await stagedDoor(r, 'v65:old', {}, dropV65);
assert.ok(spawnedArgv.at(-1).startsWith('[v46 process] diff --no-ext-diff --no-textconv --cached'), `the stand-in handed git v46's argv (the host passes the command separately): ${spawnedArgv.at(-1)}`);
assert.equal(oldStaged.files.length, 0, 'the v46 shape on this repository still yields no names');
assert.ok(oldStaged.detail.includes('git printed 4 diff section(s) whose header this door cannot split into two names'), `the census speaks: ${oldStaged.detail}`);
assert.ok(oldStaged.detail.includes('this door named 0 of them'), `and says what it could not do: ${oldStaged.detail}`);
assert.ok(!oldStaged.detail.includes('the index is EMPTY'), `the door no longer calls a read it could not name an empty index: ${oldStaged.detail}`);
assert.ok(!oldStaged.detail.includes('no complete line survived'), 'and it is not the budget, so the door does not blame the budget');
const newStaged = await stagedDoor(r, 'v65:new');
const c1 = await census(r, ['--cached']);
assert.equal(newStaged.totals.files, FOUR, `the shipped shape names all ${FOUR} changes in the same repository`);
assert.deepEqual(newStaged.files.map((f) => [f.path, f.additions, f.deletions]), c1.rows.map((x) => [x.path, x.add, x.del]), `door per-file tallies === git's -z census: ${JSON.stringify(newStaged.files.map((f) => [f.path, f.additions, f.deletions]))}`);
assert.ok(newStaged.detail.includes('1 added, 1 modified, 1 deleted, 1 renamed'), `the kinds come from git's metadata lines, not from prefixes: ${newStaged.detail}`);
assert.ok(!newStaged.detail.includes('diff section(s) whose header'), 'and with the shape owning the prefixes there is nothing left to report as unread');
console.log(`[prefix-proof] §1 same repo, same config —\n  v46 shape: ${oldStaged.detail}\n  v65 shape: ${newStaged.detail}`);

// --- §2 the two FACES agree: --stat never needed a prefix, which is how a reviewer could catch §1 ------
const oldStatText = (await setup(r, 'diff', ...OLD_FLAGS, '--cached', '--stat')).stdout;
assert.equal(parseDiffStat(oldStatText).files, FOUR, `git's OWN stat footer of the same index reads ${FOUR} files while the v46 full face named 0: ${JSON.stringify(oldStatText.trim().split('\n').pop())}`);
const newStat = await stagedDoor(r, 'v65:stat', { stat: true });
assert.equal(newStat.summary.files, FOUR, "the door's --stat face, through the shipped shape, agrees with its full face");
// the worktree door has no EMPTY sentence to lose, so its harm is a bare 0-file tally — the notice fixes that too
const oldDiff = await diffDoor(r, 'v65:olddiff', dropV65);
assert.equal(oldDiff.totals.files, 0, 'the v46 worktree face names nothing on the same rendering');
assert.ok(oldDiff.detail.includes('git printed 1 diff section(s)'), `git.diff states the floor under its own tally: ${oldDiff.detail}`);
const newDiff = await diffDoor(r, 'v65:newdiff');
assert.equal(newDiff.totals.files, 1, 'the shipped shape names the unstaged edit');
assert.deepEqual([newDiff.totals.additions, newDiff.totals.deletions], [1, 0], `and its lines are git's: ${JSON.stringify((await setup(r, 'diff', ...GIT_DIFF_FLAGS, '--numstat')).stdout.trim())}`);
await setup(r, 'config', '--unset-all', 'diff.noprefix');
console.log(`[prefix-proof] §2 --stat face: ${newStat.detail} · worktree face: v46 named ${oldDiff.totals.files} of 1 section, v65 → ${newDiff.detail}`);

// --- §3 the command line OUTRANKS the config file: two hostile keys at once, and git still obeys us ----
await setup(r, 'config', 'diff.noprefix', 'true');
await setup(r, 'config', 'diff.srcPrefix', 'zz/');
const forced = heads((await setup(r, 'diff', ...GIT_DIFF_FLAGS, '--cached')).stdout);
assert.deepEqual(forced, defaultHeads, `noprefix AND srcPrefix=zz/ together still print OUR prefixes: ${JSON.stringify(forced)}`);
const hostileShow = await showDoor(r, 'docs/keep.md', 'v65:show');
assert.equal(hostileShow.additions, 2, `git.show, same hostile config, reads HEAD's 2 added lines: ${hostileShow.detail}`);
assert.ok(spawnedArgv.some((a) => a.includes('--src-prefix=a/') && a.includes('--dst-prefix=b/')), `the prefixes are ON THE COMMAND LINE, which is why no config wins: ${JSON.stringify(spawnedArgv.at(-1))}`);
await setup(r, 'config', '--unset-all', 'diff.noprefix');
await setup(r, 'config', '--unset-all', 'diff.srcPrefix');
console.log(`[prefix-proof] §3 diff.noprefix=true + diff.srcPrefix=zz/ → headers unmoved, git.show: ${hostileShow.detail}`);

// --- §4 the fix costs NOTHING in the common case: in a repo that sets nothing, git's bytes are identical --
for (const [cmd, before, after] of [
  ['diff', [...OLD_FLAGS, '--cached'], [...GIT_DIFF_FLAGS, '--cached']],
  ['diff', OLD_FLAGS, GIT_DIFF_FLAGS],
  ['diff', [...OLD_FLAGS, '--cached', '--stat'], [...GIT_DIFF_FLAGS, '--cached', '--stat']],
  ['show', [...OLD_FLAGS, '--format=', '--', 'docs/keep.md'], [...GIT_DIFF_FLAGS, '--format=', '--', 'docs/keep.md']],
]) {
  const o = await setup(r, cmd, ...before);
  const n = await setup(r, cmd, ...after);
  assert.equal(sha(o.stdout), sha(n.stdout), `${cmd} ${after.join(' ')}: v46's bytes and v65's bytes are the SAME in a repo that sets nothing`);
}
console.log('[prefix-proof] §4 in a DEFAULT repository the two shapes are byte-identical (sha256) for --cached, the worktree, --stat and show');

// --- §5 a section this door cannot name is NOT counted into the file before it (v64's family) ----------
const staged = (await setup(r, 'diff', ...GIT_DIFF_FLAGS, '--cached')).stdout;
const phantom = 'diff --git phantom.md phantom.md\n--- phantom.md\n+++ phantom.md\n@@ -1 +1,2 @@\n-x\n+y\n+z\n';
const mixed = `${staged}${phantom}`;
assert.ok(staged.endsWith('\n'), 'git ends its answer with a newline, so the spliced section starts on its own line');
const read = parseStagedDiff(mixed);
const namable = heads(mixed).length - unnamableDiffSections(mixed).length;
assert.equal(unnamableDiffSections(mixed).length, 1, 'the spliced section is the `noprefix` rendering, fed in by hand so the shipped shape cannot hide it');
assert.equal(read.totals.files, namable, `only the ${namable} section(s) git named in OUR prefixes are counted, not the phantom one`);
assert.ok(!read.files.some((f) => f.path === 'phantom.md'), 'phantom.md is a change git printed that this door cannot NAME, so it is in no file and no tally');
assert.ok(!read.files.some((f) => f.path === 'hantom.md'), 'and its name pair was not read as a name by the file before it — a two-character strip would have said `hantom.md`');
assert.equal(read.files.find((f) => f.path === 'notes.md').additions, 2, 'the LAST named file keeps exactly its own 2 lines, not 2 + the phantom hunk');
console.log(`[prefix-proof] §5 ${heads(mixed).length} sections, ${namable} namable → the reader counts ${read.totals.files} file(s) and the unnamable one adds 0 lines to any tally`);

// --- §6 the rule is WIRED: every reader this package has, and only once each -------------------------
const src = Object.fromEntries(['gitTools.ts', 'gitStagedTool.ts'].map((name) => [name, readFileSync(join('agents', 'exec-host', 'src', name), 'utf8')]));
for (const [f, text] of Object.entries(src)) {
  assert.equal((text.match(/if \(line\.startsWith\('diff --git '\)\)/g) ?? []).length, 1, `${f} carries the section-boundary rule exactly ONCE`);
}
let diffShapes = 0;
for (const [policy, rules] of [[gitReadOnlyPolicy('X:/repo'), 3], [gitStagedPolicy('X:/repo'), 2], [gitShowPolicy('X:/repo'), 1]]) {
  assert.equal(policy.allow.length, rules, 'the allow-list has exactly the shapes this proof runs');
  for (const rule of policy.allow) {
    if (rule.argv[1] === 'status') continue; // git.status renders no diff
    diffShapes += 1;
    assert.ok(rule.argv.includes('--src-prefix=a/') && rule.argv.includes('--dst-prefix=b/'), `${rule.argv.join(' ')} carries the prefixes`);
    assert.ok(planExec({ argv: rule.argv }, policy).ok, `${rule.argv.join(' ')} is a shape the gate allows`);
  }
}
await setup(r, 'config', 'diff.mnemonicPrefix', 'true');
assert.ok((await stagedDoor(r, 'v65:mnemonic')).detail.includes('1 added, 1 modified, 1 deleted, 1 renamed'), 'and the door is unaffected, key by key');
await setup(r, 'config', '--unset-all', 'diff.mnemonicPrefix');
console.log(`[prefix-proof] §6 boundary rule in both diff readers, prefixes carried by all ${diffShapes} diff shapes, and mnemonicPrefix answered correctly through the shipped door`);

// --- §7 §9: this repository's HEAD is untouched -----------------------------------------------------
assert.equal((await raw('.', 'rev-parse', 'HEAD')).stdout.trim(), homeHead, "this repository's HEAD was not touched");
assert.equal(spawns, 7, 'exactly 7 door spawns: 2×git.staged (§1) + 1×git.staged --stat + 2×git.diff (§2) + 1×git.show (§3) + 1×git.staged (§6) — every claim above came through a real git process, and no other process answered for it');
console.log(`[prefix-proof] §7 HEAD ${homeHead.slice(0, 7)} unchanged, ${spawns} door spawns, all writes inside os.tmpdir (${r})`);
console.log('[prefix-proof] ALL GREEN');
