// NEXUS M2 v39 — remembered-victory proof (ADR 0016 amendment 39).
// v36 taught the loop WHEN to knock (commit after green); v37 built the read-back door;
// v38 wired it into the plan; v39 closes the memory loop: the ONLY position the demo
// planner ever assigns to memory.save is the tail of the FULL verify→commit→confirm arc.
// Position is the safety — §26 memory can never hold a "victory" that didn't verify,
// land, and read back agreeing. This proof runs the REAL loop over REAL sandbox tools
// AND a REAL MemoryStore: run 1 wins, run 2's research step RECALLS that win from the
// very memory the arc wrote. Home repo untouched; real writes live in os.tmpdir only.
// Run after `npm run build`:  node docs/evidence/agents/remember-proof.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry, InMemoryWorkspace, registerWorkspaceTools, planTask, predicateRunner, registerTestTools, runTask, appendLedger, loadLedger, MemoryStore, registerMemoryTools } = rt;
const { NODE_SPAWN, createExecHost, gitCommitPolicy, gitEnv, gitLogPolicy, registerGitCommitTool, registerGitLogTool } = eh;

// 1) PURE plan data: remember is a nested tail of confirm, which is a nested tail of commit.
const arc = { hasVerify: true, hasCommit: true, hasConfirm: true, hasRemember: true };
const full = planTask({ id: 'rm', goal: 'add widget docs' }, arc);
assert.deepEqual(full.steps.map((s) => s.stepId), ['search', 'read', 'annotate', 'verify', 'commit', 'confirm', 'remember']);
const remember = full.steps.at(-1);
assert.equal(remember.tool, 'memory.save');
assert.equal(remember.args.runId, 'rm');
assert.ok(String(remember.args.summary).includes('ARC-COMPLETE') && String(remember.args.summary).includes(`seed ${full.seed}`), 'the summary STATES the mode and the arc it remembers (v45 corrected the wording: the arc is what position guarantees, the landing is git\'s answer)');
assert.deepEqual(remember.args.refs, ['@search.hits.0.path'], 'refs ride the same @ref dataflow as the read step');
for (const minus of [
  { hasVerify: true, hasCommit: true, hasRemember: true }, // no confirm tier
  { hasVerify: true, hasRemember: true }, // no commit tier
  { hasRemember: true }, // no verify → nothing green could ever be remembered
]) {
  assert.ok(!planTask({ id: 'rm', goal: 'add widget docs' }, minus).steps.some((s) => s.tool === 'memory.save'), 'pull any earlier tier and the memory step vanishes with it');
}
console.log('[remember-proof] plan data: memory.save exists ONLY at the tail of verify→commit→confirm — position is the safety');

