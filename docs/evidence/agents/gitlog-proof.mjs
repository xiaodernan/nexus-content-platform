// NEXUS M2 v37 — the git LOG read-back proof (ADR 0016 amendment 37).
// The circle closes: v32 SEES the working tree, v35 TOUCHES history, v37 CONFIRMS the
// touch from the agent's own side — `git log --oneline -n <count>`, the second production
// use of the '*' ARG wildcard (shape fixed, count floats), read-only like v32 but still a
// REAL process behind §28. The headline assertion: the newest logged commit is BYTE-EQUAL
// to the GitCommitRecord the commit tool handed back — the agent can check its own work.
// REAL-REPO SAFETY (§9): everything happens in a throwaway repo under os.tmpdir that the
// proof deletes; the demo repo's HEAD is asserted byte-identical before and after.
// Run after `npm run build`:  node docs/evidence/agents/gitlog-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry, planExec } = rt;
const { NODE_SPAWN, createExecHost, gitCommitPolicy, gitEnv, gitLogPolicy, parseGitLog, registerGitCommitTool, registerGitLogTool } = eh;

// 1) Pure: ONE argv shape on the read side, and the echo parses into ordered records.
const logPolicy = gitLogPolicy('X:/repo');
for (const argv of [['git', 'log', '--oneline', '-n', '5'], ['git', 'log', '--oneline', '-n', '100']]) {
  assert.equal(planExec({ argv }, logPolicy).ok, true, `${argv.join(' ')} plans`);
}
for (const argv of [['git', 'log'], ['git', 'log', '--oneline'], ['git', 'log', '--oneline', '-n'], ['git', 'log', '--oneline', '-n', '5', 'main'], ['git', 'log', '--all', '--oneline', '-n', '5'], ['git', 'show', 'HEAD'], ['git', 'commit', '-m', 'x'], ['git', 'push']]) {
  const d = planExec({ argv }, logPolicy);
  assert.equal(d.ok, false);
  assert.match(d.reason, /default-deny/, `${argv.join(' ')} must NEVER plan on the read side`);
}
const parsed = parseGitLog('0a1b2c3 feat: add thing\n deadbeef chore: seed\nnot-a-commit\n\n');
assert.deepEqual(parsed.commits, [
  { hash: '0a1b2c3', subject: 'feat: add thing' },
  { hash: 'deadbeef', subject: 'chore: seed' },
]);
assert.equal(parsed.skipped, 1, 'a hashless echo line is COUNTED, never guessed into a commit');
console.log('[gitlog-proof] policy: `git log --oneline -n *` is the ONLY shape · show/commit/push/--all default-deny · echo parser is honest');

