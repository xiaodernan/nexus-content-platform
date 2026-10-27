import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '@nexus/agent-runtime';
import {
  CONTAINER_DEFAULTS,
  CONTAINER_EXEC_TOOL_SPECS,
  CONTAINER_ISOLATION_ARGS,
  CONTAINER_MOUNT_FLAGS,
  CONTAINER_NAME_PREFIX,
  appendContainerRun,
  containerRunFailure,
  createContainerExecHost,
  formatContainerLine,
  loadContainerAudits,
  loadContainerRuns,
  planContainerRun,
  probeContainerRuntime,
  registerContainerExecTools,
  validateContainerPolicy,
  type ContainerAuditRecord,
  type ContainerPolicy,
  type ContainerRunResult,
  type ContainerRuntimeProbe,
} from '../src/containerExec.js';
import type { ExecChild, SpawnLike } from '../src/execHost.js';

const POLICY: ContainerPolicy = {
  image: 'node:22-alpine',
  workdirRoot: '/workspace',
  allow: [
    { argv: ['node', 'app.js'], timeoutMs: 60_000, maxOutputBytes: 1_000 },
    { argv: ['git', 'status', '*'], timeoutMs: 20, maxOutputBytes: 6 },
  ],
  envAllow: ['PATH'],
};

class FakeChild implements ExecChild {
  killed = false;
  pid = 4242;
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

interface Call {
  command: string;
  args: string[];
  opts: { cwd: string; env: Record<string, string> };
}

interface Harness {
  host: ReturnType<typeof createContainerExecHost>;
  calls: Call[];
  children: FakeChild[];
}

/** spawnLike that starts NOTHING: each call gets a fake child; `ends` describes the Nth call's child. */
function harness(
  ends: Array<{ code?: number | null; signal?: string | null; error?: string } | 'never'>,
  chunks: Record<number, Array<['stdout' | 'stderr', Buffer | string]>> = {},
  journal?: Parameters<typeof createContainerExecHost>[1] extends never ? never : { disk: { readFileSync(p: string): string; mkdirSync(): void; writeFileSync(p: string, d: string): void }; file: string },
  options: { probe?: () => Promise<ContainerRuntimeProbe> } = {},
): Harness {
  const calls: Call[] = [];
  const children: FakeChild[] = [];
  const spawnLike: SpawnLike = (command, args, opts) => {
    calls.push({ command, args, opts });
    const c = new FakeChild();
    children.push(c);
    const i = children.length - 1;
    queueMicrotask(() => {
      for (const [s, t] of chunks[i] ?? []) c.emitData(s, t);
      const end = ends[i];
      if (end !== 'never') c.emitEnd({ code: end?.code ?? null, signal: end?.signal ?? null, error: end?.error });
    });
    return c;
  };
  return { host: createContainerExecHost(POLICY, { spawnLike, journal, ...options }), calls, children };
}

const OK_GATE = { checkpoint: () => true };
const mountFlagsIn = (args: string[]): string[] => args.filter((a) => CONTAINER_MOUNT_FLAGS.includes(a));

describe('planContainerRun (v166: the v29 decision, one layer out)', () => {
  it('an allowlisted request plans the inner argv verbatim, the pinned image, and a guarded workdir', () => {
    const d = planContainerRun({ argv: ['node', 'app.js'], cwd: 'sub/dir' }, POLICY);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.plan.argv).toEqual(['node', 'app.js']);
    expect(d.plan.image).toBe('node:22-alpine');
    expect(d.plan.workdir).toBe('/workspace/sub/dir');
    expect(d.plan.executes).toBe(false);
    expect(d.plan.containerName.startsWith(CONTAINER_NAME_PREFIX)).toBe(true);
  });

  it('the docker argv ALWAYS carries the isolation flags and NEVER a mount flag', () => {
    const d = planContainerRun({ argv: ['node', 'app.js'] }, POLICY);
    if (!d.ok) throw new Error(d.reason);
    const a = d.plan.dockerArgs;
    for (const flag of CONTAINER_ISOLATION_ARGS) expect(a).toContain(flag);
    expect(mountFlagsIn(a)).toEqual([]); // no -v / --volume / --mount can exist in this argv
    expect(a.indexOf('--network') > -1 && a[a.indexOf('--network') + 1]).toBe('none');
    expect(a[a.indexOf('--memory') + 1]).toBe(`${CONTAINER_DEFAULTS.memoryMb}m`);
    expect(a[a.indexOf('--memory-swap') + 1]).toBe(`${CONTAINER_DEFAULTS.memoryMb}m`); // no swap escape
    expect(a[a.indexOf('--cpus') + 1]).toBe(String(CONTAINER_DEFAULTS.cpus));
    expect(a[a.indexOf('--pids-limit') + 1]).toBe(String(CONTAINER_DEFAULTS.pidsLimit));
    expect(a[a.indexOf('--tmpfs') + 1]).toBe(CONTAINER_DEFAULTS.tmpfs);
    expect(a[a.indexOf('-w') + 1]).toBe('/workspace');
    const imageAt = a.indexOf('node:22-alpine');
    expect(imageAt).toBeGreaterThan(0);
    expect(a.slice(imageAt + 1)).toEqual(['node', 'app.js']); // exec-form: inner argv rides as data
  });

  it('env crosses only through the policy allowlist, as --env pairs, and is scrubbed otherwise', () => {
    const d = planContainerRun({ argv: ['node', 'app.js'], env: { PATH: '/bin', SECRET: 'leak' } }, POLICY);
    if (!d.ok) throw new Error(d.reason);
    expect(d.plan.env).toEqual({ PATH: '/bin' });
    expect(d.plan.droppedEnv).toEqual(['SECRET']);
    const a = d.plan.dockerArgs;
    expect(a.filter((t) => t === '--env')).toHaveLength(1);
    expect(a).toContain('PATH=/bin');
    expect(a.join(' ')).not.toContain('SECRET');
  });

  it('a request cannot choose an image, widen a budget, or leave the workdir root', () => {
    const escaped = planContainerRun({ argv: ['node', 'app.js'], cwd: '../etc' }, POLICY);
    expect(escaped.ok).toBe(false);
    if (!escaped.ok) expect(escaped.reason).toContain('escapes');
    const absolute = planContainerRun({ argv: ['node', 'app.js'], cwd: '/etc' }, POLICY);
    expect(absolute.ok).toBe(false);
    const denied = planContainerRun({ argv: ['curl', 'http://evil.test'] }, POLICY);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toContain('default-deny');
    const pathExec = planContainerRun({ argv: ['/bin/sh', '-c', 'x'] }, POLICY);
    expect(pathExec.ok).toBe(false);
  });

  it('policy validation: image pin, workdir root, and cap ranges are checked before anything plans', () => {
    expect(validateContainerPolicy({ ...POLICY, image: '' })).toContain('image');
    expect(validateContainerPolicy({ ...POLICY, image: '-p node' })).toContain('image');
    expect(validateContainerPolicy({ ...POLICY, workdirRoot: 'workspace' })).toContain('workdirRoot');
    expect(validateContainerPolicy({ ...POLICY, workdirRoot: '/a/../b' })).toContain('..');
    expect(validateContainerPolicy({ ...POLICY, memoryMb: 4 })).toContain('memoryMb');
    expect(validateContainerPolicy({ ...POLICY, cpus: 0 })).toContain('cpus');
    expect(validateContainerPolicy({ ...POLICY, pidsLimit: 0 })).toContain('pidsLimit');
    expect(validateContainerPolicy({ ...POLICY, allow: [{ argv: ['/bin/sh'] }] })).toContain('bare name');
    expect(validateContainerPolicy({ ...POLICY, memoryMb: 256, cpus: 2, pidsLimit: 64 })).toBeNull();
  });

  it('budgets clamp to the policy caps the request cannot raise', () => {
    const capped: ContainerPolicy = { ...POLICY, maxTimeoutMs: 5_000, maxOutputBytes: 512 };
    const d = planContainerRun({ argv: ['node', 'app.js'] }, capped);
    if (!d.ok) throw new Error(d.reason);
    expect(d.plan.timeoutMs).toBe(5_000);
    expect(d.plan.maxOutputBytes).toBe(512);
  });

  it('two plans in one process get distinct container names (the cleanup must target the right one)', () => {
    const a = planContainerRun({ argv: ['node', 'app.js'] }, POLICY);
    const b = planContainerRun({ argv: ['node', 'app.js'] }, POLICY);
    if (!a.ok || !b.ok) throw new Error('planning failed');
    expect(a.plan.containerName).not.toBe(b.plan.containerName);
  });
});

