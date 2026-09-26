// NEXUS M2 v54 (runtime) — the RUN line answers for its own gates (ADR 0016 amendment 54).
// v50 gave the durable ARC its §28 receipts and closed by naming what was still missing: "the
// editor's fs.append and test.run gates are still nowhere in the file, since the anti-fold cuts both
// ways." A cold reader could ask who allowed the commit and get an answer; the same reader asking who
// allowed the WRITE that the commit recorded got silence. This closes that bound the same way v50
// closed v49's — by lifting the rule, not copying it: `receiptsOrNote` and `gatedCallIds` now live in
// checkpointPolicy.ts and serve both record kinds, so `decisions: []` cannot mean one thing on an arc
// line and another thing on a run line. Deliberately narrow (§60):
//  - a record answers ONLY for calls its own `results` transcript shows it made — the designer's
//    brief is gated and appears on no line, because no line owns a chained stage's own call;
//  - ownership is now CHECKED on read, not just followed by construction (receiptsOwned in ledger.ts):
//    a complete, well-formed receipt for a call the record never made makes the WHOLE line malformed;
//  - nothing is recorded unless the line is HEADED FOR A LEDGER: the dock's in-memory chains keep the
//    pre-v54 outcome byte-for-byte, which is also why the Studio dock is untouched by this amendment.
// §1 is the data face with no process in sight. §2 runs the REAL chain against REAL git in a throwaway
// os.tmpdir repo and triangulates: the durable receipts, the decider's own list, the workspace the
// granted write actually changed, the git processes counted on the spawn seam, the commits counted by
// `git rev-list`, and a §26 memory file read cold from real disk.
// §9: every write here is inside os.tmpdir and deleted below; git PUSH never happens; staging the
// index stays a HUMAN act — the doors read it, none of them write it.
// Run after `npm run build`:  node docs/evidence/agents/runreceipts-proof.mjs
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
  MemoryStore,
  RoleRegistry,
  DEMO_ROLES,
  GIT_ARC_TOOLS,
  NO_RECEIPTS_NOTE,
  RELEASE_ROLE,
  formatLedgerLine,
  gatedCallIds,
  loadLedger,
  parseLedgerLine,
  policyCheckpoint,
  receiptsOrNote,
  registerMemoryTools,
  registerWorkspaceTools,
  runRoleChain,
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

const STAGE_RULES = [
  { tool: 'fs.*', grant: true, reason: 'the demo workspace is open to every stage' },
  { tool: 'memory.*', grant: true, reason: 'recalling the past is not writing the repo' },
  { tool: 'test.run', grant: true, reason: 'verification is always welcome' },
];
const GIT_OPEN = { tool: 'git.*', grant: true, reason: 'the release window is open today' };
const OPEN_ARC = { rules: [...STAGE_RULES, GIT_OPEN], default: { grant: false, reason: 'unlisted tools are refused' } };
// The run's OWN verification, refused by its own row (listed FIRST: the first match wins).
const VETO_VERIFY = { rules: [{ tool: 'test.run', grant: false, reason: 'this host runs no verification the agent may invoke' }, ...STAGE_RULES.filter((r) => r.tool !== 'test.run'), GIT_OPEN], default: { grant: false, reason: 'unlisted tools are refused' } };

