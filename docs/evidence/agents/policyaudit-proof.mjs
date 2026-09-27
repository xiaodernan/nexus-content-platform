// NEXUS M2 v86b — checkpoint-table audit proof (ADR 0016 amendment 87). The header named a number
// in the sixties the ledger never granted, so a reader following the citation found no record.
// v40 made §28 a TABLE you can diff; v41 made every verdict a RECEIPT. v86b answers the
// question those two enable and nobody had asked yet: "would this convenient table have
// contradicted the humans it is meant to stand in for?" — asked BEFORE it is ever trusted.
//
// The audit is run against a REAL recorded history from a REAL loop, not a hand-written
// fixture, because the whole point is to grade a table against what people actually did.
// Run after `npm run build`:  node docs/evidence/agents/policyaudit-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync } from '../lib/syncproc.mjs';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const {
  ToolRegistry,
  InMemoryWorkspace,
  registerWorkspaceTools,
  predicateRunner,
  registerTestTools,
  runTask,
  policyCheckpoint,
  auditGateHistory,
  auditLineFor,
  recordsFromDecisions,
} = rt;
const { NODE_SPAWN, createExecHost, gitCommitPolicy, gitEnv, registerGitCommitTool } = eh;

// ── A human checkpoint that RECORDS what the person did, exactly like the v41 human face ──
// It is the source of truth this whole proof grades against: whatever it says is history.
function recordingHuman(opinion) {
  const history = [];
  const checkpoint = (req) => {
    const granted = opinion(req.call.tool);
    history.push({ tool: req.call.tool, granted, by: 'human', reason: granted ? 'person allowed it' : 'person vetoed it' });
    return granted;
  };
  return { checkpoint, history };
}

const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dir = mkdtempSync(join(tmpdir(), 'nexus-policyaudit-'));
const posixDir = dir.replace(/\\/g, '/');

