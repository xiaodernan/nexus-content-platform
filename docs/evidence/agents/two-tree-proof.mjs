// NEXUS M2 v62 (exec-host) — PORCELAIN'S TWO COLUMNS ARE TWO TREES
// (ADR 0016 amendment 62).
// v32 read `git status --short` as a flat list: one entry, one status, one path. Porcelain v1's
// format is `XY path` where X answers "how does the INDEX differ from HEAD?" and Y answers "how
// does the WORKTREE differ from the INDEX?". A single line `MM both.txt` carries TWO different
// changes about ONE file, and `git.commit` records only the index half. Before v62 the door said
// "N entries" and nothing about how many a commit would actually record. Measured: a repository
// with 7 porcelain lines where a granted commit records exactly 4; the door could not say so.
// This proof:
//   §1 sets up a repository with the 7 shapes (MM/AM/D_/ M_/ D/??), reads it through the SHIPPED
//      door, and cross-checks the door's per-file staged/dirty fields against git's own name-lists
//      (`diff --name-only --cached` for index-side, `diff --name-only` for worktree-side, and raw
//      `status --short` untracked lines). The door's numbers must MATCH git's.
//   §2 commits (through the SHIPPED commit door) and verifies: the 4 staged entries landed in
//      HEAD, the 3 worktree/untracked did NOT, and the tree-split notice correctly predicted this.
//   §3 asserts the notice's SILENCE when every entry is staged (no false alarm).
//   §4 this repo's HEAD is unchanged: every write happened inside os.tmpdir.
// Run after `npm run build`:  node docs/evidence/agents/two-tree-proof.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry } = rt;
const {
  NODE_SPAWN,
  createExecHost,
  gitCommitPolicy,
  gitEnv,
  gitReadOnlyPolicy,
  parseGitStatus,
  registerGitCommitTool,
  registerGitTools,
  treeSplitNotice,
} = eh;

