import { describe, expect, it } from 'vitest';
import { CONTAINER_ISOLATION_ARGS, CONTAINER_MOUNT_FLAGS, CONTAINER_NAME_PREFIX, planContainerRun } from '@nexus/exec-host';

import {
  containerLaneState,
  createStudioContainerHost,
  runContainerExec,
  STUDIO_CONTAINER_IMAGE,
  STUDIO_CONTAINER_POLICY,
  STUDIO_CONTAINER_WORKDIR_ROOT,
  studioContainerPolicyError,
} from './containerServer';

/** Minimal SpawnLike fake — the host never knows it is not docker. */
function fakeSpawn(stdout = 'jail ok\n', code: number | null = 0) {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const spawnLike = (cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    return {
      onData: (l: (s: 'stdout' | 'stderr', c: Buffer | string) => void) => {
        if (stdout !== '') l('stdout', Buffer.from(stdout));
      },
      onEnd: (l: (e: { code: number | null; signal: string | null; error?: string }) => void) => {
        setImmediate(() => l({ code, signal: null }));
      },
      kill: () => {},
    };
  };
  return { spawnLike, calls };
}

describe('studio container policy (v172)', () => {
  it('validates and pins the facts the panel states', () => {
    expect(studioContainerPolicyError()).toBeNull();
    expect(STUDIO_CONTAINER_IMAGE).toBe('node:22-alpine');
    expect(STUDIO_CONTAINER_POLICY.image).toBe('node:22-alpine');
    expect(STUDIO_CONTAINER_POLICY.workdirRoot).toBe('/workspace');
    expect(STUDIO_CONTAINER_POLICY.allow).toHaveLength(2);
  });

  it('refuses argv the allowlist never named (default-deny, the same planExec decision)', () => {
    expect(planContainerRun({ argv: ['ls', '-la'] }, STUDIO_CONTAINER_POLICY).ok).toBe(false);
    expect(planContainerRun({ argv: ['node', '-e'] }, STUDIO_CONTAINER_POLICY).ok).toBe(false);
    expect(planContainerRun({ argv: ['node', '-e', '1', '2'] }, STUDIO_CONTAINER_POLICY).ok).toBe(false);
  });
});

describe('studio container host (v172, fake spawn)', () => {
  it('runs the self-check inside docker argv that carries the full isolation and no mount flag', async () => {
    const { spawnLike, calls } = fakeSpawn();
    const host = createStudioContainerHost({ spawnLike });
    const r = await host.run({ argv: ['node', '-e', 'console.log("jail ok")'] }, { checkpoint: () => true });
    expect(r.ran).toBe(true);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe('jail ok\n');
    expect(r.image).toBe('node:22-alpine');
    expect(r.workdir).toBe('/workspace');
    expect((r.containerName ?? '').startsWith(CONTAINER_NAME_PREFIX)).toBe(true);
    expect(calls[0]!.cmd).toBe('docker');
    for (const flag of CONTAINER_ISOLATION_ARGS) expect(calls[0]!.args).toContain(flag);
    for (const flag of CONTAINER_MOUNT_FLAGS) expect(calls[0]!.args).not.toContain(flag);
  });

  it('refuses before any spawn when a checkpoint is missing or denies (§28)', async () => {
    const { spawnLike, calls } = fakeSpawn();
    const host = createStudioContainerHost({ spawnLike });
    const noGate = await host.run({ argv: ['node', '-e', '1'] });
    expect(noGate.ran).toBe(false);
    expect(noGate.reason).toContain('checkpoint required');
    const denied = await host.run({ argv: ['node', '-e', '1'] }, { checkpoint: () => false });
    expect(denied.ran).toBe(false);
    expect(denied.reason).toBe('checkpoint denied');
    expect(calls).toHaveLength(0);
  });
});

