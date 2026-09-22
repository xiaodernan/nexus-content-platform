// NEXUS M2 v29 — exec-sandbox policy proof (ADR 0016 amendment 29, ADR 0013 first slice).
// `planExec` turns an exec REQUEST into either an inert PLAN or a stated refusal — pure
// data, pure decision. NO process is ever spawned here, and the proof below SHOWS that
// the shipped runtime bundle contains no `child_process` import at all (§60).
// Run after `npm run build`:  node docs/evidence/agents/exec-sandbox-proof.mjs
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const { ToolRegistry, planExec, registerExecTools, validatePolicy } = rt;

// 1) A policy over the REAL repo root: two exact commands allowed, everything else denied.
const POLICY = {
  root: process.cwd().replace(/\\/g, '/'),
  allow: [
    { argv: ['node', 'scripts/build.js'] },
    { argv: ['git', 'status', '*'], timeoutMs: 5_000, maxOutputBytes: 4_096 },
  ],
  envAllow: ['PATH'],
};
const allowed = planExec({ argv: ['git', 'status', '--short'], cwd: 'docs', env: { PATH: '/bin', GITHUB_TOKEN: 'leak-me' } }, POLICY);
assert.equal(allowed.ok, true);
assert.equal(allowed.plan.executes, false, 'the plan is INERT data — v29 ships no executor, by design');
assert.equal(allowed.plan.cwd, `${POLICY.root}/docs`, 'cwd resolved inside the jail root');
assert.deepEqual(allowed.plan.env, { PATH: '/bin' });
assert.deepEqual(allowed.plan.droppedEnv, ['GITHUB_TOKEN'], 'secrets never ride along uninvited');
assert.deepEqual([allowed.plan.timeoutMs, allowed.plan.maxOutputBytes], [5_000, 4_096]);
console.log(`[exec-sandbox-proof] allowlist: git status --short → inert plan, cwd ${allowed.plan.cwd}, 1 env dropped`);

// 2) Default-deny + pre-allowlist refusals: the shapes of every attack that must die early.
const refusals = [
  [{ argv: ['curl', 'http://evil.test'] }, /default-deny/],
  [{ argv: ['X:/Windows/system32/cmd.exe'] }, /bare name, not a path/],
  [{ argv: 'node scripts/build.js' }, /no shell strings/],
  [{ argv: ['node', 'scripts/build.js', 'extra'] }, /default-deny/, 'arity is part of the pattern'],
  [{ argv: ['git', 'status', '--short'], cwd: '../outside' }, /cwd refused/],
  [{ argv: ['git', 'status', '--short'], cwd: '/etc' }, /cwd refused/],
];
for (const [req, pattern] of refusals) {
  const d = planExec(req, POLICY);
  assert.equal(d.ok, false, `${JSON.stringify(req)} must be refused`);
  assert.match(d.reason, pattern);
}
console.log(`[exec-sandbox-proof] default-deny: ${refusals.length} hostile/ malformed requests refused with stated reasons`);

// 3) The REQUEST cannot raise its own budget and a broken policy is caught at registration.
const clamped = planExec({ argv: ['node', 'scripts/build.js'] }, { ...POLICY, maxTimeoutMs: 250, maxOutputBytes: 512 });
assert.deepEqual([clamped.plan.timeoutMs, clamped.plan.maxOutputBytes], [250, 512], 'policy ceilings win over rule wishes');
assert.equal(validatePolicy(POLICY), null);
assert.match(validatePolicy({ root: 'r', allow: [{ argv: ['*', 'x'] }] }), /may not match the executable/);
assert.throws(() => registerExecTools(new ToolRegistry(), { root: 'r', allow: [{ argv: ['*'] }] }), /exec policy invalid/);
console.log('[exec-sandbox-proof] budgets clamped to policy caps; wildcard-executable policy throws at registration');

// 4) The tool: exec.plan only READS policy, so §28 has nothing to gate — and it says so.
const registry = registerExecTools(new ToolRegistry(), POLICY);
const ungated = await registry.invoke({ callId: 'c1', tool: 'exec.plan', args: { argv: ['node', 'scripts/build.js'] } });
assert.equal(ungated.ok, true, 'no checkpoint option passed, yet the DECISION is callable (it decides, never executes)');
assert.equal(ungated.output.executes, false);
const denied = await registry.invoke({ callId: 'c2', tool: 'exec.plan', args: { argv: ['rm', '-rf', '/'] } });
assert.equal(denied.output.planned, false);
assert.match(denied.output.reason, /default-deny/);
console.log('[exec-sandbox-proof] tool: exec.plan answers without a gate; rm -rf / comes back planned:false');

// 5) §60 made CHECKABLE: the built bundle provably contains no process-spawning surface.
const distFiles = readdirSync('./agents/runtime/dist').filter((f) => f.endsWith('.js'));
for (const f of distFiles) {
  const src = readFileSync(`./agents/runtime/dist/${f}`, 'utf8');
  assert.ok(!src.includes('child_process'), `${f} imports child_process — the "plans are inert" claim would be a lie`);
  assert.ok(!src.includes('node:child_process'), `${f} imports node:child_process`);
}
console.log(`[exec-sandbox-proof] §60 audit: ${distFiles.length} dist modules scanned, zero child_process references — nothing in @nexus/agent-runtime can spawn`);

console.log('[exec-sandbox-proof] ALL ASSERTIONS PASSED (policy-as-data gate proven before any executor exists)');
