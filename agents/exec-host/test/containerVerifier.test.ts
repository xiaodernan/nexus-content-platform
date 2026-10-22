/**
 * Direct coverage for `containerVerifyRunner` (agents/exec-host/src/containerVerifier.ts).
 *
 * The adapter is a pure mapping from a ContainerRunResult to a BuildVerifier answer — no docker
 * needed. It was only reached indirectly (through whoever wires it), so the mapping rules (exit
 * code → ok, killedByBudget → not ok, ran=false → reason, the engine label, stdout passthrough)
 * were never asserted. Per house discipline an untested pure branch *is* the next increment.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ContainerHost, ContainerRunResult } from '../src/containerExec.js';
import { containerVerifyRunner } from '../src/containerVerifier.js';

function makeResult(over: Partial<ContainerRunResult> = {}): ContainerRunResult {
  return {
    ran: true,
    planned: true,
    reason: '',
    argv: ['node', 'verify.js'],
    image: 'nexus/exec:pinned',
    workdir: '/workspace',
    dockerArgs: [],
    exitCode: 0,
    signal: null,
    stdout: '',
    stderr: '',
    truncated: false,
    killedByBudget: false,
    spawnError: '',
    containerName: 'nexus-exec-x',
    ...over,
  };
}

function fakeHost(image: string, run: ContainerHost['run']): ContainerHost {
  return { policy: { image } as ContainerHost['policy'], run } as unknown as ContainerHost;
}

describe('containerVerifyRunner', () => {
  it('defaults the engine label to container:<pinned-image>', async () => {
    const run = vi.fn().mockResolvedValue(makeResult({ exitCode: 0 }));
    const verify = containerVerifyRunner(fakeHost('nexus/exec:pinned', run));
    const r = await verify({ argv: ['node', 'verify.js'], arcId: 'a', stepId: '1' });
    expect(r.engine).toBe('container:nexus/exec:pinned');
  });

  it('maps a clean exit 0 to ok:true with a no-truncation detail', async () => {
    const run = vi.fn().mockResolvedValue(makeResult({ exitCode: 0, killedByBudget: false }));
    const verify = containerVerifyRunner(fakeHost('nexus/exec:pinned', run));
    const r = await verify({ argv: ['node', 'verify.js'], arcId: 'a', stepId: '1' });
    expect(r.ok).toBe(true);
    expect(r.engine).toBe('container:nexus/exec:pinned');
    expect(r.detail).toContain('→ exit 0');
    expect(r.detail).not.toContain('killed at timeout');
    expect(r.stdout).toBeUndefined();
  });

  it('maps a non-zero exit to ok:false but still reports the detail', async () => {
    const run = vi.fn().mockResolvedValue(makeResult({ exitCode: 3 }));
    const verify = containerVerifyRunner(fakeHost('nexus/exec:pinned', run));
    const r = await verify({ argv: ['x'], arcId: 'a', stepId: '1' });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('exit 3');
  });

  it('treats a budget kill as not-ok regardless of exit code', async () => {
    const run = vi.fn().mockResolvedValue(makeResult({ exitCode: 0, killedByBudget: true, truncated: true, truncatedStreams: ['stdout'] }));
    const verify = containerVerifyRunner(fakeHost('nexus/exec:pinned', run));
    const r = await verify({ argv: ['x'], arcId: 'a', stepId: '1' });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('killed at timeout budget');
    expect(r.detail).toContain('output truncated: stdout');
  });

  it('surfaces a spawn/client failure distinctly', async () => {
    const run = vi.fn().mockResolvedValue(makeResult({ spawnError: 'ENOENT' }));
    const verify = containerVerifyRunner(fakeHost('nexus/exec:pinned', run));
    const r = await verify({ argv: ['x'], arcId: 'a', stepId: '1' });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('docker client failed: ENOENT');
  });

  it('passes through the reason when the run never started', async () => {
    const run = vi.fn().mockResolvedValue(makeResult({ ran: false, reason: 'checkpoint denied' }));
    const verify = containerVerifyRunner(fakeHost('nexus/exec:pinned', run));
    const r = await verify({ argv: ['x'], arcId: 'a', stepId: '1' });
    expect(r.ok).toBe(false);
    expect(r.detail).toBe('checkpoint denied');
  });

  it('forwards stdout when present and honors a custom engine', async () => {
    const run = vi.fn().mockResolvedValue(makeResult({ exitCode: 0, stdout: 'PASS: 12/12' }));
    const verify = containerVerifyRunner(fakeHost('img', run), { engine: 'custom-engine' });
    const r = await verify({ argv: ['x'], arcId: 'a', stepId: '1' });
    expect(r.engine).toBe('custom-engine');
    expect(r.stdout).toBe('PASS: 12/12');
  });

  it('joins the callId as <arcId>:<stepId> for the host run', async () => {
    const run = vi.fn().mockResolvedValue(makeResult({ exitCode: 0 }));
    const verify = containerVerifyRunner(fakeHost('img', run));
    await verify({ argv: ['x'], arcId: 'arc-9', stepId: 's2' });
    expect(run).toHaveBeenCalledWith(
      { argv: ['x'], cwd: undefined },
      expect.objectContaining({ preApproved: true, callId: 'arc-9:s2' }),
    );
  });
});