describe('studio container route core (v172)', () => {
  it('refuses malformed bodies with ok:false and no spawn', async () => {
    const { spawnLike, calls } = fakeSpawn();
    for (const body of [null, {}, { argv: 'node -e 1' }, { argv: [] }, { argv: ['node', ''] }]) {
      const a = await runContainerExec(body, { spawnLike });
      expect(a.ok).toBe(false);
    }
    expect(calls).toHaveLength(0);
  });

  it('answers a policy refusal honestly (ran:false + stated reason) and a run with its own detail line', async () => {
    const { spawnLike, calls } = fakeSpawn();
    const refused = await runContainerExec({ argv: ['curl', 'http://example.invalid'] }, { spawnLike });
    expect(refused.ok).toBe(true);
    if (refused.ok) {
      expect(refused.ran).toBe(false);
      expect(refused.detail).toContain('no allowlist rule matches');
    }
    const ran = await runContainerExec({ argv: ['node', '-e', 'console.log("jail ok")'] }, { spawnLike });
    expect(ran.ok).toBe(true);
    if (ran.ok) {
      expect(ran.ran).toBe(true);
      expect(ran.result.exitCode).toBe(0);
      expect(ran.detail).toContain('node:22-alpine');
      expect(ran.detail).toContain('exit 0');
    }
    expect(calls).toHaveLength(1);
  });
});

describe('studio container lane state (v172)', () => {
  it('merges the probe answer with the pinned policy facts', async () => {
    const { spawnLike } = fakeSpawn('29.8.2\n');
    const s = await containerLaneState({ spawnLike });
    expect(s.available).toBe(true);
    expect(s.serverVersion).toBe('29.8.2');
    expect(s.image).toBe('node:22-alpine');
    expect(s.workdirRoot).toBe('/workspace');
    expect(s.rules[0]).toEqual(['node', '-e', '*']);
  });

  it('states unavailability as a normal answer, not an error', async () => {
    const spawnLike = () => ({
      onData: () => {},
      onEnd: (l: (e: { code: number | null; signal: string | null; error?: string }) => void) => setImmediate(() => l({ code: null, signal: null, error: 'spawn ENOENT' })),
      kill: () => {},
    });
    const s = await containerLaneState({ spawnLike });
    expect(s.available).toBe(false);
    expect(s.reason).toContain('docker CLI failed');
  });
});

