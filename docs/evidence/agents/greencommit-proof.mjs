// NEXUS M2 v36 — commit AFTER green proof (ADR 0016 amendment 36).
// v35 built the door (`git.commit`, one argv wide); v36 teaches the LOOP when to knock:
// the demo planner appends a commit step AFTER verify — structurally unreachable unless
// verification is green (a failed verify returns before it) — and the fix-round rewrite
// means green-via-fix reaches it too, with fix steps never running twice.
// The §28 checkpoint is where the HUMAN lives: this proof's checkpoint callback plays the
// human who stages the index right before approving (staging is never the tool's job —
// the policy has no add). REAL writes happen ONLY in a throwaway os.tmpdir repo; the
// home repo's HEAD is byte-checked before/after like always.
// Run after `npm run build`:  node docs/evidence/agents/greencommit-proof.mjs
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
const { NODE_SPAWN, createExecHost, gitCommitPolicy, gitEnv, registerGitCommitTool } = eh;

// 1) PURE plan data: the commit step rides ONLY behind a verify step.
const green = planTask({ id: 'g', goal: 'add widget docs' }, { hasVerify: true, hasCommit: true });
assert.deepEqual(green.steps.map((s) => s.stepId), ['search', 'read', 'annotate', 'verify', 'commit']);
assert.equal(green.steps.at(-1).tool, 'git.commit');
assert.ok(String(green.steps.at(-1).args.message).includes('verified run g'), 'the message STATES the run and seed');
assert.ok(!planTask({ id: 'g', goal: 'add widget docs' }, { hasVerify: false, hasCommit: true }).steps.some((s) => s.tool === 'git.commit'), 'no verify → no green → NEVER a commit step');
console.log('[greencommit-proof] plan data: commit is structurally AFTER verify — unreachable on red');

