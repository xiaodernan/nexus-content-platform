// NEXUS v45 (runtime) — staged intent IN THE PLAN proof (ADR 0016 amendment 45).
// v43 built the door (git.staged); this puts it in the PLAN, one step BEFORE the §28 ask to
// record what it reads. The REAL loop runs over FOUR keyed doors in a throwaway os.tmpdir
// repo, and the money assertion is a three-way agreement: the lines the run pulled out of the
// index BEFORE the commit are byte-equal the lines git.show hands back AFTER it, byte-equal
// what the HUMAN staged. Also proven: refusing the intent read stops the walk BEFORE the
// commit (zero spawns, history unmoved, nothing remembered), and an EMPTY index is stated in
// the run's own words one step ahead of git's blunt answer — which is why the remembered
// sentence now claims the ARC it walked and leaves "did anything land?" to git (§60).
// Run after `npm run build`:  node docs/evidence/agents/intent-proof.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from '../lib/syncproc.mjs';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const {
  ToolRegistry,
  InMemoryWorkspace,
  registerWorkspaceTools,
  registerMemoryTools,
  MemoryStore,
  planTask,
  predicateRunner,
  registerTestTools,
  runTask,
  appendLedger,
  loadLedger,
} = rt;
const {
  NODE_SPAWN,
  createExecHost,
  gitCommitPolicy,
  gitEnv,
  gitLogPolicy,
  gitShowPolicy,
  gitStagedPolicy,
  registerGitCommitTool,
  registerGitLogTool,
  registerGitShowTool,
  registerGitStagedTool,
} = eh;

// 1) PURE plan data: the index read rides INSIDE the commit block and IMMEDIATELY before it.
const intent = planTask({ id: 'in', goal: 'add widget docs' }, { hasVerify: true, hasCommit: true, hasStaged: true });
assert.deepEqual(intent.steps.map((s) => s.stepId), ['search', 'read', 'annotate', 'verify', 'staged', 'commit']);
assert.deepEqual(intent.steps.at(-2), {
  stepId: 'staged',
  tool: 'git.staged',
  args: { stat: false },
  rationale: 'read what the HUMAN staged — the intent the next step would record, read before it is recorded',
});
assert.equal(intent.steps.at(-1).tool, 'git.commit', 'the read is the step BEFORE the ask, never after it');
const everything = planTask({ id: 'in', goal: 'add widget docs' }, { hasVerify: true, hasCommit: true, hasStaged: true, hasConfirm: true, hasContent: true, hasRemember: true });
assert.deepEqual(
  everything.steps.map((s) => s.stepId),
  ['search', 'read', 'annotate', 'verify', 'staged', 'commit', 'confirm', 'inspect', 'remember'],
  'the whole v44 tail hangs off the commit; the intent read is the first of the git doors',
);
for (const opts of [{ hasVerify: true, hasStaged: true }, { hasStaged: true }, { hasCommit: true, hasStaged: true }]) {
  assert.ok(!planTask({ id: 'in', goal: 'add widget docs' }, opts).steps.some((s) => s.tool === 'git.staged'), 'no commit door ⇒ nobody is asked what nobody will record');
}
assert.deepEqual(
  planTask({ id: 'in', goal: 'add widget docs' }, { hasVerify: true, hasCommit: true, hasConfirm: true }),
  planTask({ id: 'in', goal: 'add widget docs' }, { hasVerify: true, hasCommit: true, hasConfirm: true, hasStaged: false }),
  'a host without the door keeps the v44 plan byte-for-byte',
);
console.log('[intent-proof] plan data: staged is the FIRST git door — inside the commit block, one step ahead of the §28 ask');

