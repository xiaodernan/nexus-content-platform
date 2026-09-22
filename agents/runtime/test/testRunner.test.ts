import { describe, expect, it } from 'vitest';
import { InMemoryWorkspace, registerWorkspaceTools } from '../src/workspace.js';
import { ToolRegistry } from '../src/registry.js';
import { runTask } from '../src/orchestrator.js';
import {
  appendTestReport,
  loadTestReports,
  predicateRunner,
  registerTestTools,
  runPredicates,
  type TestPredicate,
} from '../src/testRunner.js';

const FILES = { 'docs/a.md': 'alpha notes\nNOTE (DEMO MODE): here', 'src/b.ts': 'export const b = 1;' };
const pass = (name: string): TestPredicate => ({ name, check: () => null });
const failWith = (name: string, message: string): TestPredicate => ({ name, check: () => message });

class MemDisk {
  files = new Map<string, string>();
  readFileSync(p: string): string {
    const c = this.files.get(p);
    if (c === undefined) throw new Error(`no such file: ${p}`);
    return c;
  }
  mkdirSync(): void {}
  writeFileSync(p: string, data: string): void {
    this.files.set(p, data);
  }
}

describe('runPredicates (v28: in-process predicate engine, engine stated)', () => {
  it('an all-pass pack yields ok with zero failures and the engine named in detail', () => {
    const rep = runPredicates('in-process-predicates', [pass('a'), pass('b')], FILES);
    expect(rep).toMatchObject({ engine: 'in-process-predicates', ok: true, total: 2, passed: 2, failures: [] });
    expect(rep.detail).toBe('in-process-predicates: 2/2 passed');
  });

  it('a failing predicate carries its message VERBATIM and flips the verdict', () => {
    const rep = runPredicates('e', [pass('a'), failWith('b', 'custom message')], FILES);
    expect(rep.ok).toBe(false);
    expect(rep.failures).toEqual([{ name: 'b', message: 'custom message' }]);
    expect(rep.detail).toContain('failing: b');
  });

  it('a throwing predicate is reported as `threw: …`, never crashes the run', () => {
    const rep = runPredicates(
      'e',
      [
        { name: 'boom', check: () => { throw new Error('kaboom'); } },
        failWith('weak', 'soft fail'),
      ],
      FILES,
    );
    expect(rep.failures).toEqual([
      { name: 'boom', message: 'threw: kaboom' },
      { name: 'weak', message: 'soft fail' },
    ]);
    expect(rep.passed).toBe(0);
  });

  it('execution is by name order regardless of registration order; duplicate names: first registration wins', () => {
    const rep = runPredicates('e', [failWith('z', 'late'), failWith('a', 'early'), failWith('z', 'shadowed dup')], FILES);
    expect(rep.failures.map((f) => [f.name, f.message])).toEqual([['a', 'early'], ['z', 'late']]);
  });

  it('an EMPTY pack is a stated vacuous failure, not a green pass (§60)', () => {
    const rep = runPredicates('e', [], FILES);
    expect(rep.ok).toBe(false);
    expect(rep.total).toBe(0);
    expect(rep.detail).toContain('vacuous: no predicate ran');
  });

  it('only= runs exactly one named predicate; a miss yields total 0', () => {
    const pack = [pass('a'), failWith('b', 'nope')];
    expect(runPredicates('e', pack, FILES, 'b')).toMatchObject({ total: 1, passed: 0 });
    expect(runPredicates('e', pack, FILES, 'ghost').total).toBe(0);
  });
});

describe('registerTestTools + predicateRunner (the tool the §63 loop verifies with)', () => {
  const build = (predicates: TestPredicate[], ws: InMemoryWorkspace) => {
    const registry = registerWorkspaceTools(new ToolRegistry(), ws);
    const runner = predicateRunner('in-process-predicates', predicates, () => ws.snapshot());
    registerTestTools(registry, runner);
    return { registry, runner };
  };

  it('test.run is exec-gated: without a checkpoint grant it simply never runs', async () => {
    const { registry } = build([pass('a')], new InMemoryWorkspace(FILES));
    const res = await registry.invoke({ callId: 'c1', tool: 'test.run', args: {} });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('checkpoint required for exec');
  });

  it('a granted call returns {ok, detail} for the loop PLUS a structured report for the journal', async () => {
    const { registry } = build([pass('a'), failWith('b', 'broken')], new InMemoryWorkspace(FILES));
    const res = await registry.invoke({ callId: 'c2', tool: 'test.run', args: {} }, { checkpoint: () => true });
    expect(res.ok).toBe(true);
    const out = res.output as { ok: boolean; detail: string; report: { engine: string; failures: unknown[] } };
    expect(out.ok).toBe(false);
    expect(out.report.engine).toBe('in-process-predicates');
    expect(out.report.failures).toEqual([{ name: 'b', message: 'broken' }]);
    expect(out.detail).toBe(out.report.detail);
  });

  it('an unknown `only` filter is an ERROR, not a vacuous pass', async () => {
    const { registry } = build([pass('a')], new InMemoryWorkspace(FILES));
    const res = await registry.invoke({ callId: 'c3', tool: 'test.run', args: { only: 'ghost' } }, { checkpoint: () => true });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('no test predicate named "ghost"');
  });

  it('the runner reads files LAZILY: a later write changes the next verdict, no re-registration', () => {
    const ws = new InMemoryWorkspace({ 'docs/a.md': 'plain' });
    const runner = predicateRunner('e', [{ name: 'has-marker', check: (f) => (f['docs/a.md']?.includes('MARKER') ? null : 'no MARKER yet') }], () => ws.snapshot());
    expect(runner.run().ok).toBe(false);
    ws.write('docs/a.md', 'plain + MARKER');
    expect(runner.run().ok).toBe(true);
  });
});

