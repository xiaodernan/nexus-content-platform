import { describe, expect, it } from 'vitest';
import { InMemoryWorkspace, ToolRegistry, registerTestTools, registerWorkspaceTools, runTask } from '@nexus/agent-runtime';
import type { ExecPolicy, SpawnLike } from '@nexus/agent-runtime';
import { createExecHost, type ExecChild } from '../src/execHost.js';
import { execTestRunner } from '../src/execTestRunner.js';

const POLICY: ExecPolicy = {
  root: 'X:/jail',
  allow: [{ argv: ['node', 'app.js'], timeoutMs: 60_000, maxOutputBytes: 2_000 }, { argv: ['git', 'status', '*'], timeoutMs: 20, maxOutputBytes: 200 }],
  envAllow: ['PATH'],
};

class FakeChild implements ExecChild {
  killed = false;
  private data: Array<(s: 'stdout' | 'stderr', c: Buffer | string) => void> = [];
  private ends: Array<(e: { code: number | null; signal: string | null; error?: string }) => void> = [];
  onData(l: (s: 'stdout' | 'stderr', c: Buffer | string) => void) {
    this.data.push(l);
  }
  onEnd(l: (e: { code: number | null; signal: string | null; error?: string }) => void) {
    this.ends.push(l);
  }
  kill() {
    this.killed = true;
    this.emitEnd({ code: null, signal: 'SIGTERM' });
  }
  emitData(s: 'stdout' | 'stderr', c: Buffer | string) {
    for (const l of this.data) l(s, c);
  }
  emitEnd(e: { code: number | null; signal: string | null; error?: string }) {
    for (const l of this.ends) l(e);
  }
}

function harness(end: { code?: number | null; signal?: string | null } = { code: 0, signal: null }, chunks: ['stdout' | 'stderr', string][] = []) {
  const calls: string[][] = [];
  let child: FakeChild | undefined;
  const spawnLike: SpawnLike = (command, args) => {
    calls.push([command, ...args]);
    child = new FakeChild();
    const c = child;
    queueMicrotask(() => {
      for (const [s, t] of chunks) c.emitData(s, t);
      if (end.code !== undefined || end.signal !== undefined) c.emitEnd({ code: end.code ?? null, signal: end.signal ?? null });
    });
    return c;
  };
  return { host: createExecHost(POLICY, { spawnLike }), calls, lastChild: () => child! };
}

const PASS_OPTS = { preApproved: true };

describe('execTestRunner (v31: a real command answers the §63 verify step)', () => {
  it('exit 0 → passing report whose engine NAMES the argv, shape identical to predicates', async () => {
    const h = harness({ code: 0, signal: null }, [['stdout', 'all good']]);
    const rep = await execTestRunner(h.host, ['node', 'app.js'], PASS_OPTS).run();
    expect(rep).toMatchObject({ engine: 'exec-host:node app.js', ok: true, total: 1, passed: 1, failures: [] });
    expect(rep.detail).toBe('exec-host:node app.js: 1/1 passed — exit 0 · all good');
  });

  it('exit 1 with stderr → failing report carrying the exit code and stderr VERBATIM', async () => {
    const h = harness({ code: 1, signal: null }, [['stderr', 'boom: assertion failed']]);
    const rep = await execTestRunner(h.host, ['node', 'app.js'], PASS_OPTS).run();
    expect(rep.ok).toBe(false);
    expect(rep.failures).toEqual([{ name: 'exit-zero', message: 'exit 1 · boom: assertion failed' }]);
  });

  it('timeout kill → honest failure: budget death is NEVER exit-code 0 noise', async () => {
    const h = harness({}, []); // never auto-ends; git rule caps at 20ms
    const rep = await execTestRunner(h.host, ['git', 'status', '--short'], PASS_OPTS).run();
    expect(rep.ok).toBe(false);
    expect(rep.failures[0]!.message).toContain('killed at timeout budget (SIGTERM)');
    expect(h.lastChild().killed).toBe(true);
  });

  it('a policy refusal becomes a FAILING report with the stated reason — never a crash, never a spawn', async () => {
    const h = harness();
    const rep = await execTestRunner(h.host, ['curl', 'http://evil.test'], PASS_OPTS).run();
    expect(h.calls).toHaveLength(0);
    expect(rep.ok).toBe(false);
    expect(rep.total).toBe(1);
    expect(rep.failures[0]!.message).toContain('default-deny');
  });

  it('§28 at the bridge: without preApproved the host refuses and the report says exactly that', async () => {
    const h = harness();
    const rep = await execTestRunner(h.host, ['node', 'app.js']).run();
    expect(h.calls).toHaveLength(0);
    expect(rep.failures).toEqual([{ name: 'exit-zero', message: 'checkpoint required for exec (§28)' }]);
  });

  it('`only` on another name → vacuous total-0 report (the tool turns it into a stated error)', async () => {
    const h = harness();
    const rep = await execTestRunner(h.host, ['node', 'app.js'], PASS_OPTS).run('ghost');
    expect(rep).toMatchObject({ total: 0, ok: false });
    expect(rep.detail).toContain('vacuous: no predicate ran');
    expect(h.calls).toHaveLength(0, 'a filter miss must not even pay for a spawn');
  });
});

describe('execTestRunner through registerTestTools (test.run now command-backed)', () => {
  const setup = (h: ReturnType<typeof harness>) => {
    const ws = new InMemoryWorkspace({ 'docs/alpha.md': 'notes\n' });
    const registry = registerWorkspaceTools(new ToolRegistry(), ws);
    registerTestTools(registry, execTestRunner(h.host, ['node', 'app.js'], PASS_OPTS));
    return { ws, registry };
  };

  it('granted call → {ok, detail, report} with the exec-host engine stated', async () => {
    const h = harness({ code: 0, signal: null });
    const { registry } = setup(h);
    const res = await registry.invoke({ callId: 'c1', tool: 'test.run', args: {} }, { checkpoint: () => true });
    expect(res.ok).toBe(true);
    const out = res.output as { ok: boolean; detail: string; report: { engine: string } };
    expect(out.report.engine).toBe('exec-host:node app.js');
    expect(out.detail).toContain('exit 0');
  });

  it('an unknown `only` filter is a tool ERROR naming the predicate, not a vacuous pass', async () => {
    const h = harness();
    const { registry } = setup(h);
    const res = await registry.invoke({ callId: 'c2', tool: 'test.run', args: { only: 'ghost' } }, { checkpoint: () => true });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('no test predicate named "ghost"');
  });

  it('runTask end-to-end: template run verifies with the REAL command and journals the report', async () => {
    const h = harness({ code: 0, signal: null });
    const { registry } = setup(h);
    const out = await runTask({ id: 't1', goal: 'annotate the alpha doc', targetPath: 'docs/alpha.md' }, { registry, checkpoint: () => true });
    expect(out.status).toBe('completed');
    expect(out.testReports).toHaveLength(1);
    expect(out.testReports![0]).toMatchObject({ engine: 'exec-host:node app.js', ok: true, total: 1 });
    expect(h.calls).toEqual([['node', 'app.js']]);
  });
});
