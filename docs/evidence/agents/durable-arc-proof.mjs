// NEXUS M2 v49 (runtime) — the arc survives its PROCESS: role-chain git walks in the ledger
// (ADR 0016 amendment 49). v47 gave the arc a role; the walk still lived only in the returned
// object, so a cold reader of the JSONL audit trail saw, for a chain that had really committed,
// an editor run containing NO git step and nothing else — the strongest record in the file was
// silent about the four doors. That asymmetry is the whole difference between the plan face
// (v36-v45, every door journaled) and the role face, and this proof closes it against REAL git:
// §2 runs a released chain over four keyed doors in a throwaway os.tmpdir repo, then reads the
// file back and joins the durable commit hash to `git rev-parse HEAD` measured OUTSIDE the loop.
// Deliberately NOT folded together (§60): the arc gets its own line, not extra steps inside the
// editor's record — that plan never contained a git step, and rewriting it would be a lie about
// what that stage planned. Proven here too: a stopped arc is durable AS stopped (the landed
// commit survives the veto that follows it), a refused arc is durable as a refusal (the ask is
// journalled, not just the successes), and a hand-tampered arc line is counted, never trusted.
// §9: all writes are inside os.tmpdir and deleted here; git PUSH never happens.
// Run after `npm run build`:  node docs/evidence/agents/durable-arc-proof.mjs
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
  RELEASE_ROLE,
  formatLedgerLine,
  isArcRecord,
  loadLedger,
  parseLedgerLine,
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

// 1) THE CONTRACT, as data: one stream, two record kinds, and neither is trusted on its word alone.
const preV49Line = '{"task":{"id":"old"},"provenance":{"mode":"demo","runtime":"nexus-agent-runtime","version":"0.1.0"},"plan":{"goal":"g","seed":1,"steps":[]},"results":[],"events":[],"status":"completed"}';
const old = parseLedgerLine(preV49Line);
assert.equal(old.ok, true, 'every ledger written before v49 still parses — a new record kind is not a migration');
assert.equal(isArcRecord(old.entry), false, 'no `kind` field ⇒ a run, exactly as v7 wrote it');
const completeArc = {
  kind: 'git-arc',
  provenance: { mode: 'demo', runtime: 'nexus-agent-runtime', version: '0.1.0' },
  runId: 'c1',
  goal: 'annotate widget rotation docs',
  role: RELEASE_ROLE,
  arc: { doors: [...GIT_ARC_TOOLS], steps: [{ stepId: 'commit', tool: 'git.commit', args: { message: 'm' }, rationale: 'r' }], results: [{ callId: 'c1:release:commit', tool: 'git.commit', ok: true, output: { record: { hash: 'abc1234' } } }], status: 'completed', notes: [] },
};
assert.deepEqual(parseLedgerLine(formatLedgerLine(completeArc)), { ok: true, entry: completeArc }, 'an arc round-trips through one JSON line, walk and all');
for (const tamper of [
  { arc: { ...completeArc.arc, status: 'probably' } },
  { arc: { ...completeArc.arc, notes: undefined } },
  { arc: { ...completeArc.arc, results: 'seven doors' } },
  { role: undefined },
  { provenance: { mode: 'real', runtime: 'x', version: '1' } },
]) {
  const broken = { ...completeArc, ...tamper };
  assert.deepEqual(
    parseLedgerLine(JSON.stringify(broken)),
    { ok: false, reason: 'not a complete git-arc record' },
    `a line that CLAIMS to be an arc is never re-read as something else (${JSON.stringify(tamper)})`,
  );
}
assert.equal(parseLedgerLine(JSON.stringify({ ...completeArc, kind: undefined })).ok, false, 'a run-shaped line is never upgraded into an arc either');
const roles = new RoleRegistry();
DEMO_ROLES.forEach((r) => roles.register(r));
const owner = roles.list().find((r) => r.allowedTools.some((t) => t.startsWith('git.')));
assert.equal(owner.id, RELEASE_ROLE, 'the name the ledger journals is the name the REGISTRY granted — one constant, no paraphrase');
assert.deepEqual(owner.allowedTools, [...GIT_ARC_TOOLS], 'and the grant is derived from the arc, so a privilege cannot drift from the walk it licenses');
console.log('[durable-arc] data: one JSONL stream, two record kinds, arc shape checked before it is believed');

