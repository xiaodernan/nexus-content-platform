// NEXUS M2 v38 — confirm-after-commit proof (ADR 0016 amendment 38).
// v36 taught the loop to knock (commit after green); v37 built the read-back door
// (git.log). v38 wires both into the PLAN ITSELF: when both exec-host tools are
// registered, the demo planner trails a `confirm` step after `commit` — the plan ends
// see→touch→CONFIRM and the RUN OUTCOME carries git's own verdict on the agent's work.
// This is the first proof where runTask — the real loop, not a hand-called tool — drives
// REAL git.commit + git.log over a REAL throwaway os.tmpdir repo. Home HEAD byte-checked.
// Run after `npm run build`:  node docs/evidence/agents/confirm-proof.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from '../lib/syncproc.mjs';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry, InMemoryWorkspace, registerWorkspaceTools, planTask, predicateRunner, registerTestTools, runTask, appendLedger, loadLedger } = rt;
const { NODE_SPAWN, createExecHost, gitCommitPolicy, gitEnv, gitLogPolicy, registerGitCommitTool, registerGitLogTool } = eh;

// 1) PURE plan data: confirm rides ONLY at the tail of commit, which rides ONLY after verify.
const full = planTask({ id: 'cf', goal: 'add widget docs' }, { hasVerify: true, hasCommit: true, hasConfirm: true });
assert.deepEqual(full.steps.map((s) => s.stepId), ['search', 'read', 'annotate', 'verify', 'commit', 'confirm']);
assert.equal(full.steps.at(-1).tool, 'git.log');
assert.deepEqual(full.steps.at(-1).args, { count: 2 }, 'the read-back window is planned, not improvised');
assert.ok(!planTask({ id: 'cf', goal: 'add widget docs' }, { hasVerify: true, hasConfirm: true }).steps.some((s) => s.tool === 'git.log'), 'nothing was committed → nothing to confirm');
assert.ok(!planTask({ id: 'cf', goal: 'add widget docs' }, { hasVerify: false, hasCommit: true, hasConfirm: true }).steps.some((s) => s.tool === 'git.log'), 'no green → no commit → no confirm');
console.log('[confirm-proof] plan data: confirm is structurally AFTER commit — a nested tail nobody can reach early');