// 1) THE RULE, BEFORE ANY CHAIN: which calls of a record need an answer at all, and what the three
//    kinds of "no answer" mean. Same function for both record kinds — that is the whole design.
{
  const reg = new ToolRegistry();
  const spec = (name, permissions) => ({ name, description: '', permissions, args: [] });
  for (const [name, permissions] of [
    ['fs.search', ['read']],
    ['memory.recall', ['read']],
    ['fs.append', ['write']],
    ['test.run', ['exec']],
    ['git.commit', ['exec']],
  ]) reg.register(spec(name, permissions), () => ({ ok: true }));
  const calls = [
    { callId: 'r1:search', tool: 'fs.search' },
    { callId: 'r1:recall', tool: 'memory.recall' },
    { callId: 'r1:annotate', tool: 'fs.append' },
    { callId: 'r1:verify', tool: 'test.run' },
    { callId: 'r1:release:commit', tool: 'git.commit' },
  ];
  assert.deepEqual(gatedCallIds(reg, calls), ['r1:annotate', 'r1:verify', 'r1:release:commit'], 'a read-permission call is not gated, so no receipt may ever claim §28 spoke for it — and the four read calls in a real run line are silent for exactly this reason');
  // Call ids alone are not the boundary: the SAME helper answers for the arc's doors and the run's
  // steps, so a next month\'s record cannot invent a second meaning for an empty list.
  const face = policyCheckpoint(OPEN_ARC);
  face({ call: calls[2], permissions: ['write'] });
  face({ call: { callId: 'someone-else:annotate', tool: 'fs.append', args: {} }, permissions: ['write'] });
  const mine = receiptsOrNote(face, ['r1:annotate']);
  assert.deepEqual(mine, { decisions: [{ call: calls[2], granted: true, matched: 'fs.*', reason: 'the demo workspace is open to every stage' }] }, 'one owned call in ⇒ one receipt out, and the face\'s OTHER decision (another record\'s call) stays off it (§60: no borrowed alibis, in either direction)');
  assert.equal(mine.note, undefined, 'a face that keeps a list owes no explanation');
  const silent = receiptsOrNote(() => true, ['r1:annotate']);
  assert.deepEqual(silent, { decisions: [], note: NO_RECEIPTS_NOTE }, 'a face with nothing to read says so — the second of the three silences');
  assert.deepEqual(receiptsOrNote(() => true, []), { decisions: [] }, 'and a record that gated NOTHING is silent honestly: empty list, no note, no gap to explain (§60)');

  // The checked half: v50 refused a HALF receipt; v54 refuses a COMPLETE one that names a call the
  // record never made. Same reason string as the shape check, because a reader cannot tell the two
  // kinds of "nothing trustworthy here" apart — so the file must not offer the choice.
  const runLine = { task: { id: 'r1', goal: 'g' }, provenance: { mode: 'demo', runtime: 'nexus-agent-runtime', version: '0.1.0' }, plan: { goal: 'g', seed: 1, steps: [] }, results: [calls[0], calls[2]].map((c) => ({ ...c, ok: true, output: {} })), events: [], status: 'completed' };
  const arcLine = { kind: 'git-arc', provenance: runLine.provenance, runId: 'r1', goal: 'g', role: RELEASE_ROLE, arc: { doors: [...GIT_ARC_TOOLS], steps: [], results: [{ ...calls[4], ok: true, output: {} }], status: 'completed', notes: [] } };
  const owned = (c) => ({ call: c, granted: true, matched: 'fs.*', reason: 'the demo workspace is open to every stage' });
  assert.equal(parseLedgerLine(JSON.stringify({ ...runLine, decisions: [owned(calls[2])] })).ok, true, 'a run line that made the call may answer for it');
  assert.deepEqual(parseLedgerLine(JSON.stringify({ ...runLine, decisions: [owned(calls[4])] })), { ok: false, reason: 'not a RunOutcome record' }, 'a run line holding a git door\'s receipt is a paste — every field present, and still junk');
  assert.deepEqual(parseLedgerLine(JSON.stringify({ ...arcLine, arc: { ...arcLine.arc, decisions: [owned(calls[2])] } })), { ok: false, reason: 'not a complete git-arc record' }, 'and the other direction is refused by the same word, because it is the same rule');
  console.log('[runreceipts] data: one ownership rule, two record kinds, three silences — and a pasted receipt is malformed on both');
}

