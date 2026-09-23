// NEXUS M2 v30 — exec-host proof (ADR 0016 amendment 30, ADR 0013 second slice).
// The v29 policy became executable: a SEPARATE package holds the ONLY child_process
// capability in the monorepo's agent stack, it runs nothing the plan didn't approve,
// and every budget in the plan is enforced. Section 5 audits that boundary both ways.
// Run after `npm run build`:  node docs/evidence/agents/exec-host-proof.mjs
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const host = await import(pathToFileURL('./agents/exec-host/dist/index.js').href);
const { ToolRegistry } = rt;

const POLICY = {
  root: 'X:/jail',
  allow: [
    { argv: ['node', 'app.js'] },
    { argv: ['git', 'status', '*'], timeoutMs: 30, maxOutputBytes: 6 },
  ],
  envAllow: ['PATH'],
};

// 1) Fake-spawn harness: EVERY claim below first holds without starting a process.
const spawns = [];
function fakeChild(end, chunks = []) {
  let data = [];
  let ends = [];
  const c = {
    killed: false,
    onData(l) { data.push(l); },
    onEnd(l) { ends.push(l); },
    kill() { c.killed = true; for (const l of ends) l({ code: null, signal: 'SIGTERM' }); },
    fire() { for (const [s, t] of chunks) for (const l of data) l(s, t); if (end) for (const l of ends) l(end); },
  };
  return c;
}
const spawnLike = (command, args, opts) => {
  const c = fakeChild({ code: 0, signal: null });
  spawns.push({ command, args, opts, child: c });
  queueMicrotask(() => c.fire());
  return c;
};
const execHost = host.createExecHost(POLICY, { spawnLike });

// gate matrix: policy refusal, missing checkpoint and human denial ALL spawn nothing
const refused = await execHost.run({ argv: ['curl', 'evil.test'] }, { checkpoint: () => true });
assert.equal(refused.ran, false);
const noGate = await execHost.run({ argv: ['node', 'app.js'] });
assert.match(noGate.reason, /checkpoint required for exec \(§28\)/);
const denied = await execHost.run({ argv: ['node', 'app.js'] }, { checkpoint: () => false });
assert.equal(denied.reason, 'checkpoint denied');
assert.equal(spawns.length, 0, 'zero spawns across all three refusals — the ONLY real promise of an exec sandbox');
console.log('[exec-host-proof] gates: policy refusal + missing checkpoint + human denial → 0 spawns');

// budgets enforced on the plan's own numbers
const approved = await execHost.run({ argv: ['node', 'app.js'], cwd: 'sub', env: { PATH: '/bin', SECRET: 'no' } }, { checkpoint: () => true });
assert.equal(approved.ran, true);
assert.deepEqual(spawns[0], { command: 'node', args: ['app.js'], opts: { cwd: 'X:/jail/sub', env: { PATH: '/bin' } }, child: spawns[0].child });
assert.equal(spawns[0].opts.env.SECRET, undefined, 'the scrubbed env is what the process ACTUALLY gets');
const capped = await host.createExecHost(POLICY, {
  spawnLike: (cmd, args, opts) => {
    const c = fakeChild({ code: 0, signal: null }, [['stdout', 'ab\ncd\n'], ['stderr', 'ef\ngh\n']]);
    queueMicrotask(() => c.fire());
    return c;
  },
}).run({ argv: ['git', 'status', '--short'] }, { checkpoint: () => true });
// v30 asserted ['abcd','ef',true] here: a 6-byte budget that kept `ef` — HALF a line, presented
// as content. v48 (ADR 0016 amendment 48) is the correction: the budget still bites exactly as
// hard, but a stream that lost bytes answers in WHOLE lines, and the starved stream says nothing.
assert.deepEqual([capped.stdout, capped.stderr, capped.truncated], ['ab\ncd\n', '', true], '6-byte budget across both streams: whole lines kept, half a line refused');
const timedOut = await host.createExecHost(POLICY, {
  spawnLike: () => fakeChild(null), // never ends on its own
}).run({ argv: ['git', 'status', '--short'] }, { checkpoint: () => true });
assert.equal(timedOut.killedByBudget, true);
assert.equal(timedOut.signal, 'SIGTERM');
console.log('[exec-host-proof] budgets: argv-as-data + plan env/cwd verbatim · output cap · timeout kill');

