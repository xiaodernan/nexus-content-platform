import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '@nexus/agent-runtime';
import type { ExecPolicy, SpawnLike } from '@nexus/agent-runtime';
import {
  EXEC_HOST_TOOL_SPECS,
  appendExecRun,
  createExecHost,
  formatExecLine,
  loadExecRuns,
  registerExecHostTools,
  type ExecChild,
  type ExecRunResult,
} from '../src/execHost.js';

const POLICY: ExecPolicy = {
  root: 'X:/jail',
  allow: [{ argv: ['node', 'app.js'], timeoutMs: 60_000, maxOutputBytes: 1_000 }, { argv: ['git', 'status', '*'], timeoutMs: 20, maxOutputBytes: 6 }],
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

interface Harness {
  host: ReturnType<typeof createExecHost>;
  calls: { command: string; args: string[]; opts: { cwd: string; env: Record<string, string> } }[];
  lastChild: () => FakeChild;
}

/** spawnLike that starts NOTHING: the child is fake and auto-exits on a microtask. */
function harness(end: { code?: number | null; signal?: string | null } = { code: 0, signal: null }, chunks: ['stdout' | 'stderr', string][] = []): Harness {
  const calls: Harness['calls'] = [];
  let child: FakeChild | undefined;
  const spawnLike: SpawnLike = (command, args, opts) => {
    calls.push({ command, args, opts });
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

const OK_GATE = { checkpoint: () => true };

describe('createExecHost (v30: only what planExec approved ever spawns)', () => {
  it('an allowlisted run spawns argv-as-data with the PLAN cwd/env, and reports exit 0', async () => {
    const h = harness({ code: 0, signal: null }, [['stdout', 'all good']]);
    const r = await h.host.run({ argv: ['node', 'app.js'], cwd: 'sub', env: { PATH: '/bin', SECRET: 'no' } }, OK_GATE);
    expect(h.calls).toEqual([{ command: 'node', args: ['app.js'], opts: { cwd: 'X:/jail/sub', env: { PATH: '/bin' } } }]);
    expect(r).toMatchObject({ ran: true, planned: true, exitCode: 0, stdout: 'all good', stderr: '', truncated: false, killedByBudget: false, spawnError: '' });
    expect(r.argv).toEqual(['node', 'app.js']);
  });

  it('an argument keeps its spaces: argv tokens are NEVER re-tokenized or shell-parsed', async () => {
    const h = harness({ code: 0, signal: null });
    // the '*' slot takes the WHOLE quoted string as one argv element, spaces and all
    await h.host.run({ argv: ['git', 'status', '--long --cached'] }, OK_GATE);
    expect(h.calls[0]!.args).toEqual(['status', '--long --cached']);
  });

  it('a policy refusal spawns NOTHING even if a checkpoint would approve it (policy outranks the gate)', async () => {
    const h = harness();
    const r = await h.host.run({ argv: ['curl', 'http://evil.test'] }, { checkpoint: () => true });
    expect(h.calls).toHaveLength(0);
    expect(r).toMatchObject({ ran: false, planned: false });
    expect(r.reason).toContain('default-deny');
  });

  it('§28 at the host: no checkpoint ⇒ stated refusal, nothing spawns; deny ⇒ planned:true + denied', async () => {
    const h = harness();
    const ungated = await h.host.run({ argv: ['node', 'app.js'] });
    expect(h.calls).toHaveLength(0);
    expect(ungated).toMatchObject({ ran: false, planned: true, reason: 'checkpoint required for exec (§28)' });
    const denied = await h.host.run({ argv: ['node', 'app.js'] }, { checkpoint: () => false });
    expect(h.calls).toHaveLength(0);
    expect(denied).toMatchObject({ ran: false, planned: true, reason: 'checkpoint denied' });
  });

  it('an approving checkpoint is asked with an exec-permission ToolCall carrying the planned argv', async () => {
    const h = harness();
    const seen: unknown[] = [];
    const r = await h.host.run({ argv: ['node', 'app.js'], env: { PATH: '/bin' } }, {
      checkpoint: (req) => {
        seen.push(req);
        return true;
      },
    });
    expect(r.ran).toBe(true);
    expect(seen).toEqual([{ call: { callId: 'exec-host', tool: 'exec.run', args: { argv: ['node', 'app.js'], cwd: 'X:/jail' } }, permissions: ['exec'] }]);
  });

  it('output budget: total stdout+stderr is hard-capped, the cut is marked truncated', async () => {
    const h = harness({ code: 0, signal: null }, [['stdout', 'abcd'], ['stderr', 'efghij']]);
    const r = await h.host.run({ argv: ['git', 'status', '--short'] }, OK_GATE); // rule caps at 6 bytes
    expect(r.stdout).toBe('abcd');
    expect(r.stderr).toBe('ef');
    expect(r.truncated).toBe(true);
  });

  it('timeout budget: a child that never ends is killed, and killedByBudget flips the verdict data', async () => {
    const h = harness({}, []); // never auto-ends
    const r = await h.host.run({ argv: ['git', 'status', '--short'] }, OK_GATE); // rule timeoutMs = 20
    expect(r.ran).toBe(true);
    expect(r.killedByBudget).toBe(true);
    expect(r.signal).toBe('SIGTERM');
    expect(h.lastChild().killed).toBe(true);
  });

  it('a spawn-layer failure (ENOENT) is structured data, not a crash', async () => {
    const spawnLike: SpawnLike = () => {
      const c = new FakeChild();
      queueMicrotask(() => c.emitEnd({ code: null, signal: null, error: 'spawn node ENOENT' }));
      return c;
    };
    const host = createExecHost(POLICY, { spawnLike });
    const r = await host.run({ argv: ['node', 'app.js'] }, OK_GATE);
    expect(r).toMatchObject({ ran: true, exitCode: null, spawnError: 'spawn node ENOENT' });
  });
});

describe('the exec.run tool in the gated registry (§28 at the registry, budgets at the host)', () => {
  const setup = (h: Harness) => {
    const registry = new ToolRegistry();
    registerExecHostTools(registry, h.host);
    return registry;
  };

  it('exec.run is exec-permission: without a checkpoint the tool NEVER reaches the host', async () => {
    const h = harness();
    const res = await setup(h).invoke({ callId: 'c1', tool: 'exec.run', args: { argv: ['node', 'app.js'] } });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('checkpoint required for exec');
    expect(h.calls).toHaveLength(0);
  });

  it('granted + exit 0 ⇒ {ok, detail} with the full result riding along', async () => {
    const h = harness({ code: 0, signal: null }, [['stdout', 'done']]);
    const res = await setup(h).invoke({ callId: 'c2', tool: 'exec.run', args: { argv: ['node', 'app.js'] } }, { checkpoint: () => true });
    expect(res.ok).toBe(true);
    const out = res.output as { ok: boolean; detail: string; result: ExecRunResult };
    expect(out.ok).toBe(true);
    expect(out.detail).toContain('exit 0');
    expect(out.result.stdout).toBe('done');
  });

  it('a policy refusal surfaces as a tool ERROR (never a silent success), registry gate included', async () => {
    const h = harness();
    const res = await setup(h).invoke({ callId: 'c3', tool: 'exec.run', args: { argv: ['rm', '-rf', '/'] } }, { checkpoint: () => true });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('default-deny');
  });

  it('a nonzero exit is ok:false WITHOUT throwing: detail states the code, result carries stderr', async () => {
    const h = harness({ code: 3, signal: null }, [['stderr', 'bad flag']]);
    const res = await setup(h).invoke({ callId: 'c4', tool: 'exec.run', args: { argv: ['node', 'app.js'] } }, { checkpoint: () => true });
    expect(res.ok).toBe(true); // the CALL succeeded; the exit verdict is in the output
    const out = res.output as { ok: boolean; detail: string; result: ExecRunResult };
    expect(out.ok).toBe(false);
    expect(out.detail).toContain('exit 3');
    expect(out.result.stderr).toContain('bad flag');
  });

  it('the spec is registered with exec permission', () => {
    expect(EXEC_HOST_TOOL_SPECS[0]).toMatchObject({ name: 'exec.run', permissions: ['exec'] });
  });
});

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

describe('exec journal (append-only JSONL, ledger discipline)', () => {
  const okRun: ExecRunResult = { ran: true, planned: true, reason: '', argv: ['git', 'status', '--short'], cwd: 'X:/jail', exitCode: 0, signal: null, stdout: 'clean', stderr: '', truncated: false, killedByBudget: false, spawnError: '' };
  const deniedRun: ExecRunResult = { ...okRun, ran: false, planned: true, reason: 'checkpoint denied', exitCode: null, stdout: '' };

  it('append → reload round-trips; malformed and shape-wrong lines are counted, never trusted', () => {
    const disk = new MemDisk();
    appendExecRun(disk, 'logs/exec.jsonl', okRun);
    appendExecRun(disk, 'logs/exec.jsonl', deniedRun);
    disk.files.set('logs/exec.jsonl', `${disk.files.get('logs/exec.jsonl')!}garbage\n{"ran":true}\n`);
    const load = loadExecRuns(disk, 'logs/exec.jsonl');
    expect(load.runs).toEqual([okRun, deniedRun]);
    expect(load.malformed).toBe(2);
  });

  it('last-N keeps the trailing runs; missing file reads empty; formatExecLine is one line', () => {
    const disk = new MemDisk();
    appendExecRun(disk, 'x/e.jsonl', okRun);
    appendExecRun(disk, 'x/e.jsonl', deniedRun);
    expect(loadExecRuns(disk, 'x/e.jsonl', 1).runs).toEqual([deniedRun]);
    expect(loadExecRuns(disk, 'x/none.jsonl')).toEqual({ runs: [], malformed: 0 });
    expect(formatExecLine(okRun).split('\n')).toHaveLength(1);
  });
});
