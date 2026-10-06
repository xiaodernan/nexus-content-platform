import { describe, expect, it } from 'vitest';
import { CONTAINER_ISOLATION_ARGS, CONTAINER_MOUNT_FLAGS } from '@nexus/exec-host';
import { planBuildArc, templateBuildPlanner } from '@nexus/agent-runtime';

import {
  buildArcState,
  runStudioBuildArc,
  STUDIO_BUILD_ARC_ID,
  STUDIO_BUILD_CATALOG,
  STUDIO_BUILD_CHECKPOINT_POLICY,
  STUDIO_BUILD_ENGINE,
  STUDIO_BUILD_GOAL,
  studioBuildCatalogAllowlistError,
  studioBuildCheckpointPolicyError,
} from './buildServer';

/** Minimal SpawnLike fake — the host never knows it is not docker. */
function fakeSpawn(stdout = 'arc ok:5\n', code: number | null = 0) {
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

describe('studio build lane facts (v175, planned)', () => {
  it('pins the catalog as data: every template inside the SAME container allowlist', () => {
    expect(STUDIO_BUILD_ARC_ID).toBe('studio-build-arc');
    expect(STUDIO_BUILD_CATALOG).toHaveLength(2);
    expect(STUDIO_BUILD_CATALOG.map((t) => t.id)).toEqual(['runtime', 'compute']);
    expect(STUDIO_BUILD_ENGINE).toBe('container:node:22-alpine');
    expect(studioBuildCatalogAllowlistError()).toBeNull();
    const planner = templateBuildPlanner(STUDIO_BUILD_CATALOG, STUDIO_BUILD_ARC_ID);
    const d = planner({ goal: STUDIO_BUILD_GOAL });
    expect(d.ok).toBe(true);
    if (d.ok) expect(planBuildArc(d.draft.spec).ok).toBe(true);
  });

  it('validates the §28 checkpoint policy: build.verify granted on record, everything else default-deny', () => {
    expect(studioBuildCheckpointPolicyError()).toBeNull();
    expect(STUDIO_BUILD_CHECKPOINT_POLICY.rules[0]!.tool).toBe('build.verify');
    expect(STUDIO_BUILD_CHECKPOINT_POLICY.default.grant).toBe(false);
  });
});

describe('studio build lane walk (v175, planned, fake spawn)', () => {
  it('the default goal summons both templates and walks them green through the real container wall', async () => {
    const { spawnLike, calls } = fakeSpawn();
    const a = await runStudioBuildArc({ spawnLike });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.status).toBe('completed');
    expect(a.goal).toBe(STUDIO_BUILD_GOAL);
    expect(a.detail).toContain('2/2 step(s) green');
    expect(a.detail).toContain('planned by template');
    expect(a.planned?.picked).toEqual(['runtime', 'compute']);
    expect(a.steps.map((s) => s.callId)).toEqual([`${STUDIO_BUILD_ARC_ID}:runtime`, `${STUDIO_BUILD_ARC_ID}:compute`]);
    expect(a.steps.every((s) => s.ok)).toBe(true);
    expect(a.steps[1]!.stdout).toBe('arc ok:5\n');
    expect(a.receipts).toHaveLength(2);
    expect(a.receipts.every((r) => r.granted)).toBe(true);
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.cmd).toBe('docker');
      for (const flag of CONTAINER_ISOLATION_ARGS) expect(c.args).toContain(flag);
      for (const flag of CONTAINER_MOUNT_FLAGS) expect(c.args).not.toContain(flag);
    }
  });

  it('the request can name a GOAL (never argv): a narrower goal summons a narrower arc', async () => {
    const { spawnLike, calls } = fakeSpawn();
    const a = await runStudioBuildArc({ spawnLike, goal: 'check the numbers' });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.status).toBe('completed');
    expect(a.goal).toBe('check the numbers');
    expect(a.planned?.picked).toEqual(['compute']);
    expect(a.steps).toHaveLength(1);
    expect(a.steps[0]!.callId).toBe(`${STUDIO_BUILD_ARC_ID}:compute`);
    expect(calls).toHaveLength(1);
  });

  it('a goal that summons nothing is an honest unplanned answer — zero spawn, zero receipts', async () => {
    const { spawnLike, calls } = fakeSpawn();
    const a = await runStudioBuildArc({ spawnLike, goal: 'zzz qqq nonsense' });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.status).toBe('unplanned');
    expect(a.reason).toContain('invents nothing');
    expect(a.steps).toEqual([]);
    expect(a.receipts).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('a red verdict stops the walk with the engine\'s own words and one receipt', async () => {
    const { spawnLike, calls } = fakeSpawn('', 3);
    const a = await runStudioBuildArc({ spawnLike });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.status).toBe('failed');
    expect(a.stoppedAt).toBe('runtime');
    expect(a.reason).toContain('verified red');
    expect(a.steps).toHaveLength(1);
    expect(a.steps[0]!.ok).toBe(false);
    expect(a.receipts).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it('the state merges the probe with the pinned lane facts (catalog, not a promise)', async () => {
    const { spawnLike } = fakeSpawn('29.8.2\n');
    const s = await buildArcState({ spawnLike });
    expect(s.available).toBe(true);
    expect(s.arcId).toBe('studio-build-arc');
    expect(s.goal).toBe(STUDIO_BUILD_GOAL);
    expect(s.engine).toBe('container:node:22-alpine');
    expect(s.steps).toEqual([
      ['node', '--version'],
      ['node', '-e', 'console.log("arc ok:" + String(2 + 3))'],
    ]);
  });
});
