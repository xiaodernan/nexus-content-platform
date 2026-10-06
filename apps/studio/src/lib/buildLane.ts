/**
 * M6 v175 (ADR 0016 amendment 175): the CLIENT half of the dock's build face — a fetch
 * adapter, nothing more. It imports NOTHING from @nexus/agent-runtime or @nexus/exec-host:
 * the runtime and the spawn-capable package stay server-side (app/api/agent/build-arc), and
 * the browser bundle holds only this module's locally-stated types. Unavailability is a
 * NORMAL answer, not an error.
 */

/** The route's GET answer (shape owned by buildServer.ts; re-stated here, not imported). */
export interface BuildLaneProbe {
  available: boolean;
  serverVersion: string;
  reason: string;
  arcId: string;
  goal: string;
  engine: string;
  /** The step CATALOG (what CAN be planned), not a promise of what will run. */
  steps: string[][];
}

/** The slice of the route's POST answer the panel renders. */
export interface BuildLaneStep {
  callId: string;
  stepId: string;
  ok: boolean;
  detail: string;
  stdout?: string;
}

export interface BuildLaneAnswer {
  ok: boolean;
  reason?: string;
  status?: string;
  stoppedAt?: string;
  /** The goal the walk planned for (echoed back). */
  goal?: string;
  /** WHO chose the steps — the planner's provenance (backend, seed, picked ids). */
  planned?: { backend: string; seed: number; goal: string; picked: string[] };
  detail?: string;
  steps?: BuildLaneStep[];
  receipts?: { callId: string; granted: boolean; reason: string }[];
}

export async function probeBuildLane(): Promise<BuildLaneProbe> {
  try {
    const res = await fetch('/api/agent/build-arc', { cache: 'no-store' });
    if (!res.ok) {
      return { available: false, serverVersion: '', reason: `probe route answered ${res.status}`, arcId: '', goal: '', engine: '', steps: [] };
    }
    return (await res.json()) as BuildLaneProbe;
  } catch (e) {
    return {
      available: false,
      serverVersion: '',
      reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}`,
      arcId: '',
      goal: '',
      engine: '',
      steps: [],
    };
  }
}

/**
 * The browser names a GOAL — never argv. When `goal` is absent the server plans for the
 * face's own default goal; either way the planner only ever selects among its catalog.
 */
export async function requestBuildArcRun(goal?: string): Promise<BuildLaneAnswer> {
  try {
    const res = await fetch('/api/agent/build-arc', {
      method: 'POST',
      ...(goal === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal }) }),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') return parsed as BuildLaneAnswer;
    return { ok: false, reason: `build route answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}
