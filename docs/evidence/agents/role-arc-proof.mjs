// NEXUS M2 v47 (runtime) — the git arc gains a ROLE (ADR 0016 amendment 47).
// v36/38/44/45 nested four §28-gated git doors into the PLAN; §24's role pack never learned they
// existed, so a role-chain run could annotate forever and never read an index, commit, or read a
// thing back. This proof closes the hole with DATA: the arc's order lives in `gitArc.ts` once and
// BOTH faces derive from it (asserted below), one role owns exactly those four doors, and a chain
// may hand a green run to it ONLY when the host asks for it. The real part runs a four-role chain
// over four keyed doors against a throwaway os.tmpdir repo, and the money assertion is v45's
// three-way agreement reached the OTHER way round: the lines the RELEASER pulled out of the index
// before the commit are byte-equal the lines git.show hands back after it, byte-equal what the
// HUMAN staged — with the arc walked by a scoped role, not by a plan. Also proven here, against
// real git: a red chain never reaches the first door (zero processes), refusing the content door
// still leaves the granted commit standing, and a chain that did not ask for the release stage is
// the v14/v22 chain byte-for-byte (§9: the home repo is never touched; git PUSH never happens).
// Run after `npm run build`:  node docs/evidence/agents/role-arc-proof.mjs
import assert from 'node:assert/strict';
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
  gitArcDoors,
  gitArcSteps,
  planTask,
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

// 1) ONE OWNER: in the whole demo role pack, exactly one role can see a git door — and it can see
//    nothing else. Commit power is named, so it can be audited; it is never spread by accident.
const roles = new RoleRegistry();
DEMO_ROLES.forEach((r) => roles.register(r));
assert.deepEqual(roles.list().map((r) => r.id), ['archivist', 'designer', 'editor', 'qa', 'releaser', 'researcher']);
const gitRoles = roles.list().filter((r) => r.allowedTools.some((t) => t.startsWith('git.')));
assert.deepEqual(gitRoles.map((r) => r.id), ['releaser'], 'a single named role owns the arc; adding a second owner is a deliberate edit, not a widening');
assert.deepEqual(gitRoles[0].allowedTools, [...GIT_ARC_TOOLS], 'its grant IS the arc — four doors, no wildcard');
for (const id of ['researcher', 'designer', 'qa', 'editor', 'archivist']) {
  const scoped = roles.scopedRegistry(id, new ToolRegistry().register({ name: 'git.commit', description: '', permissions: ['exec'], args: [] }, () => 'never'));
  assert.ok(!scoped.has('git.commit'), `${id} cannot even attempt a commit — capability by ABSENCE (§24), not a denial`);
}

// 2) ONE ORDER, TWO FACES: the nesting v36/38/44/45 grew in the plan now lives in `gitArcDoors`,
//    so a host with any SUBSET of doors gets a correctly ordered shorter arc — and the plan face
//    and the role face are the same data. A subset table plus a two-face identity, because an
//    order kept in two places is an order waiting to drift.
const all = { 'git.staged': true, 'git.commit': true, 'git.log': true, 'git.show': true };
assert.deepEqual(gitArcDoors(all), [...GIT_ARC_TOOLS], 'full house: the v45 tail, in v45 order');
assert.deepEqual(gitArcDoors({ 'git.staged': true, 'git.commit': true, 'git.log': false, 'git.show': true }), ['git.staged', 'git.commit'], 'no hash door ⇒ no content door either: never a content read with no hash to agree with');
assert.deepEqual(gitArcDoors({ 'git.staged': false, 'git.commit': false, 'git.log': true, 'git.show': true }), [], 'no commit door ⇒ no arc at all (v36): a log alone is not an arc somebody earned');
assert.deepEqual(gitArcDoors({ 'git.staged': true, 'git.commit': false, 'git.log': true, 'git.show': true }), [], 'not even a read is walked on its own when the block it belongs to is missing');
const shown = { 'git.staged': true, 'git.commit': true, 'git.log': true, 'git.show': false };
assert.deepEqual(gitArcSteps({ present: shown, message: 'm', showPath: 'p' }).map((s) => s.stepId), ['staged', 'commit', 'confirm']);
const taskForFaces = { id: 'fx', goal: 'add widget docs', targetPath: 'docs/widget.md' };
for (const has of [true, false]) {
  const planned = planTask(taskForFaces, { hasVerify: true, hasCommit: true, hasStaged: has, hasConfirm: has, hasContent: has, hasRemember: false });
  assert.deepEqual(
    planned.steps.filter((s) => s.tool.startsWith('git.')),
    gitArcSteps({
      present: { 'git.staged': has, 'git.commit': true, 'git.log': has, 'git.show': has },
      message: `chore(agent): verified run ${taskForFaces.id} · seed ${planned.seed}`,
      showPath: taskForFaces.targetPath,
    }),
    'the PLAN\'s git steps ARE gitArcSteps for the same doors — one source, two faces',
  );
}
console.log('[role-arc] data: one role owns four doors; one module carries the order both faces walk');