describe('runTask end-to-end (v28: structured reports journalled on the outcome)', () => {
  const setup = (predicates: TestPredicate[]) => {
    const ws = new InMemoryWorkspace({ 'docs/alpha.md': 'notes about alpha\n' });
    const registry = registerWorkspaceTools(new ToolRegistry(), ws);
    registerTestTools(registry, predicateRunner('in-process-predicates', predicates, () => ws.snapshot()));
    return { ws, registry };
  };
  const noteLanded: TestPredicate = {
    name: 'annotation-landed',
    check: (f) => (Object.values(f).some((c) => c.includes('NOTE (DEMO MODE')) ? null : 'no agent annotation in the corpus'),
  };

  it('a template run that annotates then verifies completes AND carries the report', async () => {
    const { registry } = setup([noteLanded]);
    const out = await runTask({ id: 't1', goal: 'annotate the alpha doc', targetPath: 'docs/alpha.md' }, { registry, checkpoint: () => true });
    expect(out.status).toBe('completed');
    expect(out.testReports).toHaveLength(1);
    expect(out.testReports![0]).toMatchObject({ engine: 'in-process-predicates', ok: true, total: 1, passed: 1 });
  });

  it('a predicate that can never pass ends failed_verification with every re-check reported', async () => {
    const { registry } = setup([{ name: 'needs-never', check: () => 'NEVER will appear' }]);
    const out = await runTask({ id: 't2', goal: 'impossible audit', targetPath: 'docs/alpha.md' }, { registry, checkpoint: () => true });
    expect(out.status).toBe('failed_verification');
    // verify + 2 fix-round re-checks, all honestly failing by name
    expect(out.testReports).toHaveLength(3);
    expect(out.testReports!.every((r) => r.ok === false && r.failures[0]!.name === 'needs-never')).toBe(true);
  });

  it('hosts WITHOUT registerTestTools keep the old shape: no reports, no fake field', async () => {
    const ws = new InMemoryWorkspace({ 'docs/alpha.md': 'x' });
    const registry = registerWorkspaceTools(new ToolRegistry(), ws);
    const out = await runTask({ id: 't3', goal: 'annotate alpha', targetPath: 'docs/alpha.md' }, { registry, checkpoint: () => true });
    expect(out.status).toBe('completed');
    expect(out.testReports).toBeUndefined();
  });
});

describe('v31 async runners — the seam widened, the sync hosts unchanged', () => {
  it('the tool AWAITS an async TestRunner and the report shape is identical', async () => {
    const registry = new ToolRegistry();
    registerTestTools(registry, { name: 'async-engine', run: async () => runPredicates('async-engine', [pass('a')], FILES) });
    const res = await registry.invoke({ callId: 'a1', tool: 'test.run', args: {} }, { checkpoint: () => true });
    expect(res.ok).toBe(true);
    const out = res.output as { report: { engine: string; ok: boolean } };
    expect(out.report).toMatchObject({ engine: 'async-engine', ok: true });
  });

  it('an async runner that REJECTS surfaces as a tool error, never a crash', async () => {
    const registry = new ToolRegistry();
    registerTestTools(registry, { name: 'bad', run: async (): Promise<never> => { throw new Error('command blew up'); } });
    const res = await registry.invoke({ callId: 'a2', tool: 'test.run', args: {} }, { checkpoint: () => true });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('command blew up');
  });

  it('runTask journals reports from an async runner like any other', async () => {
    const ws = new InMemoryWorkspace({ 'docs/alpha.md': 'notes about alpha\n' });
    const registry = registerWorkspaceTools(new ToolRegistry(), ws);
    registerTestTools(registry, { name: 'async', run: async () => runPredicates('async', [{ name: 'p', check: (f) => (Object.values(f).some((c) => c.includes('NOTE (DEMO MODE')) ? null : 'no note') }], ws.snapshot()) });
    const out = await runTask({ id: 'a3', goal: 'annotate the alpha doc', targetPath: 'docs/alpha.md' }, { registry, checkpoint: () => true });
    expect(out.status).toBe('completed');
    expect(out.testReports).toHaveLength(1);
    expect(out.testReports![0]!.engine).toBe('async');
  });
});

describe('test report JSONL durability (same discipline as the ledger)', () => {
  it('append → reload counts records; malformed lines are counted, never trusted', () => {
    const disk = new MemDisk();
    const okRep = runPredicates('e', [pass('a')], FILES);
    const badRep = runPredicates('e', [failWith('b', 'm')], FILES);
    appendTestReport(disk, 'logs/tests.jsonl', okRep);
    appendTestReport(disk, 'logs/tests.jsonl', badRep);
    disk.files.set('logs/tests.jsonl', `${disk.files.get('logs/tests.jsonl')!}not json at all\n{"engine":"e"}\n`);
    const load = loadTestReports(disk, 'logs/tests.jsonl');
    expect(load.reports).toEqual([okRep, badRep]);
    expect(load.malformed).toBe(2);
  });

  it('last-N keeps the TRAILING reports; a missing file reads as empty, not as an error', () => {
    const disk = new MemDisk();
    for (const p of [pass('a'), failWith('b', 'm'), pass('c')]) appendTestReport(disk, 'x/t.jsonl', runPredicates('e', [p], FILES));
    expect(loadTestReports(disk, 'x/t.jsonl', 2).reports.map((r) => r.ok)).toEqual([false, true]);
    expect(loadTestReports(disk, 'x/none.jsonl')).toEqual({ reports: [], malformed: 0 });
  });
});