// 2) THE REAL LOOP, REAL sandbox git, REAL MemoryStore — in a throwaway repo (§9).
const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dir = mkdtempSync(join(tmpdir(), 'nexus-remember-'));
const posixDir = dir.replace(/\\/g, '/');
try {
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', dir]);
  git('config', 'user.name', 'NEXUS Remember Proof');
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
  const commitHost = createExecHost(gitCommitPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting });
  const logHost = createExecHost(gitLogPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting });
  const task = { id: 'rm1', goal: 'add widget docs', targetPath: 'notes/widget.md' };
  const store = new MemoryStore(); // ONE memory, alive across every run below — that is the point
  const build = (marker) => {
    const ws = new InMemoryWorkspace({ 'notes/widget.md': 'widget notes\n' });
    let registry = registerWorkspaceTools(new ToolRegistry(), ws);
    registry = registerTestTools(registry, predicateRunner('remember-demo', [
      { name: 'marker-present', check: (files) => (files['notes/widget.md'] ?? '').includes(marker) ? null : `notes/widget.md lacks "${marker}"` },
    ], () => ws.snapshot()));
    registry = registerGitCommitTool(registry, commitHost, { env: gitEnv() });
    registry = registerGitLogTool(registry, logHost, { env: gitEnv() });
    registry = registerMemoryTools(registry, store, 'agent-runs');
    return { registry, ws };
  };
  const countOf = (out, tool) => out.results.filter((r) => r.tool === tool).length;

  // 2a) THE FIRST VICTORY: green→commit→confirm→remember, and memory HOLDS the arc.
  writeFileSync(join(dir, 'deliverable.txt'), 'the human reviewed and staged this\n');
  git('add', 'deliverable.txt');
  const win = await runTask(task, { registry: build('NOTE (DEMO').registry, checkpoint: () => true, maxFixRounds: 0 });
  assert.equal(win.status, 'completed');
  assert.deepEqual(win.results.map((r) => r.callId), ['rm1:search', 'rm1:read', 'rm1:annotate', 'rm1:verify', 'rm1:commit', 'rm1:confirm', 'rm1:remember'], 'the plan\'s WHOLE arc executed in order — memory.save LAST');
  const rec = store.list('agent-runs');
  assert.equal(rec.length, 1, 'exactly ONE remembered victory — nothing ghost-written');
  assert.equal(rec[0].runId, 'rm1');
  assert.equal(rec[0].query, 'add widget docs');
  assert.ok(rec[0].summary.includes('ARC-COMPLETE'), 'the record says the ARC was walked — and the run\'s own results carry git\'s answer for whether anything landed (HERE: it did, `winRecord` below)');
  assert.deepEqual(rec[0].refs, [{ path: 'notes/widget.md' }], 'the planned @ref resolved to the LIVE workspace path at invoke time');
  const winRecord = win.results.at(-3).output.record; // [-1] remember, [-2] confirm, [-3] commit
  assert.ok(winRecord.hash, 'the confirmed commit carries its hash — the ledger (section 3) is the join target');
  assert.equal(spawns.length, 2, 'one commit + one read-back = two processes; memory.save spawned nothing');

  // 2b) THE LOOP REMEMBERS: run 2's research step is memory.recall — it surfaces run 1's
  //     victory FROM THE MEMORY THAT VICTORY WROTE. Commit is then denied: nothing new lands.
  const win2 = await runTask({ ...task, id: 'rm2' }, { registry: build('NOTE (DEMO').registry, checkpoint: ({ call }) => call.tool !== 'git.commit', maxFixRounds: 0 });
  assert.equal(win2.status, 'denied');
  assert.equal(win2.plan.steps[0].tool, 'memory.recall', 'with memory registered, research routes through it first (§26)');
  const recalled = win2.results[0].output.hits;
  assert.ok(recalled.length > 0 && recalled[0].summary.includes('ARC-COMPLETE'), 'run 2 RECALLS run 1\'s remembered victory');
  assert.equal(recalled[0].path, 'notes/widget.md');
  assert.equal(countOf(win2, 'git.commit'), 1);
  assert.equal(win2.results.find((r) => r.tool === 'git.commit').ok, false, 'the denial is recorded honestly…');
  assert.equal(countOf(win2, 'memory.save'), 0, '…and the vetoed arc produces NO second victory');
  assert.equal(store.list('agent-runs').length, 1, 'memory still holds exactly run 1\'s win');
  assert.equal(spawns.length, 2, 'a denied commit costs zero processes');
  assert.ok(git('rev-parse', 'HEAD').trim().startsWith(winRecord.hash), 'HEAD still points at run 1\'s commit (full SHA; the echo abbreviates)');

  // 2c) DENIED REMEMBER after a LANDED, CONFIRMED commit: the human can always say "not
  //     into memory". Commit+confirm results STAND; the store stays untouched.
  writeFileSync(join(dir, 'second.txt'), 'another staged file\n');
  git('add', 'second.txt');
  const veto = await runTask({ ...task, id: 'rm3' }, { registry: build('NOTE (DEMO').registry, checkpoint: ({ call }) => call.tool !== 'memory.save', maxFixRounds: 0 });
  assert.equal(veto.status, 'denied');
  assert.equal(veto.results.at(-2).tool, 'git.log');
  assert.equal(veto.results.at(-2).ok, true, 'the confirmed read-back honestly STANDS in the results');
  assert.match(veto.results.at(-1).error, /denied at checkpoint/);
  assert.equal(store.list('agent-runs').length, 1, 'deny ⇒ the memory impl NEVER ran — §26 stays what the human allowed');
  assert.equal(spawns.length, 4, 'run 2c spent its commit + read-back (2 more), memory.save costs no spawn either way');

  // 2d) RED: the plan carries the WHOLE arc; verification fails; commit, confirm AND
  //     memory all stay unreached. A red run cannot remember a victory.
  const red = await runTask({ ...task, id: 'rm4' }, { registry: build('NEVER-HAPPENS').registry, checkpoint: () => true, maxFixRounds: 1 });
  assert.equal(red.status, 'failed_verification');
  assert.ok(red.plan.steps.some((s) => s.tool === 'memory.save'), 'the plan PROPOSED the arc…');
  assert.equal(countOf(red, 'git.commit'), 0);
  assert.equal(countOf(red, 'memory.save'), 0, '…the red run spent NEITHER a commit NOR a memory entry');
  assert.equal(store.list('agent-runs').length, 1, 'still exactly one remembered victory — the honest one');
  assert.equal(spawns.length, 4, 'a red run spawns nothing past verify');

  // 3) The ledger replays the arc COLD: a JSONL reader sees the memory.save result and can
  //    join its record id to the live store — memory, ledger and git now tell ONE story.
  const ledgerFile = join(dir, 'nexus-ledger.jsonl'); // inside the throwaway dir, deleted with it
  appendLedger(fs, ledgerFile, win);
  const back = loadLedger(fs, ledgerFile);
  assert.equal(back.malformed, 0);
  const replay = back.runs[0].results;
  assert.equal(replay.at(-1).tool, 'memory.save');
  assert.equal(replay.at(-1).output.id, rec[0].id, 'a cold reader sees the VERY record the run wrote into §26 memory');
  assert.equal(replay.at(-2).output.commits[0].hash, replay.at(-3).output.record.hash, 'and the confirm agreed with the commit, on the page, forever');
  assert.equal(Number(git('rev-list', '--count', 'HEAD')), 3, 'human seed + 2a + 2c — nothing else wrote history');
  console.log(`[remember-proof] REAL: victory journaled as ${rec[0].id} · run 2 recalled it FROM memory (${recalled.length} hit(s)) · denied remember stored nothing · red remembered nothing · ${spawns.length} sandbox processes total`);
} finally {
  rmSync(dir, { recursive: true, force: true });
  assert.ok(!existsSync(dir), 'the throwaway repo is gone');
}
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: home repo HEAD byte-identical — all writes and memories lived in os.tmpdir');
console.log('[remember-proof] ALL ASSERTIONS PASSED (the loop now remembers only what it actually proved)');
