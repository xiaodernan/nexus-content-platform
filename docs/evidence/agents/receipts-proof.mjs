// NEXUS M2 v50 (runtime) — the durable arc answers WHO allowed each door (ADR 0016 amendment 50).
// Amendment 49 closed v47's bound about the walk surviving its process, and opened its own: the
// ledger recorded what the runtime ASKED and what git ANSWERED, but not what the human DECIDED — a
// reader could see a refusal's effect and not its reason. v40 turned §28 into a table with a
// REQUIRED reason per row and a receipt per verdict; v50 lets a walk headed for the ledger carry
// its own receipts, so one JSONL line answers both questions. Deliberately narrow (§60):
//  - matched by CALL ID, not by tool name — the editor's `test.run` gate is not the arc's alibi;
//  - the list is CLONED out of the face, so a process cannot edit its own audit trail afterwards;
//  - a face that keeps no list says so in `notes` instead of leaving an empty field to interpret;
//  - nothing is recorded unless the walk is HEADED FOR THE LEDGER: the dock's in-memory chains get
//    the v47/v49 outcome byte-for-byte, because a receipt nobody stores is a cost with no benefit.
// §2 proves it against REAL git in a throwaway os.tmpdir repo: a granted arc whose four receipts
// match its four processes and whose hash matches HEAD, a table-vetoed content door whose reason
// sits beside a commit it cannot undo, a closed table that stops the walk at the first door with
// ONE receipt naming `default`, and a hand-forged half-receipt counted as junk rather than trusted.
// v54 tightened the door this proof walks through, and two fixtures here are its cost: `results` is
// now read as the record's OWN transcript, so a line may only carry receipts for calls IT made —
// §1's arc line shows that, and §2e forges a COMPLETE but pasted receipt next to the reason-less one
// to prove a cold reader checks it rather than admiring the fields.
// §9: every write here is inside os.tmpdir and deleted below; git PUSH never happens; staging the
// index stays a HUMAN act — the doors read it, none of them write it.
// Run after `npm run build`:  node docs/evidence/agents/receipts-proof.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
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
  isArcRecord,
  loadLedger,
  parseLedgerLine,
  policyCheckpoint,
  registerMemoryTools,
  registerWorkspaceTools,
  runGitArc,
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

// The tables below are DATA, exactly as v40 defined it: ordered rules, first match wins, and an
// EXPLICIT default whose reason is required — so a refusal always has a sentence to quote.
const STAGE_RULES = [
  { tool: 'fs.*', grant: true, reason: 'the demo workspace is open to every stage' },
  { tool: 'memory.*', grant: true, reason: 'recalling the past is not writing the repo' },
  { tool: 'test.run', grant: true, reason: 'verification is always welcome' },
];
const GIT_OPEN = { tool: 'git.*', grant: true, reason: 'the release window is open today' };
const OPEN_ARC = { rules: [...STAGE_RULES, GIT_OPEN], default: { grant: false, reason: 'unlisted tools are refused' } };
// Listed BEFORE `git.*` because the first match wins: this is how a table says "everything except one".
const VETO_INSPECT = { rules: [...STAGE_RULES, { tool: 'git.show', grant: false, reason: 'only the human reads HEAD\'s contents' }, GIT_OPEN], default: { grant: false, reason: 'unlisted tools are refused' } };
const CLOSED_ARC = { rules: [...STAGE_RULES], default: { grant: false, reason: 'nothing outside the workspace is allowed today' } };

// 1) THE CONTRACT, with no process in sight: receipts are matched to their own walk, cloned out of
//    the face that holds them, and the ledger refuses to believe a half of one.
const stubDoors = () => {
  const reg = new ToolRegistry();
  const specs = { 'git.staged': { name: 'stat', type: 'boolean' }, 'git.commit': { name: 'message', type: 'string' }, 'git.log': { name: 'count', type: 'number' }, 'git.show': { name: 'path', type: 'string' } };
  for (const tool of GIT_ARC_TOOLS) reg.register({ name: tool, description: '', permissions: ['exec'], args: [specs[tool]] }, () => ({ ok: true, detail: `${tool}: walked` }));
  return reg;
};
const ARC_CALLS = (id) => ['staged', 'commit', 'confirm', 'inspect'].map((s) => `${id}:release:${s}`);