// 2) THE REAL CHAIN, FOUR REAL DOORS, ONE JSONL FILE (§9 — created and deleted with the repo).
const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dir = mkdtempSync(join(tmpdir(), 'nexus-durable-arc-'));
const posixDir = dir.replace(/\\/g, '/');
const LEDGER_FILE = join(dir, 'nexus-chain-ledger.jsonl').replace(/\\/g, '/');
const SEED_FILE = 'human seed widget doc\n';
const stagedLines = (extra = []) => ['widget rotation notes', 'a second line with "quotes" and  double spaces', 'third line — the human wrote this', ...extra];
try {
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', dir]);
  git('config', 'user.name', 'NEXUS Durable-Arc Proof');
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
  assert.ok(!fs.existsSync(LEDGER_FILE), 'the audit trail starts as a file that does not exist — every line below was written by a chain');

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
  function chainHost(marker) {
    const ws = new InMemoryWorkspace({ 'docs/widget.md': '# Widget\n\nwidget rotation notes\n', 'docs/extra.md': '# Extra\n\nmisc\n' });
    const store = new MemoryStore();
    let registry = registerWorkspaceTools(new ToolRegistry(), ws);
    registry.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => ({
      ok: ws.read('docs/widget.md').includes(marker),
      detail: `docs/widget.md ${ws.read('docs/widget.md').includes(marker) ? 'carries' : 'does NOT carry'} "${marker}"`,
    }));
    registry = registerMemoryTools(registry, store, 'durable-arc');
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
  const lines = () => fs.readFileSync(LEDGER_FILE, 'utf8').trimEnd().split('\n');
  const kinds = () => lines().map((l) => {
    const p = parseLedgerLine(l);
    return p.ok ? (isArcRecord(p.entry) ? 'arc' : 'run') : 'junk';
  });
  const outOf = (rec, tool) => rec.arc.results.filter((r) => r.tool === tool).at(-1)?.output;

  // 2a) GRANTED: the chain writes its run line AND its arc line, and the arc line is TRUE of the
  //     repository — checked against git from outside the loop, not against the run's own memory.
  stage();
  const h = chainHost('NOTE (DEMO MODE');
  const res = await runRoleChain({ id: 'da-1', goal: 'annotate widget rotation docs' }, {
    roles, registry: h.registry, store: h.store, scope: 'durable-arc', checkpoint: () => true, fsLike: fs, ledgerFile: LEDGER_FILE, release: true, maxFixRounds: 0,
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.release.status, 'completed');
  assert.deepEqual(kinds(), ['run', 'arc'], 'two lines, in the order the process wrote them: the run it verified, then the arc that followed it');
  const cold = loadLedger(fs, LEDGER_FILE);
  assert.equal(cold.malformed, 0);
  assert.equal(cold.runs.length, 1);
  assert.equal(cold.arcs.length, 1);
  const [rec] = cold.arcs;
  assert.equal(rec.runId, cold.runs[0].task.id, 'the arc joins its run by id — one stream, two records, no ambiguity about who walked where');
  assert.equal(rec.role, RELEASE_ROLE, 'the durable record NAMES the role that held the doors');
  assert.equal(rec.provenance.mode, 'demo');
  assert.deepEqual(rec.arc, res.release, 'the walk on disk IS the walk that ran: steps, callIds, git\'s answers, byte for byte');
  // §60 anti-fold, on disk this time: neither record claims the other's work.
  assert.equal(cold.runs[0].plan.steps.some((s) => s.tool.startsWith('git.')), false, 'the editor\'s durable PLAN still holds no git step…');
  assert.equal(cold.runs[0].results.some((r) => r.tool.startsWith('git.')), false, '…and its durable RESULTS were not retrofitted either');
  assert.deepEqual(rec.arc.steps.map((s) => s.stepId), ['staged', 'commit', 'confirm', 'inspect'], 'the arc line is the ONLY place this file names the four doors');
  assert.deepEqual(rec.arc.results.map((r) => r.callId), ['da-1:release:staged', 'da-1:release:commit', 'da-1:release:confirm', 'da-1:release:inspect'], 'and its callIds still say which stage asked');
  // THE MONEY ASSERTION: a cold reader trusts the record because the REPOSITORY agrees with it.
  const durableHash = outOf(rec, 'git.commit').record.hash;
  const head = headSha();
  assert.ok(head.startsWith(durableHash), `the durable commit hash is the repo's own HEAD (${durableHash} ⊂ ${head}) — nothing re-narrated it`);
  assert.ok(durableHash.length < head.length, 'git echoed an ABBREVIATED hash and rev-parse returns the full one: equality would be the wrong assertion');
  assert.equal(outOf(rec, 'git.log').commits[0].hash, durableHash, 'the confirm door\'s answer survived the round-trip too, and still matches the commit record');
  assert.deepEqual(outOf(rec, 'git.staged').files[0].addedLines, stagedLines(), 'THE INTENT READ SURVIVES: the human\'s staged lines are in the file, in git\'s own words');
  assert.deepEqual(outOf(rec, 'git.show').addedLines, stagedLines(), 'THE CONTENT READ SURVIVES: HEAD\'s lines too — before/after agreement is now REPLAYABLE, not just witnessed');
  assert.match(outOf(rec, 'git.staged').detail, /^git\.staged → exit 0: /, 'git\'s exit status travelled with the parse, so a reader cannot mistake a refusal for a success');
  console.log(`[durable-arc] REAL: ${lines().length} JSONL lines replay a role-walked arc whose hash matches the repo's own HEAD ${durableHash}`);

  // 2b) VETOED MID-WALK: the stopped arc is durable AS stopped — the commit it had already been
  //     granted keeps its place in history AND in the record.
  const commitsAtVeto = commitsAt();
  stage(['the human staged a second version']);
  const hd = chainHost('NOTE (DEMO MODE');
  const dres = await runRoleChain({ id: 'da-2', goal: 'annotate widget rotation docs' }, {
    roles, registry: hd.registry, store: hd.store, scope: 'durable-arc', maxFixRounds: 0,
    checkpoint: ({ call }) => call.tool !== 'git.log', fsLike: fs, ledgerFile: LEDGER_FILE, release: true,
  });
  assert.equal(dres.release.status, 'stopped');
  assert.equal(dres.release.stoppedAt, 'confirm');
  assert.deepEqual(kinds(), ['run', 'arc', 'run', 'arc'], 'append-only: the second chain adds its own two lines and rewrites nothing');
  const vetoed = loadLedger(fs, LEDGER_FILE).arcs.at(-1);
  assert.equal(vetoed.runId, 'da-2');
  assert.equal(vetoed.arc.status, 'stopped');
  assert.equal(vetoed.arc.stoppedAt, 'confirm');
  assert.match(vetoed.arc.reason, /denied at confirm: denied at checkpoint \(exec\)/, 'the refusal is durable in the registry\'s own words, not paraphrased into silence');
  assert.deepEqual(vetoed.arc.results.map((r) => r.ok), [true, true, false], 'the intent read passed, the commit was granted, the confirm was refused — in that order, on disk');
  assert.equal(vetoed.arc.doors.length, 4, 'the record states which doors the role COULD walk, so a shorter walk is visibly a veto and not a missing grant');
  const vetoHash = outOf(vetoed, 'git.commit').record.hash;
  assert.ok(headSha().startsWith(vetoHash), 'the granted commit is still HEAD: a veto of the NEXT door does not launder the landed one');
  assert.equal(commitsAt(), commitsAtVeto + 1, 'exactly one commit landed in 2b, and the ledger says so');
  assert.equal(outOf(vetoed, 'git.show'), undefined, 'the refused door has NO output line to misread as an empty read');
  assert.deepEqual(loadLedger(fs, LEDGER_FILE, 1).arcs.map((a) => a.runId), ['da-2'], '`last` trims trailing RECORDS across kinds, so "the last thing that happened" is answerable');
  assert.equal(loadLedger(fs, LEDGER_FILE, 1).runs.length, 0, 'and the trailing record here is an arc — a run-only reader gets nothing, honestly');
  assert.deepEqual(loadLedger(fs, LEDGER_FILE, 2).runs.map((r) => r.task.id), ['da-2'], 'two records back is da-2\'s run line');

  // 2c) RED CHAIN: the release the chain REFUSED is journalled too. An absent line would leave a
  //     reader guessing whether nobody asked or the ask was denied — §60 says state it.
  const spawnsAtRed = spawns.length;
  const commitsAtRed = commitsAt();
  stage(['the human staged this for a chain that never went green']);
  const hr = chainHost('NEVER-HAPPENS-MARKER');
  const rres = await runRoleChain({ id: 'da-3', goal: 'annotate widget rotation docs' }, {
    roles, registry: hr.registry, store: hr.store, scope: 'durable-arc', checkpoint: () => true, fsLike: fs, ledgerFile: LEDGER_FILE, release: true, maxFixRounds: 0,
  });
  assert.equal(rres.editorOutcome.status, 'failed_verification');
  assert.equal(rres.release.status, 'no-arc');
  const red = loadLedger(fs, LEDGER_FILE).arcs.at(-1);
  assert.equal(red.runId, 'da-3');
  assert.equal(red.arc.status, 'no-arc');
  assert.deepEqual(red.arc.doors, [], 'no doors were reachable, and the record carries that as data');
  assert.equal(red.arc.reason, 'the editor stage ended failed_verification — the arc lives behind verification (v36)');
  assert.equal(spawns.length, spawnsAtRed, 'a journalled refusal costs ZERO processes: the record is the walk, not a re-narration of it');
  assert.equal(commitsAt(), commitsAtRed, 'and history is unmoved');
  assert.deepEqual(git('diff', '--cached', '--name-only').trim().split('\n'), ['docs/widget.md'], 'staging stays the HUMAN act: three chains read the index, none wrote it');

  // 2d) TAMPER: someone appends a broken arc line to a real ledger. The reader counts it and keeps
  //     reading — a corrupt record is never promoted into a run, and never poisons the good ones.
  writeFileSync(LEDGER_FILE, `${fs.readFileSync(LEDGER_FILE, 'utf8')}${JSON.stringify({ kind: 'git-arc', runId: 'forged', arc: { status: 'completed' } })}\n`, 'utf8');
  const after = loadLedger(fs, LEDGER_FILE);
  assert.equal(after.malformed, 1, 'the forged line is COUNTED, not trusted');
  assert.deepEqual(after.arcs.map((a) => a.runId), ['da-1', 'da-2', 'da-3'], 'and it surfaces nowhere: no arc, no run, no hash');
  assert.equal(after.runs.length, 3);
  assert.deepEqual(kinds().slice(-1), ['junk'], 'a cold reader who inspects the raw stream sees the junk line named as junk');

  // 2e) The pre-v49 face is untouched: a run-only ledger reads exactly as it did in v7.
  const legacy = join(dir, 'legacy.jsonl').replace(/\\/g, '/');
  writeFileSync(legacy, `${preV49Line}\n`, 'utf8');
  const oldBack = loadLedger(fs, legacy);
  assert.deepEqual([oldBack.runs.map((r) => r.task.id), oldBack.arcs, oldBack.malformed], [['old'], [], 0], 'a v7-v48 file gains an empty `arcs` and nothing else');
  assert.deepEqual([cold.runs.length, cold.arcs.length], [1, 1], 'the released chain wrote two kinds of record into one append-only stream');
} finally {
  rmSync(dir, { recursive: true, force: true });
  assert.ok(!existsSync(dir), 'the throwaway repo — and the audit trail inside it — are gone');
}
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: home repo HEAD byte-identical — every read, write and commit lived in os.tmpdir');
console.log('[durable-arc] ALL ASSERTIONS PASSED (a role-walked arc that survives its process, and a repository that signs off on it afterwards)');
