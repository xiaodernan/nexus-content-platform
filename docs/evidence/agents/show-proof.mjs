// NEXUS M2 v42 (exec-host) — CONTENT read-back proof (ADR 0016 amendment 42).
// v37/v38 proved a run can confirm THAT a commit landed: a hash agreeing with git's own
// echo. A hash says "something was recorded". This proof closes the other half of the
// sentence — WHAT was recorded — by running the real arc against REAL git in a throwaway
// os.tmpdir repo: the human stages bytes, the §28-gated commit records them, git.log agrees
// on the hash, and git.show hands back the exact lines git kept, compared against what the
// human wrote (not against what we hope was written). Then it shows the same read-back
// refusing to be widened: another commit, another path, or nothing at all.
// Run after `npm run build`:  node docs/evidence/agents/show-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry, planExec } = rt;
const { NODE_SPAWN, createExecHost, gitCommitPolicy, gitEnv, gitLogPolicy, gitShowPolicy, registerGitCommitTool, registerGitLogTool, registerGitShowTool, validateShowPath, parseShowDiff } = eh;

// 1) PURE DATA FIRST: one argv shape, HEAD pinned BY OMISSION, one path token floating.
const showPolicy = gitShowPolicy('X:/repo');
for (const argv of [['git', 'show', '--format=', '--', 'notes/widget.md'], ['git', 'show', '--format=', '--', 'README.md'], ['git', 'show', '--format=', '--', '*']]) {
  assert.equal(planExec({ argv }, showPolicy).ok, true, `${argv.join(' ')} is the shape we allow`);
}
for (const argv of [
  ['git', 'show'], // no shape at all
  ['git', 'show', 'HEAD'], // unpinned: the commit header comes back
  ['git', 'show', '--format=', 'HEAD'], // a revision is being NAMED, not a path asked for
  ['git', 'show', '--format=', 'HEAD~1:README.md'], // blob syntax reaches into ANOTHER commit
  ['git', 'show', '--format=', '--', 'a.md', 'b.md'], // two paths = a wider question
  ['git', 'show', '--format=', '--', 'a.md', 'main'], // a ref is not absorbed
  ['git', 'log', '--oneline', '-n', '2'], // the hash read-back is v37's own policy
  ['git', 'commit', '-m', 'x'], // the write is v35's own policy
  ['git', 'add', '.'], // staging is a HUMAN act and appears in no policy of ours
]) {
  const d = planExec({ argv }, showPolicy);
  assert.equal(d.ok, false, `${argv.join(' ')} must be default-denied`);
  assert.match(d.reason, /default-deny/);
}
for (const bad of ['', '   ', 'notes\nwidget.md', '-stat', '/etc/passwd', 'C:\\Windows\\win.ini', '../outside.md', 'notes/../../x.md']) {
  assert.throws(() => validateShowPath(bad), `path ${JSON.stringify(bad)} is not a path in THIS repo`);
}
console.log('[show-proof] policy data: 1 pinned shape (HEAD by omission, one path float); 9 widened argvs + 8 junk paths refused');