describe('createContainerExecHost (only what planContainerRun approved ever spawns)', () => {
  it('an approved run spawns `docker` with the plan argv, the CLIENT env — not the container env', async () => {
    const h = harness([{ code: 0, signal: null }], { 0: [['stdout', 'container-alive']] });
    const r = await h.host.run({ argv: ['node', 'app.js'], env: { PATH: '/usr/bin' } }, OK_GATE);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]!.command).toBe('docker');
    expect(h.calls[0]!.args[0]).toBe('run');
    expect(h.calls[0]!.args.at(-1)).toBe('app.js');
    expect(h.calls[0]!.opts.env).toHaveProperty('PATH'); // the client's PATH…
    expect(h.calls[0]!.opts.env['PATH']).not.toBe('/usr/bin'); // …NOT the container's scrubbed env
    expect(r).toMatchObject({ ran: true, planned: true, exitCode: 0, stdout: 'container-alive', killedByBudget: false, spawnError: '', truncated: false });
    expect(r.dockerArgs).toEqual(h.calls[0]!.args);
    expect(r.cleanup).toBeUndefined(); // nothing was killed, so there is no cleanup claim at all
  });

  it('a policy refusal spawns NOTHING even when a checkpoint would approve (policy outranks §28)', async () => {
    const h = harness([]);
    const r = await h.host.run({ argv: ['curl', 'http://evil.test'] }, { checkpoint: () => true });
    expect(h.calls).toHaveLength(0);
    expect(r).toMatchObject({ ran: false, planned: false, dockerArgs: [] });
    expect(r.reason).toContain('default-deny');
  });

  it('§28 at the host: no gate ⇒ refusal, deny ⇒ denial; the gate sees a container.exec ToolCall', async () => {
    const h = harness([]);
    const ungated = await h.host.run({ argv: ['node', 'app.js'] });
    expect(ungated).toMatchObject({ ran: false, planned: true, reason: 'checkpoint required for exec (§28)' });
    expect(h.calls).toHaveLength(0);
    const seen: unknown[] = [];
    const denied = await h.host.run({ argv: ['node', 'app.js'] }, {
      checkpoint: (req) => {
        seen.push(req);
        return false;
      },
    });
    expect(denied).toMatchObject({ ran: false, planned: true, reason: 'checkpoint denied' });
    expect(seen).toEqual([{ call: { callId: 'container-exec-host', tool: 'container.exec', args: { argv: ['node', 'app.js'], cwd: undefined } }, permissions: ['exec'] }]);
    expect(h.calls).toHaveLength(0);
  });

  it('a configured probe that says unavailable refuses LEGIBLY before any spawn', async () => {
    const h = harness([], {}, undefined, { probe: async () => ({ available: false, serverVersion: '', reason: 'daemon not running' }) });
    const r = await h.host.run({ argv: ['node', 'app.js'] }, OK_GATE);
    expect(r.ran).toBe(false);
    expect(r.planned).toBe(true);
    expect(r.reason).toBe('container runtime unavailable: daemon not running');
    expect(h.calls).toHaveLength(0);
  });

  it('timeout budget: the client child is killed AND the container is retired by name (cleanup reported, not assumed)', async () => {
    const h = harness(['never', { code: 0, signal: null }]); // call 0 never ends; call 1 is the rm -f
    const pending = h.host.run({ argv: ['git', 'status', '--short'] }, OK_GATE); // rule: timeout 20, cap 6
    // The kill fires at 20 ms; the rm -f is the SECOND spawn and must name THIS run's container.
    const r = await new Promise<ContainerRunResult>((resolve, reject) => {
      setTimeout(() => pending.then(resolve, reject), 120);
    });
    expect(r.killedByBudget).toBe(true);
    expect(r.signal).toBe('SIGTERM');
    expect(h.children[0]!.killed).toBe(true);
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1]!.command).toBe('docker');
    expect(h.calls[1]!.args).toEqual(['rm', '-f', r.containerName]);
    expect(r.cleanup).toMatchObject({ attempted: true, removed: true });
  });

  it('a cleanup the runtime refuses is REPORTED, never upgraded into a claim of removal', async () => {
    const h = harness(['never', { code: 1, signal: null }]);
    const pending = h.host.run({ argv: ['git', 'status', '--short'] }, OK_GATE);
    const r = await new Promise<ContainerRunResult>((resolve, reject) => {
      setTimeout(() => pending.then(resolve, reject), 120);
    });
    expect(r.cleanup).toMatchObject({ attempted: true, removed: false });
    expect(r.cleanup!.note).toContain('exited 1');
  });

  it('per-stream output ceilings, whole-line cuts: the v48/v53 discipline survives the container hop', async () => {
    const h = harness([{ code: 0, signal: null }], { 0: [['stdout', 'ab\ncd\n'], ['stderr', 'efghij\n']] });
    const r = await h.host.run({ argv: ['git', 'status', '--short'] }, OK_GATE); // 6-byte cap
    expect(r.stdout).toBe('ab\ncd\n');
    expect(r.stderr).toBe('');
    expect(r.truncated).toBe(true);
    expect(r.truncatedStreams).toEqual(['stderr']);
  });

  it('a docker-client spawn failure (ENOENT / daemon down) is structured data, not a crash', async () => {
    const h = harness([{ error: 'spawn docker ENOENT' }]);
    const r = await h.host.run({ argv: ['node', 'app.js'] }, OK_GATE);
    expect(r).toMatchObject({ ran: true, exitCode: null, spawnError: 'spawn docker ENOENT' });
  });
});