{
  const open = policyCheckpoint(OPEN_ARC);
  const durable = await runGitArc(stubDoors(), { callId: 'x:release', message: 'm', showPath: 'p', checkpoint: open, recordReceipts: true });
  assert.deepEqual(durable.decisions.map((d) => d.call.callId), ARC_CALLS('x'), 'one receipt per door, in ask order, each stamped with the CALL the arc actually made');
  assert.deepEqual([...new Set(durable.decisions.map((d) => `${d.matched}|${d.granted}|${d.reason}`))], ['git.*|true|the release window is open today'], 'the record names the RULE that decided and quotes its reason verbatim (§60: a verdict with no reason is a verdict nobody can audit)');
  const before = JSON.stringify(durable.decisions);
  open({ call: { callId: 'x:release:commit', tool: 'git.commit', args: {} }, permissions: ['exec'] });
  open.decisions[0].granted = false;
  assert.equal(JSON.stringify(durable.decisions), before, 'the list the arc holds is a COPY — a running process cannot rewrite what it already reported');

  const claimed = policyCheckpoint(OPEN_ARC);
  claimed({ call: { callId: 'x:verify', tool: 'git.commit', args: {} }, permissions: ['exec'] }); // an EARLIER stage, the SAME tool
  const scoped = await runGitArc(stubDoors(), { callId: 'x:release', message: 'm', showPath: 'p', checkpoint: claimed, recordReceipts: true });
  assert.equal(claimed.decisions.length, 5);
  assert.equal(scoped.decisions.length, 4, 'matched by CALL ID, not by tool: a gate another stage passed is not this arc\'s alibi');
  assert.ok(scoped.decisions.every((d) => d.call.callId.startsWith('x:release:')));

  const silent = await runGitArc(stubDoors(), { callId: 'y:release', message: 'm', showPath: 'p', checkpoint: () => true, recordReceipts: true });
  assert.deepEqual(silent.decisions, [], 'a face with no audit list yields an EMPTY list, honestly');
  assert.deepEqual(silent.notes, [NO_RECEIPTS_NOTE], '…and the line says so, because a silently absent field reads as "no decisions were made"');
  const unstored = await runGitArc(stubDoors(), { callId: 'z:release', message: 'm', showPath: 'p', checkpoint: policyCheckpoint(OPEN_ARC) });
  assert.equal('decisions' in unstored, false, 'NOT headed for the ledger ⇒ the v47/v49 outcome byte-for-byte: durability is what asks for receipts');
  const doorless = await runGitArc(new ToolRegistry(), { callId: 'w:release', message: 'm', showPath: 'p', checkpoint: () => true, recordReceipts: true });
  assert.deepEqual([doorless.status, doorless.decisions, doorless.notes], ['no-arc', [], []], 'a walk that gated NOTHING owes no explanation for an empty list');

  const receipt = { call: { callId: 'c1:release:commit', tool: 'git.commit', args: { message: 'm' } }, granted: true, matched: 'git.*', reason: 'the release window is open today' };
  // v54 reads `results` as the walk's own transcript, so this fixture shows a line that MADE the call
  // it answers for — a receipt beside an empty transcript is now a paste, not a compact example.
  const arcLine = { kind: 'git-arc', provenance: { mode: 'demo', runtime: 'nexus-agent-runtime', version: '0.1.0' }, runId: 'c1', goal: 'g', role: RELEASE_ROLE, arc: { doors: [...GIT_ARC_TOOLS], steps: [], results: [{ callId: 'c1:release:commit', tool: 'git.commit', ok: true, output: { record: { hash: 'abc1234' } } }], status: 'completed', notes: [], decisions: [receipt] } };
  assert.deepEqual(parseLedgerLine(formatLedgerLine(arcLine)), { ok: true, entry: arcLine }, 'a complete receipt round-trips through the file');
  for (const tamper of [[{ ...receipt, reason: undefined }], [{ ...receipt, granted: 'yes' }], [{ call: { tool: 'git.commit' }, granted: true, matched: 'git.*', reason: 'r' }], 'not an array']) {
    assert.deepEqual(
      parseLedgerLine(JSON.stringify({ ...arcLine, arc: { ...arcLine.arc, decisions: tamper } })),
      { ok: false, reason: 'not a complete git-arc record' },
      `a half-recorded decision makes the WHOLE line malformed (${JSON.stringify(tamper)})`,
    );
  }
  // v54's half of the same rule, on the shape v50 introduced: every field present, and still junk.
  assert.deepEqual(
    parseLedgerLine(JSON.stringify({ ...arcLine, arc: { ...arcLine.arc, decisions: [{ ...receipt, call: { callId: 'c1:release:never-knocked', tool: 'git.commit', args: {} } }] } })),
    { ok: false, reason: 'not a complete git-arc record' },
    'a COMPLETE receipt for a call this line never made is a paste, and a reader cannot see it from the fields alone',
  );
  const preV50 = { ...arcLine, arc: { doors: [], steps: [], results: [], status: 'no-arc', notes: [] } };
  assert.equal(parseLedgerLine(formatLedgerLine(preV50)).ok, true, 'a v49 line without the field still parses — the field is additive, not a migration');
  console.log('[receipts] data: receipts cloned, call-scoped, shape-checked — and absent unless the walk is durable');
}

