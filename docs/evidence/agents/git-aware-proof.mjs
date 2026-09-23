// NEXUS M2 v32 — read-only git awareness proof (ADR 0016 amendment 32).
// The agent stack can now SEE the repo (`git status --short`, `git diff [--stat]`) through
// the SAME policy + checkpoint + budget machinery as v30 — parsed into structured data,
// never a raw blob. §9 holds by policy: the allowlist has three exact argv and no more;
// the git COMMIT write tool is deliberately NOT part of this slice (§60).
// Run after `npm run build`:  node docs/evidence/agents/git-aware-proof.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const eh = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry } = rt;
const { GIT_DIFF_FLAGS, createExecHost, gitEnv, gitReadOnlyPolicy, parseDiffStat, parseGitDiff, parseGitStatus, registerGitTools } = eh;
const F = GIT_DIFF_FLAGS.join(' ');

// 1) Pure parsers first: the structured view exists before any process does.
const st = parseGitStatus(' M src/a.ts\nR  old/x.md -> new/x.md\n?? pipeout.bin\nUU conflict.ts\n');
assert.deepEqual(st.files.map((f) => f.status), ['modified', 'renamed', 'untracked', 'unmerged']);
assert.equal(st.files[1].path, 'new/x.md', 'a rename reports the NEW path');
assert.deepEqual(st.counts, { modified: 1, renamed: 1, untracked: 1, unmerged: 1 });
const df = parseGitDiff('junk preamble\ndiff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1,1 +1,2 @@\n context\n+added\n+added2\ndiff --git a/y.md b/y.md\n@@ -1 +1 @@\n-gone\n+here\n');
assert.deepEqual(df.totals, { files: 2, hunks: 2, additions: 3, deletions: 1 }, '+++ / --- headers never count as changes');
assert.deepEqual(parseDiffStat(' 1 file changed, 2 insertions(+), 1 deletion(-)'), { files: 1, insertions: 2, deletions: 1 });
console.log('[git-aware-proof] parsers: porcelain + line tallies + stat footer are pure data');

// 2) The policy says THREE exact commands and nothing else — checked before any spawn.
const policy = gitReadOnlyPolicy('X:/repo');
for (const argv of [['git', 'status', '--short'], ['git', 'diff', ...GIT_DIFF_FLAGS], ['git', 'diff', ...GIT_DIFF_FLAGS, '--stat']]) {
  assert.equal(rt.planExec({ argv }, policy).ok, true, `allowlisted ${argv.join(' ')} plans`);
}
for (const argv of [
  ['git', 'push'], ['git', 'commit', '-m', 'x'], ['git', 'diff', '--', 'a.env'], ['git', 'status'],
  ['git', 'diff'], // v46: the shape this proof shipped until a repo config was measured EXECUTING a helper and returning nothing
  ['git', 'diff', '--stat'], // same, in stat mode
  ['git', 'diff', ...GIT_DIFF_FLAGS, '--ext-diff'], // an escalation flag cancels the pin
]) {
  const d = rt.planExec({ argv }, policy);
  assert.equal(d.ok, false);
  assert.match(d.reason, /default-deny/, `${argv.join(' ')} must NEVER plan`);
}
console.log('[git-aware-proof] policy: 3 argv allowed (2 flag-pinned by v46) · push/commit/unpinned-diff/path-scoped all default-deny');

// 3) Fake-spawn tool path: gates, env scrubbing, structured outputs.
const spawns = [];
function fakeHost(stdout, end = { code: 0, signal: null }, maxOut) {
  const host = createExecHost(gitReadOnlyPolicy('X:/repo', maxOut === undefined ? {} : { maxOutputBytes: maxOut }), {
    spawnLike: (command, args, opts) => {
      spawns.push({ command, args, env: opts.env });
      const ls = [];
      const c = { onData: (l) => ls.push(l), onEnd: (l) => c.end = l, kill() { c.end({ code: null, signal: 'SIGTERM' }); } };
      queueMicrotask(() => { ls.forEach((l) => l('stdout', stdout)); c.end(end); });
      return c;
    },
  });
  const registry = registerGitTools(new ToolRegistry(), host, { env: { PATH: '/bin', TOKEN: 'leak?' } });
  return { registry, grant: { checkpoint: () => true } };
}
const gate = fakeHost(' M a.ts\n');
const ungated = await gate.registry.invoke({ callId: 'g0', tool: 'git.status', args: {} });
assert.match(ungated.error, /checkpoint required for exec/);
assert.equal(spawns.length, 0, 'exec permission means EXEC — gate-free calls spawn nothing, read-only or not');
const granted = await gate.registry.invoke({ callId: 'g1', tool: 'git.status', args: {} }, gate.grant);
assert.equal(granted.output.ok, true);
assert.deepEqual(granted.output.files, [{ xy: ' M', status: 'modified', path: 'a.ts' }], 'the agent gets PARSED state, not a string');
assert.deepEqual(spawns[0].env, gitEnv({ PATH: '/bin' }), 'the scrubber dropped TOKEN, and v46 ADDED the isolation: a caller cannot opt out');
const escape = await gate.registry.invoke({ callId: 'g2', tool: 'git.diff', args: { cwd: '../outside' } }, gate.grant);
assert.match(escape.error, /cwd refused/, 'the jail holds even for a read-only command');
const nope = fakeHost('', { code: 128, signal: null });
const notRepo = await nope.registry.invoke({ callId: 'g3', tool: 'git.status', args: {} }, nope.grant);
assert.equal(notRepo.ok, true);
assert.equal(notRepo.output.ok, false);
assert.equal(notRepo.output.exitCode, 128, 'a failing git says so as data, never as a crash');
const small = fakeHost(' M a.ts\n?? b.bin\n', { code: 0, signal: null }, 4);
const cut = await small.registry.invoke({ callId: 'g4', tool: 'git.status', args: {} }, small.grant);
assert.equal(cut.output.truncated, true);
assert.match(cut.output.detail, /output truncated at budget/, 'partial awareness is LABELED partial');
console.log('[git-aware-proof] tools: §28-gated · parsed outputs · scrubbed env · jail + exit + truncation honest');

// 4) THE REAL THING (honestly labeled): the SAME tools against THIS repo, read-only.
const realPolicyRoot = process.cwd().replace(/\\/g, '/');
const realHost = createExecHost(gitReadOnlyPolicy(realPolicyRoot, { timeoutMs: 15_000 }));
const realReg = registerGitTools(new ToolRegistry(), realHost, { env: gitEnv() });
const real = await realReg.invoke({ callId: 'r1', tool: 'git.status', args: {} }, { checkpoint: () => true });
assert.equal(real.output.ok, true, `real git status exited ${real.output.exitCode}: ${real.output.detail}`);
assert.ok(Array.isArray(real.output.files));
assert.ok(Object.values(real.output.counts).reduce((a, b) => a + b, 0) === real.output.files.length, 'counts agree with entries');
const statLine = await realReg.invoke({ callId: 'r2', tool: 'git.diff', args: { stat: true } }, { checkpoint: () => true });
assert.equal(statLine.output.ok, true);
assert.ok(statLine.output.summary === null || typeof statLine.output.summary.files === 'number');
console.log(`[git-aware-proof] real demo: git.status → ${real.output.files.length} entries [engine: node:child_process shell:false]; git.diff --stat summary ${JSON.stringify(statLine.output.summary)}`);

console.log('[git-aware-proof] ALL ASSERTIONS PASSED (the agent can SEE the repo; it still cannot TOUCH it)');
