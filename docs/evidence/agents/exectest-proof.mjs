// NEXUS M2 v31 — command-backed verification proof (ADR 0016 amendment 31).
// The v28 `test.run` seam widened (run MAY be async) and the v30 host gained a
// bridge: execTestRunner maps an ExecRunResult to a TestReport VERBATIM, so a real
// command's exit code can answer the §63 verify step. Everything here runs against
// FAKE spawns — the real-spawn demo already lives in exec-host-proof (§60).
// Run after `npm run build`:  node docs/evidence/agents/exectest-proof.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const host = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { InMemoryWorkspace, ToolRegistry, registerTestTools, registerWorkspaceTools, runTask } = rt;

const POLICY = {
  root: 'X:/jail',
  allow: [{ argv: ['node', 'app.js'], timeoutMs: 60_000 }, { argv: ['git', 'status', '*'], timeoutMs: 25 }],
  envAllow: ['PATH'],
};

function makeHost(end, chunks = []) {
  const spawns = [];
  const spawnLike = (command, args) => {
    const c = { killed: false, onData(l) { c.data.push(l); }, onEnd(l) { c.ends.push(l); }, data: [], ends: [] };
    c.kill = () => { c.killed = true; for (const l of c.ends) l({ code: null, signal: 'SIGTERM' }); };
    spawns.push({ command, args, child: c });
    if (end) queueMicrotask(() => { for (const [s, t] of chunks) for (const l of c.data) l(s, t); for (const l of c.ends) l(end); });
    return c;
  };
  return { host: host.createExecHost(POLICY, { spawnLike }), spawns };
}

// 1) The mapping is VERBATIM: exit code + streams become the report, nothing is invented.
const passH = makeHost({ code: 0, signal: null }, [['stdout', 'all good']]);
const pass = await host.execTestRunner(passH.host, ['node', 'app.js'], { preApproved: true }).run();
assert.deepEqual([pass.engine, pass.ok, pass.total, pass.passed], ['exec-host:node app.js', true, 1, 1], 'the engine NAMES the real argv');
assert.equal(pass.detail, 'exec-host:node app.js: 1/1 passed — exit 0 · stdout: all good'); // v60: the pipe is NAMED — v31 could only say where text came from by accident
const failH = makeHost({ code: 1, signal: null }, [['stderr', 'boom: assertion failed']]);
const fail = await host.execTestRunner(failH.host, ['node', 'app.js'], { preApproved: true }).run();
assert.deepEqual(fail.failures, [{ name: 'exit-zero', message: 'exit 1 · stderr: boom: assertion failed' }]); // v60: the same words, now attributed to the pipe that said them
console.log('[exectest-proof] mapping: exit 0 passes · exit 1 + stderr fail verbatim, engine = argv');

// 2) Honest denials: a refusal is a FAILING report with its stated reason — never a crash, never a spawn.
const refuseH = makeHost({ code: 0, signal: null });
const refused = await host.execTestRunner(refuseH.host, ['curl', 'evil.test'], { preApproved: true }).run();
assert.equal(refused.ok, false);
assert.match(refused.failures[0].message, /default-deny/);
assert.equal(refused.failures[0].name, 'never-ran', 'v60: a refusal is not filed under the predicate it never reached — the dock tooltip reads this name');
assert.equal(refuseH.spawns.length, 0, 'a policy refusal costs zero spawns even through the bridge');
const noGate = await host.execTestRunner(refuseH.host, ['node', 'app.js']).run();
assert.match(noGate.failures[0].message, /^never ran: checkpoint required for exec \(§28\)/, '§28: no preApproved AND no checkpoint ⇒ the host itself refuses, and v60 says so in words');
assert.equal(noGate.total, 1, 'v60 kept the NUMBER: total counts a predicate in scope, and zeroing it would make registerTestTools answer "no test predicate named exit-zero"');
const timeoutH = makeHost(null); // child never ends on its own
const killed = await host.execTestRunner(timeoutH.host, ['git', 'status', '--short'], { preApproved: true }).run();
assert.equal(killed.ok, false);
assert.match(killed.failures[0].message, /killed at timeout budget \(SIGTERM\)/);
assert.match(killed.failures[0].message, /\(descendants: (reaped|reaper-failed|no-pid|unsupported-platform|not-attempted)\)/, "v55's tree answer, spoken by the bridge since v60");
assert.equal(/exit null/.test(killed.failures[0].message), false, 'v60 retired the exit-null wording — an exit clause for a process that never exited');
assert.equal(timeoutH.spawns[0].child.killed, true);
const vacuous = await host.execTestRunner(refuseH.host, ['node', 'app.js'], { preApproved: true }).run('ghost');
assert.deepEqual([vacuous.total, vacuous.ok], [0, false], 'an `only` miss is the stated vacuous shape, no spawn paid for it');
console.log('[exectest-proof] denials: policy refusal + §28 absence + timeout kill all FAIL honestly, 0 wasted spawns');

// 3) The bridge in the real loop: test.run becomes command-backed, still ONE §28 gate.
const { host: loopHost, spawns: loopSpawns } = makeHost({ code: 0, signal: null });
const ws = new InMemoryWorkspace({ 'docs/alpha.md': 'notes about alpha\n' });
const registry = registerTestTools(
  registerWorkspaceTools(new ToolRegistry(), ws),
  host.execTestRunner(loopHost, ['node', 'app.js'], { preApproved: true }),
);
const denied = await registry.invoke({ callId: 'c1', tool: 'test.run', args: {} }); // no checkpoint ⇒ never runs
assert.equal(denied.ok, false);
assert.match(denied.error, /checkpoint required for exec/);
assert.equal(loopSpawns.length, 0);
const granted = await registry.invoke({ callId: 'c2', tool: 'test.run', args: {} }, { checkpoint: () => true });
assert.equal(granted.output.report.engine, 'exec-host:node app.js');
assert.equal(loopSpawns.length, 1, 'ONE §28 gate (the registry) ⇒ exactly one spawn per granted verify');
const ghost = await registry.invoke({ callId: 'c3', tool: 'test.run', args: { only: 'ghost' } }, { checkpoint: () => true });
assert.match(ghost.error, /no test predicate named "ghost"/, 'the vacuous shape surfaces as a tool ERROR');
const out = await runTask({ id: 'x1', goal: 'annotate the alpha doc', targetPath: 'docs/alpha.md' }, { registry, checkpoint: () => true });
assert.equal(out.status, 'completed');
assert.deepEqual(out.testReports.map((r) => [r.engine, r.ok]), [['exec-host:node app.js', true]], 'the §63 verify step was answered by a COMMAND');
assert.equal(loopSpawns.length, 2, 'the loop added exactly ONE spawn: the ghost filter and the denied call cost nothing');
console.log(`[exectest-proof] loop: runTask verified by exec-host command · ${out.testReports.length} report journalled, engine stated`);

// 4) The seam did not leak a spawn into the runtime: async TestRunner is still pure data there.
assert.ok(!readFileSync('./agents/runtime/dist/testRunner.js', 'utf8').includes('child_process'), 'agent-runtime must stay provably spawn-free');
console.log('[exectest-proof] §60 audit: runtime/testRunner.js spawn-free — the bridge lives in exec-host only');

console.log('[exectest-proof] ALL ASSERTIONS PASSED (real commands can verify now, and every refusal says why)');
