// NEXUS M2 v28 — test-run seam proof (ADR 0016 amendment 28).
// The §63 "test" word, made first-class: hosts stop hand-rolling one-off `test.run`
// bodies and register the runtime's shared PREDICATE ENGINE instead. Everything here
// runs in-process over plain data — NO subprocess is spawned and nothing pretends to
// be a real `npm test` run (§60; real runners live behind the ADR 0013 exec sandbox).
// Run after `npm run build`:  node docs/evidence/agents/testrunner-proof.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const {
  InMemoryWorkspace,
  ToolRegistry,
  appendTestReport,
  loadTestReports,
  predicateRunner,
  registerTestTools,
  registerWorkspaceTools,
  runPredicates,
  runTask,
} = rt;

// 1) Pure predicate semantics — deterministic, verbatim messages, throw-safe, honest about emptiness.
const FILES = { 'docs/a.md': 'alpha\nNOTE (DEMO MODE): ok', 'src/b.ts': 'const b = 1;' };
const allPass = runPredicates('in-process-predicates', [{ name: 'a', check: () => null }, { name: 'b', check: (f) => (f['src/b.ts'].includes('b') ? null : 'b gone') }], FILES);
assert.deepEqual(allPass.failures, []);
assert.equal(allPass.detail, 'in-process-predicates: 2/2 passed');
const mixed = runPredicates('e', [{ name: 'z', check: () => 'VERBATIM message' }, { name: 'boom', check: () => { throw new Error('kaboom'); } }], FILES);
assert.deepEqual(mixed.failures, [{ name: 'boom', message: 'threw: kaboom' }, { name: 'z', message: 'VERBATIM message' }]); // name order, throw reported not crashed
assert.equal(mixed.ok, false);
const vacuous = runPredicates('e', [], FILES);
assert.equal(vacuous.ok, false, 'an EMPTY pack must never masquerade as green');
assert.match(vacuous.detail, /vacuous: no predicate ran/);
assert.deepEqual(runPredicates('e', [{ name: 'a', check: () => null }], FILES), runPredicates('e', [{ name: 'a', check: () => null }], FILES), 'determinism');
console.log(`[testrunner-proof] predicates: verbatim failures · throw→"threw:" · empty = stated vacuous failure, not green`);

// 2) The tool contract: exec-gated, {ok, detail} for the loop + structured report for the journal.
const ws = new InMemoryWorkspace(FILES);
const registry = registerWorkspaceTools(new ToolRegistry(), ws);
const runner = predicateRunner('in-process-predicates', [{ name: 'annotation-landed', check: (f) => (Object.values(f).some((c) => c.includes('NOTE (DEMO MODE')) ? null : 'no annotation in corpus') }], () => ws.snapshot());
registerTestTools(registry, runner);
const denied = await registry.invoke({ callId: 'c1', tool: 'test.run', args: {} }); // §28: no checkpoint ⇒ never runs
assert.equal(denied.ok, false);
assert.match(denied.error, /checkpoint required for exec/);
const granted = await registry.invoke({ callId: 'c2', tool: 'test.run', args: {} }, { checkpoint: () => true });
assert.equal(granted.output.ok, true);
assert.equal(granted.output.report.engine, 'in-process-predicates');
const ghost = await registry.invoke({ callId: 'c3', tool: 'test.run', args: { only: 'ghost' } }, { checkpoint: () => true });
assert.equal(ghost.ok, false);
assert.match(ghost.error, /no test predicate named "ghost"/, 'an unknown filter is an ERROR, not a vacuous pass');
console.log('[testrunner-proof] tool: exec-gated · report travels · unknown `only` errors honestly');

// 3) End-to-end §63 loop: verify reports journal on the RunOutcome; re-checks after fix rounds too.
const ws2 = new InMemoryWorkspace({ 'docs/alpha.md': 'notes about alpha\n' });
const reg2 = registerTestTools(
  registerWorkspaceTools(new ToolRegistry(), ws2),
  predicateRunner('in-process-predicates', [{ name: 'annotation-landed', check: (f) => (Object.values(f).some((c) => c.includes('NOTE (DEMO MODE')) ? null : 'no agent annotation in the corpus') }], () => ws2.snapshot()),
);
const good = await runTask({ id: 'p1', goal: 'annotate the alpha doc', targetPath: 'docs/alpha.md' }, { registry: reg2, checkpoint: () => true });
assert.equal(good.status, 'completed');
assert.deepEqual(good.testReports.map((r) => [r.engine, r.ok, r.total]), [['in-process-predicates', true, 1]]);
const reg3 = registerTestTools(
  registerWorkspaceTools(new ToolRegistry(), new InMemoryWorkspace({ 'docs/alpha.md': 'x' })),
  predicateRunner('in-process-predicates', [{ name: 'needs-never', check: () => 'NEVER will appear' }]),
);
const bad = await runTask({ id: 'p2', goal: 'impossible audit', targetPath: 'docs/alpha.md' }, { registry: reg3, checkpoint: () => true });
assert.equal(bad.status, 'failed_verification');
assert.equal(bad.testReports.length, 3, 'verify + both fix-round re-checks are all on record');
assert.ok(bad.testReports.every((r) => !r.ok && r.failures[0].name === 'needs-never'));
console.log(`[testrunner-proof] loop: completed run journals 1 ok report · failing predicate → ${bad.testReports.length} honest reports, status=${bad.status}`);

// 4) Durable verdicts: append-only JSONL with counted, never-trusted malformed lines.
class MemDisk {
  files = new Map();
  readFileSync(p) { const c = this.files.get(p); if (c === undefined) throw new Error(`no such file: ${p}`); return c; }
  mkdirSync() {}
  writeFileSync(p, d) { this.files.set(p, d); }
}
const disk = new MemDisk();
appendTestReport(disk, 'logs/tests.jsonl', allPass);
appendTestReport(disk, 'logs/tests.jsonl', mixed);
disk.files.set('logs/tests.jsonl', `${disk.files.get('logs/tests.jsonl')}garbage\n{"engine":"e"}\n`);
const load = loadTestReports(disk, 'logs/tests.jsonl');
assert.deepEqual(load.reports, [allPass, mixed]);
assert.equal(load.malformed, 2);
assert.deepEqual(loadTestReports(disk, 'logs/tests.jsonl', 1).reports, [mixed]);
console.log(`[testrunner-proof] durability: 2 reports reload, ${load.malformed} malformed counted not trusted, last-N holds`);

console.log('[testrunner-proof] ALL ASSERTIONS PASSED (in-process predicate engine end-to-end, §60: never a real test suite)');
