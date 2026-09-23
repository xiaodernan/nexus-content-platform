// NEXUS v44 (runtime) — content confirmation IN THE PLAN proof (ADR 0016 amendment 44).
// v38 wired the hash confirm into the plan's tail; v42 built the CONTENT door (git.show).
// This proof runs the REAL loop — runTask, not a hand-called tool — over REAL
// git.commit → git.log → git.show in a throwaway os.tmpdir repo, and the money assertion
// is at the END of the arc: the lines git.show hands back are BYTE-EQUAL what the human
// staged. A hash says something landed; this is the plan finishing the sentence.
// Also proven: a denied inspect costs zero spawns while the landed arc STANDS, and BOTH blunt
// answers git really gives about content are DATA the walk carries, not a crash — an empty diff
// (exit 0, "nothing recorded for this path") rides the plan to the end, and an exit-128 refusal
// (unborn HEAD) reads as honest non-green. Running this proof is what replaced the pathspec
// refusal v42's wording had assumed for the empty case.
// Run after `npm run build`:  node docs/evidence/agents/inspect-proof.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry, InMemoryWorkspace, registerWorkspaceTools, planTask, predicateRunner, registerTestTools, runTask, appendLedger, loadLedger } = rt;
const { GIT_DIFF_FLAGS, NODE_SPAWN, createExecHost, gitCommitPolicy, gitEnv, gitLogPolicy, gitShowPolicy, registerGitCommitTool, registerGitLogTool, registerGitShowTool } = eh;
const F = GIT_DIFF_FLAGS.join(' ');


// 1) PURE plan data: inspect rides ONLY behind confirm, which rides ONLY behind commit+verify.
const full = planTask({ id: 'ic', goal: 'add widget docs' }, { hasVerify: true, hasCommit: true, hasConfirm: true, hasContent: true });
assert.deepEqual(full.steps.map((s) => s.stepId), ['search', 'read', 'annotate', 'verify', 'commit', 'confirm', 'inspect']);
assert.equal(full.steps.at(-1).tool, 'git.show');
assert.deepEqual(full.steps.at(-1).args, { path: '@search.hits.0.path' }, 'the planned path is a LIVE ref, resolved at invoke time like read/annotate');
const withRemember = planTask({ id: 'ic', goal: 'add widget docs' }, { hasVerify: true, hasCommit: true, hasConfirm: true, hasContent: true, hasRemember: true });
assert.deepEqual(withRemember.steps.map((s) => s.stepId), ['search', 'read', 'annotate', 'verify', 'commit', 'confirm', 'inspect', 'remember'], 'inspect sits BEFORE remember — the memory tail stays the tail');
for (const opts of [{ hasVerify: true, hasCommit: true, hasContent: true }, { hasVerify: true, hasContent: true }, { hasContent: true }]) {
  assert.ok(!planTask({ id: 'ic', goal: 'add widget docs' }, opts).steps.some((s) => s.tool === 'git.show'), 'pull any earlier tier and the content step vanishes with it');
}
console.log('[inspect-proof] plan data: inspect is a nested tail — unreachable ahead of commit+confirm, never ahead of remember');