try {
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', dir]);
  git('config', 'user.name', 'NEXUS Policy Audit Proof');
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
  const task = { id: 'pa1', goal: 'add widget docs', targetPath: 'notes/widget.md' };
  const buildRegistry = () => {
    const ws = new InMemoryWorkspace({ 'notes/widget.md': 'widget notes\n' });
    let registry = registerWorkspaceTools(new ToolRegistry(), ws);
    registry = registerTestTools(
      registry,
      predicateRunner(
        'policyaudit-demo',
        [{ name: 'marker-present', check: (files) => ((files['notes/widget.md'] ?? '').includes('NOTE (DEMO') ? null : 'note missing') }],
        () => ws.snapshot(),
      ),
    );
    registry = registerGitCommitTool(registry, host, { env: gitEnv() });
    return registry;
  };

  // ── 1) REAL RUN #1 — a cautious human: work + verification yes, committing NO ──────────
  const cautious = recordingHuman((tool) => tool !== 'git.commit');
  const out1 = await runTask(task, { registry: buildRegistry(), checkpoint: cautious.checkpoint, maxFixRounds: 0 });
  assert.equal(out1.status, 'denied', 'the cautious person stopped the commit at §28');
  assert.equal(spawns.length, 0, 'a vetoed commit spawns nothing');
  assert.equal(git('rev-parse', 'HEAD').trim(), rootHead, 'history unmoved — a person said no');
  assert.deepEqual(
    cautious.history.map((h) => [h.tool, h.granted]),
    [['fs.append', true], ['test.run', true], ['git.commit', false]],
    'the recorded HUMAN history: hands allowed, history kept closed',
  );
  console.log(`[policyaudit-proof] real run #1: human recorded ${cautious.history.length} verdicts, commit vetoed, 0 spawns, HEAD unmoved`);

  // ── 2) REAL RUN #2 — an approving human: the same plan, now all the way through ────────
  const permissive = recordingHuman(() => true);
  const out2 = await runTask(task, { registry: buildRegistry(), checkpoint: permissive.checkpoint, maxFixRounds: 0 });
  assert.equal(out2.status, 'completed');
  assert.equal(spawns.length, 1, 'exactly one process: the human-approved commit');
  assert.ok(git('rev-parse', 'HEAD').trim().startsWith(out2.results.at(-1).output.record.hash), 'history really moved');
  const approvingHistory = permissive.history;
  assert.deepEqual(approvingHistory.map((h) => [h.tool, h.granted]), [['fs.append', true], ['test.run', true], ['git.commit', true]]);

  // ── 3) REAL RUN #3 — a POLICY face, so the audit has non-human records to refuse ───────
  const policyTable = {
    rules: [
      { tool: 'fs.*', grant: true, reason: 'the run may edit its workspace' },
      { tool: 'test.run', grant: true, reason: 'verification is never scary' },
      { tool: 'git.commit', grant: false, reason: 'history stays closed in this host' },
    ],
    default: { grant: false, reason: 'nothing else was ever discussed' },
  };
  const cp = policyCheckpoint(policyTable);
  const out3 = await runTask(task, { registry: buildRegistry(), checkpoint: cp, maxFixRounds: 0 });
  assert.equal(out3.status, 'denied');
  const policyRecords = recordsFromDecisions(cp.decisions);
  assert.equal(policyRecords.length, 3);
  assert.ok(policyRecords.every((r) => r.by === 'policy'), 'every receipt from a table is a POLICY record');
  console.log(`[policyaudit-proof] real run #3: policy face produced ${policyRecords.length} receipts, each self-labelled by:'policy'`);

  // ══════════════════════════════════════════════════════════════════════════════════════
  // 4) THE AUDIT — grade candidate tables against the REAL recorded history
  // ══════════════════════════════════════════════════════════════════════════════════════

  // 4a) The faithful table: exactly the cautious person's own verdicts, written down.
  const faithful = {
    rules: [
      { tool: 'fs.*', grant: true, reason: 'hands may work' },
      { tool: 'test.run', grant: true, reason: 'verification is cheap' },
      { tool: 'git.commit', grant: false, reason: 'committing is a human act' },
    ],
    default: { grant: false, reason: 'unlisted capabilities escalate to a person' },
  };
  const a1 = auditGateHistory(faithful, cautious.history);
  assert.equal(a1.total, 3);
  assert.equal(a1.audited, 3);
  assert.equal(a1.agreed, 3);
  assert.equal(a1.agreement, 1);
  assert.deepEqual(a1.divergences, []);
  assert.deepEqual(a1.silentApprovals, [], 'every grant came from a named rule, none from the blanket default');
  assert.equal(auditLineFor(a1), 'audit: 3/3 agreed');

  // 4b) The CONVENIENT table: someone "just" let the commit through. This is the whole point.
  const convenient = {
    rules: [
      { tool: 'fs.*', grant: true, reason: 'hands may work' },
      { tool: 'test.run', grant: true, reason: 'verification is cheap' },
      { tool: 'git.commit', grant: true, reason: 'it passed the tests, let it land' },
    ],
    default: { grant: false, reason: 'unlisted capabilities escalate' },
  };
  const a2 = auditGateHistory(convenient, cautious.history);
  assert.equal(a2.agreed, 2);
  assert.equal(a2.agreement, 2 / 3);
  assert.equal(a2.divergences.length, 1);
  assert.deepEqual(
    { index: a2.divergences[0].index, tool: a2.divergences[0].tool, kind: a2.divergences[0].kind, matched: a2.divergences[0].matched },
    { index: 2, tool: 'git.commit', kind: 'too-permissive', matched: 'git.commit' },
  );
  assert.equal(a2.divergences[0].reason, 'it passed the tests, let it land', 'the report quotes the TABLE’s own words back at it');
  assert.match(auditLineFor(a2), /would ALLOW what a human vetoed: git\.commit/);
  console.log(`[policyaudit-proof] the convenient table is caught BEFORE it is ever used: ${auditLineFor(a2)}`);

  // 4c) The PARANOID table: blocks something the person was happy to allow.
  const paranoid = {
    rules: [
      { tool: 'fs.*', grant: true, reason: 'hands may work' },
      { tool: 'test.run', grant: false, reason: 'running tests costs compute' },
      { tool: 'git.commit', grant: false, reason: 'committing is a human act' },
    ],
    default: { grant: false, reason: 'unlisted capabilities escalate' },
  };
  const a3 = auditGateHistory(paranoid, cautious.history);
  assert.equal(a3.divergences.length, 1);
  assert.equal(a3.divergences[0].kind, 'too-strict');
  assert.equal(a3.divergences[0].tool, 'test.run');
  assert.match(auditLineFor(a3), /would BLOCK what a human allowed: test\.run/);

  // 4d) The BLANKET table: no rules at all, a default that says yes to everything.
  const blanket = { rules: [], default: { grant: true, reason: 'the agent has been reliable so far' } };
  const a4 = auditGateHistory(blanket, cautious.history);
  assert.equal(a4.agreed, 2, 'it happens to agree on the two grants…');
  assert.equal(a4.divergences.length, 1, '…and disagrees on the veto');
  assert.deepEqual(a4.silentApprovals, ['fs.append', 'test.run'], 'named: approvals the table never actually wrote down');
  assert.match(auditLineFor(a4), /default-only for: fs\.append, test\.run/);
  console.log(`[policyaudit-proof] blanket default flagged: ${auditLineFor(a4)}`);

  // 4e) No gap, no overlap: every default-granted call is a silent approval XOR a divergence.
  const defaultGranted = ['fs.append', 'test.run'];
  const covered = new Set([...a4.silentApprovals, ...a4.divergences.map((d) => d.tool)]);
  for (const tool of defaultGranted) assert.ok(covered.has(tool), `${tool} must be reported somewhere`);
  assert.equal(new Set(a4.silentApprovals).size, a4.silentApprovals.length, 'silentApprovals never repeats a tool');

  // 4f) THE HONESTY RULE: policy-made records are skipped, never counted as agreement.
  const approvingTable = {
    rules: [
      { tool: 'fs.*', grant: true, reason: 'hands may work' },
      { tool: 'test.run', grant: true, reason: 'verification is cheap' },
      { tool: 'git.commit', grant: true, reason: 'this person approves commits' },
    ],
    default: { grant: false, reason: 'unlisted capabilities escalate' },
  };
  const mixed = [...approvingHistory, ...policyRecords];
  const a5 = auditGateHistory(approvingTable, mixed);
  assert.equal(a5.total, 6, 'three human verdicts and three policy receipts');
  assert.equal(a5.audited, 3, 'only the three HUMAN verdicts are graded');
  assert.equal(a5.skippedPolicyRecords, 3);
  assert.equal(a5.agreed, 3);
  assert.deepEqual(a5.divergences, [], 'a table agreeing with its own past output proves nothing — so it is not asked');
  assert.match(auditLineFor(a5), /3 policy record\(s\) not counted/);

  // The SAME faithful table graded against the APPROVING human flags the one thing they
  // disagree on — proof that the audit is about the people, not about the table alone.
  const a5b = auditGateHistory(faithful, approvingHistory);
  assert.equal(a5b.agreed, 2);
  assert.equal(a5b.divergences.length, 1);
  assert.equal(a5b.divergences[0].tool, 'git.commit');
  assert.equal(a5b.divergences[0].kind, 'too-strict', 'the cautious table blocks a commit this person allowed');

  // A history of ONLY policy records proves nothing about people.
  const a6 = auditGateHistory(faithful, policyRecords);
  assert.equal(a6.audited, 0);
  assert.equal(a6.agreement, 0, 'nothing is proven about nothing — never a vacuous 100%');
  assert.equal(auditLineFor(a6), 'audit: no human decisions in 3 record(s) — nothing to grade');
  console.log(`[policyaudit-proof] honesty rule holds: ${auditLineFor(a6)}`);

  // 4g) The approving human grades the SAME convenient table as clean — same table, different people.
  const a7 = auditGateHistory(convenient, approvingHistory);
  assert.equal(a7.agreement, 1, 'for a person who approves commits, this table is faithful');
  assert.deepEqual(a7.divergences, []);
  console.log('[policyaudit-proof] same table, two humans: "too permissive" is relative to the people it replaces, and the audit says so');

  // ── 5) Purity + determinism: the audit is a reader, not a writer ───────────────────────
  const policyBefore = JSON.stringify(convenient);
  const historyBefore = JSON.stringify(cautious.history);
  auditGateHistory(convenient, cautious.history);
  assert.equal(JSON.stringify(convenient), policyBefore, 'the policy is untouched');
  assert.equal(JSON.stringify(cautious.history), historyBefore, 'the history is untouched');
  assert.equal(
    JSON.stringify(auditGateHistory(convenient, cautious.history)),
    JSON.stringify(auditGateHistory(convenient, cautious.history)),
    'byte-identical reports for byte-identical inputs',
  );

  // Malformed tables are refused before they can be graded, let alone trusted.
  assert.throws(
    () => auditGateHistory({ rules: [{ tool: 'a', grant: true, reason: 'r' }, { tool: 'a', grant: false, reason: 'r' }], default: { grant: false, reason: 'd' } }, []),
    /duplicate tool pattern/,
  );
  assert.throws(() => auditGateHistory({ rules: [] }, []), /explicit default/);
  console.log('[policyaudit-proof] purity + determinism + validation: the audit never writes, never invents, never grades a table that cannot gate');
} finally {
  rmSync(dir, { recursive: true, force: true });
  assert.ok(!existsSync(dir), 'the throwaway repo is gone');
}

assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: home repo HEAD byte-identical — every write lived in os.tmpdir');
console.log('[policyaudit-proof] ALL ASSERTIONS PASSED (§28 tables can now be graded against the people they replace, before they are trusted)');