// 2) THE REAL THING in a throwaway repo (deleted at the end; §9 holds).
const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); // THIS repo, untouched below
const dir = mkdtempSync(join(tmpdir(), 'nexus-gitlog-proof-'));
try {
  const posixDir = dir.replace(/\\/g, '/');
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', dir]);
  git('config', 'user.name', 'NEXUS Git Log Proof');
  git('config', 'user.email', 'proof@nexus.invalid');
  git('config', 'core.hooksPath', '.no-hooks'); // neutralize this machine's global hooksPath — INSIDE the temp repo only
  git('config', 'commit.gpgsign', 'false');

  const spawns = [];
  const counting = (command, args, opts) => {
    spawns.push({ args, cwd: opts.cwd });
    return NODE_SPAWN(command, args, opts);
  };
  // ONE registry, TWO keyed doors: the log host can only read, the commit host can only
  // write ONE shape — each tool is wired to its OWN policy, and neither can borrow the other's power.
  const logHost = createExecHost(gitLogPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting });
  const commitHost = createExecHost(gitCommitPolicy(posixDir, { timeoutMs: 20_000 }), { spawnLike: counting });
  const registry = registerGitLogTool(registerGitCommitTool(new ToolRegistry(), commitHost, { env: gitEnv() }), logHost, { env: gitEnv() });
  const grant = { checkpoint: () => true };

  // 2a) A repo with NO history answers honestly: exit-128 DATA through the sandbox, not a crash.
  const empty = await registry.invoke({ callId: 'l0', tool: 'git.log', args: {} }, grant);
  assert.equal(empty.ok, true, 'the read itself succeeded; the EMPTY REPO is git\'s answer');
  assert.equal(empty.output.ok, false);
  assert.equal(empty.output.exitCode, 128);
  assert.match(empty.output.detail, /does not have any commits yet/);
  assert.deepEqual(empty.output.commits, []);
  assert.equal(spawns.length, 1);
  assert.deepEqual(spawns[0].args, ['log', '--oneline', '-n', '10'], 'default window is ten, one fixed argv shape');
  console.log(`[gitlog-proof] REAL: empty repo → honest exit-${empty.output.exitCode} DATA ("${empty.output.detail.split(': ').slice(2).join(': ')}"), ${spawns.length} spawn`);

  // 2b) The HUMAN seeds history outside the sandbox — the agent had no part in this commit.
  writeFileSync(join(dir, 'seed.txt'), 'human seed\n');
  git('add', 'seed.txt');
  git('commit', '-q', '-m', 'human: seed commit outside any sandbox');

  // 2c) The AGENT commits through its own keyed door (§28 granted, human staged).
  writeFileSync(join(dir, 'work.txt'), 'agent deliverable\n');
  git('add', 'work.txt'); // staging is a human act — setup runs OUTSIDE the sandbox on purpose
  const committed = await registry.invoke({ callId: 'c1', tool: 'git.commit', args: { message: 'proof: agent commit lands and reads back' } }, grant);
  assert.equal(committed.output.ok, true, `granted commit must succeed: ${committed.output?.detail ?? committed.error}`);
  const record = committed.output.record;
  assert.equal(spawns.length, 2);
  assert.deepEqual(spawns[1].args, ['commit', '-m', 'proof: agent commit lands and reads back']);

  // 2d) THE READ-BACK: git's own log must agree, byte for byte, with the record handed to us.
  const readBack = await registry.invoke({ callId: 'l1', tool: 'git.log', args: { count: 2 } }, grant);
  assert.equal(readBack.output.ok, true, readBack.output.detail);
  const [newest, second] = readBack.output.commits;
  assert.equal(newest.hash, record.hash, 'the hash git LOGS equals the hash git ECHOED at commit time');
  assert.equal(newest.subject, record.subject, 'the subject survives write→read intact');
  assert.match(second.subject, /^human: seed commit/, 'the human commit sits BELOW the agent commit — history is shared, not overwritten');
  assert.equal(spawns.length, 3);
  assert.deepEqual(spawns[2].args, ['log', '--oneline', '-n', '2'], 'the wildcard carried the explicit count verbatim');
  assert.equal(spawns[2].cwd, posixDir, 'the read jail is the temp repo — the home repo is not even visible from here');
  console.log(`[gitlog-proof] REAL: read-back agrees — newest ${newest.hash} "${newest.subject}" === commit record ${record.branch}@${record.hash}`);

  // 2e) Gates stay gates on the read side: denial and out-of-bound counts cost ZERO processes.
  const denied = await registry.invoke({ callId: 'l2', tool: 'git.log', args: {} }, { checkpoint: () => false });
  assert.match(denied.error, /denied at checkpoint/);
  const unbounded = await registry.invoke({ callId: 'l3', tool: 'git.log', args: { count: 10_000 } }, grant);
  assert.match(unbounded.error, /bounded read-back/, 'the tool bounds the window BEFORE the policy sees it');
  assert.equal(spawns.length, 3, 'a read is cheap, but never free, and never unbounded');

  // 2f) The log host cannot be talked into the commit host's (or anyone's) business.
  const sneaky = await logHost.run({ argv: ['git', 'push'], env: gitEnv() }, { preApproved: true });
  assert.equal(sneaky.ran, false);
  assert.match(sneaky.reason, /default-deny/);
  assert.equal(spawns.length, 3, 'even preApproved:true cannot widen a keyed door');
  console.log('[gitlog-proof] denied/bounded/out-of-policy reads spawned NOTHING (total sandbox processes: 3)');
} finally {
  rmSync(dir, { recursive: true, force: true });
  assert.ok(!existsSync(dir), 'the throwaway repo is gone');
}
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: the REAL repo HEAD never moved — the proof wrote and read history ONLY in os.tmpdir');
console.log('[gitlog-proof] ALL ASSERTIONS PASSED (see → touch → confirm: the agent can now check its own history, one bounded argv at a time)');