// 2) THE REAL LOOP over the REAL sandbox tools in a throwaway repo (§9; deleted at the end).
const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dir = mkdtempSync(join(tmpdir(), 'nexus-confirm-'));
const posixDir = dir.replace(/\\/g, '/');
try {
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', dir]);
  git('config', 'user.name', 'NEXUS Confirm Proof');
  git('config', 'user.email', 'proof@nexus.invalid');
  git('config', 'core.hooksPath', '.no-hooks'); // global codex hooks neutralized INSIDE the temp repo only
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(dir, 'README.md'), 'human seed\n');
  git('add', 'README.md');
  git('commit', '-q', '-m', 'chore: human seed commit');

  const spawns = [];
  const counting = (command, args, opts) => {
    spawns.push({ args, cwd: opts.cwd });
    return NODE_SPAWN(command, args, opts);
  };
  // ONE registry, TWO keyed doors — exactly what the orchestrator detects as hasCommit+hasConfirm.
  const commitHost = createExecHost(gitCommitPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting });
  const logHost = createExecHost(gitLogPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting });
  const task = { id: 'cf1', goal: 'add widget docs', targetPath: 'notes/widget.md' };
  const build = (marker) => {
    const ws = new InMemoryWorkspace({ 'notes/widget.md': 'widget notes\n' });
    let registry = registerWorkspaceTools(new ToolRegistry(), ws);
    registry = registerTestTools(registry, predicateRunner('confirm-demo', [
      { name: 'marker-present', check: (files) => (files['notes/widget.md'] ?? '').includes(marker) ? null : `notes/widget.md lacks "${marker}"` },
    ], () => ws.snapshot()));
    registry = registerGitCommitTool(registry, commitHost, { env: gitEnv() });
    registry = registerGitLogTool(registry, logHost, { env: gitEnv() });
    return registry;
  };
  const countOf = (out, tool) => out.results.filter((r) => r.tool === tool).length;

  // 2a) ALL GRANTED: the loop itself walks verify→commit→confirm and CONFIRMS its own write.
  writeFileSync(join(dir, 'deliverable.txt'), 'the human reviewed and staged this\n');
  git('add', 'deliverable.txt');
  const greenRun = await runTask(task, { registry: build('NOTE (DEMO'), checkpoint: () => true, maxFixRounds: 0 });
  assert.equal(greenRun.status, 'completed', `granted run must complete: ${JSON.stringify(greenRun.results.at(-1))}`);
  assert.deepEqual(greenRun.results.map((r) => r.callId), ['cf1:search', 'cf1:read', 'cf1:annotate', 'cf1:verify', 'cf1:commit', 'cf1:confirm'], 'the plan\'s full arc executed in order, confirm LAST');
  const commitRec = greenRun.results.at(-2).output.record;
  assert.ok(commitRec && commitRec.stat.files === 1, 'the commit carried exactly the human-staged file');
  const confirmOut = greenRun.results.at(-1).output;
  assert.equal(confirmOut.ok, true);
  assert.equal(confirmOut.commits[0].hash, commitRec.hash, 'THE MONEY ASSERTION: git\'s own log agrees with what the commit tool claimed');
  assert.equal(confirmOut.commits[0].subject, commitRec.subject, 'subject survives write→read byte for byte');
  assert.match(confirmOut.commits[1].subject, /^chore: human seed/, 'the human commit sits below — shared history, not overwritten');
  assert.equal(spawns.length, 2, 'one approved commit + one approved read-back = two processes, no more');
  assert.deepEqual(spawns[1].args, ['log', '--oneline', '--no-decorate', '--no-color', '-n', '2'], 'the PLANNED window reached git verbatim, inside the two v67 tokens');
  assert.ok(git('rev-parse', 'HEAD').trim().startsWith(commitRec.hash), 'rev-parse prints the FULL SHA — the abbreviated commit record is its prefix');

  // 2b) DENIED CONFIRM after a LANDED commit: the run says denied; the commit stands.
  const spawnsAt2b = spawns.length;
  writeFileSync(join(dir, 'second.txt'), 'another staged file\n');
  git('add', 'second.txt');
  const vetoRun = await runTask(task, { registry: build('NOTE (DEMO'), checkpoint: ({ call }) => call.tool !== 'git.log', maxFixRounds: 0 });
  assert.equal(vetoRun.status, 'denied');
  assert.equal(countOf(vetoRun, 'git.commit'), 1);
  assert.equal(vetoRun.results.at(-2).ok, true, 'the commit BEFORE the veto honestly STANDS in the results');
  assert.equal(vetoRun.results.at(-1).ok, false, 'the denied confirm is recorded as a denial, not hidden');
  assert.match(vetoRun.results.at(-1).error, /denied at checkpoint/);
  assert.equal(spawns.length, spawnsAt2b + 1, 'the granted commit spawned; the vetoed read spawned nothing');
  const secondRec = vetoRun.results.at(-2).output.record;
  assert.ok(git('rev-parse', 'HEAD').trim().startsWith(secondRec.hash), 'history moved once — and the run still says it could not confirm');

  // 2c) RED: the plan carries commit AND confirm; the loop reaches neither, ever.
  const redRun = await runTask(task, { registry: build('NEVER-HAPPENS'), checkpoint: () => true, maxFixRounds: 1 });
  assert.equal(redRun.status, 'failed_verification');
  assert.ok(redRun.plan.steps.some((s) => s.tool === 'git.log'), 'the plan PROPOSED the whole arc…');
  assert.equal(countOf(redRun, 'git.commit'), 0, '…the red run spent neither a commit nor a confirm');
  assert.equal(countOf(redRun, 'git.log'), 0);
  assert.ok(git('rev-parse', 'HEAD').trim().startsWith(secondRec.hash), 'history untouched by a failed run');

  // 3) The ledger replays the WHOLE arc — commit record AND read-back — to a cold reader.
  const ledgerFile = join(dir, 'nexus-ledger.jsonl'); // inside the throwaway dir, deleted with it
  appendLedger(fs, ledgerFile, greenRun);
  const back = loadLedger(fs, ledgerFile);
  assert.equal(back.malformed, 0);
  const replay = back.runs[0].results;
  assert.equal(replay.at(-1).tool, 'git.log');
  assert.equal(replay.at(-1).output.commits[0].hash, replay.at(-2).output.record.hash, 'a cold reader can re-check the confirmation against the record on the SAME page');
  assert.equal(Number(git('rev-list', '--count', 'HEAD')), 3, 'human seed + 2a + 2b — nothing else wrote history');
  console.log(`[confirm-proof] REAL: loop-driven commit→confirm agrees on ${commitRec.hash} · denied confirm kept its commit and cost 0 spawns · red spent neither · ${spawns.length} sandbox processes in total · ledger replays the arc`);
} finally {
  rmSync(dir, { recursive: true, force: true });
  assert.ok(!existsSync(dir), 'the throwaway repo is gone');
}
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: home repo HEAD byte-identical — all writes and reads lived in os.tmpdir');
console.log('[confirm-proof] ALL ASSERTIONS PASSED (the plan itself now ends in git\'s own words, not the agent\'s)');