// 2) THE REAL LOOP over the THREE REAL sandbox doors in a throwaway repo (§9; deleted at the end).
const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dir = mkdtempSync(join(tmpdir(), 'nexus-inspect-'));
const posixDir = dir.replace(/\\/g, '/');
try {
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', dir]);
  git('config', 'user.name', 'NEXUS Inspect Proof');
  git('config', 'user.email', 'proof@nexus.invalid');
  git('config', 'core.hooksPath', '.no-hooks'); // global codex hooks neutralized INSIDE the temp repo only
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false'); // the bytes the human stages are the bytes git records
  writeFileSync(join(dir, 'README.md'), 'human seed\n');
  git('add', 'README.md');
  git('commit', '-q', '-m', 'chore: human seed commit');

  const spawns = [];
  const counting = (command, args, opts) => {
    spawns.push(args.join(' '));
    return NODE_SPAWN(command, args, opts);
  };
  // ONE registry, THREE keyed doors — exactly what the orchestrator now detects as hasCommit+hasConfirm+hasContent.
  const commitHost = createExecHost(gitCommitPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting });
  const logHost = createExecHost(gitLogPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting });
  const showHost = createExecHost(gitShowPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting });
  const task = { id: 'ic1', goal: 'add widget docs', targetPath: 'notes/widget.md' };
  const countOf = (out, tool) => out.results.filter((r) => r.tool === tool).length;
  // The verify predicate greps ANY workspace file for the marker — the agent note lands
  // wherever the TASK points, and the repo-side story below is what really matters.
  const build = (marker) => {
    const ws = new InMemoryWorkspace({ 'notes/widget.md': 'widget notes\n', 'never-staged.md': 'a workspace file that never reached this repo\n' });
    let registry = registerWorkspaceTools(new ToolRegistry(), ws);
    registry = registerTestTools(registry, predicateRunner('inspect-demo', [
      { name: 'marker-present', check: (files) => Object.values(files).some((c) => c.includes(marker)) ? null : `no workspace file carries "${marker}"` },
    ], () => ws.snapshot()));
    registry = registerGitCommitTool(registry, commitHost, { env: gitEnv() });
    registry = registerGitLogTool(registry, logHost, { env: gitEnv() });
    registry = registerGitShowTool(registry, showHost, { env: gitEnv() });
    return registry;
  };

  // THE HUMAN ACT: a person writes and stages the file the plan's own tail will read back.
  const STAGED = ['widget notes', 'a second line with "quotes" and  double spaces', 'third line — the human wrote this'];
  mkdirSync(join(dir, 'notes'));
  writeFileSync(join(dir, 'notes', 'widget.md'), `${STAGED.join('\n')}\n`);
  git('add', 'notes/widget.md');

  // 2a) ALL GRANTED: the loop walks verify→commit→confirm→INSPECT and says WHAT landed.
  const gates = [];
  const greenRun = await runTask(task, {
    registry: build('NOTE (DEMO'),
    checkpoint: ({ call, permissions }) => {
      if (permissions.includes('exec')) gates.push(call.tool);
      return true;
    },
    maxFixRounds: 0,
  });
  assert.equal(greenRun.status, 'completed', `granted run must complete: ${JSON.stringify(greenRun.results.at(-1))}`);
  assert.deepEqual(greenRun.results.map((r) => r.callId), ['ic1:search', 'ic1:read', 'ic1:annotate', 'ic1:verify', 'ic1:commit', 'ic1:confirm', 'ic1:inspect'], 'the plan\'s full arc executed in order, inspect LAST');
  assert.deepEqual(gates, ['test.run', 'git.commit', 'git.log', 'git.show'], 'every exec-armed step is its OWN §28 gate — the loop asks four times, and the reads are gated too');
  const commitRec = greenRun.results.at(-3).output.record;
  assert.equal(greenRun.results.at(-2).output.commits[0].hash, commitRec.hash, 'v38\'s hash agreement still holds…');
  const inspectOut = greenRun.results.at(-1).output;
  assert.deepEqual(inspectOut.addedLines, STAGED, 'THE MONEY ASSERTION: the PLANNED content read-back returns, byte for byte, the lines the HUMAN staged — the run finishes its own sentence');
  assert.equal(inspectOut.detail, 'git.show → exit 0: HEAD changed notes/widget.md · +3 −0 across 1 hunk(s)', 'the planned @ref resolved to the live target path and git\'s answer states its scope');
  assert.equal(spawns[2], `show ${F} --format= -- notes/widget.md`, 'git saw exactly the pinned argv — one token per argument, the path came from the LIVE search hit');
  console.log(`[inspect-proof] REAL: loop-driven commit→confirm→inspect read back ${STAGED.length} human-staged lines at ${commitRec.hash} · ${gates.length} §28 gates, 3 sandbox processes`);

  // 2b) DENIED INSPECT after a landed+hash-confirmed commit: denied status, arc STANDS, zero spawns.
  const spawnsBefore = spawns.length;
  writeFileSync(join(dir, 'notes', 'widget.md'), `${STAGED.join('\n')}\nand another human edit\n`);
  git('add', 'notes/widget.md');
  const vetoRun = await runTask(task, { registry: build('NOTE (DEMO'), checkpoint: ({ call }) => call.tool !== 'git.show', maxFixRounds: 0 });
  assert.equal(vetoRun.status, 'denied');
  assert.equal(countOf(vetoRun, 'git.commit'), 1, 'the commit ran and landed…');
  assert.equal(vetoRun.results.at(-2).output.commits[0].hash, vetoRun.results.at(-3).output.record.hash, '…and so did the hash confirm…');
  assert.match(vetoRun.results.at(-1).error, /denied at checkpoint \(exec\)/, '…but the human refused to let the run READ WHAT it wrote — recorded as a denial, not hidden');
  assert.equal(spawns.length, spawnsBefore + 2, 'a vetoed content read costs ZERO processes — §28 speaks before git does');

  // 2c) HONEST DATA mid-walk: the planned path lives in the AGENT's workspace and never reached
  //     this repo. Real git's answer is exit 0 with an EMPTY diff — the walk carries "nothing
  //     here" as an answer and claims no content. (Amendment 44 found this by RUNNING it: the
  //     "pathspec did not match" refusal this proof first asserted is not what git does after
  //     `--`; 2e proves the non-zero shape git really produces.)
  const stranger = { id: 'ic2', goal: 'add widget docs', targetPath: 'never-staged.md' };
  writeFileSync(join(dir, 'other.txt'), 'human staged a DIFFERENT file this time\n');
  git('add', 'other.txt');
  const oddRun = await runTask(stranger, { registry: build('NOTE (DEMO'), checkpoint: () => true, maxFixRounds: 0 });
  assert.equal(oddRun.status, 'completed', 'the walk continued: the tool worked, and git\'s answer — however blunt — is DATA');
  const oddOut = oddRun.results.at(-1).output;
  assert.equal(oddOut.ok, true, 'git exited 0; nothing failed, and nothing was recorded either');
  assert.equal(oddOut.exitCode, 0);
  assert.deepEqual([oddOut.hunks, oddOut.additions, oddOut.deletions], [0, 0, 0], 'zero hunks in, zero claims out');
  assert.deepEqual(oddOut.addedLines, [], 'and the run claims NO content it did not read (§60)');
  assert.equal(oddOut.detail, 'git.show → exit 0: HEAD touches nothing at never-staged.md (empty diff — git recorded no change for this path in HEAD)', 'the answer states its own emptiness instead of hedging toward a landed change');
  assert.equal(spawns[spawns.length - 1], `show ${F} --format= -- never-staged.md`, 'the pinned shape held even for the blunt answer');

  // 2d) RED: the plan carries the WHOLE tail; a red run reaches none of it.
  const spawnsAtRed = spawns.length;
  const redRun = await runTask(task, { registry: build('NEVER-HAPPENS'), checkpoint: () => true, maxFixRounds: 1 });
  assert.equal(redRun.status, 'failed_verification');
  assert.ok(redRun.plan.steps.some((s) => s.tool === 'git.show'), 'the plan PROPOSED the content read-back…');
  assert.equal(countOf(redRun, 'git.commit') + countOf(redRun, 'git.log') + countOf(redRun, 'git.show'), 0, '…the red run spent none of the tail');
  assert.equal(spawns.length, spawnsAtRed, 'zero new processes from a failed run');

  // 2e) THE OTHER BLUNT ANSWER IS REAL, NOT A FIXTURE: a repo whose HEAD does not exist yet, so
  //     git exits 128 and prints its own fatal line. The tool returns that as ok:false DATA
  //     (§60: honest non-green, never laundered, no content invented). The LOOP cannot reach this
  //     state at `inspect` — its own granted commit step would already have CREATED HEAD — which
  //     is exactly why the tail is nested: the door is therefore knocked on directly here.
  const bareDir = mkdtempSync(join(tmpdir(), 'nexus-inspect-bare-'));
  try {
    execFileSync('git', ['init', '-q', bareDir]); // init only: no commits, so HEAD is unborn
    const bareSpawns = [];
    const bareHost = createExecHost(gitShowPolicy(bareDir.replace(/\\/g, '/'), { timeoutMs: 20_000 }), {
      spawnLike: (command, args, opts) => {
        bareSpawns.push(args.join(' '));
        return NODE_SPAWN(command, args, opts);
      },
    });
    const bareRegistry = registerGitShowTool(new ToolRegistry(), bareHost, { env: gitEnv() });
    const blunt = await bareRegistry.invoke({ callId: 'ic:blunt', tool: 'git.show', args: { path: 'notes/widget.md' } }, { checkpoint: () => true });
    assert.equal(blunt.ok, true, 'the tool did not throw — git refused, and the refusal IS the result');
    assert.equal(blunt.output.ok, false, 'a red git answer never reads as a green one');
    assert.equal(blunt.output.exitCode, 128);
    assert.match(blunt.output.detail, /^git\.show → exit 128: fatal: your current branch .* does not have any commits yet/);
    assert.deepEqual(blunt.output.addedLines, [], 'no content claimed from a history that has none');
    assert.deepEqual(bareSpawns, [`show ${F} --format= -- notes/widget.md`], 'one real git process, pinned argv, inside a second throwaway repo');
  } finally {
    rmSync(bareDir, { recursive: true, force: true });
    assert.ok(!existsSync(bareDir), 'and that one is gone too');
  }

  // 3) The ledger replays the FULL sentence — commit record, hash AND content — to a cold reader.
  const ledgerFile = join(dir, 'nexus-ledger.jsonl'); // inside the throwaway dir, deleted with it
  appendLedger(fs, ledgerFile, greenRun);
  const back = loadLedger(fs, ledgerFile);
  assert.equal(back.malformed, 0);
  const replay = back.runs[0].results;
  assert.equal(replay.at(-1).tool, 'git.show');
  assert.deepEqual(replay.at(-1).output.addedLines, STAGED, 'a cold JSONL reader sees WHAT landed, not merely THAT something did');
  assert.equal(replay.at(-2).output.commits[0].hash, replay.at(-3).output.record.hash, 'the hash confirm replays too — record, hash and content agree on the SAME page');
  assert.equal(Number(git('rev-list', '--count', 'HEAD')), 4, 'human seed + 2a + 2b + 2c — nothing else wrote history');
  console.log(`[inspect-proof] REAL: denied inspect cost 0 spawns with the arc standing · an empty diff and an unborn-HEAD 128 both rode as honest DATA · red spent none of the tail · ledger replays the content · ${spawns.length} sandbox processes in total`);
} finally {
  rmSync(dir, { recursive: true, force: true });
  assert.ok(!existsSync(dir), 'the throwaway repo is gone');
}
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: home repo HEAD byte-identical — all writes and reads lived in os.tmpdir');
console.log('[inspect-proof] ALL ASSERTIONS PASSED (the plan itself now ends: something landed AND this is what it says)');
