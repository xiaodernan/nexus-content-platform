/**
 * Direct coverage for `buildDockerArgs` + `minimalClientEnv` (agents/exec-host/src/containerExec.ts).
 *
 * Both are pure and deterministic — the docker argv the host spawns and the client env the probe
 * uses — yet neither was referenced directly by any test (planContainerRun / createContainerExecHost
 * reach buildDockerArgs indirectly; probeContainerRuntime reaches minimalClientEnv indirectly). Per
 * house discipline an untested pure branch *is* the next increment.
 */
import { describe, expect, it } from 'vitest';
import { buildDockerArgs, CONTAINER_ISOLATION_ARGS, minimalClientEnv } from '../src/containerExec.js';

const base = {
  image: 'nexus/exec:pinned',
  workdir: '/workspace/src',
  containerName: 'nexus-exec-abc',
  argv: ['node', 'verify.js'],
  env: { B: '2', A: '1' },
  memoryMb: 512,
  cpus: 1,
  pidsLimit: 128,
  tmpfs: '/tmp:rw,noexec,nosuid,size=64m',
};

describe('buildDockerArgs', () => {
  it('always leads with run and carries every isolation flag', () => {
    const args = buildDockerArgs(base);
    expect(args[0]).toBe('run');
    for (const flag of CONTAINER_ISOLATION_ARGS) expect(args).toContain(flag);
    // the isolation array appears verbatim, in order, right after 'run'
    const isoStart = args.indexOf('run') + 1;
    expect(args.slice(isoStart, isoStart + CONTAINER_ISOLATION_ARGS.length)).toEqual([...CONTAINER_ISOLATION_ARGS]);
  });

  it('pins the container name, memory (with swap equal), cpus, pids and tmpfs in order', () => {
    const args = buildDockerArgs(base);
    expect(args).toEqual(expect.arrayContaining(['--name', 'nexus-exec-abc']));
    expect(args).toEqual(expect.arrayContaining(['--memory', '512m', '--memory-swap', '512m']));
    expect(args).toEqual(expect.arrayContaining(['--cpus', '1', '--pids-limit', '128']));
    expect(args).toEqual(expect.arrayContaining(['--tmpfs', '/tmp:rw,noexec,nosuid,size=64m']));
    expect(args).toEqual(expect.arrayContaining(['-w', '/workspace/src']));
    // memory and memory-swap must carry the same cap (no swap escape hatch)
    const mem = args[args.indexOf('--memory') + 1];
    const swap = args[args.indexOf('--memory-swap') + 1];
    expect(mem).toBe(swap);
  });

  it('emits env pairs sorted by key, as --env KEY=VALUE', () => {
    const args = buildDockerArgs(base);
    const envIdx = args.indexOf('--env');
    expect(envIdx).toBeGreaterThanOrEqual(0);
    // sorted: A before B
    expect(args[envIdx + 1]).toBe('A=1');
    expect(args[envIdx + 3]).toBe('B=2');
    expect(args[envIdx + 2]).toBe('--env');
  });

  it('places the pinned image immediately before the inner argv, with no host mount flag', () => {
    const args = buildDockerArgs(base);
    const imgIdx = args.indexOf('nexus/exec:pinned');
    expect(imgIdx).toBeGreaterThanOrEqual(0);
    expect(args.slice(imgIdx + 1)).toEqual(['node', 'verify.js']); // image is the last prefix before argv
    for (const mount of ['-v', '--volume', '--mount']) expect(args).not.toContain(mount); // ADR 0013: no host mounts
  });

  it('threads numeric resource limits straight through (no parsing, no clamping here)', () => {
    const args = buildDockerArgs({ ...base, memoryMb: 2048, cpus: 2.5, pidsLimit: 256 });
    expect(args[args.indexOf('--memory') + 1]).toBe('2048m');
    expect(args[args.indexOf('--cpus') + 1]).toBe('2.5');
    expect(args[args.indexOf('--pids-limit') + 1]).toBe('256');
  });
});

describe('minimalClientEnv', () => {
  it('always returns a PATH string (from PATH or Path) and nothing else on non-Windows', () => {
    const env = minimalClientEnv();
    expect(typeof env.PATH).toBe('string');
  });

  it('adds SystemRoot on win32 only when the host actually has one', () => {
    const env = minimalClientEnv();
    if (process.platform === 'win32') {
      if (process.env.SystemRoot) expect(env.SystemRoot).toBe(process.env.SystemRoot);
      else expect(env.SystemRoot).toBeUndefined();
    } else {
      expect(env.SystemRoot).toBeUndefined();
    }
  });
});