describe('the container.exec tool in the gated registry (§28 at the registry)', () => {
  const setup = (h: Harness) => {
    const registry = new ToolRegistry();
    registerContainerExecTools(registry, h.host);
    return registry;
  };

  it('container.exec is exec-permission: without a checkpoint the tool never reaches the host', async () => {
    const h = harness([{ code: 0, signal: null }]);
    const res = await setup(h).invoke({ callId: 'c1', tool: 'container.exec', args: { argv: ['node', 'app.js'] } });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('checkpoint required for exec');
    expect(h.calls).toHaveLength(0);
  });

  it('granted + exit 0 ⇒ {ok, detail} naming image and exit, result riding along', async () => {
    const h = harness([{ code: 0, signal: null }], { 0: [['stdout', 'done']] });
    const res = await setup(h).invoke({ callId: 'c2', tool: 'container.exec', args: { argv: ['node', 'app.js'] } }, { checkpoint: () => true });
    expect(res.ok).toBe(true);
    const out = res.output as { ok: boolean; detail: string; result: ContainerRunResult };
    expect(out.ok).toBe(true);
    expect(out.detail).toContain('container node:22-alpine');
    expect(out.detail).toContain('exit 0');
    expect(out.result.stdout).toBe('done');
  });

  it('env arrives as KEY=VALUE pairs and is STILL scrubbed by the policy allowlist', async () => {
    const h = harness([{ code: 0, signal: null }]);
    const res = await setup(h).invoke({ callId: 'c3', tool: 'container.exec', args: { argv: ['node', 'app.js'], env: ['PATH=/bin', 'SECRET=x'] } }, { checkpoint: () => true });
    expect(res.ok).toBe(true);
    const out = res.output as { result: ContainerRunResult };
    expect(out.result.dockerArgs).toContain('PATH=/bin');
    expect(out.result.dockerArgs.join(' ')).not.toContain('SECRET');
  });

  it('a policy refusal surfaces as a tool ERROR (never a silent success)', async () => {
    const h = harness([]);
    const res = await setup(h).invoke({ callId: 'c4', tool: 'container.exec', args: { argv: ['rm', '-rf', '/'] } }, { checkpoint: () => true });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('default-deny');
  });

  it('a nonzero exit is ok:false WITHOUT throwing; the spec carries exec permission', async () => {
    const h = harness([{ code: 3, signal: null }], { 0: [['stderr', 'bad flag']] });
    const res = await setup(h).invoke({ callId: 'c5', tool: 'container.exec', args: { argv: ['node', 'app.js'] } }, { checkpoint: () => true });
    expect(res.ok).toBe(true);
    const out = res.output as { ok: boolean; detail: string };
    expect(out.ok).toBe(false);
    expect(out.detail).toContain('exit 3');
    expect(CONTAINER_EXEC_TOOL_SPECS[0]).toMatchObject({ name: 'container.exec', permissions: ['exec'] });
  });

  it('a host built on an invalid policy cannot register at all — and the check reads a COPY, never the shared fixture', () => {
    const bad = harness([]);
    const invalidPolicy: ContainerPolicy = { ...POLICY, image: '' }; // a copy: mutating the host's own fixture would poison every later test
    expect(() => {
      const registry = new ToolRegistry();
      registerContainerExecTools(registry, { policy: invalidPolicy, run: bad.host.run });
    }).toThrow('container policy invalid');
  });
});

