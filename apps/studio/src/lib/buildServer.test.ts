import { describe, expect, it } from 'vitest';
import { CONTAINER_ISOLATION_ARGS, CONTAINER_MOUNT_FLAGS } from '@nexus/exec-host';
import { planBuildArc, templateBuildPlanner } from '@nexus/agent-runtime';

import { askDoorStatus } from './doorFailure';
import {
  buildArcState,
  runStudioBuildArc,
  runStudioBuildArcOutcome,
  STUDIO_BUILD_ARC_ID,
  STUDIO_BUILD_CATALOG,
  STUDIO_BUILD_CHECKPOINT_POLICY,
  STUDIO_BUILD_ENGINE,
  STUDIO_BUILD_GOAL,
  studioBuildCatalogAllowlistError,
  studioBuildCheckpointPolicyError,
} from './buildServer';

/**
 * Minimal SpawnLike fake — the host never knows it is not docker. `error` is the CLIENT's own failure.
 *
 * v526 — `signal` is the fourth shape the client's end event can carry: the client was TERMINATED by
 * a signal, so it never reported an exit code. `code` is null in that shape, and the host's record
 * keeps `killedByBudget` false because the host's own budget timer is not what fired.
 */
function fakeSpawn(stdout = 'arc ok:5\n', code: number | null = 0, error = '', signal: string | null = null) {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const spawnLike = (cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    return {
      onData: (l: (s: 'stdout' | 'stderr', c: Buffer | string) => void) => {
        if (stdout !== '') l('stdout', Buffer.from(stdout));
      },
      onEnd: (l: (e: { code: number | null; signal: string | null; error?: string }) => void) => {
        setImmediate(() => l({ code, signal, ...(error === '' ? {} : { error }) }));
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

  it('the verify verdict is the EXIT CODE, not the stdout: empty stdout with a zero exit is still green', async () => {
    // This case pins a CORRECTION, and it is here because this file's fake already takes the stdout
    // first, so the shapes below are the ones the shipped code is read against.
    //
    // `containerVerifier.ts` computes `ok = result.exitCode === 0 && !result.killedByBudget` — the
    // stdout is NOT part of the verdict. A case in `deployServer.test.ts` used to name an empty stdout
    // as the thing that fails a build, and its fake put the empty string where the EXIT CODE goes, so
    // the case went red by accident and the comment was never true. Here the stdout really is empty
    // (the fake emits no data at all) and the exit code really is zero, and the build is GREEN.
    const { spawnLike } = fakeSpawn('', 0);
    const a = await runStudioBuildArc({ spawnLike });
    expect(a.ok).toBe(true);
    if (!a.ok) throw new Error(`the build arc refused instead of answering: ${a.reason}`);
    expect(a.status).toBe('completed');
    expect(a.steps).toHaveLength(2);
    expect(a.steps.every((s) => s.ok)).toBe(true);
    // The stdout really was empty — the verifier OMITS an empty stdout rather than reporting it — so
    // this is not the green case above wearing a different hat.
    expect(a.steps.every((s) => s.stdout === undefined)).toBe(true);
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

describe('runStudioBuildArcOutcome — the walk AND its display answer (v455)', () => {
  // v177 split the walk's outcome from the answer the route renders. Until now only the answer half
  // was graded (through runStudioBuildArc), so what the deploy face RECEIVES — and how the answer is
  // projected out of the outcome — was reachable only by reading the mapping.

  it('an unplanned goal walks NOTHING: the outcome half is null and the answer says so', async () => {
    const { spawnLike, calls } = fakeSpawn();
    const walk = await runStudioBuildArcOutcome({ spawnLike, goal: 'zzz qqq nonsense' });
    expect(walk.outcome).toBeNull();
    expect(walk.answer.ok).toBe(true);
    if (!walk.answer.ok) return;
    expect(walk.answer.status).toBe('unplanned');
    expect(walk.answer.reason).toContain('invents nothing');
    expect(walk.answer.detail).toContain('unplanned');
    expect(walk.answer.detail).toContain(STUDIO_BUILD_ARC_ID);
    // An unplanned goal has no planner provenance to show and no receipts to carry.
    expect(walk.answer.planned).toBeUndefined();
    expect(walk.answer.steps).toEqual([]);
    expect(walk.answer.receipts).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('a walked arc hands back the OUTCOME beside the answer, and the answer is its projection', async () => {
    const { spawnLike } = fakeSpawn();
    const walk = await runStudioBuildArcOutcome({ spawnLike });
    expect(walk.outcome).not.toBeNull();
    const o = walk.outcome!;
    expect(o.arcId).toBe(STUDIO_BUILD_ARC_ID);
    expect(o.status).toBe('completed');
    expect(walk.answer.ok).toBe(true);
    if (!walk.answer.ok) return;
    expect(walk.answer.status).toBe(o.status);
    expect(walk.answer.goal).toBe(o.goal);
    // One answer step per outcome result, one receipt per decision, in the same order.
    expect(walk.answer.steps).toHaveLength(o.results.length);
    expect(walk.answer.steps.map((s) => s.callId)).toEqual(o.results.map((r) => r.callId));
    expect(walk.answer.receipts).toEqual((o.decisions ?? []).map((d) => ({ callId: d.call.callId, granted: d.granted, reason: d.reason })));
  });

  it('the stepId is the callId MINUS the arc prefix — the prefix is the answer’s, not the step’s', async () => {
    const { spawnLike } = fakeSpawn();
    const walk = await runStudioBuildArcOutcome({ spawnLike });
    if (!walk.answer.ok) return;
    expect(walk.answer.steps.map((s) => s.stepId)).toEqual(['runtime', 'compute']);
    for (const s of walk.answer.steps) expect(s.callId).toBe(`${STUDIO_BUILD_ARC_ID}:${s.stepId}`);
  });

  it('a step is green only when the TOOL and the VERDICT agree — a red exit is a step whose tool answered fine', async () => {
    // The conjunction the answer’s `ok` field is made of: `r.ok && verdict.ok === true`. A container
    // that exits 3 is a tool that ANSWERED (the outcome says its result is ok) carrying a verdict that
    // says red — two different questions, and the answer step is the AND of them.
    const { spawnLike } = fakeSpawn('', 3);
    const walk = await runStudioBuildArcOutcome({ spawnLike });
    const o = walk.outcome!;
    expect(o.results[0]!.ok).toBe(true);
    if (!walk.answer.ok) return;
    expect(walk.answer.steps[0]!.ok).toBe(false);
    expect(walk.answer.steps[0]!.detail).toContain('exit 3');
    expect(walk.answer.status).toBe('failed');
    expect(walk.answer.stoppedAt).toBe('runtime');
  });

  it('a completed walk’s answer carries NO stoppedAt and NO reason — absent keys, not undefined ones', async () => {
    const { spawnLike } = fakeSpawn();
    const walk = await runStudioBuildArcOutcome({ spawnLike });
    if (!walk.answer.ok) return;
    expect('stoppedAt' in walk.answer).toBe(false);
    expect('reason' in walk.answer).toBe(false);
  });

  it('a BLANK goal falls back to the face’s default; a named one rides along on both halves', async () => {
    const blank = await runStudioBuildArcOutcome({ spawnLike: fakeSpawn().spawnLike, goal: '   ' });
    if (!blank.answer.ok) return;
    expect(blank.answer.goal).toBe(STUDIO_BUILD_GOAL);
    expect(blank.outcome?.goal).toBe(STUDIO_BUILD_GOAL);

    const named = await runStudioBuildArcOutcome({ spawnLike: fakeSpawn().spawnLike, goal: 'check the numbers' });
    if (!named.answer.ok) return;
    expect(named.answer.goal).toBe('check the numbers');
    expect(named.outcome?.goal).toBe('check the numbers');
  });
});

describe('runStudioBuildArcOutcome — WHICH kind of "no" the answer is (v525)', () => {
  // The build door's answer used to carry no kind at all, so a door that could not start docker and a
  // step that verified bad were the SAME answer: ok:true, status 'failed', and a 200 that reads as
  // "attempted". The kind rides the walk up now, and the status is DERIVED from it.

  it('a docker that never STARTED is the machine failing — the answer says whose failure it is', async () => {
    const { spawnLike } = fakeSpawn('', 0, 'spawn docker ENOENT');
    const walk = await runStudioBuildArcOutcome({ spawnLike });
    expect(walk.answer.ok).toBe(true);
    if (!walk.answer.ok) return;
    expect(walk.answer.status).toBe('failed');
    expect(walk.answer.failure).toBe('the-machine');
    expect(walk.answer.detail).toContain('the machine failed');
    expect(walk.answer.reason).toContain('spawn docker ENOENT');
    // The walk knows it too — the answer is its projection, not a second reading of the same bytes.
    expect(walk.outcome?.failure).toBe('the-machine');
  });

  it('a machine failure earns 503 — the door did not perform the ask', async () => {
    const { spawnLike } = fakeSpawn('', 0, 'spawn docker ENOENT');
    const a = await runStudioBuildArc({ spawnLike });
    expect(askDoorStatus(a)).toBe(503);
  });

  it('a RED verdict names NO kind — the container ran and the step is bad, so the door answers 200', async () => {
    const { spawnLike } = fakeSpawn('', 3);
    const a = await runStudioBuildArc({ spawnLike });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.status).toBe('failed');
    expect(a.failure).toBeUndefined();
    expect(a.detail).not.toContain('the machine failed');
    expect(askDoorStatus(a)).toBe(200);
  });

  it('an UNPLANNED goal names NO kind — nothing was asked of the machine, so the door answers 200', async () => {
    const { spawnLike } = fakeSpawn();
    const a = await runStudioBuildArc({ spawnLike, goal: 'zzz qqq nonsense' });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.status).toBe('unplanned');
    expect(a.failure).toBeUndefined();
    expect(askDoorStatus(a)).toBe(200);
  });
});

/**
 * v526 — the SECOND way the machine fails: the docker client was TERMINATED by a signal before it
 * reported an exit code. v524/v525 taught this arc the first way (the client never lived); this
 * shape was invisible to them — it arrived as a red verdict (`exit null`), so the build answer said
 * "the step verified bad" and the door answered 200 for a build that never ran.
 *
 * The discriminator is in the RECORD, not in a sentence: `signal` is set, `exitCode` is null and
 * `killedByBudget` is false (the host did not kill it — it was killed from outside). The host's own
 * budget kill is the plan's own act and stays kind-less.
 */
describe('runStudioBuildArcOutcome — the machine that DIED mid-flight (v526)', () => {
  it('a client killed from OUTSIDE is the machine failing — the answer names the signal', async () => {
    const { spawnLike } = fakeSpawn('', null, '', 'SIGKILL');
    const walk = await runStudioBuildArcOutcome({ spawnLike });
    expect(walk.answer.ok).toBe(true);
    if (!walk.answer.ok) return;
    expect(walk.answer.status).toBe('failed');
    expect(walk.answer.failure).toBe('the-machine');
    expect(walk.answer.reason).toContain('SIGKILL');
    expect(walk.answer.reason).toContain('before it reported an exit code');
    expect(walk.answer.detail).toContain('the machine failed at runtime');
    // The walk knows it too — the answer is its projection, not a second reading of the same bytes.
    expect(walk.outcome?.failure).toBe('the-machine');
  });

  it('a machine failure earns 503 — the door did not perform the ask', async () => {
    const { spawnLike } = fakeSpawn('', null, '', 'SIGKILL');
    const a = await runStudioBuildArc({ spawnLike });
    expect(askDoorStatus(a)).toBe(503);
  });

  it('the walk STOPS at the first death — no second step is asked of a dead machine', async () => {
    const { spawnLike, calls } = fakeSpawn('', null, '', 'SIGKILL');
    const walk = await runStudioBuildArcOutcome({ spawnLike });
    expect(walk.answer.ok).toBe(true);
    if (!walk.answer.ok) return;
    expect(walk.outcome?.stoppedAt).toBe('runtime');
    expect(walk.answer.steps).toHaveLength(1);
    expect(walk.answer.receipts).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });
});