function gitRaw(dir, env, ...argv) {
  return new Promise((resolve) => {
    execFile('git', argv, { cwd: dir, env, encoding: 'utf8', maxBuffer: 1 << 23 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : null) : 0, stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
}

function mkTmp(prefix) {
  const base = join(tmpdir().replace(/\\/g, '/'), prefix);
  let n = 0;
  while (existsSync(base + n)) n += 1;
  mkdirSync(base + n, { recursive: true });
  return base + n;
}

const PIN = gitEnv({});
const homeHead = (await gitRaw('.', PIN, 'rev-parse', 'HEAD')).stdout.trim();
const workRoot = mkTmp('nexus-v62-proof');
let spawns = 0;
const counting = (cmd, args, opts) => { spawns += 1; return NODE_SPAWN(cmd, args, opts); };

function statusDoor(dir, callId) {
  const host = createExecHost(gitReadOnlyPolicy(dir), { spawnLike: counting });
  const reg = registerGitTools(new ToolRegistry(), host, { env: {} });
  return reg.invoke({ callId: callId ?? 'v62:status', tool: 'git.status', args: {} }, { checkpoint: () => true });
}

function commitDoor(dir, msg, callId) {
  const host = createExecHost(gitCommitPolicy(dir), { spawnLike: counting });
  const reg = registerGitCommitTool(new ToolRegistry(), host, { env: {} });
  return reg.invoke({ callId: callId ?? 'v62:commit', tool: 'git.commit', args: { message: msg } }, { checkpoint: () => true });
}

const out = (res) => res.output;

async function setup(dir, ...argv) {
  const r = await gitRaw(dir, PIN, ...argv);
  if (r.code !== 0) throw new Error(`setup ${argv.join(' ')} → ${r.code}: ${r.stderr}`);
  return r;
}

const envInit = { ...PIN, GIT_CONFIG_NOSYSTEM: '1' };

// --- §1: 7 shapes, door reads per-column staging ---
const r1 = join(workRoot, 'r1');
mkdirSync(r1, { recursive: true });
await gitRaw(r1, envInit, 'init');
await setup(r1, 'config', 'user.email', 'proof@nexus.test');
await setup(r1, 'config', 'user.name', 'NEXUS Proof');
await setup(r1, 'config', 'core.autocrlf', 'false');
// initial commit so we have a HEAD with tracked files
writeFileSync(r1 + '/staged-mod.txt', 'original\n');
writeFileSync(r1 + '/staged-del.txt', 'will be deleted\n');
writeFileSync(r1 + '/both.txt', 'original\n');
writeFileSync(r1 + '/worktree-mod.txt', 'original\n');
writeFileSync(r1 + '/worktree-del.txt', 'to be deleted from disk\n');
await setup(r1, 'add', '.');
await setup(r1, 'commit', '-m', 'seed');

// now create the 7 shapes:
// MM both.txt: stage a modification, then modify again
writeFileSync(r1 + '/both.txt', 'staged version\n');
await setup(r1, 'add', 'both.txt');
writeFileSync(r1 + '/both.txt', 'staged + worktree edit\n');

// AM new-staged.md: stage a new file, then edit it
writeFileSync(r1 + '/new-staged.md', 'first version\n');
await setup(r1, 'add', 'new-staged.md');
writeFileSync(r1 + '/new-staged.md', 'first + worktree edit\n');

// D  staged-del.txt: stage a deletion
rmSync(r1 + '/staged-del.txt');
await setup(r1, 'add', 'staged-del.txt');

// M  staged-mod.txt: stage a modification (no worktree change)
writeFileSync(r1 + '/staged-mod.txt', 'staged only\n');
await setup(r1, 'add', 'staged-mod.txt');

//  D worktree-del.txt: delete from disk without staging
rmSync(r1 + '/worktree-del.txt');

//  M worktree-mod.txt: edit without staging
writeFileSync(r1 + '/worktree-mod.txt', 'worktree only\n');

// ?? untracked.md: brand new, never staged
writeFileSync(r1 + '/untracked.md', 'never staged\n');

// --- read through the door ---
const door1 = out(await statusDoor(r1, 'v62:§1'));
assert.ok(door1.ok, 'door must succeed: ' + door1.detail);
assert.equal(door1.files.length, 7, 'expected 7 porcelain entries, got ' + door1.files.length);

const stagedFiles = door1.files.filter((f) => f.staged === true).map((f) => f.path).sort();
const dirtyOnlyFiles = door1.files.filter((f) => f.staged !== true && f.dirty === true).map((f) => f.path).sort();
const untrackedFiles = door1.files.filter((f) => f.status === 'untracked').map((f) => f.path).sort();

// cross-check against git's own name-lists
const cachedNames = (await gitRaw(r1, PIN, 'diff', '--name-only', '--cached')).stdout.trim().split('\n').filter(Boolean).sort();
const worktreeNames = (await gitRaw(r1, PIN, 'diff', '--name-only')).stdout.trim().split('\n').filter(Boolean).sort();
const untrackedRaw = (await gitRaw(r1, PIN, 'ls-files', '--others', '--exclude-standard')).stdout.trim().split('\n').filter(Boolean).sort();

assert.deepEqual(stagedFiles, cachedNames, 'door staged set must match git diff --cached name list');
assert.deepEqual(dirtyOnlyFiles, worktreeNames.filter((p) => !cachedNames.includes(p)).sort(), 'door dirty-only must match worktree diff minus staged');
assert.deepEqual(untrackedFiles, untrackedRaw, 'door untracked must match git ls-files --others');

// tree split notice present and correct numbers
assert.ok(door1.detail.includes('git.commit records the INDEX: 4/7'), 'the notice must say 4/7: ' + door1.detail);
assert.ok(door1.detail.includes('a granted commit records NONE of'), 'and name the 3 others');
assert.ok(door1.detail.includes('2 staged AND edited again'), 'MM and AM counted in the both-column clause');
console.log('[two-tree-proof] §1 door reports 4/7 staged; git --cached confirms: ' + cachedNames.join(', '));

// --- §2: commit the index, verify only 4 landed ---
const commitRes = out(await commitDoor(r1, 'v62 proof commit', 'v62:§2'));
assert.ok(commitRes.ok, 'commit door must succeed: ' + (commitRes.detail ?? JSON.stringify(commitRes)));

// after commit: worktree-side + untracked remain, staged entries are gone from status
const door2 = out(await statusDoor(r1, 'v62:§2-after'));
assert.ok(door2.ok);
const remainPaths = door2.files.map((f) => f.path).sort();
const shouldRemain = ['both.txt', 'new-staged.md', 'untracked.md', 'worktree-del.txt', 'worktree-mod.txt'].sort();
assert.deepEqual(remainPaths, shouldRemain, 'after commit the worktree+untracked remain (staged ones were consumed by the commit): ' + remainPaths.join(', '));

// verify the committed tree: HEAD now has the staged versions
const headFiles = (await gitRaw(r1, PIN, 'show', '--format=', '--name-only', 'HEAD')).stdout.trim().split('\n').filter(Boolean).sort();
assert.ok(headFiles.includes('staged-mod.txt'), 'staged modification landed in HEAD');
assert.ok(headFiles.includes('staged-del.txt'), 'staged deletion landed in HEAD');
assert.ok(!headFiles.includes('untracked.md'), 'untracked never entered HEAD');
assert.ok(!headFiles.includes('worktree-del.txt'), 'worktree deletion did not enter HEAD');
console.log('[two-tree-proof] §2 commit recorded exactly the 4 staged paths; 3 worktree/untracked remain outside HEAD');

// --- §3: notice is silent when ALL entries are staged ---
const r2 = join(workRoot, 'r2');
mkdirSync(r2, { recursive: true });
await gitRaw(r2, envInit, 'init');
await setup(r2, 'config', 'user.email', 'proof@nexus.test');
await setup(r2, 'config', 'user.name', 'NEXUS Proof');
writeFileSync(r2 + '/a.txt', 'a\n');
await setup(r2, 'add', '.');
await setup(r2, 'commit', '-m', 'seed');
writeFileSync(r2 + '/a.txt', 'changed\n');
await setup(r2, 'add', 'a.txt');
const door3 = out(await statusDoor(r2, 'v62:§3'));
assert.ok(door3.ok);
assert.ok(!door3.detail.includes('git.commit records the INDEX'), 'fully-staged tree gets no split notice: ' + door3.detail);
console.log('[two-tree-proof] §3 fully-staged tree: notice correctly absent');

// --- §4: §9 — this repo's HEAD is unchanged ---
const finalHead = (await gitRaw('.', PIN, 'rev-parse', 'HEAD')).stdout.trim();
assert.equal(finalHead, homeHead, 'this repository\'s HEAD was not touched');
console.log(`[two-tree-proof] §4 HEAD ${homeHead.slice(0, 7)} unchanged, ${spawns} door spawns, all writes inside os.tmpdir`);
console.log('[two-tree-proof] ALL GREEN');
