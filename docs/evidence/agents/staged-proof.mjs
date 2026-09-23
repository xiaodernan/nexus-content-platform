// NEXUS M2 v43 (exec-host) — STAGED-INTENT proof (ADR 0016 amendment 43).
// v35 lets a §28-approved run commit, and §9 keeps STAGING a human act — so the thing the
// agent records is exactly what a human put in the index. Problem: v32's read-only door
// cannot see the index at all. Plain `git diff` compares the working tree TO the index, so a
// staged change reads as NOTHING there. This proof measures that gap against real git in a
// throwaway os.tmpdir repo, opens the window (`git diff --cached`), and then shows the two
// doors are complementary rather than redundant: the same file, staged and then edited again,
// appears in BOTH diffs with DIFFERENT lines. Finally it checks the arc's bookkeeping — the
// intent read BEFORE the commit is byte-identical to the content read AFTER it (v42's door),
// and the edit nobody staged is stated as not-recorded instead of quietly vanishing.
// Run after `npm run build`:  node docs/evidence/agents/staged-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry, planExec } = rt;
const {
  NODE_SPAWN,
  createExecHost,
  gitCommitPolicy,
  gitEnv,
  gitReadOnlyPolicy,
  gitShowPolicy,
  gitStagedPolicy,
  parseStagedDiff,
  registerGitCommitTool,
  registerGitShowTool,
  registerGitStagedTool,
  registerGitTools,
  tallyStagedCounts,
} = eh;

// 1) PURE DATA FIRST: two argv shapes, and the option-widenings that would change what git
//    can DO (not just what it prints) named and refused on the record.
const stagedPolicy = gitStagedPolicy('X:/repo');
for (const argv of [['git', 'diff', '--cached'], ['git', 'diff', '--cached', '--stat']]) {
  assert.equal(planExec({ argv }, stagedPolicy).ok, true, `${argv.join(' ')} is the shape we allow`);
}
for (const argv of [
  ['git', 'diff'], // v32's door — this one is about the INDEX
  ['git', 'diff', '--cached', 'README.md'], // a path is a scoping surface, not on the menu
  ['git', 'diff', '--cached', '--name-only'],
  ['git', 'diff', '--cached', '--ext-diff'], // git EXECUTES a configured helper: code running in a read-only costume
  ['git', 'diff', '--cached', '--textconv'], // same trick through gitattributes filters
  ['git', 'diff', '--cached', '--output=X:/repo/pwn.txt'], // a "read" that WRITES a file
  ['git', 'diff', '--cached', '--stat', '--ext-diff'],
  ['git', '-c', 'diff.external=evil', 'diff', '--cached'],
  ['git', 'add', '.'], // staging stays a HUMAN act and appears in no policy here
  ['git', 'commit', '-m', 'x'], // v35's write door
  ['git', 'show', '--format=', '--', 'a.md'], // v42's content door
]) {
  const d = planExec({ argv }, stagedPolicy);
  assert.equal(d.ok, false, `${argv.join(' ')} must be default-denied`);
  assert.match(d.reason, /default-deny/);
}
// Kinds come from git's own metadata lines, and an empty index is a stated zero (§60).
const canned = parseStagedDiff('diff --git a/x.md b/x.md\nnew file mode 100644\n--- /dev/null\n+++ b/x.md\n@@ -0,0 +1 @@\n+hello\n');
assert.deepEqual(canned.files[0], { path: 'x.md', change: 'added', hunks: 1, additions: 1, deletions: 0, addedLines: ['hello'], binary: false });
assert.deepEqual(parseStagedDiff('').files, [], 'no diff text means no changes, not an unknown one');
assert.equal(tallyStagedCounts({ deleted: 1, added: 2 }), '2 added, 1 deleted', 'the sentence is in canonical order, not object order');
console.log('[staged-proof] policy data: 2 pinned shapes allowed; 11 widenings refused (incl. --ext-diff/--textconv/--output); parser kinds pure-checked');