// 2) THE REAL LOOP over FOUR REAL sandbox doors in a throwaway repo (§9; deleted at the end).
const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dir = mkdtempSync(join(tmpdir(), 'nexus-intent-'));
const posixDir = dir.replace(/\\/g, '/');
const STAGED = ['widget notes', 'a second line with "quotes" and  double spaces', 'third line — the human wrote this'];
try {
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', dir]);
  git('config', 'user.name', 'NEXUS Intent Proof');
  git('config', 'user.email', 'proof@nexus.invalid');
  git('config', 'core.hooksPath', '.no-hooks'); // global codex hooks neutralized INSIDE the temp repo only
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false'); // the bytes the human stages are the bytes git records
  writeFileSync(join(dir, 'README.md'), 'human seed\n');
  git('add', 'README.md');
  git('commit', '-q', '-m', 'chore: human seed commit');
  const commitsAt = () => Number(git('rev-list', '--count', 'HEAD'));

  const spawns = [];
  const counting = (command, args, opts) => {
    spawns.push(args.join(' '));
    return NODE_SPAWN(command, args, opts);
  };
  // ONE registry, FOUR keyed doors — exactly what the orchestrator now detects as
  // hasStaged+hasCommit+hasConfirm+hasContent (+ hasRemember when a memory store is given).
  const stagedHost = createExecHost(gitStagedPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting });
  const commitHost = createExecHost(gitCommitPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting });
  const logHost = createExecHost(gitLogPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting });
  const showHost = createExecHost(gitShowPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting });
  const task = { id: 'in1', goal: 'add widget docs', targetPath: 'notes/widget.md' };
  const build = (marker, store) => {
    const ws = new InMemoryWorkspace({ 'notes/widget.md': 'widget notes\n' });
    let registry = registerWorkspaceTools(new ToolRegistry(), ws);
    registry = registerTestTools(registry, predicateRunner('intent-demo', [
      { name: 'marker-present', check: (files) => (Object.values(files).some((c) => c.includes(marker)) ? null : `no workspace file carries "${marker}"`) },
    ], () => ws.snapshot()));
    registry = registerGitStagedTool(registry, stagedHost, { env: gitEnv() });
    registry = registerGitCommitTool(registry, commitHost, { env: gitEnv() });
    registry = registerGitLogTool(registry, logHost, { env: gitEnv() });
    registry = registerGitShowTool(registry, showHost, { env: gitEnv() });
    if (store) registry = registerMemoryTools(registry, store, { scope: 'intent' });
    return registry;
  };
  const out = (run, tool) => run.results.filter((r) => r.tool === tool).at(-1).output;
  const stageWidget = (lines) => {
    mkdirSync(join(dir, 'notes'), { recursive: true });
    writeFileSync(join(dir, 'notes', 'widget.md'), `${lines.join('\n')}\n`);
    git('add', 'notes/widget.md');
  };

  // 2a) ALL GRANTED: the plan reads the index, then records it, then reads it back.
  stageWidget(STAGED);
  const gates = [];
  const store = new MemoryStore();
  const greenRun = await runTask(task, {
    registry: build('NOTE (DEMO', store),
    checkpoint: ({ call, permissions }) => {
      if (permissions.includes('exec')) gates.push(call.tool);
      return true;
    },
    maxFixRounds: 0,
  });
  assert.equal(greenRun.status, 'completed', `granted run must complete: ${JSON.stringify(greenRun.results.at(-1))}`);
  assert.equal(greenRun.plan.steps[0].tool, 'memory.recall', 'a §26 store is registered, so research routes through memory first (v2 priority) — cold, it returns nothing, and the arc still walks');
  assert.deepEqual(
    greenRun.results.map((r) => r.callId),
    ['in1:search', 'in1:read', 'in1:annotate', 'in1:verify', 'in1:staged', 'in1:commit', 'in1:confirm', 'in1:inspect', 'in1:remember'],
    'the plan\'s full arc executed in order, with the intent read as the FIRST git door',
  );
  assert.deepEqual(gates, ['test.run', 'git.staged', 'git.commit', 'git.log', 'git.show'], 'five §28 gates: the human answers the READ before the WRITE');
  const intentOut = out(greenRun, 'git.staged');
  assert.deepEqual(intentOut.paths, ['notes/widget.md'], 'the run saw WHICH file the human was about to record, before recording it');
  assert.deepEqual(intentOut.files[0].change, 'added', 'and as WHAT kind, in git\'s own metadata\'s words');
  const commitOut = out(greenRun, 'git.commit');
  const afterOut = out(greenRun, 'git.show');
  assert.deepEqual(intentOut.files[0].addedLines, STAGED, 'THE MONEY ASSERTION (1/2): the PLANNED pre-commit read returns, byte for byte, the lines the HUMAN staged');
  assert.deepEqual(afterOut.addedLines, STAGED, 'THE MONEY ASSERTION (2/2): the same lines come back from HEAD after the commit — intent BEFORE and content AFTER agree byte-for-byte, in ONE run, driven by the PLAN');
  assert.equal(commitOut.record.hash, greenRun.results.filter((r) => r.tool === 'git.log').at(-1).output.commits[0].hash, 'and the hash confirm between them still agrees (v38 untouched)');
  assert.equal(intentOut.detail, 'git.staged → exit 0: index holds 1 change(s): 1 added · +3 −0 across 1 hunk(s)', 'the read states its own tally');
  const stagedArgv = spawns[0].split(' ');
  assert.equal(stagedArgv[0], 'diff', 'the FIRST git process of the tail is a diff…');
  assert.ok(stagedArgv.includes('--cached'), '…pinned to the CACHED side, which is where the human\'s intent lives…');
  assert.ok(!stagedArgv.includes('notes/widget.md'), '…with NO pathspec — the read is the whole index, not one path the agent chose');
  assert.equal(commitsAt(), 2, 'human seed + this run — exactly one new commit');
  const remembered = store.list('intent');
  assert.equal(remembered.length, 1, 'the confirmed arc is what got remembered');
  assert.ok(String(remembered[0].summary).includes('ARC-COMPLETE'), 'the memory claims the ARC the plan walked…');
  assert.ok(!String(remembered[0].summary).includes('COMMITTED+CONFIRMED'), '…and no longer asserts a landing it never checked (2c proves why)');
  console.log(`[intent-proof] REAL: plan read ${STAGED.length} staged lines BEFORE the commit and the SAME lines AFTER it · ${gates.length} §28 gates, ${spawns.length} sandbox processes`);

  // 2b) DENIED INTENT READ: the walk stops BEFORE the commit — refusing to be shown is refusing.
  const spawnsAt = spawns.length;
  const commitsAtDenial = commitsAt();
  stageWidget([...STAGED, 'the human staged a second version']);
  const vetoStore = new MemoryStore();
  const vetoRun = await runTask(task, { registry: build('NOTE (DEMO', vetoStore), checkpoint: ({ call }) => call.tool !== 'git.staged', maxFixRounds: 0 });
  assert.equal(vetoRun.status, 'denied');
  assert.deepEqual(vetoRun.results.map((r) => r.tool), ['memory.recall', 'fs.read', 'fs.append', 'test.run', 'git.staged'], 'no commit, no confirm, no inspect, no remember — the read came first');
  assert.match(vetoRun.results.at(-1).error, /denied at checkpoint \(exec\)/);
  assert.equal(spawns.length, spawnsAt, 'a vetoed intent read costs ZERO processes — and so does everything behind it');
  assert.equal(commitsAt(), commitsAtDenial, 'history unmoved: the human who would not be shown never got asked to commit');
  assert.deepEqual(vetoStore.list('intent'), [], 'nothing was remembered, because nothing was walked');
  assert.deepEqual(git('diff', '--cached', '--name-only').trim().split('\n'), ['notes/widget.md'], 'and the staged intent is still there, unrecorded, exactly as the human left it (§9)');

  // 2c) EMPTY INDEX, FULL GRANT: the read says so in one sentence; the STATIC plan still asks
  //     the commit anyway (the demo planner has no conditionals — §60 limit, shown not hidden),
  //     and git's own answer is ok:false DATA while history stays exactly where it was.
  git('reset', '-q'); // the human un-stages: the index is empty, the working tree still differs
  const commitsAtEmpty = commitsAt();
  const emptyStore = new MemoryStore();
  const emptyRun = await runTask(task, { registry: build('NOTE (DEMO', emptyStore), checkpoint: () => true, maxFixRounds: 0 });
  const emptyIntent = out(emptyRun, 'git.staged');
  assert.equal(emptyIntent.detail, 'git.staged → exit 0: the index is EMPTY — nothing is staged, so a granted git.commit right now would have nothing to record', 'the PLAN read the gap before the ask, in git\'s own words');
  assert.deepEqual([emptyIntent.files, emptyIntent.paths], [[], []], 'zero files in the index, zero files claimed');
  const emptyCommit = out(emptyRun, 'git.commit');
  assert.equal(emptyCommit.ok, false, 'the write ran and git refused it — the refusal is DATA the run carries, not a crash');
  assert.equal(emptyCommit.exitCode, 1);
  assert.match(emptyCommit.detail, /^git\.commit → exit 1: no changes added to commit \(use "git add" and\/or "git commit -a"\) · git's last line of the \d+ it printed$/, 'v52 moved this sentence: it quotes git VERDICT line now, where pre-v52 it quoted the FIRST line (`On branch master`, a header). v45 read the INDEX one step earlier for the same reason — the reason matters more than the banner');
  assert.equal(/On branch master/.test(emptyCommit.detail), false, 'and the banner is gone from the caller-visible sentence, not merely out front of it');
  assert.equal(emptyCommit.record, undefined, 'no record, because nothing was recorded');
  assert.equal(commitsAt(), commitsAtEmpty, 'HEAD unmoved through the whole granted walk');
  assert.equal(out(emptyRun, 'git.log').commits[0].hash, commitOut.record.hash, 'the confirm step still read back honestly: the newest commit is 2a\'s, because nothing new landed');
  assert.equal(emptyRun.status, 'completed', 'the LOOP completed (every step it asked got an answer) while its RESULTS say nothing was recorded — both facts on the page');
  const emptyMemory = emptyStore.list('intent');
  assert.equal(emptyMemory.length, 1);
  assert.ok(!String(emptyMemory[0].summary).includes('COMMITTED+CONFIRMED'), '§60: the remembered sentence does NOT claim a landing that git refused — amendment 45 retires the wording amendment 39 could not support');
  assert.match(String(emptyMemory[0].summary), /whether anything LANDED is git\'s own answer/);
  console.log('[intent-proof] REAL: denied read = 0 spawns and no commit · an EMPTY index is stated one step before git answers "no changes added to commit" with history unmoved');

  // 2d) RED: the plan carries the whole tail; a red run never knocks on the first door.
  const spawnsAtRed = spawns.length;
  const redRun = await runTask(task, { registry: build('NEVER-HAPPENS'), checkpoint: () => true, maxFixRounds: 1 });
  assert.equal(redRun.status, 'failed_verification');
  assert.ok(redRun.plan.steps.some((s) => s.tool === 'git.staged'), 'the plan PROPOSED the intent read…');
  assert.equal(redRun.results.filter((r) => r.tool.startsWith('git.')).length, 0, '…and the red run spent none of the git tail');
  assert.equal(spawns.length, spawnsAtRed, 'zero new processes from a failed run');

  // 3) The ledger replays BOTH ends of the agreement to a cold reader.
  const ledgerFile = join(dir, 'nexus-ledger.jsonl'); // inside the throwaway dir, deleted with it
  appendLedger(fs, ledgerFile, greenRun);
  const back = loadLedger(fs, ledgerFile);
  assert.equal(back.malformed, 0);
  const replay = back.runs[0].results;
  const replayIntent = replay.filter((r) => r.tool === 'git.staged').at(-1).output;
  const replayAfter = replay.filter((r) => r.tool === 'git.show').at(-1).output;
  assert.deepEqual(replayIntent.files[0].addedLines, STAGED, 'a cold JSONL reader sees the intent as the run saw it…');
  assert.deepEqual(replayAfter.addedLines, replayIntent.files[0].addedLines, '…and the content it agreed with, on the same page, in the order the plan walked them');
  assert.equal(replay.filter((r) => r.tool.startsWith('git.')).map((r) => r.tool).join('→'), 'git.staged→git.commit→git.log→git.show', 'the executed order is durable, not just asserted in-process');
  assert.equal(commitsAt(), 2, 'human seed + 2a and NOTHING else: a denied read and a granted commit of an empty index both record no history');
} finally {
  rmSync(dir, { recursive: true, force: true });
  assert.ok(!existsSync(dir), 'the throwaway repo is gone');
}
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: home repo HEAD byte-identical — all reads and writes lived in os.tmpdir');
console.log('[intent-proof] ALL ASSERTIONS PASSED (the plan reads what the human means to record, then asks to record it)');