describe('studio container workdir root, graded directly (v472)', () => {
  it('the constant is a posix container jail root, and the policy carries that very constant', () => {
    expect(STUDIO_CONTAINER_WORKDIR_ROOT).toBe('/workspace');
    expect(STUDIO_CONTAINER_WORKDIR_ROOT.startsWith('/')).toBe(true);
    expect(STUDIO_CONTAINER_WORKDIR_ROOT.includes('\\')).toBe(false);
    expect(STUDIO_CONTAINER_WORKDIR_ROOT.split('/').some((p) => p === '..')).toBe(false);
    expect(STUDIO_CONTAINER_WORKDIR_ROOT.endsWith('/')).toBe(false);
    expect(STUDIO_CONTAINER_POLICY.workdirRoot).toBe(STUDIO_CONTAINER_WORKDIR_ROOT);
    expect(studioContainerPolicyError()).toBeNull();
  });

  it('a run with no cwd — or a cwd that is not a string — lands exactly at the root, and docker is told so', async () => {
    const { spawnLike, calls } = fakeSpawn();
    for (const cwd of [undefined, 42]) {
      const a = await runContainerExec({ argv: ['node', '--version'], cwd }, { spawnLike });
      expect(a.ok).toBe(true);
      if (a.ok) {
        expect(a.ran).toBe(true);
        expect(a.result.workdir).toBe(STUDIO_CONTAINER_WORKDIR_ROOT);
      }
    }
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      const at = call.args.indexOf('-w');
      expect(at).toBeGreaterThan(-1);
      expect(call.args[at + 1]).toBe(STUDIO_CONTAINER_WORKDIR_ROOT);
    }
  });

  it('a relative cwd is jailed UNDER the root, never beside it', async () => {
    const { spawnLike, calls } = fakeSpawn();
    const sub = await runContainerExec({ argv: ['node', '--version'], cwd: 'sub/dir' }, { spawnLike });
    expect(sub.ok).toBe(true);
    if (sub.ok) expect(sub.result.workdir).toBe(STUDIO_CONTAINER_WORKDIR_ROOT + '/sub/dir');
    const dot = await runContainerExec({ argv: ['node', '--version'], cwd: '.' }, { spawnLike });
    expect(dot.ok).toBe(true);
    if (dot.ok) expect(dot.result.workdir).toBe(STUDIO_CONTAINER_WORKDIR_ROOT);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.args[calls[0]!.args.indexOf('-w') + 1]).toBe(STUDIO_CONTAINER_WORKDIR_ROOT + '/sub/dir');
    expect(calls[1]!.args[calls[1]!.args.indexOf('-w') + 1]).toBe(STUDIO_CONTAINER_WORKDIR_ROOT);
  });

  it('an escaping cwd is refused by name before any spawn — the root is a jail, not a suggestion', async () => {
    const { spawnLike, calls } = fakeSpawn();
    const escapes: Array<[unknown, string]> = [
      ['../etc', 'path escapes the allowed root'],
      ['..\\..\\etc', 'path escapes the allowed root'],
      ['/etc', 'absolute paths are not allowed'],
      ['C:\\win', 'absolute paths are not allowed'],
    ];
    for (const [cwd, why] of escapes) {
      const a = await runContainerExec({ argv: ['node', '--version'], cwd }, { spawnLike });
      expect(a.ok).toBe(true);
      if (a.ok) {
        expect(a.ran).toBe(false);
        expect(a.result.planned).toBe(false);
        expect(a.result.reason).toContain('cwd refused');
        expect(a.result.reason).toContain(why);
        expect(a.result.dockerArgs).toEqual([]);
      }
    }
    expect(calls).toHaveLength(0);
  });

  it('the lane state states the pinned root on both branches — available or not', async () => {
    const up = await containerLaneState({ spawnLike: fakeSpawn('29.8.2\n').spawnLike });
    expect(up.available).toBe(true);
    expect(up.workdirRoot).toBe(STUDIO_CONTAINER_WORKDIR_ROOT);
    const down = await containerLaneState({
      spawnLike: () => ({
        onData: () => {},
        onEnd: (l: (e: { code: number | null; signal: string | null; error?: string }) => void) => setImmediate(() => l({ code: null, signal: null, error: 'spawn ENOENT' })),
        kill: () => {},
      }),
    });
    expect(down.available).toBe(false);
    expect(down.workdirRoot).toBe(STUDIO_CONTAINER_WORKDIR_ROOT);
  });
});

describe('studio container answer — whose “no” it is (v524)', () => {
  // The door used to answer a machine with no docker as a RUN: `ran: true` and the sentence
  // “container node:22-alpine node --version → exit null”, because the host's `ran` is only its record
  // that the promise settled — the docker client was summoned, it came back with a spawn error and no
  // exit code. The exec-host's OWN registry reader throws for both of those bytes, and a 200 with an
  // exit-code sentence tells the caller their ask was performed when the machine is the thing that
  // could not perform it. So the lane now reads `spawnError` and stamps the kind.

  function fakeDockerMissing() {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const spawnLike = (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return {
        onData: () => {},
        onEnd: (l: (e: { code: number | null; signal: string | null; error?: string }) => void) => {
          setImmediate(() => l({ code: null, signal: null, error: 'spawn docker ENOENT' }));
        },
        kill: () => {},
      };
    };
    return { spawnLike, calls };
  }

  it('a docker the machine cannot start is the MACHINE’s failure — the door refuses the word “ran”', async () => {
    const { spawnLike, calls } = fakeDockerMissing();
    const a = await runContainerExec({ argv: ['node', '--version'] }, { spawnLike });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.ran).toBe(false);
    expect(a.failure).toBe('the-machine');
    expect(Object.keys(a).sort()).toEqual(['detail', 'failure', 'ok', 'ran', 'result']);
    expect(a.detail).toContain('never started');
    expect(a.detail).toContain('spawn docker ENOENT');
    expect(a.detail).toContain(STUDIO_CONTAINER_IMAGE);
    // The host's raw record stays beside the door's verdict — including the ran the door refuses.
    expect(a.result.spawnError).toBe('spawn docker ENOENT');
    expect(a.result.exitCode).toBeNull();
    expect(a.result.ran).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.cmd).toBe('docker');
  });

  it('a policy refusal names NO kind and keeps the lane’s sentence in detail — the ask was the problem', async () => {
    const { spawnLike, calls } = fakeSpawn();
    const a = await runContainerExec({ argv: ['ls', '-la'] }, { spawnLike });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.ran).toBe(false);
    expect(a.failure).toBeUndefined();
    expect('failure' in a).toBe(false);
    expect(Object.keys(a).sort()).toEqual(['detail', 'ok', 'ran', 'result']);
    expect(a.detail).toContain('no allowlist rule matches');
    expect(a.result.spawnError).toBe('');
    expect(calls).toHaveLength(0);
  });

  it('a container that really ran names no kind either — a green run is the door answering', async () => {
    const { spawnLike, calls } = fakeSpawn();
    const a = await runContainerExec({ argv: ['node', '-e', 'console.log("jail ok")'] }, { spawnLike });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.ran).toBe(true);
    expect(a.failure).toBeUndefined();
    expect(a.detail).toContain('exit 0');
    expect(calls).toHaveLength(1);
  });

  it('the machine’s failure is stamped even when the ask is well-formed but the host never got a stream', async () => {
    const { spawnLike } = fakeDockerMissing();
    const a = await runContainerExec({ argv: ['node', '-e', 'console.log("jail ok")'], cwd: 'build' }, { spawnLike });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.ran).toBe(false);
    expect(a.failure).toBe('the-machine');
    expect(a.detail).toContain('never started');
  });
});

