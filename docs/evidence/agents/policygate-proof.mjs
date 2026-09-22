// NEXUS M2 v40 — checkpoint-policy proof (ADR 0016 amendment 40).
// §28 always said "a human decides". v40 makes that decision INSPECTABLE: ordered rules
// as data, first match wins, an EXPLICIT default (no implicit verdicts), and a receipt
// for every single call. This proof runs the REAL loop with the SAME plan under TWO
// policies against REAL sandbox git in a throwaway os.tmpdir repo — then shows the audit
// trails explain each outcome without anyone remembering what the callback did.
// Run after `npm run build`:  node docs/evidence/agents/policygate-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry, InMemoryWorkspace, registerWorkspaceTools, predicateRunner, registerTestTools, runTask, validateCheckpointPolicy, decide, policyCheckpoint } = rt;
const { NODE_SPAWN, createExecHost, gitCommitPolicy, gitEnv, registerGitCommitTool } = eh;

// 1) PURE data: the policy is a TABLE, and the table is checked before it can gate.
const table = {
  rules: [
    { tool: 'fs.*', grant: true, reason: 'workspace edits are the point of the run' },
    { tool: 'git.commit', grant: false, reason: 'this host keeps history closed' },
  ],
  default: { grant: false, reason: 'unlisted capabilities escalate' },
};
assert.deepEqual([decide(table, { call: { callId: 'x', tool: 'fs.write', args: {} }, permissions: ['write'] }).matched], ['fs.*']);
assert.equal(decide(table, { call: { callId: 'y', tool: 'git.commit', args: {} }, permissions: ['exec'] }).granted, false);
assert.equal(decide(table, { call: { callId: 'z', tool: 'memory.save', args: {} }, permissions: ['write'] }).matched, 'default', 'unmatched ⇒ the EXPLICIT default, never an invented verdict');
for (const bad of [
  { rules: [{ tool: 'a', grant: true, reason: '' }], default: { grant: false, reason: 'd' } }, // no reason
  { rules: [{ tool: 'a', grant: true, reason: 'r' }, { tool: 'a', grant: false, reason: 'r' }], default: { grant: false, reason: 'd' } }, // duplicate ⇒ dead rule
  { rules: [], default: { grant: false, reason: '' } }, // mute default
]) {
  assert.throws(() => validateCheckpointPolicy(bad), 'malformed policy must throw BEFORE gating anything');
}
assert.throws(() => policyCheckpoint({ rules: [{ tool: 'x', grant: 1 }], default: { grant: false, reason: 'd' } }), 'policyCheckpoint validates too — no un-gateable tables');
console.log('[policygate-proof] policy data: first-match + explicit default; malformed tables throw at construction');