describe('probeContainerRuntime (the honest question: is there a daemon here?)', () => {
  it('exit 0 with a version line ⇒ available, trimmed', async () => {
    const p = await probeContainerRuntime({
      spawnLike: (_c, _a, _o) => {
        const c = new FakeChild();
        queueMicrotask(() => {
          c.emitData('stdout', '29.8.0\n');
          c.emitEnd({ code: 0, signal: null });
        });
        return c;
      },
    });
    expect(p).toEqual({ available: true, serverVersion: '29.8.0', reason: '' });
  });

  it('a nonzero exit, a spawn failure and a timeout are all stated unavailability', async () => {
    const exited = await probeContainerRuntime({
      spawnLike: () => {
        const c = new FakeChild();
        queueMicrotask(() => c.emitEnd({ code: 1, signal: null }));
        return c;
      },
    });
    expect(exited.available).toBe(false);
    expect(exited.reason).toContain('exited 1');
    const failed = await probeContainerRuntime({
      spawnLike: () => {
        const c = new FakeChild();
        queueMicrotask(() => c.emitEnd({ code: null, signal: null, error: 'spawn docker ENOENT' }));
        return c;
      },
    });
    expect(failed).toEqual({ available: false, serverVersion: '', reason: 'docker CLI failed: spawn docker ENOENT' });
    const slow = await probeContainerRuntime({
      timeoutMs: 30,
      spawnLike: () => new FakeChild(), // never ends
    });
    expect(slow.available).toBe(false);
    expect(slow.reason).toContain('30ms');
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

describe('container journal (v51 discipline, container-shaped)', () => {
  const FILE = 'logs/container-audit.jsonl';
  const ran: ContainerRunResult = { ran: true, planned: true, reason: '', argv: ['node', 'app.js'], image: 'node:22-alpine', workdir: '/workspace', dockerArgs: ['run'], exitCode: 0, signal: null, stdout: 'ok', stderr: '', truncated: false, killedByBudget: false, spawnError: '', containerName: 'nexus-exec-x-1' };

  it('append → reload round-trips; malformed and invariant-breaking lines are counted, never trusted', async () => {
    const disk = new MemDisk();
    const h = harness([{ code: 0, signal: null }], { 0: [['stdout', 'ok']] }, { disk, file: FILE });
    const refused = await h.host.run({ argv: ['curl', 'http://evil.test'] }, OK_GATE);
    const ungated = await h.host.run({ argv: ['node', 'app.js'] });
    const ok = await h.host.run({ argv: ['node', 'app.js'] }, OK_GATE);
    expect([refused.ran, ungated.ran, ok.ran]).toEqual([false, false, true]);
    expect(h.calls).toHaveLength(1);
    const { records, malformed } = loadContainerAudits(disk, FILE);
    expect(malformed).toBe(0);
    expect(records.map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(records.map((r) => r.rule)).toEqual([null, 0, 0]); // a rule number EXACTLY when the policy said yes
    expect(records[2]!.containerName).toBe(ok.containerName);
    expect(records[2]!.image).toBe('node:22-alpine');
    // the record adds nothing the caller was not told
    const { seq, rule, ...rest } = records[2] as ContainerAuditRecord;
    expect([seq, rule]).toEqual([3, 0]);
    expect(rest).toEqual(ok);
  });

  it('the old reader shape still parses (one-directional compatibility); garbage is malformed', () => {
    const disk = new MemDisk();
    appendContainerRun(disk, FILE, ran);
    disk.files.set(FILE, `${disk.files.get(FILE)!}garbage\n{"ran":true}\n`);
    expect(loadContainerRuns(disk, FILE).runs).toHaveLength(1); // extra keys are nobody's business
    const audits = loadContainerAudits(disk, FILE);
    expect(audits.records).toHaveLength(0); // a bare run line carries no seq/rule: the AUDIT reader refuses it
    expect(audits.malformed).toBe(3); // the run line + `garbage` + `{"ran":true}` all fail the audit gate
    disk.files.set(FILE, `${formatContainerLine({ ...ran, containerName: undefined as unknown as string })}\n`);
    expect(loadContainerRuns(disk, FILE).runs).toHaveLength(1);
    expect(loadContainerRuns(disk, FILE).malformed).toBe(0);
    expect(loadContainerRuns({ readFileSync: () => 'not json\n' }, FILE).malformed).toBe(1);
  });

  it('a host with no journal writes nothing; last-N keeps the tail; missing file reads empty', async () => {
    const disk = new MemDisk();
    const h = harness([{ code: 0, signal: null }], { 0: [['stdout', 'ok']] });
    await h.host.run({ argv: ['node', 'app.js'] }, OK_GATE);
    expect(disk.files.size).toBe(0);
    const disk2 = new MemDisk();
    const j = { disk: disk2, file: FILE };
    const h2 = harness([{ code: 0, signal: null }], { 0: [] }, j);
    await h2.host.run({ argv: ['node', 'app.js'] }, OK_GATE);
    expect(loadContainerRuns(disk2, FILE, 1).runs).toHaveLength(1);
    expect(loadContainerRuns(disk2, 'x/none.jsonl')).toEqual({ runs: [], malformed: 0 });
  });
});

/**
 * v526 — WHICH kind of "no" a container run's RECORD carries. The rule lives in ONE place
 * (containerRunFailure), so every door that reads the record reads it the same way, and the
 * table below is that rule's whole surface: TWO shapes are the machine failing, and every
 * other shape names no kind.
 */
describe('containerRunFailure — the ONE rule (v526)', () => {
  const record = (over: Partial<ContainerRunResult>): ContainerRunResult => ({
    ran: true,
    planned: true,
    reason: '',
    argv: ['node', '--version'],
    image: 'node:22-alpine',
    workdir: '/workspace',
    dockerArgs: ['run', '--rm'],
    exitCode: 0,
    signal: null,
    stdout: '',
    stderr: '',
    truncated: false,
    killedByBudget: false,
    spawnError: '',
    ...over,
  });

  it('a client that NEVER LIVED is the machine failing — and the words are the spawn error', () => {
    expect(containerRunFailure(record({ exitCode: null, spawnError: 'spawn docker ENOENT' }))).toEqual({
      kind: 'the-machine',
      why: 'never-started',
      words: 'spawn docker ENOENT',
    });
  });

  it('a client KILLED FROM OUTSIDE is the machine failing — the signal is the word', () => {
    expect(containerRunFailure(record({ exitCode: null, signal: 'SIGKILL' }))).toEqual({
      kind: 'the-machine',
      why: 'killed-outside',
      words: 'SIGKILL',
    });
  });

  it('the host’s OWN budget kill names NO kind — the plan’s timeout is the plan’s own act', () => {
    expect(containerRunFailure(record({ exitCode: null, signal: 'SIGTERM', killedByBudget: true }))).toBeUndefined();
  });

  it('a RED VERDICT names no kind — the container ran and exited nonzero', () => {
    expect(containerRunFailure(record({ exitCode: 3 }))).toBeUndefined();
  });

  it('a client that reported BOTH an exit code and a signal names NO kind — the verdict is known', () => {
    expect(containerRunFailure(record({ exitCode: 0, signal: 'SIGTERM' }))).toBeUndefined();
  });

  it('a POLICY refusal names NO kind — the ask was refused before any client was summoned', () => {
    expect(
      containerRunFailure(record({ ran: false, planned: false, reason: 'no allowlist rule matches (default-deny)' })),
    ).toBeUndefined();
  });

  it('a GREEN run names NO kind — the door answered', () => {
    expect(containerRunFailure(record({}))).toBeUndefined();
  });
});