// 3) THE REAL CHAIN, FOUR REAL DOORS, THROWAWAY REPO (§9 — created and deleted here).
const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dir = mkdtempSync(join(tmpdir(), 'nexus-role-arc-'));
const posixDir = dir.replace(/\\/g, '/');
const SEED_FILE = 'human seed widget doc\n';
const stagedLines = (extra = []) => ['widget rotation notes', 'a second line with "quotes" and  double spaces', 'third line — the human wrote this', ...extra];
try {
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', dir]);
  git('config', 'user.name', 'NEXUS Role-Arc Proof');
  git('config', 'user.email', 'proof@nexus.invalid');
  git('config', 'core.hooksPath', '.no-hooks'); // global codex hooks neutralized INSIDE the temp repo only
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false'); // the bytes the human stages are the bytes git records
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'widget.md'), SEED_FILE);
  git('add', 'docs/widget.md');
  git('commit', '-q', '-m', 'chore: human seed commit');
  const commitsAt = () => Number(git('rev-list', '--count', 'HEAD'));
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

  /**
   * A chain host: an in-memory corpus the four roles can research, annotate and verify, plus the
   * FOUR REAL SANDBOX DOORS pointing at the throwaway repo. The workspace and the repo share the
   * path `docs/widget.md` on purpose — that is what lets the arc read back, from git, the very
   * path the chain's own research handed it.
   */
  function chainHost(marker, opts = { gitDoors: true }) {
    const ws = new InMemoryWorkspace({ 'docs/widget.md': '# Widget\n\nwidget rotation notes\n', 'docs/extra.md': '# Extra\n\nmisc\n' });
    const store = new MemoryStore();
    let registry = registerWorkspaceTools(new ToolRegistry(), ws);
    registry.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => ({
      ok: ws.read('docs/widget.md').includes(marker),
      detail: `docs/widget.md ${ws.read('docs/widget.md').includes(marker) ? 'carries' : 'does NOT carry'} "${marker}"`,
    }));
    registry = registerMemoryTools(registry, store, 'role-arc');
    if (opts.gitDoors) {
      registry = registerGitStagedTool(registry, doors.staged, { env: gitEnv() });
      registry = registerGitCommitTool(registry, doors.commit, { env: gitEnv() });
      registry = registerGitLogTool(registry, doors.log, { env: gitEnv() });
      registry = registerGitShowTool(registry, doors.show, { env: gitEnv() });
    }
    const gates = [];
    const checkpoint = ({ call, permissions }) => {
      if (permissions.includes('exec')) gates.push(call.tool);
      return true;
    };
    return { ws, store, registry, gates, checkpoint };
  }

  /** What the human put in the index, and the only path the arc is allowed to read back. */
  const stage = (extra = []) => {
    writeFileSync(join(dir, 'docs', 'widget.md'), `${SEED_FILE}${stagedLines(extra).join('\n')}\n`);
    git('add', 'docs/widget.md');
  };
  const chainOptions = (h, extra = {}) => ({ roles, registry: h.registry, store: h.store, scope: 'role-arc', checkpoint: h.checkpoint, ...extra });
  const outOf = (res, tool) => res.release.results.filter((r) => r.tool === tool).at(-1).output;

  // 3a) GRANTED ALL FOUR: a green chain hands the arc to the releaser, and the arc's own
  //     before/after agreement holds against REAL git.
  stage();
  const h = chainHost('NOTE (DEMO MODE');
  const res = await runRoleChain({ id: 'ra-1', goal: 'annotate widget rotation docs' }, chainOptions(h, { release: true }));
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.editorOutcome.status, 'completed', 'the chain earned the arc by verifying, not by asking');
  assert.deepEqual(res.release.doors, [...GIT_ARC_TOOLS]);
  assert.equal(res.release.status, 'completed', `the role-walked arc must complete: ${JSON.stringify(res.release.reason)}`);
  assert.deepEqual(res.release.steps.map((s) => s.stepId), ['staged', 'commit', 'confirm', 'inspect'], 'the SAME order the plan walks, now walked by a ROLE off the SAME data');
  assert.deepEqual(res.release.results.map((r) => r.callId), ['ra-1:release:staged', 'ra-1:release:commit', 'ra-1:release:confirm', 'ra-1:release:inspect'], 'the arc\'s callIds name the STAGE, so a cold reader can tell it from a plan step');
  assert.deepEqual(h.gates.filter((t) => t.startsWith('git.')), ['git.staged', 'git.commit', 'git.log', 'git.show'], 'four separate §28 asks for one arc — never one blanket approval');
  const intentOut = outOf(res, 'git.staged');
  const commitOut = outOf(res, 'git.commit');
  const afterOut = outOf(res, 'git.show');
  assert.equal(intentOut.files[0].path, 'docs/widget.md', 'the releaser read the index and saw WHICH file the human meant');
  assert.deepEqual(intentOut.files[0].addedLines, stagedLines(), 'THE MONEY ASSERTION (1/2): a scoped ROLE pulled the human\'s staged lines out of the index before recording them');
  assert.deepEqual(afterOut.addedLines, stagedLines(), 'THE MONEY ASSERTION (2/2): the same role read the SAME lines back out of HEAD afterwards — byte-for-byte, through real git');
  assert.equal(afterOut.path, 'docs/widget.md', 'and it read the path the CHAIN handed it, not one this stage chose');
  assert.equal(commitOut.record.hash, outOf(res, 'git.log').commits[0].hash, 'the hash between the two reads still agrees with git\'s own log (v38 survives the move)');
  assert.equal(commitsAt(), 2, 'human seed + this chain — exactly one new commit, and no push (push is out of scope by design)');
  assert.equal(res.editorOutcome.plan.steps.some((s) => s.tool.startsWith('git.')), false, '§60: the editor\'s PLAN never claimed the arc…');
  assert.equal(res.editorOutcome.results.some((r) => r.tool.startsWith('git.')), false, '…and its RESULTS were not retrofitted with it either — the arc is its own stage with its own callIds');
  assert.deepEqual(res.handoffs.map((x) => `${x.from}→${x.to}`), ['researcher→designer', 'designer→qa', 'qa→editor', 'editor→releaser', 'releaser→host'], 'the chain grew two handoffs, not a hidden fifth actor');
  assert.equal(res.handoffs[3].via, 'git.arc:git.staged+git.commit+git.log+git.show', 'which doors the next stage could even attempt is recorded, not implied');
  assert.equal(res.handoffs[4].via, 'git:staged→commit→confirm→inspect');
  assert.equal(h.store.list('role-arc').filter((r) => r.query === 'annotate widget rotation docs — release').map((r) => r.summary).join(), 'release completed: staged→commit→confirm→inspect', 'the HOST journalled the arc into §26 — the releaser role has no memory tool to do it with');
  assert.equal(roles.scopedRegistry('releaser', h.registry).has('memory.save'), false, 'the arc cannot write its own journal: governance stays with the host');
  console.log(`[role-arc] REAL chain: role read ${stagedLines().length} staged lines before the commit and the SAME lines after · ${h.gates.filter((t) => t.startsWith('git.')).length} git gates · ${spawns.length} sandbox processes`);

  // 3b) DENY THE CONTENT DOOR: the walk stops where the human says stop, and the commit that was
  //     already granted STANDS — refused reads are refused, earlier grants are not undone.
  const spawnsAt = spawns.length;
  const commitsAtDenial = commitsAt();
  stage(['the human staged a second version']);
  const hd = chainHost('NOTE (DEMO MODE');
  hd.checkpoint = ({ call, permissions }) => {
    if (permissions.includes('exec')) hd.gates.push(call.tool);
    return call.tool !== 'git.show';
  };
  const dres = await runRoleChain({ id: 'ra-2', goal: 'annotate widget rotation docs' }, chainOptions(hd, { release: true }));
  assert.equal(dres.ok, true);
  assert.equal(dres.release.status, 'stopped');
  assert.equal(dres.release.stoppedAt, 'inspect');
  assert.match(dres.release.reason, /denied at inspect: denied at checkpoint \(exec\)/);
  assert.deepEqual(dres.release.results.map((r) => r.ok), [true, true, true, false], 'the intent read, the commit and the hash confirm all passed; only the content read was refused');
  assert.deepEqual(dres.release.results.filter((r) => r.ok).map((r) => r.tool), ['git.staged', 'git.commit', 'git.log']);
  assert.match(dres.release.results.at(-1).error, /denied at checkpoint \(exec\)/, 'the refused door carries the registry\'s own words, not a paraphrase');
  assert.equal(commitsAt(), commitsAtDenial + 1, 'the granted commit is history — a later veto does not roll it back (§28 gates each door, one at a time)');
  assert.equal(dres.release.results[1].output.record.hash, outOf(dres, 'git.log').commits[0].hash, 'and the confirm that did run still describes that commit');
  assert.deepEqual(hd.gates.filter((t) => t.startsWith('git.')), ['git.staged', 'git.commit', 'git.log', 'git.show'], 'the refused door was still ASKED — veto is an answer, not silence');
  assert.equal(spawns.length, spawnsAt + 3, 'three granted doors spent three processes; the refused fourth spent none');
  assert.equal(dres.handoffs[4].via, 'git:staged→commit→confirm→inspect!stopped', 'the handoff says STOPPED; a red tail is never written as a green one (§60)');
  console.log(`[role-arc] REAL: veto at the content door stopped the walk after ${commitsAt() - commitsAtDenial} commit landed · 1 process spared`);

  // 3c) NOT ASKED, NOT GRANTED: a chain built without the release stage is the v14/v22 chain —
  //     same handoffs, same transcript shape, zero git processes. Commit power is opt-in.
  const spawnsBefore = spawns.length;
  const commitsBefore = commitsAt();
  const hn = chainHost('NOTE (DEMO MODE');
  const nores = await runRoleChain({ id: 'ra-3', goal: 'annotate widget rotation docs' }, chainOptions(hn));
  assert.equal(nores.ok, true);
  assert.equal('release' in nores, false, 'no release, no field — the result does not carry an arc that never ran');
  assert.deepEqual(nores.handoffs.map((x) => `${x.from}→${x.to}`), ['researcher→designer', 'designer→qa', 'qa→editor'], 'the v14/v22 three handoffs, byte-for-byte');
  assert.equal(spawns.length, spawnsBefore, 'a chain that did not ask for the release stage spends ZERO processes on git');
  assert.equal(commitsAt(), commitsBefore, 'and records no history');
  assert.equal(hn.store.list('role-arc').some((r) => r.query.endsWith('— release')), false, 'nothing journalled about a release nobody asked for');

  // 3d) RED CHAIN: no door is knocked on — POSITION, not the scope, refuses it, so not even an
  //     ask is spent. Same safety the plan face has had since v36, now on the role face. The
  //     human has staged something for this run, so the case also proves what a red chain leaves
  //     ALONE: the index, the history, and the process count.
  stage(['the human staged this for a chain that never went green']);
  const hr = chainHost('NEVER-HAPPENS-MARKER');
  const rres = await runRoleChain({ id: 'ra-4', goal: 'annotate widget rotation docs' }, chainOptions(hr, { release: true, maxFixRounds: 0 }));
  assert.equal(rres.ok, true, 'the chain reports the failure honestly instead of inheriting it');
  assert.equal(rres.editorOutcome.status, 'failed_verification');
  assert.equal(rres.release.status, 'no-arc');
  assert.equal(rres.release.reason, 'the editor stage ended failed_verification — the arc lives behind verification (v36)');
  assert.deepEqual(rres.release.doors, [], 'no doors attempted, because no door was reached');
  assert.equal(spawns.length, spawnsBefore, 'a red chain costs ZERO git processes — the human-staged change is still sitting there, unrecorded (§9)');
  assert.equal(commitsAt(), commitsBefore);
  assert.deepEqual(git('diff', '--cached', '--name-only').trim().split('\n'), ['docs/widget.md'], 'staging remains the HUMAN act: the agent read the index at most, wrote it never');
  assert.deepEqual(hr.gates.filter((t) => t.startsWith('git.')), [], 'not even a §28 ask was spent on an unearned arc');

  // 3e) NO DOORS IN THE HOST: the arc belongs to no role by absence, and the chain says so.
  const hg = chainHost('NOTE (DEMO MODE', { gitDoors: false });
  const gres = await runRoleChain({ id: 'ra-5', goal: 'annotate widget rotation docs' }, chainOptions(hg, { release: true }));
  assert.equal(gres.ok, true);
  assert.equal(gres.release.status, 'no-arc');
  assert.match(gres.release.reason, /no git\.commit in this scope — the arc belongs to no role by absence/);
  assert.equal(gres.editorOutcome.status, 'completed', 'the four original stages ran fine; only the arc had nowhere to walk');
  assert.deepEqual(gres.handoffs.map((x) => `${x.from}→${x.to}`), ['researcher→designer', 'designer→qa', 'qa→editor', 'editor→releaser'], 'the attempt is still recorded, the refusal inside it');
  assert.equal(commitsAt(), commitsBefore, 'and history is still 2a\'s alone');
} finally {
  rmSync(dir, { recursive: true, force: true });
  assert.ok(!existsSync(dir), 'the throwaway repo is gone');
}
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: home repo HEAD byte-identical — every read and write lived in os.tmpdir');
console.log('[role-arc] ALL ASSERTIONS PASSED (one role owns four doors, one module owns the order, and a role-walked arc agrees with real git before and after)');
