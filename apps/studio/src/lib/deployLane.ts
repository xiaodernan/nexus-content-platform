/**
 * M6 v177 (ADR 0016 amendment 177): the CLIENT half of the dock's deploy face — a fetch
 * adapter, nothing more. It imports NOTHING from @nexus/agent-runtime or @nexus/exec-host:
 * the runtime, the spawn-capable package and the records file stay server-side
 * (app/api/agent/deploy), and the browser bundle holds only this module's locally-stated
 * types. Unavailability is a NORMAL answer, not an error.
 */

/** The route's GET answer (shape owned by deployServer.ts; re-stated here, not imported). */
export interface DeployLaneProbe {
  available: boolean;
  serverVersion: string;
  reason: string;
  arcId: string;
  goal: string;
  engine: string;
  /** The build step CATALOG (what CAN be planned), not a promise of what will run. */
  steps: string[][];
  /** Where deploy records land, and how many already have. */
  recordsPath: string;
  recordCount: number;
  /** v178: the records ON FILE, newest first — the read side of the sink. */
  records?: DeployLaneRecordView[];
  /** v178: lines on file that are not a readable record — named as a count, never hidden. */
  malformed?: number;
}

/** One record on file, display-ready (re-stated locally; the records file stays server-side). */
export interface DeployLaneRecordView {
  at: number;
  arcId: string;
  goal: string;
  stepId: string;
  fact: string;
  engine: string;
}

/** The slice of the route's POST answer the panel renders. */
export interface DeployLaneFact {
  stepId: string;
  stdout: string;
}

export interface DeployLaneAnswer {
  ok: boolean;
  reason?: string;
  status?: string;
  stoppedAt?: string;
  /** The goal the arc was planned for (echoed back). */
  goal?: string;
  /** The BUILD verdict this deploy stands on. */
  build?: { status: string; detail: string };
  detail?: string;
  facts?: DeployLaneFact[];
  unmeasured?: string[];
  recordsPath?: string;
  deployReceipts?: { callId: string; granted: boolean; reason: string }[];
}

export async function probeDeployLane(): Promise<DeployLaneProbe> {
  try {
    const res = await fetch('/api/agent/deploy', { cache: 'no-store' });
    if (!res.ok) {
      return { available: false, serverVersion: '', reason: `probe route answered ${res.status}`, arcId: '', goal: '', engine: '', steps: [], recordsPath: '', recordCount: 0 };
    }
    return (await res.json()) as DeployLaneProbe;
  } catch (e) {
    return {
      available: false,
      serverVersion: '',
      reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}`,
      arcId: '',
      goal: '',
      engine: '',
      steps: [],
      recordsPath: '',
      recordCount: 0,
    };
  }
}

/**
 * The browser names a GOAL — never argv, never a fact. The server plans and walks the build
 * arc, and only a green arc's measured stdout crosses the deploy.record door.
 */
export async function requestDeployArcRun(goal?: string): Promise<DeployLaneAnswer> {
  try {
    const res = await fetch('/api/agent/deploy', {
      method: 'POST',
      ...(goal === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal }) }),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') return parsed as DeployLaneAnswer;
    return { ok: false, reason: `deploy route answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}
