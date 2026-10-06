/**
 * M6 v174 (ADR 0016 amendment 174): the CLIENT half of the dock's build face — a fetch
 * adapter, nothing more. It imports NOTHING from @nexus/agent-runtime or @nexus/exec-host:
 * the runtime and the spawn-capable package stay server-side (app/api/agent/build), and the
 * browser bundle holds only this module's locally-stated types. Unavailability is a NORMAL
 * answer, not an error.
 */

/** The route's GET answer (shape owned by buildServer.ts; re-stated here, not imported). */
export interface BuildLaneProbe {
  available: boolean;
  serverVersion: string;
  reason: string;
  arcId: string;
  goal: string;
  engine: string;
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
  detail?: string;
  steps?: BuildLaneStep[];
  receipts?: { callId: string; granted: boolean; reason: string }[];
}

export async function probeBuildLane(): Promise<BuildLaneProbe> {
  try {
    const res = await fetch('/api/agent/build', { cache: 'no-store' });
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

export async function requestBuildArcRun(): Promise<BuildLaneAnswer> {
  try {
    const res = await fetch('/api/agent/build', { method: 'POST' });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') return parsed as BuildLaneAnswer;
    return { ok: false, reason: `build route answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}
