import { describe, expect, it } from 'vitest';
import { containerVerifyRunner } from './containerVerifier.js';
import {
  CONTAINER_ISOLATION_ARGS,
  CONTAINER_MOUNT_FLAGS,
  createContainerExecHost,
  type ContainerHost,
  type ContainerRunResult,
} from './containerExec.js';
import type { ExecChild, ExecSpawnOptions, SpawnLike } from './execHost.js';

const POLICY = {
  image: 'node:22-alpine',
  workdirRoot: '/workspace',
  allow: [
    { argv: ['node', '--version'], timeoutMs: 5_000, maxOutputBytes: 1_024 },
    { argv: ['node', '-e', '*'], timeoutMs: 5_000, maxOutputBytes: 1_024 },
  ],
  envAllow: [] as string[],
  maxTimeoutMs: 10_000,
  maxOutputBytes: 2_048,
};

const baseResult: ContainerRunResult = {
  ran: true,
  planned: true,
  reason: '',
  argv: ['node', '--version'],
  image: 'node:22-alpine',
  workdir: '/workspace',
  dockerArgs: ['run', '--rm'],
  exitCode: 0,
  signal: null,
  stdout: 'v22.0.0\n',
  stderr: '',
  truncated: false,
  killedByBudget: false,
  spawnError: '',
};

/** A stub host: records the exact request/opts the adapter handed it, answers with a canned result. */
function stubHost(result: Partial<ContainerRunResult>): { host: ContainerHost; calls: Array<{ request: { argv: unknown; cwd?: unknown }; opts: { preApproved?: boolean; callId?: string } }> } {
  const calls: Array<{ request: { argv: unknown; cwd?: unknown }; opts: { preApproved?: boolean; callId?: string } }> = [];
  const host: ContainerHost = {
    policy: POLICY,
    async run(request, opts = {}) {
      calls.push({ request, opts });
      return { ...baseResult, ...result };
    },
  };
  return { host, calls };
}

/** Fake docker client: records every spawn, answers asynchronously (listeners attach after the spawn call). */
function fakeSpawn(exitCode: number | null, opts: { stdout?: string; error?: string } = {}) {
  const spawned: Array<{ command: string; args: string[]; opts: ExecSpawnOptions }> = [];
  const spawnLike: SpawnLike = (command, args, o) => {
    spawned.push({ command, args, opts: o });
    const dataListeners: Array<(stream: 'stdout' | 'stderr', chunk: Buffer | string) => void> = [];
    const endListeners: Array<(end: { code: number | null; signal: string | null; error?: string }) => void> = [];
    queueMicrotask(() => {
      if (opts.stdout !== undefined) for (const l of dataListeners) l('stdout', opts.stdout);
      for (const l of endListeners) l({ code: exitCode, signal: null, ...(opts.error ? { error: opts.error } : {}) });
    });
    const child: ExecChild = {
      onData: (l) => dataListeners.push(l),
      onEnd: (l) => endListeners.push(l),
      kill: () => {},
    };
    return child;
  };
  return { spawned, spawnLike };
}

describe('containerVerifyRunner — adapter mapping over a stub host', () => {
  it('hands the host a preApproved run joined to the arc step that asked', async () => {
    const { host, calls } = stubHost({});
    const verify = containerVerifyRunner(host);
    const answer = await verify({ arcId: 'arc-1', stepId: 's2', argv: ['node', '--version'], cwd: 'sub/dir' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.opts).toMatchObject({ preApproved: true, callId: 'arc-1:s2' });
    expect(calls[0]!.request).toMatchObject({ argv: ['node', '--version'], cwd: 'sub/dir' });
    expect(answer).toMatchObject({ ok: true, engine: 'container:node:22-alpine' });
    expect(answer.detail).toContain('exit 0');
  });

  it('a refusal that never ran is ok:false with the stated reason, never a green tick', async () => {
    const { host } = stubHost({ ran: false, planned: false, reason: 'no allowlist rule matches (default-deny)' });
    const answer = await containerVerifyRunner(host)({ arcId: 'a', stepId: 's', argv: ['curl'] });
    expect(answer.ok).toBe(false);
    expect(answer.detail).toContain('default-deny');
  });

  it('a docker client failure is stated, not swallowed', async () => {
    const { host } = stubHost({ ran: true, spawnError: 'ENOENT' });
    const answer = await containerVerifyRunner(host)({ arcId: 'a', stepId: 's', argv: ['node'] });
    expect(answer.ok).toBe(false);
    expect(answer.detail).toContain('docker client failed');
    expect(answer.detail).toContain('ENOENT');
  });

  it('exit code is the verdict: nonzero is red, a budget kill reddens even exit 0', async () => {
    const red = await containerVerifyRunner(stubHost({ exitCode: 3 }).host)({ arcId: 'a', stepId: 's', argv: ['node'] });
    expect(red.ok).toBe(false);
    expect(red.detail).toContain('exit 3');
    const killed = await containerVerifyRunner(stubHost({ exitCode: 0, killedByBudget: true }).host)({ arcId: 'a', stepId: 's', argv: ['node'] });
    expect(killed.ok).toBe(false);
    expect(killed.detail).toContain('killed at timeout budget');
  });

  it('the engine name is the caller’s override or the pinned image', async () => {
    const { host } = stubHost({});
    expect((await containerVerifyRunner(host, { engine: 'custom-runner' })({ arcId: 'a', stepId: 's', argv: ['node'] })).engine).toBe('custom-runner');
  });
});

describe('containerVerifyRunner — the wall holds on the real host path', () => {
  it('green: the spawned argv is a docker run carrying every isolation flag and no mount flag', async () => {
    const { spawned, spawnLike } = fakeSpawn(0, { stdout: 'v22.0.0\n' });
    const host = createContainerExecHost(POLICY, { spawnLike });
    const verify = containerVerifyRunner(host);
    const outcome = await verify({ arcId: 'arc-9', stepId: 'build', argv: ['node', '--version'] });
    expect(outcome.ok).toBe(true);
    expect(spawned).toHaveLength(1);
    expect(spawned[0]!.command).toBe('docker');
    for (const flag of CONTAINER_ISOLATION_ARGS) expect(spawned[0]!.args).toContain(flag);
    for (const flag of CONTAINER_MOUNT_FLAGS) expect(spawned[0]!.args).not.toContain(flag);
    expect(spawned[0]!.args).toContain('node:22-alpine');
    expect(spawned[0]!.args.indexOf('-w') >= 0).toBe(true);
  });

  it('a command the policy never allowed spawns NOTHING and answers red with the reason', async () => {
    const { spawned, spawnLike } = fakeSpawn(0);
    const host = createContainerExecHost(POLICY, { spawnLike });
    const answer = await containerVerifyRunner(host)({ arcId: 'arc-9', stepId: 'exfil', argv: ['curl', 'http://example.invalid'] });
    expect(answer.ok).toBe(false);
    expect(answer.detail).toContain('default-deny');
    expect(spawned).toHaveLength(0);
  });

  it('a failing command inside the container is a red verdict with the container’s exit code', async () => {
    const { spawned, spawnLike } = fakeSpawn(3);
    const host = createContainerExecHost(POLICY, { spawnLike });
    const answer = await containerVerifyRunner(host)({ arcId: 'arc-9', stepId: 'build', argv: ['node', '-e', 'process.exit(3)'] });
    expect(answer.ok).toBe(false);
    expect(answer.detail).toContain('exit 3');
    expect(spawned).toHaveLength(1);
  });
});