// 2) THE REAL CHAIN: four keyed git doors, one real node:fs ledger, one throwaway repository.
const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dir = mkdtempSync(join(tmpdir(), 'nexus-runreceipts-'));
const posixDir = dir.replace(/\\/g, '/');
const LEDGER_FILE = join(dir, 'nexus-chain-ledger.jsonl').replace(/\\/g, '/');
const MEMORY_FILE = join(dir, 'nexus-memory.json').replace(/\\/g, '/');
const SEED_FILE = 'human seed widget doc\n';
const stagedLines = (extra = []) => ['widget rotation notes', 'a second line with "quotes" and  double spaces', 'third line — the human wrote this', ...extra];
try {
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', dir]);
  git('config', 'user.name', 'NEXUS Run-Receipts Proof');
  git('config', 'user.email', 'proof@nexus.invalid');
  git('config', 'core.hooksPath', '.no-hooks'); // global codex hooks neutralized INSIDE the temp repo only
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'widget.md'), SEED_FILE);
  git('add', 'docs/widget.md');
  git('commit', '-q', '-m', 'chore: human seed commit');
  const commitsAt = () => Number(git('rev-list', '--count', 'HEAD'));
  const headSha = () => git('rev-parse', 'HEAD').trim();
  assert.equal(commitsAt(), 1);

  const spawns = [];
  const counting = (command, args, opts) => {
    spawns.push(`${command} ${args.join(' ')}`);
    return NODE_SPAWN(command, args, opts);
  };
  const doors = {
    staged: createExecHost(gitStagedPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting }),
    commit: createExecHost(gitCommitPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting }),
    log: createExecHost(gitLogPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting }),
    show: createExecHost(gitShowPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting }),
  };
  /** The editor's `test.run` is a stub the SAME host owns: it reads the workspace the run wrote. */
  function chainHost(marker) {
    const ws = new InMemoryWorkspace({ 'docs/widget.md': '# Widget\n\nwidget rotation notes\n', 'docs/extra.md': '# Extra\n\nmisc\n' });
    const store = new MemoryStore();
    let registry = registerWorkspaceTools(new ToolRegistry(), ws);
    registry.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => ({
      ok: ws.read('docs/widget.md').includes(marker),
      detail: `docs/widget.md ${ws.read('docs/widget.md').includes(marker) ? 'carries' : 'does NOT carry'} "${marker}"`,
    }));
    registry = registerMemoryTools(registry, store, 'runreceipts');
    registry = registerGitStagedTool(registry, doors.staged, { env: gitEnv() });
    registry = registerGitCommitTool(registry, doors.commit, { env: gitEnv() });
    registry = registerGitLogTool(registry, doors.log, { env: gitEnv() });
    registry = registerGitShowTool(registry, doors.show, { env: gitEnv() });
    return { ws, store, registry };
  }
  const stage = (extra = []) => {
    writeFileSync(join(dir, 'docs', 'widget.md'), `${SEED_FILE}${stagedLines(extra).join('\n')}\n`);
    git('add', 'docs/widget.md');
  };
  const cold = () => loadLedger(fs, LEDGER_FILE);
  const runOf = (id) => cold().runs.find((r) => r.task.id === id);
  const arcOf = (id) => cold().arcs.find((a) => a.runId === id);
  const roles = new RoleRegistry();
  DEMO_ROLES.forEach((r) => roles.register(r));
  const released = (id, h, checkpoint, ledger = true) =>
    runRoleChain({ id, goal: 'annotate widget rotation docs' }, {
      roles, registry: h.registry, store: h.store, scope: 'runreceipts', checkpoint, fsLike: fs,
      ...(ledger ? { ledgerFile: LEDGER_FILE } : {}), memoryFile: MEMORY_FILE, release: true, maxFixRounds: 0,
    });
  /** The calls the editor loop itself made, in ask order: its write and its verification. */
  const RUN_CALLS = (id) => [`${id}:annotate`, `${id}:verify`];
  const ARC_CALLS = (id) => ['staged', 'commit', 'confirm', 'inspect'].map((s) => `${id}:release:${s}`);
  /** Re-derive v54's invariant over the whole file instead of trusting the writer a second time. */
  const everyReceiptOwned = () => {
    const { runs, arcs } = cold();
    let receipts = 0;
    for (const r of runs) {
      receipts += r.decisions?.length ?? 0;
      assert.ok((r.decisions ?? []).every((d) => r.results.some((x) => x.callId === d.call.callId)), `run line ${r.task.id} holds a receipt for a call it never made`);
    }
    for (const a of arcs) {
      receipts += a.arc.decisions?.length ?? 0;
      assert.ok(a.arc.decisions === undefined || a.arc.decisions.every((d) => a.arc.results.some((x) => x.callId === d.call.callId)), `arc line ${a.runId} holds a receipt for a door it never knocked on`);
    }
    return receipts;
  };

  // 2a) GREEN CHAIN, TWO LINES, ONE ANSWER EACH. The run line answers for the write and the check;
  //     the arc line answers for the four doors; the arithmetic says the WHOLE walk is accounted for
  //     except the one call v54 still cannot own (the brief), and that exception is counted, not waved.
  stage();
  const h = chainHost('NOTE (DEMO MODE');
  const open = policyCheckpoint(OPEN_ARC);
  const spawnsAt = spawns.length;
  const commitsAt0 = commitsAt();
  const res = await released('rr-1', h, open);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.editorOutcome.status, 'completed');
  assert.equal(cold().malformed, 0, 'the tightened shape check loads everything this runtime just wrote — four scenarios of real records, zero junk lines');
  const run = runOf('rr-1');
  assert.deepEqual(run, res.editorOutcome, 'v49\'s identity, now on the run face: the line in the file IS the outcome the caller holds, receipts included');
  assert.deepEqual(run.decisions.map((d) => d.call.callId), RUN_CALLS('rr-1'), 'the durable run line names the two calls §28 disposed of for THIS run, in ask order');
  assert.deepEqual(run.decisions.map((d) => [d.call.tool, d.granted, d.matched, d.reason]), [
    ['fs.append', true, 'fs.*', 'the demo workspace is open to every stage'],
    ['test.run', true, 'test.run', 'verification is always welcome'],
  ], 'each receipt carries the RULE that decided and the human\'s sentence, not the runtime\'s summary of it');
  assert.ok(run.results.length > run.decisions.length, 'and the line made MORE calls than it answers for: fs.index, memory.recall and the search step are reads, so §28 never spoke for them and nothing claims otherwise (§60)');
  assert.equal(run.decisions.some((d) => d.call.tool.startsWith('git.')), false, 'the four git doors two records below are NOT folded in, though the same face decided them in the same milliseconds');
  const arc = arcOf('rr-1');
  assert.deepEqual(arc.arc.decisions.map((d) => d.call.callId), ARC_CALLS('rr-1'), 'the arc line still answers for exactly its own doors (v50 holds)');
  const journaled = [...run.decisions, ...arc.arc.decisions].map((d) => d.call.callId);
  assert.equal(new Set(journaled).size, 6, 'six receipts on two lines, no call answered for twice');
  // The face is a THIRD source, and it disagrees with neither line: one list, in the order §28 was
  // asked — the designer's brief first (stage 2), the editor's own calls next (stage 4), the doors last.
  assert.deepEqual(open.decisions.map((d) => d.call.callId), ['rr-1:brief', ...RUN_CALLS('rr-1'), ...ARC_CALLS('rr-1')], 'the decider\'s own transcript, in ask order, is the seven gates the two durable records split between them');
  assert.equal(open.decisions.length, 7, 'the face held SEVEN gates: two the run owns, four the arc owns, and the designer\'s brief that belongs to neither record');
  assert.equal(journaled.includes('rr-1:brief'), false, 'THE HONEST EXCEPTION, stated as data: a chained stage\'s own call is journaled on NO line, because no line owns the chain — the fix is a third record kind, not a paste (v55\'s candidate)');
  assert.equal(new Set([...journaled, 'rr-1:brief']).size, open.decisions.length, 'and the arithmetic closes: face decisions = journaled + brief, exactly one unowned gate, none invented');
  // Corroboration from OUTSIDE the runtime's memory: the granted write has an EFFECT, and the
  // granted doors have PROCESSES and a COMMIT behind them.
  assert.ok(h.ws.read('docs/widget.md').includes('NOTE (DEMO MODE'), 'the fs.append grant the run line claims is visible in the workspace the run acted through — a receipt claiming a yes whose effect is absent is a forged grant');
  assert.equal(spawns.length, spawnsAt + 4, 'four doors granted, four real git processes');
  assert.equal(commitsAt(), commitsAt0 + 1, 'and one commit landed, counted by git itself, not by the runtime');
  assert.ok(headSha().startsWith(arc.arc.results.find((r) => r.tool === 'git.commit').output.record.hash), 'the durable hash is still the repository\'s own HEAD');
  console.log(`[runreceipts] REAL: run line owns ${run.decisions.length} gates · arc line owns ${arc.arc.decisions.length} · face holds ${open.decisions.length} (the brief on none)`);

  // 2b) THE RUN'S OWN VERIFICATION REFUSED: v50 could show a vetoed DOOR; this shows a vetoed STEP.
  //     The refusal lands on the run line, and everything the veto did NOT reach stays recorded true.
  const h2 = chainHost('NOTE (DEMO MODE');
  const spawnsAtVeto = spawns.length;
  const commitsAtVeto = commitsAt();
  const res2 = await released('rr-2', h2, policyCheckpoint(VETO_VERIFY));
  assert.equal(res2.ok, true, 'the chain still reports honestly: the stages ran, the run did not finish');
  assert.equal(res2.editorOutcome.status, 'denied');
  const run2 = runOf('rr-2');
  assert.deepEqual(run2.decisions.map((d) => [d.call.tool, d.granted, d.matched]), [['fs.append', true, 'fs.*'], ['test.run', false, 'test.run']], 'a refusal is a receipt too: the granted write and the vetoed check sit side by side in the order they were asked');
  assert.equal(run2.decisions[1].reason, 'this host runs no verification the agent may invoke', 'in the human\'s own words, on the line a cold reader loads (§28 answered, and the answer is durable)');
  assert.ok(h2.ws.read('docs/widget.md').includes('NOTE (DEMO MODE'), 'the earlier grant stands on the workspace: a later veto did not rewrite it into a refusal');
  const arc2 = arcOf('rr-2');
  assert.equal(arc2.arc.status, 'no-arc', 'behind a red editor there is no arc');
  assert.deepEqual(arc2.arc.decisions, [], 'and its empty list is the THIRD silence: nothing was gated, not "nothing was said"');
  assert.deepEqual(arc2.arc.notes, [], '…so it owes no note — the empty is explained by its status, and a reader never guesses');
  assert.equal(spawns.length, spawnsAtVeto, 'a denied verification spends ZERO git processes');
  assert.equal(commitsAt(), commitsAtVeto, 'and moves no history');
  // A second durable file, read cold from real disk: §26 says the same thing the ledger says.
  const memory = fs.readFileSync(MEMORY_FILE, 'utf8');
  assert.match(memory, /editor stage ended denied/, 'the memory the HOST wrote about this release names the editor\'s denial — two durable artifacts, one story, and neither produced by the other');
  assert.equal(cold().malformed, 0);
  assert.ok(everyReceiptOwned() >= 6, 'the ownership invariant re-derived over every line written so far');
  console.log('[runreceipts] REAL: a vetoed verification is durable on the run line, the granted write still stands, the arc\'s emptiness is its own kind of true');

  // 2c) NOT DURABLE ⇒ NOTHING RECORDED. The dock's face, byte-for-byte unchanged by v54.
  const linesBefore = fs.readFileSync(LEDGER_FILE, 'utf8').split('\n').filter((l) => l.trim() !== '').length;
  const h3 = chainHost('NOTE (DEMO MODE');
  const res3 = await released('rr-3', h3, policyCheckpoint(OPEN_ARC), false);
  assert.equal(res3.editorOutcome.status, 'completed');
  assert.equal('decisions' in res3.editorOutcome, false, 'an in-memory run line stores nothing, so it answers for nothing (§60: no cost without a reader)');
  assert.equal('decisionsNote' in res3.editorOutcome, false, '…not even an empty note to misread');
  assert.equal('decisions' in res3.release, false, 'the same rule the arc learned in v50, from the same flag');
  assert.equal(fs.readFileSync(LEDGER_FILE, 'utf8').split('\n').filter((l) => l.trim() !== '').length, linesBefore, 'and the audit trail gained no line for a chain that was never asked to be audited');

  // 2d) A FACE WITH NOTHING TO SHOW: the live Allow-once human keeps no list the runtime can read.
  //     Both kinds now say the SAME sentence in their own field — and the walk is untouched by it.
  const spawnsAtPlain = spawns.length;
  const commitsAtPlain = commitsAt();
  stage(['the human staged a version for a face that keeps no list']);
  const h4 = chainHost('NOTE (DEMO MODE');
  const res4 = await released('rr-4', h4, () => true);
  const run4 = runOf('rr-4');
  assert.deepEqual(run4.decisions, [], 'four stages gated by a human hand, zero receipts the runtime can read');
  assert.equal(run4.decisionsNote, NO_RECEIPTS_NOTE, 'the run line says WHY — the sentence v50 introduced for the arc, now on the other kind');
  const arc4 = arcOf('rr-4');
  assert.deepEqual(arc4.arc.notes, [NO_RECEIPTS_NOTE], '…and it is ONE sentence, exported once, not two paragraphs that drift apart');
  assert.equal(arc4.arc.decisions.length, 0);
  assert.equal(spawns.length, spawnsAtPlain + 4, 'the walk itself is unchanged by who is watching it: still four real processes');
  assert.equal(commitsAt(), commitsAtPlain + 1, 'and its commit is history, veto or no veto');
  assert.ok(headSha().startsWith(arc4.arc.results.find((r) => r.tool === 'git.commit').output.record.hash));
  console.log('[runreceipts] REAL: one sentence, two fields, a walk that spent the same four processes either way');
} finally {
  rmSync(dir, { recursive: true, force: true });
  assert.ok(!existsSync(dir), 'the throwaway repo — and its ledger and memory files — are gone');
}
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: home repo HEAD byte-identical — every read, write, commit and receipt lived in os.tmpdir');
console.log('[runreceipts] ALL ASSERTIONS PASSED (the run line answers for its own gates, the brief answers for none, and a paste is junk on both kinds)');