// 2) THE REAL ARC against REAL git (§9: writes only inside os.tmpdir).
const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dir = mkdtempSync(join(tmpdir(), 'nexus-staged-'));
const posixDir = dir.replace(/\\/g, '/');
try {
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', dir]);
  git('config', 'user.name', 'NEXUS Staged Proof');
  git('config', 'user.email', 'proof@nexus.invalid');
  git('config', 'core.hooksPath', '.no-hooks'); // neutralized INSIDE the temp repo only
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false'); // the bytes we stage are the bytes git records
  writeFileSync(join(dir, 'README.md'), 'human seed\n');
  git('add', 'README.md');
  git('commit', '-q', '-m', 'chore: human seed commit');

  const spawns = [];
  const counting = (command, args, opts) => {
    spawns.push(args.join(' '));
    return NODE_SPAWN(command, args, opts);
  };
  // Four capabilities, four confined hosts, four policies — one door per argv family.
  const diffHost = createExecHost(gitReadOnlyPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting });
  const stagedHost = createExecHost(gitStagedPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting });
  const commitHost = createExecHost(gitCommitPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting });
  const showHost = createExecHost(gitShowPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting });
  let registry = new ToolRegistry();
  registry = registerGitTools(registry, diffHost, { env: gitEnv() });
  registry = registerGitStagedTool(registry, stagedHost, { env: gitEnv() });
  registry = registerGitCommitTool(registry, commitHost, { env: gitEnv() });
  registry = registerGitShowTool(registry, showHost, { env: gitEnv() });

  // §28 face: a human who reads each request and keeps a receipt of what they answered.
  const gates = [];
  const human = ({ call, permissions }) => {
    gates.push(`${call.tool}:${permissions.join('/')}`);
    return true;
  };

  // THE HUMAN ACT: a person writes and STAGES the content the agent is about to be asked to record.
  const INTENT = ['intent: add widget docs', 'line with "quotes" and  double spaces', 'NOTE (DEMO MODE · seed 42): staged by a human, not by the agent'];
  const writeIntent = (extra) => writeFileSync(join(dir, 'intent.md'), `${[...INTENT, ...(extra ? [extra] : [])].join('\n')}\n`);
  writeIntent(false);
  git('add', 'intent.md');
  const indexBytes = git('show', ':intent.md'); // what the INDEX holds, read the way a human would
  assert.equal(indexBytes, `${INTENT.join('\n')}\n`, 'sanity: the human staged exactly these bytes');

  // 2a) THE GAP, MEASURED: v32's door is blind to it, this door is not.
  const blind = await registry.invoke({ callId: 'd1', tool: 'git.diff', args: {} }, { checkpoint: human });
  assert.equal(blind.output.ok, true, 'git.diff succeeded — and said nothing about the staged change');
  assert.equal(blind.output.totals.files, 0, 'a staged change is INVISIBLE to plain `git diff` (working tree vs index): this is the gap v43 opens');
  const seen = await registry.invoke({ callId: 'd2', tool: 'git.staged', args: {} }, { checkpoint: human });
  assert.equal(seen.ok, true, seen.error);
  assert.deepEqual(seen.output.paths, ['intent.md'], 'the index names its own one change');
  assert.equal(seen.output.files[0].change, 'added', 'git said `new file mode`: the intent is to ADD');
  assert.deepEqual(seen.output.files[0].addedLines, INTENT, 'and the lines it will record are read back VERBATIM — quotes, double spaces, the §60 banner');
  assert.equal(`${seen.output.files[0].addedLines.join('\n')}\n`, indexBytes, 're-joining them reproduces the INDEX bytes, not the working file, not our hopes');
  assert.equal(spawns[1], 'diff --cached', 'git saw exactly the pinned argv');
  assert.equal(seen.output.detail, 'git.staged → exit 0: index holds 1 change(s): 1 added · +3 −0 across 1 hunk(s)');
  console.log(`[staged-proof] REAL: git.diff sees ${blind.output.totals.files} file(s) while git.staged reads 1 added change with ${seen.output.files[0].addedLines.length} verbatim lines — the gap exists and is now closed`);

  // 2b) TWO WINDOWS, NOT ONE: the same file, staged once then edited again, shows DIFFERENT
  //     lines through the two doors. If they were redundant, this is where it would break.
  const UNSTAGED = 'left for the human to stage';
  writeIntent(UNSTAGED);
  const afterEditStaged = await registry.invoke({ callId: 'd3', tool: 'git.staged', args: {} }, { checkpoint: human });
  const afterEditWork = await registry.invoke({ callId: 'd4', tool: 'git.diff', args: {} }, { checkpoint: human });
  assert.deepEqual(afterEditStaged.output.files[0].addedLines, INTENT, 'the index is unchanged by a working-tree edit: same intent, same lines');
  assert.equal(afterEditWork.output.totals.additions, 1, 'the working tree sees ONLY the new, unstaged line');
  assert.ok(afterEditWork.output.files.some((f) => f.path === 'intent.md' && f.additions === 1), 'the unstaged line is visible through v32\'s door…');
  assert.ok(!afterEditStaged.output.text.includes(UNSTAGED), '…and correctly absent from this one — the doors answer different questions');
  console.log('[staged-proof] REAL: one file, two windows — git.diff sees the unstaged +1, git.staged still sees the 3 staged lines');

  // 2c) THE COMMIT RECORDS THE INDEX, NOT THE EDIT: §9's staging rule, checked by reading.
  const commit = await registry.invoke({ callId: 'd5', tool: 'git.commit', args: { message: 'docs(agent): record the human-staged intent' } }, { checkpoint: human });
  assert.equal(commit.ok, true, commit.error);
  assert.equal(commit.output.record.stat.files, 1, 'one file moved into history: the staged one');
  const afterCommit = await registry.invoke({ callId: 'd6', tool: 'git.staged', args: {} }, { checkpoint: human });
  assert.deepEqual(afterCommit.output.files, [], 'the window is LIVE: what the commit recorded has left the index');
  assert.match(afterCommit.output.detail, /the index is EMPTY — nothing is staged, so a granted git\.commit right now would have nothing to record/, 'and an empty index is stated in the words the agent needs BEFORE asking for a commit');
  const shown = await registry.invoke({ callId: 'd7', tool: 'git.show', args: { path: 'intent.md' } }, { checkpoint: human });
  assert.deepEqual(shown.output.addedLines, INTENT, 'THE ARC CLOSES: the intent read BEFORE the commit is byte-identical to the content read AFTER it — two doors, one truth');
  assert.ok(!shown.output.addedLines.includes(UNSTAGED), 'the unstaged edit is NOT in history — stated by its absence here and by git.diff below, never silently dropped');
  const stillUnstaged = await registry.invoke({ callId: 'd8', tool: 'git.diff', args: {} }, { checkpoint: human });
  assert.equal(stillUnstaged.output.totals.additions, 1, 'it is still sitting in the working tree for the human to stage');
  console.log(`[staged-proof] REAL: commit ${commit.output.record.hash} recorded the 3 staged lines; the unstaged line stayed out and git.staged now says EMPTY`);

  // 2d) THE HUMAN STAGES THE REST: the kind flips as history says, and --stat answers too.
  git('add', 'intent.md');
  const stat = await registry.invoke({ callId: 'd9', tool: 'git.staged', args: { stat: true } }, { checkpoint: human });
  assert.equal(spawns[spawns.length - 1], 'diff --cached --stat', 'stat mode asks the SECOND pinned argv, and only that one');
  assert.deepEqual(stat.output.summary, { files: 1, insertions: 1, deletions: 0 }, 'git\'s own footer, parsed not paraphrased');
  const secondRound = await registry.invoke({ callId: 'd10', tool: 'git.staged', args: {} }, { checkpoint: human });
  assert.equal(secondRound.output.files[0].change, 'modified', 'the file exists in HEAD now, so the same staged line is a MODIFICATION — kind follows git\'s metadata, not our memory');
  assert.deepEqual(secondRound.output.files[0].addedLines, [UNSTAGED], 'and the intent of this round is exactly the line the human just staged');
  assert.equal(secondRound.output.detail, 'git.staged → exit 0: index holds 1 change(s): 1 modified · +1 −0 across 1 hunk(s)');
  console.log('[staged-proof] REAL: --stat footer parsed, and the same path reads as `modified` once it has a HEAD to differ from');

  // 2e) DENIAL, ESCAPE, AND THE ABSENCE OF A HANDLE.
  const before = spawns.length;
  const denied = await registry.invoke({ callId: 'd11', tool: 'git.staged', args: {} }, { checkpoint: ({ call }) => call.tool !== 'git.staged' });
  assert.equal(denied.ok, false);
  assert.match(denied.error, /denied at checkpoint \(exec\)/);
  assert.equal(spawns.length, before, 'a vetoed intent read costs ZERO processes — §28 speaks before git does');
  const escape = await registry.invoke({ callId: 'd12', tool: 'git.staged', args: { cwd: '../outside' } }, { checkpoint: human });
  assert.equal(escape.ok, false);
  assert.match(escape.error, /cwd refused/, 'a read is still jailed to the policy root');
  const noHandle = await registry.invoke({ callId: 'd13', tool: 'git.staged', args: { path: 'HEAD~1:intent.md' } }, { checkpoint: human });
  assert.equal(noHandle.ok, false);
  assert.match(noHandle.error, /unknown arg "path"/, 'the door has no handle for a revision: the spec itself refuses an argument it never declared, before the policy is even consulted');
  assert.equal(spawns.length, before, 'refusals by spec, jail and checkpoint all spawn nothing');
  assert.equal(git('rev-list', '--count', 'HEAD').trim(), '2', 'and no refusal of any kind moved history');

  // 2f) §28 IS PER-CAPABILITY: four reads, four writes, four separate gate lines.
  assert.deepEqual(gates, ['git.diff:exec', 'git.staged:exec', 'git.staged:exec', 'git.diff:exec', 'git.commit:exec', 'git.staged:exec', 'git.show:exec', 'git.diff:exec', 'git.staged:exec', 'git.staged:exec', 'git.staged:exec'], 'every gate call is on the record, in order — and the spec-level refusal is NOT, because it never reached a checkpoint');
  assert.ok(spawns.every((a) => a === 'diff' || a === 'diff --stat' || a === 'diff --cached' || a === 'diff --cached --stat' || a.startsWith('commit -m ') || a.startsWith('show --format= -- ')), `every process born here was a pinned shape: ${JSON.stringify([...new Set(spawns)])}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
  assert.ok(!existsSync(dir), 'the throwaway repo is gone');
}
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: home repo HEAD byte-identical — all writes lived in os.tmpdir');
console.log('[staged-proof] ALL ASSERTIONS PASSED (the agent can read what a human meant to record, BEFORE it is recorded — and what actually landed, after)');
