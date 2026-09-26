// NEXUS M2 v35 — the git COMMIT write tool proof (ADR 0016 amendment 35).
// v32 said "see, don't touch"; v35 opens the TOUCH half under its OWN separate policy:
// exactly `git commit -m <message>` — the first production use of the '*' wildcard in an
// ARG position (shape fixed, message floats, one verbatim token thanks to shell:false).
// The commit records ONLY the human-staged index; there is no add, no push, no flag.
// REAL-REPO SAFETY (§9): every real git write happens in a THROWAWAY repo under os.tmpdir
// that the proof deletes afterwards; the demo repo's HEAD is asserted byte-identical
// before and after. Setup commands (init/config/add) run OUTSIDE the sandbox on purpose —
// the policy under test must NOT be able to stage, only to commit.
// Run after `npm run build`:  node docs/evidence/agents/commit-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync } from '../lib/syncproc.mjs';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry, planExec } = rt;
const { GIT_COMMIT_TOOL_SPECS, NODE_SPAWN, createExecHost, gitCommitPolicy, gitEnv, parseCommitOutput, registerGitCommitTool } = eh;

// 1) Pure: ONE argv shape, and git's own echo parses into a record.
const policy = gitCommitPolicy('X:/repo');
for (const argv of [['git', 'commit', '-m', 'ship it'], ['git', 'commit', '-m', 'two words + "quotes"'], ['git', 'commit', '-m', '*']]) {
  assert.equal(planExec({ argv }, policy).ok, true, `${argv.join(' ')} plans`);
}
for (const argv of [['git', 'commit'], ['git', 'commit', '-m', 'a', 'b'], ['git', 'commit', '-am', 'x'], ['git', 'commit', '--no-verify', '-m', 'x'], ['git', 'add', '.'], ['git', 'push']]) {
  const d = planExec({ argv }, policy);
  assert.equal(d.ok, false);
  assert.match(d.reason, /default-deny/, `${argv.join(' ')} must NEVER plan`);
}
assert.equal(parseCommitOutput('[master 0a1b2c3] feat: x\n 2 files changed, 3 insertions(+), 1 deletion(-)\n').stat.files, 2);
assert.equal(parseCommitOutput('On branch main\nnothing to commit\n'), null, 'anything that is not a commit echo parses to null, not to a guess');
console.log('[commit-proof] policy: `git commit -m *` is the ONLY shape · add/push/flag-variants default-deny · echo parser is honest');

// 2) THE REAL THING in a throwaway repo (this demo is deleted at the end; §9 holds).
const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); // THIS repo, untouched below
const dir = mkdtempSync(join(tmpdir(), 'nexus-commit-proof-'));
try {
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  execFileSync('git', ['init', '-q', dir]);
  git('config', 'user.name', 'NEXUS Commit Proof');
  git('config', 'user.email', 'proof@nexus.invalid');
  git('config', 'core.hooksPath', '.no-hooks'); // neutralize this machine's global hooksPath — INSIDE the temp repo only
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(dir, 'a.txt'), 'staged line\n');
  git('add', 'a.txt');
  writeFileSync(join(dir, 'a.txt'), 'staged line\nplus an UNSTAGED extra edit\n'); // the trap: more than the index
  writeFileSync(join(dir, 'b.txt'), 'never staged\n');

  const spawns = [];
  const host = createExecHost(gitCommitPolicy(dir.replace(/\\/g, '/'), { timeoutMs: 20_000 }), {
    spawnLike: (command, args, opts) => {
      spawns.push({ command, args, cwd: opts.cwd, envKeys: Object.keys(opts.env).sort() });
      return NODE_SPAWN(command, args, opts);
    },
  });
  const registry = registerGitCommitTool(new ToolRegistry(), host, { env: gitEnv() });

  const ungated = await registry.invoke({ callId: 'p0', tool: 'git.commit', args: { message: 'should never run' } });
  assert.match(ungated.error, /checkpoint required for exec/);
  assert.equal(spawns.length, 0, 'a HISTORY WRITE without §28 spawns nothing — the strictest kind of default-deny');
  const denied = await registry.invoke({ callId: 'p1', tool: 'git.commit', args: { message: 'also should never run' } }, { checkpoint: () => false });
  assert.match(denied.error, /denied at checkpoint/);
  assert.equal(spawns.length, 0);
  const blank = await registry.invoke({ callId: 'p2', tool: 'git.commit', args: { message: '   ' } }, { checkpoint: () => true });
  assert.match(blank.error, /non-empty string/, 'a blank message is an ERROR, not a mystery commit');
  assert.equal(spawns.length, 0);

  const message = 'proof: staged-only commit\n\nbody keeps "quotes", dashes --no-verify and spaces verbatim';
  const res = await registry.invoke({ callId: 'p3', tool: 'git.commit', args: { message } }, { checkpoint: () => true });
  assert.equal(res.output.ok, true, `granted commit of the staged index must succeed: ${res.output?.detail ?? res.error}`);
  const record = res.output.record;
  assert.ok(record, `git's echo must parse into a record: ${res.output.detail}`);
  assert.match(record.hash, /^[0-9a-f]{7,}$/, 'git echoed a real hash');
  assert.equal(record.stat.files, 1, 'exactly ONE file changed — only the STAGED line went in');
  assert.equal(record.stat.deletions, 0);
  assert.equal(spawns.length, 1);
  assert.deepEqual(spawns[0].args, ['commit', '-m', message], 'the message reached git as ONE verbatim token (argv-as-data, no shell)');
  assert.equal(spawns[0].cwd, dir.replace(/\\/g, '/'), 'the jail is the temp repo — git can not even SEE the real one from here');
  const fullBody = git('log', '-1', '--pretty=%B');
  assert.ok(fullBody.includes('body keeps "quotes", dashes --no-verify and spaces verbatim'), 'what git RECORDS is what we asked, byte for byte');
  assert.ok(git('rev-parse', 'HEAD').trim().startsWith(record.hash));
  assert.ok(git('status', '--short').includes(' M a.txt'), 'the UNSTAGED edit survives the commit (porcelain ` M`) — the tool commits the index, not the working tree');
  assert.ok(git('status', '--short').includes('?? b.txt'), 'never-staged files stay untracked: no add path exists in this policy');
  const second = await registry.invoke({ callId: 'p4', tool: 'git.commit', args: { message: 'nothing more is staged' } }, { checkpoint: () => true });
  assert.equal(second.output.ok, false, 'an empty index is honest exit-1 DATA, not a crash and not a fake success');
  assert.equal(second.output.exitCode, 1);
  assert.equal(spawns.length, 2);
  assert.ok(git('rev-parse', 'HEAD').trim().startsWith(record.hash), 'the failed attempt wrote NO history');
  console.log(`[commit-proof] REAL(temp repo): committed ${record.branch}@${record.hash} · staged-only stat ${JSON.stringify(record.stat)} · empty index = data · ${spawns.length} sandboxed spawns, message verbatim`);
} finally {
  rmSync(dir, { recursive: true, force: true });
  assert.ok(!existsSync(dir), 'the throwaway repo is gone');
}
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§9: the REAL repo HEAD never moved — the proof wrote history ONLY in os.tmpdir');
console.log('[commit-proof] ALL ASSERTIONS PASSED (the agent can now commit the staged index behind §28 — still never push, never stage, never shell)');