// 2) THE REAL LOOP, SAME plan+registry, TWO policies, REAL git in a throwaway repo (§9).
const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dir = mkdtempSync(join(tmpdir(), 'nexus-policygate-'));
const posixDir = dir.replace(/\\/g, '/');
try {
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', dir]);
  git('config', 'user.name', 'NEXUS Policy Gate Proof');
  git('config', 'user.email', 'proof@nexus.invalid');
  git('config', 'core.hooksPath', '.no-hooks'); // neutralized INSIDE the temp repo only
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(dir, 'README.md'), 'human seed\n');
  git('add', 'README.md');
  git('commit', '-q', '-m', 'chore: human seed commit');
  const rootHead = git('rev-parse', 'HEAD').trim();
  writeFileSync(join(dir, 'deliverable.txt'), 'the human staged this\n');
  git('add', 'deliverable.txt');

  const spawns = [];
  const host = createExecHost(gitCommitPolicy(posixDir, { timeoutMs: 20_000 }), {
    spawnLike: (command, args, opts) => {
      spawns.push({ args, cwd: opts.cwd });
      return NODE_SPAWN(command, args, opts);
    },
  });
  const task = { id: 'pg1', goal: 'add widget docs', targetPath: 'notes/widget.md' };
  const build = () => {
    const ws = new InMemoryWorkspace({ 'notes/widget.md': 'widget notes\n' });
    let registry = registerWorkspaceTools(new ToolRegistry(), ws);
    registry = registerTestTools(registry, predicateRunner('policygate-demo', [
      { name: 'marker-present', check: (files) => (files['notes/widget.md'] ?? '').includes('NOTE (DEMO') ? null : 'note missing' },
    ], () => ws.snapshot()));
    registry = registerGitCommitTool(registry, host, { env: gitEnv() });
    return registry;
  };
  const registry = build();
  const policyFor = (allowCommit) => ({
    rules: [
      { tool: 'fs.*', grant: true, reason: 'the run may edit its workspace' },
      { tool: 'test.run', grant: true, reason: 'verification is never scary' },
      { tool: 'git.commit', grant: allowCommit, reason: allowCommit ? 'the human pre-approved THIS one argv shape' : 'the human kept history closed' },
    ],
    default: { grant: false, reason: 'nothing else was ever discussed' },
  });

  // 2a) DENY-POLICY run: work lands, commit is vetoed BY THE TABLE, history unmoved.
  const closed = policyCheckpoint(policyFor(false));
  const outClosed = await runTask(task, { registry: build(), checkpoint: closed, maxFixRounds: 0 });
  assert.equal(outClosed.status, 'denied');
  assert.equal(outClosed.results.at(-1).tool, 'git.commit');
  assert.match(outClosed.results.at(-1).error, /denied at checkpoint/);
  assert.equal(spawns.length, 0, 'a closed table spawns zero processes');
  assert.equal(git('rev-parse', 'HEAD').trim(), rootHead, 'history untouched — the POLICY, not a mood, decided');
  assert.deepEqual(closed.decisions.map((d) => [d.call.tool, d.granted]), [['fs.append', true], ['test.run', true], ['git.commit', false]], 'one receipt per gated call, in executed order');
  assert.equal(closed.decisions.find((d) => d.call.tool === 'git.commit').reason, 'the human kept history closed', 'the receipt quotes the TABLE, verbatim');
  assert.ok(!closed.decisions.some((d) => d.call.tool === 'fs.search' || d.call.tool === 'fs.read'), 'read steps never reach the checkpoint — §28 gates hands, not eyes');

  // 2b) ALLOW-POLICY run over the SAME plan: identical receipts EXCEPT the one rule flipped.
  const open = policyCheckpoint(policyFor(true));
  const outOpen = await runTask(task, { registry, checkpoint: open, maxFixRounds: 0 });
  assert.equal(outOpen.status, 'completed');
  assert.equal(spawns.length, 1, 'the only process born is the table-approved commit');
  const record = outOpen.results.at(-1).output.record;
  assert.ok(git('rev-parse', 'HEAD').trim().startsWith(record.hash), 'and history really moved (rev-parse is full-SHA; the echo abbreviates)');
  assert.equal(open.decisions.length, closed.decisions.length, 'the SAME calls walked both tables…');
  const diff = open.decisions.filter((d, i) => d.granted !== closed.decisions[i].granted);
  assert.deepEqual(diff.map((d) => d.call.tool), ['git.commit'], '…and exactly ONE decision differs — the ONE rule that changed');
  console.log(`[policygate-proof] REAL: closed table denied the commit (0 spawns, HEAD unmoved) · open table committed ${record.hash} · audits differ on exactly git.commit`);

  // 2c) The default tier is load-bearing: an UNLISTED exec-capability tool is refused
  //     by the table itself, with the default's reason on the receipt.
  const registry3 = build();
  registry3.register({ name: 'sneaky.tool', description: 'unlisted exec tool', permissions: ['exec'], args: [] }, () => {
    throw new Error('must never run');
  });
  const sneakCp = policyCheckpoint(policyFor(true));
  const res3 = await registry3.invoke({ callId: 's1', tool: 'sneaky.tool', args: {} }, { checkpoint: sneakCp });
  assert.equal(res3.ok, false);
  assert.match(res3.error, /denied at checkpoint/);
  assert.equal(sneakCp.decisions[0].matched, 'default');
  assert.equal(spawns.length, 1, 'the unlisted capability cost nothing — history still holds exactly one agent commit');
} finally {
  rmSync(dir, { recursive: true, force: true });
  assert.ok(!existsSync(dir), 'the throwaway repo is gone');
}
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: home repo HEAD byte-identical — all writes lived in os.tmpdir');
console.log('[policygate-proof] ALL ASSERTIONS PASSED (§28 is now a table you can diff, not a closure you must trust)');