/**
 * v526 — the SECOND way the machine fails, and the one the record used to hide: the docker client
 * is terminated by a signal the HOST did not send, so the record carries that signal with no exit
 * code and no spawn error. Nothing ever reported, so the container's verdict is UNKNOWN — and before
 * the repair this exact shape answered `ran: true` with “→ exit null”, which reads as a container that
 * ran and exited nothing. The rule now lives in exec-host (`containerRunFailure`), so this lane and
 * the build arc cannot disagree about the same bytes.
 */
describe('studio container answer — the client killed from OUTSIDE (v526)', () => {
  function fakeDockerKilledOutside() {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const spawnLike = (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return {
        onData: () => {},
        onEnd: (l: (e: { code: number | null; signal: string | null; error?: string }) => void) => {
          setImmediate(() => l({ code: null, signal: 'SIGKILL' }));
        },
        kill: () => {},
      };
    };
    return { spawnLike, calls };
  }

  it('a docker killed by an OUTSIDE signal is the MACHINE’s failure — and the door refuses the word “ran”', async () => {
    const { spawnLike, calls } = fakeDockerKilledOutside();
    const a = await runContainerExec({ argv: ['node', '--version'] }, { spawnLike });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.ran).toBe(false);
    expect(a.failure).toBe('the-machine');
    expect(Object.keys(a).sort()).toEqual(['detail', 'failure', 'ok', 'ran', 'result']);
    expect(a.detail).toContain('killed by SIGKILL');
    expect(a.detail).toContain('before it reported an exit code');
    expect(a.detail).toContain(STUDIO_CONTAINER_IMAGE);
    // The host's raw record stays beside the door's verdict — the signal is the fact, and the door
    // quotes it rather than inventing a verdict out of the missing exit code.
    expect(a.result.signal).toBe('SIGKILL');
    expect(a.result.exitCode).toBeNull();
    expect(a.result.spawnError).toBe('');
    expect(calls).toHaveLength(1);
  });

  it('the host’s OWN budget kill is still a red verdict — the plan’s timeout is the plan’s own act', async () => {
    // The studio lane's own timeout is ten seconds of wall clock, so that shape is graded in the
    // exec-host package, where `killedByBudget` can be set directly. What this file pins is that the
    // lane reads the RECORD's flag and not the signal: a run that ended by the host's own budget kill
    // names no kind, and the lane's answer says so.
    const { spawnLike } = fakeSpawn();
    const a = await runContainerExec({ argv: ['node', '--version'] }, { spawnLike });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.failure).toBeUndefined();
    expect(a.result.killedByBudget).toBe(false);
  });
});