// 2) REAL loop over a throwaway repo, through the confined exec host.
const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dir = mkdtempSync(join(tmpdir(), 'nexus-greencommit-'));
const posixDir = dir.replace(/\\/g, '/');
try {
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', dir]);
  git('config', 'user.name', 'NEXUS Green-Commit Proof');
  git('config', 'user.email', 'proof@nexus.invalid');
  git('config', 'core.hooksPath', '.no-hooks'); // neutralize global hooks INSIDE the temp repo only — never bypassed, never touched
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(dir, 'README.md'), 'human seed\n');
  git('add', 'README.md');
  git('commit', '-q', '-m', 'chore: human seed commit');
  const rootHead = git('rev-parse', 'HEAD').trim();

  const spawns = [];
  const host = createExecHost(gitCommitPolicy(posixDir, { timeoutMs: 20_000 }), {
    spawnLike: (command, args, opts) => {
      spawns.push({ command, args, cwd: opts.cwd, envKeys: Object.keys(opts.env).sort() });
      return NODE_SPAWN(command, args, opts);
    },
  });
  const wsFiles = { 'notes/widget.md': 'widget notes\n' };
  const task = { id: 'gc1', goal: 'add widget docs', targetPath: 'notes/widget.md' };
  const build = (marker) => {
    const ws = new InMemoryWorkspace({ ...wsFiles });
    let registry = registerWorkspaceTools(new ToolRegistry(), ws);
    registry = registerTestTools(registry, predicateRunner('greencommit-demo', [
      { name: 'marker-present', check: (files) => (files['notes/widget.md'] ?? '').includes(marker) ? null : `notes/widget.md lacks "${marker}"` },
    ], () => ws.snapshot()));
    registry = registerGitCommitTool(registry, host, { env: gitEnv() });
    return registry;
  };
  const countOf = (out, tool) => out.results.filter((r) => r.tool === tool).length;

  // 2a) RED: a predicate NOTHING can satisfy → the plan CARRIES a commit step but the
  //     loop returns failed_verification before ever reaching it.
  {
    const out = await runTask(task, { registry: build('NEVER-HAPPENS'), checkpoint: () => true, maxFixRounds: 1 });
    assert.equal(out.status, 'failed_verification');
    assert.ok(out.plan.steps.some((s) => s.tool === 'git.commit'), 'the plan carried a commit step…');
    assert.equal(countOf(out, 'git.commit'), 0, '…and the red run never reached it');
    assert.equal(spawns.length, 0, 'a red run spent ZERO processes on history');
    assert.equal(git('rev-parse', 'HEAD').trim(), rootHead, 'the repo still points at the human seed');
  }

  // 2b) DENIED: green run, but the human says NO at the commit checkpoint.
  {
    const out = await runTask(task, { registry: build('NOTE (DEMO'), checkpoint: ({ call }) => call.tool !== 'git.commit', maxFixRounds: 0 });
    assert.equal(out.status, 'denied');
    assert.equal(countOf(out, 'test.run'), 1, 'verification passed…');
    const asked = out.results.filter((r) => r.tool === 'git.commit');
    assert.equal(asked.length, 1, '§28 was ASKED exactly once…');
    assert.equal(asked[0].ok, false, '…and the human veto turned it into an honest denial');
    assert.match(asked[0].error, /denied at checkpoint/);
    assert.equal(spawns.length, 0, 'denial costs zero spawns — history stays unwritten');
    assert.equal(git('rev-parse', 'HEAD').trim(), rootHead);
  }

  // 2c) GREEN AFTER A FIX ROUND — the case the old early-return would have skipped:
  //     verify fails, fs.append fix lands, re-verify passes, and ONLY THEN the loop
  //     walks into the commit step — exactly once, with fix steps never re-run.
  {
    writeFileSync(join(dir, 'deliverable.txt'), 'the human reviewed and staged this\n');
    git('add', 'deliverable.txt');
    const out = await runTask(task, { registry: build('FIX (DEMO'), checkpoint: () => true, maxFixRounds: 1 });
    assert.equal(out.status, 'completed');
    assert.deepEqual(out.results.map((r) => r.callId), ['gc1:search', 'gc1:read', 'gc1:annotate', 'gc1:verify', 'gc1:fix-1', 'gc1:verify-2', 'gc1:commit'], 'verify→fix→re-verify→COMMIT, each step exactly once');
    const commitRes = out.results.at(-1);
    assert.equal(commitRes.tool, 'git.commit');
    assert.equal(commitRes.ok, true, `granted commit must run: ${commitRes.error ?? ''}`);
    const record = commitRes.output.record;
    assert.ok(record, `git echo must parse: ${commitRes.output.detail}`);
    assert.equal(record.stat.files, 1, 'exactly the ONE file the human staged — nothing else');
    assert.ok(record.subject.startsWith('chore(agent): verified run gc1'), 'the subject carries the planner-stated message verbatim');
    assert.ok(git('rev-parse', 'HEAD').trim().startsWith(record.hash), 'the record points at the commit that actually landed');
    assert.equal(spawns.length, 1, 'across red+denied+green the ONLY process born is the one approved commit');
    const msg = out.plan.steps.find((s) => s.tool === 'git.commit').args.message;
    assert.deepEqual(spawns[0].args, ['commit', '-m', msg], 'argv-as-data: the planned message reached git as ONE token');
    assert.equal(spawns[0].cwd, posixDir, 'the jail is the temp repo');
    assert.deepEqual(spawns[0].envKeys, Object.keys(gitEnv()).sort(), 'the spawn env is EXACTLY the allowlisted names');
  }

  // 3) The ledger replays the decision: a cold JSONL reader sees the commit record.
  {
    writeFileSync(join(dir, 'second.txt'), 'another staged file\n');
    git('add', 'second.txt');
    const out = await runTask(task, { registry: build('NOTE (DEMO'), checkpoint: () => true, maxFixRounds: 0 });
    assert.equal(out.status, 'completed');
    const rec = out.results.at(-1).output.record;
    assert.equal(rec.stat.files, 1);
    const ledgerFile = join(dir, 'nexus-ledger.jsonl'); // inside the throwaway dir, deleted with it
    appendLedger(fs, ledgerFile, out);
    const back = loadLedger(fs, ledgerFile);
    assert.equal(back.malformed, 0);
    const replayCommit = back.runs[0].results.at(-1);
    assert.equal(replayCommit.tool, 'git.commit');
    assert.equal(replayCommit.output.record.hash, rec.hash, 'a cold reader sees EXACTLY the commit that landed');
    assert.equal(Number(git('rev-list', '--count', 'HEAD')), 3, 'human seed + 2c + 3 — nothing else wrote history');
    console.log(`[greencommit-proof] REAL: red never commits · denial never commits · green-after-fix commits ONCE · ledger replays ${rec.branch}@${rec.hash} · total spawns ${spawns.length}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
  assert.ok(!existsSync(dir), 'the throwaway repo is gone');
}
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: home repo HEAD byte-identical — all writes lived in os.tmpdir');
console.log('[greencommit-proof] ALL ASSERTIONS PASSED (the loop now knows: propose after green — and only the human opens the door)');