// 2) THE REAL ARC: commit → hash confirmation → CONTENT confirmation, against real git (§9).
const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dir = mkdtempSync(join(tmpdir(), 'nexus-show-'));
const posixDir = dir.replace(/\\/g, '/');
try {
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', dir]);
  git('config', 'user.name', 'NEXUS Show Proof');
  git('config', 'user.email', 'proof@nexus.invalid');
  git('config', 'core.hooksPath', '.no-hooks'); // neutralized INSIDE the temp repo only
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false'); // the bytes we stage are the bytes git records
  mkdirSync(join(dir, 'notes'));
  writeFileSync(join(dir, 'README.md'), 'human seed\n');
  git('add', 'README.md');
  git('commit', '-q', '-m', 'chore: human seed commit');
  const rootHead = git('rev-parse', 'HEAD').trim();

  // THE HUMAN ACT: a person writes and stages the content the agent will later read back.
  const STAGED = ['widget notes', 'line with "quotes" and  double spaces', 'NOTE (DEMO MODE · seed 42): goal "add widget docs"'];
  writeFileSync(join(dir, 'notes', 'widget.md'), `${STAGED.join('\n')}\n`);
  git('add', 'notes/widget.md');
  const stagedBytes = readFileSync(join(dir, 'notes', 'widget.md'), 'utf8');

  const spawns = [];
  const counting = (command, args, opts) => {
    spawns.push(args.join(' '));
    return NODE_SPAWN(command, args, opts);
  };
  // Three capabilities, three confined hosts, three policies — each argv shape its own door.
  const commitHost = createExecHost(gitCommitPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting });
  const logHost = createExecHost(gitLogPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting });
  const showHost = createExecHost(gitShowPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting });
  let registry = new ToolRegistry();
  registry = registerGitCommitTool(registry, commitHost, { env: gitEnv() });
  registry = registerGitLogTool(registry, logHost, { env: gitEnv() });
  registry = registerGitShowTool(registry, showHost, { env: gitEnv() });

  // §28 face: a human who reads each request and keeps a receipt of what they answered.
  const gates = [];
  const human = ({ call, permissions }) => {
    gates.push(`${call.tool}:${permissions.join('/')}`);
    return true;
  };

  // 2a) touch → confirm-by-hash → confirm-by-content: three separately gated calls.
  const commit = await registry.invoke({ callId: 'c1', tool: 'git.commit', args: { message: 'feat(agent): verified run show-1 · seed 42' } }, { checkpoint: human });
  assert.equal(commit.ok, true, commit.error);
  assert.equal(commit.output.record.stat.files, 1, 'one file moved: the human-staged one');
  const log = await registry.invoke({ callId: 'c2', tool: 'git.log', args: { count: 2 } }, { checkpoint: human });
  assert.equal(log.output.commits[0].hash, commit.output.record.hash, 'v38: the hash echo still agrees');
  assert.notEqual(git('rev-parse', 'HEAD').trim(), rootHead, 'history moved off the human seed commit — and only the granted commit moved it');
  assert.equal(git('rev-list', '--count', 'HEAD').trim(), '2', 'seed + one agent commit, exactly');
  assert.equal(spawns.length, 2, 'two processes so far — a commit and a read-back, nothing extra');

  const show = await registry.invoke({ callId: 'c3', tool: 'git.show', args: { path: 'notes/widget.md' } }, { checkpoint: human });
  assert.equal(show.ok, true, show.error);
  assert.deepEqual(show.output.addedLines, STAGED, 'CONTENT read-back: the lines git recorded at HEAD are the lines the HUMAN staged — quotes, double spaces and the §60 banner included');
  assert.equal(`${show.output.addedLines.join('\n')}\n`, stagedBytes, 'and re-joining them reproduces the staged file byte for byte');
  assert.deepEqual([show.output.additions, show.output.deletions, show.output.hunks], [3, 0, 1], 'a file ADDED at HEAD: every line of it is an addition');
  assert.equal(show.output.detail, 'git.show → exit 0: HEAD changed notes/widget.md · +3 −0 across 1 hunk(s)');
  assert.deepEqual(gates, ['git.commit:exec', 'git.log:exec', 'git.show:exec'], 'every read-back is its own §28 gate — spawning is never a free pass');
  assert.equal(spawns[2], 'show --format= -- notes/widget.md', 'git saw exactly the pinned argv, in one token per argument');
  console.log(`[show-proof] REAL: commit ${commit.output.record.hash} → log agrees → git.show read back ${show.output.addedLines.length} staged lines (+3 −0), 3 gates, 3 spawns`);

  // 2b) A PARTIAL change is stated as partial — never passed off as the whole file (§60).
  writeFileSync(join(dir, 'notes', 'widget.md'), `${STAGED[0]}\ntouched by the agent run\n${STAGED[1]}\n${STAGED[2]}\n`);
  git('add', 'notes/widget.md');
  const second = await registry.invoke({ callId: 'c4', tool: 'git.commit', args: { message: 'docs(agent): touch one line' } }, { checkpoint: human });
  assert.equal(second.ok, true, second.error);
  const partial = await registry.invoke({ callId: 'c5', tool: 'git.show', args: { path: 'notes/widget.md' } }, { checkpoint: human });
  assert.deepEqual(partial.output.addedLines, ['touched by the agent run'], 'HEAD added ONE line; the read-back claims exactly one, not the file');
  assert.ok(!partial.output.addedLines.includes(STAGED[0]), 'unchanged context is NOT presented as content HEAD wrote');
  assert.equal(partial.output.deletions, 0);
  console.log('[show-proof] REAL: a 1-line change reads back as +1 −0 — the tool states its own scope instead of implying a file');

  // 2c) DENY the content read-back: history already landed and stands; the spawn never happens.
  const before = spawns.length;
  const denied = await registry.invoke({ callId: 'c6', tool: 'git.show', args: { path: 'notes/widget.md' } }, { checkpoint: ({ call }) => call.tool !== 'git.show' });
  assert.equal(denied.ok, false);
  assert.match(denied.error, /denied at checkpoint \(exec\)/);
  assert.equal(spawns.length, before, 'a vetoed read-back costs ZERO processes — §28 speaks before git does');
  assert.equal(git('rev-list', '--count', 'HEAD').trim(), '3', 'the two landed commits are unbothered by a later refusal (human seed + two agent commits)');

  // 2d) HONEST DATA for the two "nothing to show" shapes, and a rev token that cannot widen:
  //     git exits 0 and prints an EMPTY diff for a pathspec HEAD does not touch — the tool
  //     must report that as "nothing here", never as content and never as a crash (§60).
  const missing = await registry.invoke({ callId: 'c7', tool: 'git.show', args: { path: 'nope.md' } }, { checkpoint: human });
  assert.equal(missing.ok, true, 'the tool completed; git simply had nothing to say about this path');
  assert.equal(missing.output.ok, true);
  assert.equal(missing.output.exitCode, 0);
  assert.deepEqual(missing.output.addedLines, [], 'a path that exists in no commit yields NO lines — the tool does not invent content to fill the gap');
  assert.match(missing.output.detail, /git\.show → exit 0: HEAD touches nothing at nope\.md/);
  const sneaky = await registry.invoke({ callId: 'c8', tool: 'git.show', args: { path: 'HEAD:notes/widget.md' } }, { checkpoint: human });
  assert.deepEqual(sneaky.output.addedLines, [], 'after `--` a rev-looking token is a PATHSPEC: it matches nothing, so no other commit is reachable through the float');
  assert.ok(!sneaky.output.detail.includes('widget notes'), 'and the answer carries none of the content a widened `git show HEAD:<path>` would have printed — the SHAPE does the confining, not our good intentions');
  const escape = await registry.invoke({ callId: 'c9', tool: 'git.show', args: { path: 'notes/widget.md', cwd: '../outside' } }, { checkpoint: human });
  assert.equal(escape.ok, false);
  assert.match(escape.error, /cwd refused/, 'the jail still holds for a read: cwd is confined by the policy root, not by good manners');

  // 2e) THE PARSER IS THE TOOL'S OWN CODE (§8): real git bytes in, same answer out.
  const raw = execFileSync('git', ['-C', dir, 'show', '--format=', '--', 'notes/widget.md'], { encoding: 'utf8' });
  assert.deepEqual(parseShowDiff(raw, 'notes/widget.md').addedLines, ['touched by the agent run'], 'no second implementation — the proof and the tool read diff with the same function');
  assert.deepEqual(parseShowDiff('', 'notes/widget.md'), { path: 'notes/widget.md', hunks: 0, additions: 0, deletions: 0, addedLines: [], binary: false }, 'empty stdout is an honest empty change');
  const empty = await registry.invoke({ callId: 'c10', tool: 'git.show', args: { path: 'README.md' } }, { checkpoint: human });
  assert.equal(empty.output.detail, 'git.show → exit 0: HEAD touches nothing at README.md (empty diff — git recorded no change for this path in HEAD)');
  assert.equal(empty.output.addedLines.length, 0, 'a file in the repo but untouched by HEAD says so, instead of inventing content');

  assert.ok(spawns.every((a) => a.startsWith('commit -m ') || a.startsWith('log --oneline') || a.startsWith('show --format= -- ')), `every process born here was one of the three pinned shapes: ${JSON.stringify([...new Set(spawns.map((s) => s.split(' ')[0]))])}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
  assert.ok(!existsSync(dir), 'the throwaway repo is gone');
}
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: home repo HEAD byte-identical — all writes lived in os.tmpdir');
console.log('[show-proof] ALL ASSERTIONS PASSED (the run finishes its sentence: something landed AND this is what it says)');