// 2) THE REAL CHAIN, FOUR REAL DOORS, ONE JSONL FILE (§9 — the repo and its audit trail are deleted below).
const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dir = mkdtempSync(join(tmpdir(), 'nexus-receipts-'));
const posixDir = dir.replace(/\\/g, '/');
const LEDGER_FILE = join(dir, 'nexus-chain-ledger.jsonl').replace(/\\/g, '/');
const SEED_FILE = 'human seed widget doc\n';
const stagedLines = (extra = []) => ['widget rotation notes', 'a second line with "quotes" and  double spaces', 'third line — the human wrote this', ...extra];
try {
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', dir]);
  git('config', 'user.name', 'NEXUS Receipts Proof');
  git('config', 'user.email', 'proof@nexus.invalid');
  git('config', 'core.hooksPath', '.no-hooks'); // global codex hooks neutralized INSIDE the temp repo only
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false'); // the bytes the human stages are the bytes git records
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
  /** An in-memory corpus the four roles can research and annotate, plus the FOUR REAL DOORS. */
  function chainHost(marker) {
    const ws = new InMemoryWorkspace({ 'docs/widget.md': '# Widget\n\nwidget rotation notes\n', 'docs/extra.md': '# Extra\n\nmisc\n' });
    const store = new MemoryStore();
    let registry = registerWorkspaceTools(new ToolRegistry(), ws);
    registry.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => ({
      ok: ws.read('docs/widget.md').includes(marker),
      detail: `docs/widget.md ${ws.read('docs/widget.md').includes(marker) ? 'carries' : 'does NOT carry'} "${marker}"`,
    }));
    registry = registerMemoryTools(registry, store, 'receipts');
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
  const lastArc = () => cold().arcs.at(-1);
  const outOf = (rec, tool) => rec.arc.results.filter((r) => r.tool === tool).at(-1)?.output;
  /** The path the chain's OWN search step returned, read back from that run's durable line. */
  const searchedPath = (id) => {
    const runLine = cold().runs.find((r) => r.task.id === id);
    const hits = runLine?.results.filter((r) => r.callId.endsWith(':search')).at(-1)?.output?.hits;
    assert.ok(Array.isArray(hits) && hits.length > 0, `the ${id} run line carries search hits — the arc's content door reads one of them or lies`);
    return hits[0].path;
  };
  const roles = new RoleRegistry();
  DEMO_ROLES.forEach((r) => roles.register(r));
  const released = (id, h, checkpoint) =>
    runRoleChain({ id, goal: 'annotate widget rotation docs' }, {
      roles, registry: h.registry, store: h.store, scope: 'receipts', checkpoint, fsLike: fs, ledgerFile: LEDGER_FILE, release: true, maxFixRounds: 0,
    });

  // 2a) GRANTED BY A TABLE: the durable line carries four receipts, four processes spent four
  //     spawns, and the repository still signs off on the hash — three sources agreeing.
  stage();
  const h = chainHost('NOTE (DEMO MODE');
  const open = policyCheckpoint(OPEN_ARC);
  const spawnsAt = spawns.length;
  const res = await released('rc-1', h, open);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.release.status, 'completed');
  const rec = lastArc();
  assert.deepEqual(rec.arc, res.release, 'v49\'s identity EXTENDS to the receipts: the durable walk IS the returned walk, field for field');
  assert.deepEqual(rec.arc.decisions.map((d) => d.call.callId), ARC_CALLS('rc-1'), 'the receipts line up with the doors one-for-one');
  assert.deepEqual(rec.arc.decisions.map((d) => d.call.tool), [...GIT_ARC_TOOLS]);
  assert.ok(rec.arc.decisions.every((d) => d.granted && d.matched === 'git.*' && d.reason === 'the release window is open today'), 'each one names the RULE and quotes the reason the human wrote into the table');
  assert.equal(rec.arc.steps.find((s) => s.stepId === 'inspect').args.path, searchedPath('rc-1'), 'the path the receipts authorized is the path the chain\'s OWN search step returned in its run line — two durable records, one truth (v44: the arc invents nothing)');
  assert.ok(open.decisions.length > rec.arc.decisions.length, 'the face ALSO decided the earlier stages\' gates…');
  assert.equal(rec.arc.decisions.some((d) => !d.call.tool.startsWith('git.')), false, '…and NOT ONE of those decisions was pasted onto the arc line (§60: no borrowed alibis)');
  assert.equal(spawns.length, spawnsAt + 4, 'RECEIPTS AND PROCESSES AGREE: four doors granted, four real git processes — a receipt claiming a grant that spawned nothing would be a forged yes');
  const hash = outOf(rec, 'git.commit').record.hash;
  assert.ok(headSha().startsWith(hash) && hash.length < headSha().length, 'the durable hash is still the repo\'s own HEAD, abbreviated as git echoed it (v49 holds)');
  assert.deepEqual(outOf(rec, 'git.show').addedLines, stagedLines(), 'and the content the receipts authorized is byte-equal what the human staged');
  console.log(`[receipts] REAL: a granted arc left ${rec.arc.decisions.length} receipts naming their rule, matching ${spawns.length - spawnsAt} git processes`);

  // 2b) VETOED BY A ROW: the table refuses the content door. The durable line now answers three
  //     questions at once — what git did, where the walk stopped, and WHO said no with WHAT reason.
  const commitsAtVeto = commitsAt();
  const spawnsAtVeto = spawns.length;
  stage(['the human staged a second version']);
  const hv = chainHost('NOTE (DEMO MODE');
  const vres = await released('rc-2', hv, policyCheckpoint(VETO_INSPECT));
  assert.equal(vres.release.status, 'stopped');
  assert.equal(vres.release.stoppedAt, 'inspect');
  const v = lastArc();
  const askedPath = searchedPath('rc-2');
  assert.match(askedPath, /^docs\/.+\.md$/, 'the content door asks for a real document path, not a token the walker left unresolved');
  assert.deepEqual(v.arc.decisions.map((d) => d.granted), [true, true, true, false], 'three grants and one refusal, in the order the doors were knocked');
  assert.deepEqual(v.arc.decisions.at(-1), {
    call: { callId: 'rc-2:release:inspect', tool: 'git.show', args: { path: askedPath } },
    granted: false,
    matched: 'git.show',
    reason: 'only the human reads HEAD\'s contents',
  }, 'THE MONEY ASSERTION: the veto\'s reason, in the human\'s own words, sits on the same line as the commit it could not undo (§28 answered four doors one at a time, and the receipt names the CALL it answered)');
  assert.equal(v.arc.results.at(-1).ok, false, 'the refused door has a red RESULT…');
  assert.equal(outOf(v, 'git.show'), undefined, '…and no output a reader could mistake for an empty read');
  assert.deepEqual(v.arc.decisions.slice(0, 3).map((d) => d.matched), ['git.*', 'git.*', 'git.*'], 'the earlier grants were decided by a DIFFERENT row — the table says so, not the runtime');
  assert.equal(commitsAt(), commitsAtVeto + 1, 'the commit the table allowed is history; the veto came after it, at its own door');
  assert.equal(spawns.length, spawnsAtVeto + 3, 'a refusal spends ZERO processes: the receipt records an ANSWER, not an execution');
  assert.deepEqual(outOf(v, 'git.staged').files[0].addedLines, ['the human staged a second version'], 'the intent read the table granted is the ONE line the human appended on top of 2a\'s commit — git\'s own answer, byte for byte, and the receipts that allowed it are on the same line');

  // 2c) VETOED BY THE DEFAULT: a closed table stops the walk at the FIRST door, and the durable
  //     receipt names `default` — the row the human never wrote a tool into still has to explain
  //     itself (v40's REQUIRED reason, now durable).
  const spawnsAtClosed = spawns.length;
  const commitsAtClosed = commitsAt();
  stage(['the human staged this for a chain that was never going to be allowed']);
  const hc = chainHost('NOTE (DEMO MODE');
  const cres = await released('rc-3', hc, policyCheckpoint(CLOSED_ARC));
  assert.equal(cres.ok, true, 'the chain still reports honestly: the four stages ran, the release did not');
  assert.equal(cres.release.status, 'stopped');
  assert.equal(cres.release.stoppedAt, 'staged');
  const cl = lastArc();
  assert.deepEqual(cl.arc.decisions.length, 1, 'the walk stopped where the table stopped it: one ask, one receipt');
  assert.deepEqual(cl.arc.decisions[0], {
    call: { callId: 'rc-3:release:staged', tool: 'git.staged', args: { stat: false } },
    granted: false,
    matched: 'default',
    reason: 'nothing outside the workspace is allowed today',
  }, 'a refusal by the DEFAULT row is recorded as such — `matched: default` is auditable evidence the human wrote no rule for this tool');
  assert.equal(spawns.length, spawnsAtClosed, 'a closed table spends ZERO git processes');
  assert.equal(commitsAt(), commitsAtClosed, 'and moves no history: the earlier commits stand as 2a\'s and 2b\'s alone');
  assert.deepEqual(git('diff', '--cached', '--name-only').trim().split('\n'), ['docs/widget.md'], 'the human\'s staging is still there, unread and unrecorded — staging remains a HUMAN act (§9)');

  // 2d) A FACE WITH NOTHING TO SHOW: the live Allow-once human (a bare closure) keeps no list the
  //     runtime can read, so the durable line says THAT, rather than leaving an empty field to
  //     interpret. Same walk, different face, different sentence.
  const spawnsAtPlain = spawns.length;
  stage(['the human staged a fourth version']);
  const hp = chainHost('NOTE (DEMO MODE');
  const pres = await released('rc-4', hp, () => true);
  assert.equal(pres.release.status, 'completed');
  const pl = lastArc();
  assert.deepEqual(pl.arc.decisions, [], 'four doors were gated and the runtime cannot say by whom');
  assert.deepEqual(pl.arc.notes, [NO_RECEIPTS_NOTE], '…so the note carries that, and a cold reader learns the field is empty because of the FACE, not because nobody decided');
  assert.equal(pl.arc.doors.length, 4);
  assert.equal(spawns.length, spawnsAtPlain + 4, 'the walk itself is unchanged by who is watching it: still four real processes');
  assert.ok(headSha().startsWith(outOf(pl, 'git.commit').record.hash), 'and its commit is HEAD');
  // Durability is what asks: the SAME face and table without a ledger file get the pre-v50 shape.
  const hm = chainHost('NOTE (DEMO MODE');
  const mem = await runRoleChain({ id: 'rc-5', goal: 'annotate widget rotation docs' }, { roles, registry: hm.registry, store: hm.store, scope: 'receipts', checkpoint: policyCheckpoint(OPEN_ARC), release: true, maxFixRounds: 0 });
  assert.equal('decisions' in mem.release, false, 'an in-memory chain stores nothing, so it records nothing — the dock\'s face is untouched by this amendment');
  assert.deepEqual(mem.release.notes, [], '…and gets no note either');

  // 2e) TAMPER: a forged half-receipt AND a forged complete one appended to a real ledger. The
  //     reader counts both and keeps reading — an audit trail that trusted the writer's word would
  //     not be one, and since v54 "trusted" includes "believed a line owns the calls it lists".
  const goodArcs = cold().arcs.map((a) => a.runId);
  const forged = { kind: 'git-arc', provenance: { mode: 'demo', runtime: 'nexus-agent-runtime', version: '0.1.0' }, runId: 'forged', goal: 'g', role: RELEASE_ROLE, arc: { doors: [], steps: [], results: [], status: 'completed', notes: [], decisions: [{ call: { callId: 'f:release:commit', tool: 'git.commit', args: {} }, granted: true, matched: 'git.*' }] } };
  // Every field v50 demanded is here. Only the transcript disagrees with it: this arc called nothing.
  const pasted = { ...forged, runId: 'pasted', arc: { ...forged.arc, decisions: [{ call: { callId: 'rc-1:release:commit', tool: 'git.commit', args: { message: 'm' } }, granted: true, matched: 'git.*', reason: 'the release window is open today' }] } };
  writeFileSync(LEDGER_FILE, `${fs.readFileSync(LEDGER_FILE, 'utf8')}${JSON.stringify(forged)}\n${JSON.stringify(pasted)}\n`, 'utf8');
  const after = cold();
  assert.equal(after.malformed, 2, 'a receipt with no reason is not a receipt, and a receipt for a call the line never made is a paste: both lines count as junk');
  assert.deepEqual(after.arcs.map((a) => a.runId), goodArcs, 'and neither surfaces anywhere — no arc, no grant, no borrowed approval');
  assert.equal(after.arcs.every((a) => a.arc.decisions.every((d) => typeof d.reason === 'string' && d.reason !== '')), true, 'every receipt a cold reader DOES get holds a non-empty reason');
  assert.deepEqual(after.runs.map((r) => r.task.id), ['rc-1', 'rc-2', 'rc-3', 'rc-4'], 'the run lines around it keep loading — one bad record poisons nothing');
} finally {
  rmSync(dir, { recursive: true, force: true });
  assert.ok(!existsSync(dir), 'the throwaway repo — and the audit trail inside it — are gone');
}
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: home repo HEAD byte-identical — every read, write, commit and receipt lived in os.tmpdir');
console.log('[receipts] ALL ASSERTIONS PASSED (a durable arc that names the rule, the verdict and the reason — or says out loud that its face keeps none)');