// 2) The registry tool path: ONE §28 gate (the registry's), budgets still the host's.
const registry = host.registerExecHostTools(new ToolRegistry(), execHost);
const ungated = await registry.invoke({ callId: 'c1', tool: 'exec.run', args: { argv: ['node', 'app.js'] } });
assert.match(ungated.error, /checkpoint required for exec/);
const granted = await registry.invoke({ callId: 'c2', tool: 'exec.run', args: { argv: ['node', 'app.js'] } }, { checkpoint: () => true });
assert.equal(granted.output.ok, true);
assert.match(granted.output.detail, /exit 0/);
const hostile = await registry.invoke({ callId: 'c3', tool: 'exec.run', args: { argv: ['rm', '-rf', '/'] } }, { checkpoint: () => true });
assert.equal(hostile.ok, false);
assert.match(hostile.error, /default-deny/, 'an approving human cannot override the policy through the tool either');
console.log('[exec-host-proof] tool: exec.run registry-gated · policy refusal stays an error past the gate');

// 3) Journal round-trip through the same file the loop would write.
class MemDisk {
  files = new Map();
  readFileSync(p) { const c = this.files.get(p); if (c === undefined) throw new Error(`no such file: ${p}`); return c; }
  mkdirSync() {}
  writeFileSync(p, d) { this.files.set(p, d); }
}
const disk = new MemDisk();
host.appendExecRun(disk, 'logs/exec.jsonl', approved);
host.appendExecRun(disk, 'logs/exec.jsonl', denied);
disk.files.set('logs/exec.jsonl', `${disk.files.get('logs/exec.jsonl')}junk\n{"ran":false}\n`);
const loaded = host.loadExecRuns(disk, 'logs/exec.jsonl');
assert.deepEqual(loaded.runs, [approved, denied]);
assert.equal(loaded.malformed, 2);
console.log('[exec-host-proof] journal: 2 runs reload · 2 malformed counted, never trusted');

// 4) THE REAL THING (honestly labeled): one read-only command, through the exact same
// policy + checkpoint + budget machinery — NODE_SPAWN, the default adapter.
const realHost = host.createExecHost({
  root: process.cwd().replace(/\\/g, '/'),
  allow: [{ argv: ['git', 'status', '*'], timeoutMs: 10_000, maxOutputBytes: 65_536 }],
  envAllow: ['PATH', 'SYSTEMROOT', 'HOME', 'USERPROFILE'],
});
const env = {};
for (const k of ['PATH', 'SYSTEMROOT', 'HOME', 'USERPROFILE']) if (typeof process.env[k] === 'string') env[k] = process.env[k];
const real = await realHost.run({ argv: ['git', 'status', '--short'], env }, { checkpoint: () => true });
assert.equal(real.ran, true);
assert.equal(real.exitCode, 0, 'a REAL process ran under the REAL plan');
assert.equal(real.killedByBudget, false);
assert.equal(typeof real.stdout, 'string');
assert.equal(real.spawnError, '');
console.log(`[exec-host-proof] real demo: git status --short spawned, exit ${real.exitCode}, ${real.stdout.split('\n').filter(Boolean).length} lines (read-only, repo untouched) [engine: node:child_process shell:false]`);

// 5) The spawn boundary, audited BOTH ways: capability lives in exactly one package.
const rtFiles = readdirSync('./agents/runtime/dist').filter((f) => f.endsWith('.js'));
for (const f of rtFiles) {
  assert.ok(!readFileSync(`./agents/runtime/dist/${f}`, 'utf8').includes('child_process'), `agent-runtime/${f} grew a spawn — the v29 audit is dead`);
}
const hostFiles = readdirSync('./agents/exec-host/dist').filter((f) => f.endsWith('.js'));
const spawners = hostFiles.filter((f) => readFileSync(`./agents/exec-host/dist/${f}`, 'utf8').includes('child_process'));
assert.deepEqual(spawners, ['execHost.js'], 'exactly ONE module in the monorepo may talk to child_process');
console.log(`[exec-host-proof] §60 audit: ${rtFiles.length} runtime modules spawn-free · exec-host capability confined to execHost.js`);

console.log('[exec-host-proof] ALL ASSERTIONS PASSED (the ADR 0013 gate now has a keyed door, and the key is the checkpoint)');
