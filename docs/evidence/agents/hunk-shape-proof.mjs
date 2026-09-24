// NEXUS M2 v64 (exec-host) — A `+++` LINE IS A NAME ONLY BEFORE THE FIRST `@@`
// (ADR 0016 amendment 64).
// Three doors read a unified diff: `git.diff` (the worktree), `git.staged` (the index, i.e. the text a
// human is asked to approve at §28) and `git.show` (what HEAD recorded). All three were built on the
// same shape test — a line starting with `+++`/`---` is git naming a file, so it must not be counted —
// and none of them asked WHERE that line sits. git prints the pair exactly once per file section, in the
// preamble; inside a hunk every line is content, and content that merely begins with `++` or `--` arrives
// wearing the pair's shape: a file that gains the line `++ b/second.md` shows it as `+++ b/second.md`.
// Measured on this box before the amendment (worktree: `code.ts` loses a line reading `-- a/ghost.ts`,
// `notes.md` gains `++ b/second.md`, `plain.txt` gains `+++ b/fake-from-an-addition`): git's own shortstat
// says `3 files changed, 2 insertions(+), 1 deletion(-)` and `git.diff` answered `3 files, +0 −0 (3 hunks)`
// — and named its second entry `second.md`, a path that exists nowhere. The same rule over the same-shaped
// INDEX made `git.staged` hand the §28 reviewer `index holds 2 change(s): 2 modified · +0 −0` with paths
// `code.ts, second.md` and an EMPTY `addedLines`: it withheld from a human the one line the commit would
// add, under a filename the commit would not touch.
// This proof does not take the fixed sentence on trust either. Every number is compared with git's OWN
// machinery — `diff --numstat -z`, `--name-only -z`, `--shortstat`, `show --numstat` — never with this
// file's expectations: §1 the worktree door, §2 the index door and the text it now shows, §3 the replaced
// rule transcribed and run over the same bytes (so the finding survives a future rewrite of the source), §4
// one REAL commit through the commit door, read back through `git.show`, §5 the pair still NAMES where it
// is still a pair (a rename whose `diff --git` header split a ` b/` steals, and a new file's `/dev/null`
// pre-image) — and names it EXACTLY as git spelled it, which means cutting the TAB git puts after a name
// containing a space (§5 witnesses that line byte-for-byte), §6 the rule is wired at every reader this
// package has.
// §9 holds: throwaway repos under os.tmpdir, hooks/signing neutralized LOCALLY there, staging done by this
// proof playing the human, the one commit made by the door, and this repository's HEAD compared byte-wise.
// Run after `npm run build`:  node docs/evidence/agents/hunk-shape-proof.mjs
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry } = rt;
const {
  GIT_DIFF_FLAGS,
  createExecHost,
  gitCommitPolicy,
  gitEnv,
  gitReadOnlyPolicy,
  gitShowPolicy,
  gitStagedPolicy,
  parseDiffHeader,
  parseFileLine,
  registerGitCommitTool,
  registerGitShowTool,
  registerGitStagedTool,
  registerGitTools,
} = eh;

const PIN = gitEnv({});
const raw = (dir, ...argv) =>
  new Promise((resolve) => {
    execFile('git', argv, { cwd: dir, env: { ...PIN, GIT_CONFIG_NOSYSTEM: '1' }, encoding: 'utf8', maxBuffer: 1 << 23 }, (err, stdout, stderr) => {
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

async function setup(dir, ...argv) {
  const r = await raw(dir, ...argv);
  if (r.code !== 0) throw new Error(`setup ${argv.join(' ')} → ${r.code}: ${r.stderr}`);
  return r;
}

const lines = (s) => s.split('\n').filter((l) => l.trim() !== '');
const homeHead = (await raw('.', 'rev-parse', 'HEAD')).stdout.trim();
let spawns = 0;
const counting = (cmd, args, opts) => {
  spawns += 1;
  return eh.NODE_SPAWN(cmd, args, opts);
};

const seed = async (dir) => {
  await setup(dir, 'init', '-q', '-b', 'main');
  await setup(dir, 'config', 'user.email', 'proof@nexus.test');
  await setup(dir, 'config', 'user.name', 'NEXUS Proof');
  await setup(dir, 'config', 'commit.gpgsign', 'false');
  await setup(dir, 'config', 'core.hooksPath', join(dir, '.nohooks'));
};
const w = (dir, name, text) => writeFileSync(join(dir, name), (Array.isArray(text) ? text.join('\n') : text) + '\n');

/**
 * git's OWN census of a diff — the flags the door uses, the totals it must match. `-z` is what makes this
 * census usable at all on a rename: without it git joins a rename's two names with ` => ` (measured:
 * `1\t0\tx.md => m b/n.md`), a key this file would have to rebuild by guessing. With `-z` an entry is
 * `add \t del \t path` NUL-terminated, and a rename's path field is EMPTY, its pre- and post-image names
 * the next two NUL-terminated fields (measured: `2\t0\tfresh.md\0 1\t0\t\0 x.md\0 m b/n.md\0`).
 */
async function census(dir, extra) {
  const z = (await setup(dir, 'diff', ...GIT_DIFF_FLAGS, ...extra, '--numstat', '-z')).stdout.split('\0').filter((f) => f !== '');
  const rows = [];
  for (let i = 0; i < z.length; i += 1) {
    const [a, d, p = ''] = z[i].split('\t');
    if (p === '') { rows.push({ path: z[i + 2], add: Number(a), del: Number(d) }); i += 2; } // a rename: empty path, then BOTH names
    else rows.push({ path: p, add: Number(a), del: Number(d) });
  }
  const map = new Map(rows.map((r) => [r.path, r]));
  const names = (await setup(dir, 'diff', ...GIT_DIFF_FLAGS, ...extra, '--name-only', '-z')).stdout.split('\0').filter((n) => n !== '');
  const tally = (await setup(dir, 'diff', ...GIT_DIFF_FLAGS, ...extra, '--shortstat')).stdout.trim();
  return { map, names, add: rows.reduce((t, r) => t + r.add, 0), del: rows.reduce((t, r) => t + r.del, 0), files: rows.length, tally };
}

const doorOut = async (registry, tool, args, callId) => {
  const res = await registry.invoke({ callId, tool, args }, { checkpoint: () => true });
  const o = res.output ?? res.error;
  if (o?.ok !== true) throw new Error(`${tool} refused: ${JSON.stringify(o)}`);
  return o;
};
const big = 1 << 20; // a budget no fixture here reaches, so §1-§5 are whole reads, not windows (v63)
const diffDoor = (dir, callId) => doorOut(registerGitTools(new ToolRegistry(), createExecHost(gitReadOnlyPolicy(dir, { maxOutputBytes: big }), { spawnLike: counting }), { env: {} }), 'git.diff', {}, callId);
const stagedDoor = (dir, callId) => doorOut(registerGitStagedTool(new ToolRegistry(), createExecHost(gitStagedPolicy(dir, { maxOutputBytes: big }), { spawnLike: counting }), { env: {} }), 'git.staged', {}, callId);
const showDoor = (dir, path, callId) => doorOut(registerGitShowTool(new ToolRegistry(), createExecHost(gitShowPolicy(dir, { maxOutputBytes: big }), { spawnLike: counting }), { env: {} }), 'git.show', { path }, callId);
const commitDoor = (dir, message, callId) => doorOut(registerGitCommitTool(new ToolRegistry(), createExecHost(gitCommitPolicy(dir), { spawnLike: counting }), { env: {} }), 'git.commit', { message }, callId);

// --- the repository: three changes whose OWN TEXT starts with `++`/`--` ------------------------------
const r1 = mkTmp('nexus-v64-hunk');
await seed(r1);
w(r1, 'code.ts', ['a', '-- a/ghost.ts', 'b']);
w(r1, 'notes.md', ['head', 'tail']);
w(r1, 'plain.txt', ['one', 'two']);
await setup(r1, 'add', '.');
await setup(r1, 'commit', '-q', '-m', 'seed');
w(r1, 'code.ts', ['a', 'b']); // one DELETION whose text starts with `--`
w(r1, 'notes.md', ['head', '++ b/second.md', 'tail']); // one ADDITION whose text starts with `++`
w(r1, 'plain.txt', ['one', 'two', '+++ b/fake-from-an-addition']); // one ADDITION whose text starts with `+++`

const body = (await setup(r1, 'diff', ...GIT_DIFF_FLAGS)).stdout;
assert.ok(body.includes('+++ b/second.md'), 'git rendered the added line as `+++ b/second.md` — the trap must be live, not assumed');
assert.ok(body.includes('--- a/ghost.ts'), 'git rendered the deleted line as `--- a/ghost.ts`');
assert.ok(body.includes('++++ b/fake-from-an-addition'), 'and the four-plus line is git adding a line that begins `+++`');
const c1 = await census(r1, []);
assert.deepEqual([c1.files, c1.add, c1.del], [3, 2, 1], `git's own census of this worktree is the shortstat quoted above: ${c1.tally}`);

// --- §1 the worktree door answers WITH git, not against itself --------------------------------------
const d1 = await diffDoor(r1, 'v64:§1');
assert.deepEqual(d1.files.map((f) => f.path).sort(), [...c1.names].sort(), `every path the door names is a path git printed: ${JSON.stringify(d1.files.map((f) => f.path))}`);
assert.ok(!d1.files.some((f) => ['second.md', 'ghost.ts', 'fake-from-an-addition'].includes(f.path)), 'the door invented NONE of the names that live INSIDE these files as text');
for (const f of d1.files) {
  const g = c1.map.get(f.path);
  assert.deepEqual([f.additions, f.deletions], [g.add, g.del], `git's numstat says ${f.path} +${g.add} −${g.del}, the door says +${f.additions} −${f.deletions}`);
}
assert.deepEqual(d1.totals, { files: c1.files, hunks: d1.totals.hunks, additions: c1.add, deletions: c1.del }, `the door's tally must equal git's ${c1.tally}`);
assert.ok(d1.detail.includes(`${c1.files} files, +${c1.add} −${c1.del}`), d1.detail);
console.log(`[hunk-shape] §1 git ${JSON.stringify(c1.tally)} → door: ${d1.detail}`);

// --- §2 the INDEX door, which is the text a human approves at §28 -----------------------------------
await setup(r1, 'add', 'code.ts', 'notes.md', 'plain.txt');
const c2 = await census(r1, ['--cached']);
const s2 = await stagedDoor(r1, 'v64:§2');
assert.deepEqual(s2.files.map((f) => f.path).sort(), [...c2.names].sort(), `the index door names git's paths, not its own inventions: ${JSON.stringify(s2.files.map((f) => f.path))}`);
assert.deepEqual([s2.totals.files, s2.totals.additions, s2.totals.deletions], [c2.files, c2.add, c2.del], `the §28 sentence must carry git's counts: ${s2.detail}`);
const notes = s2.files.find((f) => f.path === 'notes.md');
assert.deepEqual(notes.addedLines, ['++ b/second.md'], 'the reviewer sees the line it is being asked to approve — the one line a prefix rule throws away');
console.log(`[hunk-shape] §2 git ${JSON.stringify(c2.tally)} → door: ${s2.detail} · addedLines ${JSON.stringify(notes.addedLines)}`);

// --- §3 the replaced rule, transcribed, over the SAME bytes -----------------------------------------
// This is the reader every door had before amendment 64: `parseFileLine` consulted ANYWHERE, and `+`
// counted unless the line started with `+++`. `git log -S` finds the commit that wrote it; §6 below is
// what pins that the shipped source no longer runs it.
function preV64(text) {
  const files = [];
  let current = null;
  for (const line of text.split('\n')) {
    const h = parseDiffHeader(line);
    if (h) {
      current = { path: h.to, additions: 0, deletions: 0 };
      files.push(current);
      continue;
    }
    if (!current) continue;
    const named = parseFileLine(line);
    if (named) {
      current.path = named.path;
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) current.additions += 1; // ← the rule v64 replaced
    else if (line.startsWith('-') && !line.startsWith('---')) current.deletions += 1;
  }
  return { paths: files.map((f) => f.path), add: files.reduce((a, f) => a + f.additions, 0), del: files.reduce((a, f) => a + f.deletions, 0) };
}
const old3 = preV64(body);
assert.deepEqual([old3.add, old3.del], [0, 0], `the transcription of the old rule still reads git's ${c1.tally} as +0 −0 — that is the bug, witnessed`);
assert.ok(old3.paths.includes('second.md'), `and it renames a file to text that was inside it: ${JSON.stringify(old3.paths)}`);
assert.ok(!old3.paths.includes('notes.md'), 'notes.md disappeared from the old reader entirely');
const found = await raw('.', 'log', '--format=%h', '-S', "!line.startsWith('+++')", '--', 'agents/exec-host/src/gitTools.ts');
assert.ok(lines(found.stdout).length >= 1, `history must hold the commit that WROTE that predicate: ${JSON.stringify(lines(found.stdout))}`);
console.log(`[hunk-shape] §3 old rule over the same bytes: ${JSON.stringify(old3)} vs git +${c1.add} −${c1.del}; ${lines(found.stdout).length} commit(s) in history changed that predicate (${lines(found.stdout).join(' ')})`);

// --- §4 one REAL commit through the door, read back through git.show --------------------------------
const made = await commitDoor(r1, 'v64 hunk-proof: the three ++/-- changes', 'v64:§4:commit');
assert.ok(made.detail.includes(`${c2.files} file(s) +${c2.add} −${c2.del}`), `the commit itself reports git's census, not the door's: ${made.detail}`);
const shown = await showDoor(r1, 'notes.md', 'v64:§4:show');
const showNs = lines((await setup(r1, 'show', '--numstat', '--format=', 'HEAD', '--', 'notes.md')).stdout).map((l) => l.split('\t'))[0];
assert.ok(showNs, 'git itself says HEAD touched this path');
assert.deepEqual([shown.additions, shown.deletions], [Number(showNs[0]), Number(showNs[1])], `git's own numstat for HEAD at notes.md is +${showNs[0]} −${showNs[1]}: ${shown.detail}`);
assert.deepEqual(shown.addedLines, ['++ b/second.md'], 'the commit door recorded the line and the show door hands it back whole');
console.log(`[hunk-shape] §4 ${made.detail} → ${shown.detail}`);

// --- §5 the pair still NAMES where it is still a pair ------------------------------------------------
const r2 = mkTmp('nexus-v64-names');
await seed(r2);
w(r2, 'x.md', ['one', 'two']);
await setup(r2, 'add', '.');
await setup(r2, 'commit', '-q', '-m', 'seed');
mkdirSync(join(r2, 'm b'), { recursive: true });
await setup(r2, 'mv', 'x.md', join('m b', 'n.md')); // a directory whose name contains ` b/`: the header split is ambiguous
w(r2, join('m b', 'n.md'), ['one', 'two', 'three']); // …and the section still carries a real pair
w(r2, 'fresh.md', ['++ b/copied.md', 'tail']); // a NEW file: pre-image is /dev/null, content starts with `++`
await setup(r2, 'add', '.');
const c5 = await census(r2, ['--cached']);
const s5 = await stagedDoor(r2, 'v64:§5');
assert.deepEqual(s5.files.map((f) => f.path).sort(), [...c5.names].sort(), `v61's per-line name still wins: ${JSON.stringify(s5.files.map((f) => f.path))}`);
// and the name git printed is the name the door hands out — TAB included on our side of it
const nameLine = (await setup(r2, 'diff', ...GIT_DIFF_FLAGS, '--cached')).stdout.split('\n').find((l) => l.startsWith('+++ b/m b/'));
assert.ok(nameLine, 'git prints a per-line name for the spaced path it just renamed');
assert.ok(nameLine.endsWith('\t'), `git's own name line for a path containing a space ENDS WITH A TAB: ${JSON.stringify(nameLine)} — git's header field separator, with nothing after it`);
assert.equal(parseFileLine(nameLine).path, 'm b/n.md', 'the reader cuts that separator, so the door path is a name that exists');
assert.ok(!s5.files.some((f) => f.path.includes('\t')), `no door path carries a tab: ${JSON.stringify(s5.files.map((f) => f.path))}`);
for (const f of s5.files) {
  const g = c5.map.get(f.path);
  assert.ok(g, `${f.path} is a path git's own -z census lists: ${JSON.stringify(c5.names)}`);
  assert.deepEqual([f.additions, f.deletions], [g.add, g.del], `${f.path}: git +${g.add} −${g.del}, door +${f.additions} −${f.deletions}`);
}
const fresh = s5.files.find((f) => f.path === 'fresh.md');
assert.deepEqual(fresh.addedLines, ['++ b/copied.md', 'tail'], 'a new file yields its WHOLE content, including a line that looks like a name');
assert.equal(fresh.change, 'added', `and the kind still comes from git's own metadata line, not from a prefix: ${JSON.stringify(fresh.change)}`);
console.log(`[hunk-shape] §5 git ${JSON.stringify(c5.tally)} → door: ${s5.detail} · git's name line ${JSON.stringify(nameLine)} → door path ${JSON.stringify(s5.files.find((f) => f.path === 'm b/n.md').path)} · fresh.md addedLines ${JSON.stringify(fresh.addedLines)}`);

// --- §6 every reader in this package is wired, and none kept the blanket exception -------------------
const src = Object.fromEntries(['gitTools.ts', 'gitStagedTool.ts', 'gitShowTool.ts'].map((f) => [f, readFileSync(join('agents', 'exec-host', 'src', f), 'utf8')]));
for (const [f, text] of Object.entries(src)) {
  assert.equal((text.match(/isDiffHeaderPairLine\(/g) ?? []).length, 1, `${f} calls the position rule exactly ONCE — not zero (unwired) and not twice (two rules)`);
  assert.ok(!text.includes("startsWith('+++')") && !text.includes("startsWith('---')"), `${f} still carries a bare +++/--- prefix test`);
}
assert.ok(src['gitTools.ts'].includes("!insideHunk && (line.startsWith('--- ') || line.startsWith('+++ '))"), 'the rule IS the position: `!insideHunk` guards the pair shape');
console.log('[hunk-shape] §6 gitTools.ts, gitStagedTool.ts, gitShowTool.ts — one call site each, no blanket prefix test left');

// --- §7 §9: this repository's HEAD is untouched ----------------------------------------------------
const finalHead = (await raw('.', 'rev-parse', 'HEAD')).stdout.trim();
assert.equal(finalHead, homeHead, "this repository's HEAD was not touched");
assert.ok(spawns >= 5, `every claim above came through a real door spawn (${spawns}: one git.diff, two git.staged, one git.commit, one git.show)`);
console.log(`[hunk-shape] §7 HEAD ${homeHead.slice(0, 7)} unchanged, ${spawns} door spawns, all writes inside os.tmpdir`);
console.log('[hunk-shape] ALL GREEN');
