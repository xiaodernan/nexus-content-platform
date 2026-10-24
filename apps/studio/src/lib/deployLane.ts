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

/**
 * How long the Studio's own door waits for its route to answer.
 *
 * <p>These lanes call the global `fetch` directly — they predate the injected-fetch lanes, and the
 * signal sweep that counts `fetchImpl(` call sites never saw them, so a route that never answered hung
 * the panel forever with no reason to show. v484 gives them the budget every other door in the house
 * has had since v294: 45 seconds, long enough for a compile, short enough that a reader is not left
 * waiting.
 */
export const CALL_TIMEOUT_MS = 45_000;

/** A signal that stops a call the route does not answer in time. */
function callSignal(): AbortSignal {
  return AbortSignal.timeout(CALL_TIMEOUT_MS);
}

/**
 * Why a call to the Studio's own door did not answer.
 *
 * <p>A TIMEOUT is not an unreachable Studio: the Studio is very probably there, compiling. Saying
 * "unreachable" about a slow answer is the same kind of lie the house's rule about failed reads is
 * about — a reader who is told the thing is gone when it is only late stops looking for it. The same
 * sentence publishLane has carried since v294.
 */
function unreachableReason(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return `the Studio did not answer within ${CALL_TIMEOUT_MS / 1000} seconds`;
  }
  return `studio server unreachable: ${error instanceof Error ? error.message : String(error)}`;
}

/**
 * v485 closed the UNREADABLE body; v486 closes the READABLE-BUT-WRONG one. The dock reads
 * `steps.length` without a guard, so a 200 whose body is JSON but not the probe's shape would
 * crash the panel — and a cast is not a contract. A wrong shape is a NAMED refusal, the same way an
 * unreadable body is: the route answered, and what it answered is not the thing this lane promised.
 */
function isDeployProbeShape(body: unknown): body is DeployLaneProbe {
  if (typeof body !== 'object' || body === null) return false;
  const p = body as Partial<DeployLaneProbe>;
  return (
    typeof p.available === 'boolean' &&
    typeof p.serverVersion === 'string' &&
    typeof p.reason === 'string' &&
    typeof p.arcId === 'string' &&
    typeof p.goal === 'string' &&
    typeof p.engine === 'string' &&
    Array.isArray(p.steps) &&
    p.steps.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string')) &&
    typeof p.recordsPath === 'string' &&
    typeof p.recordCount === 'number' && Number.isFinite(p.recordCount)
  );
}

export async function probeDeployLane(): Promise<DeployLaneProbe> {
  try {
    const res = await fetch('/api/agent/deploy', { cache: 'no-store', signal: callSignal() });
    if (!res.ok) {
      return { available: false, serverVersion: '', reason: `probe route answered ${res.status}`, arcId: '', goal: '', engine: '', steps: [], recordsPath: '', recordCount: 0 };
    }
    let probe: DeployLaneProbe;
    try {
      probe = (await res.json()) as DeployLaneProbe;
    } catch {
      // v485 — a 200 whose body cannot be read is a door that ANSWERED, badly. Answering
      // "unreachable" here would be the lie the house refuses: the server was there. The other doors
      // of this very file already say it plainly; the probe now says it too.
      return { available: false, serverVersion: '', reason: `deploy route answered ${res.status} with a non-JSON body`, arcId: '', goal: '', engine: '', steps: [], recordsPath: '', recordCount: 0 };
    }
    if (!isDeployProbeShape(probe)) {
      return { available: false, serverVersion: '', reason: `deploy route answered ${res.status} with a body that is not the probe’s shape`, arcId: '', goal: '', engine: '', steps: [], recordsPath: '', recordCount: 0 };
    }
    return probe;
  } catch (e) {
    return {
      available: false,
      serverVersion: '',
      reason: unreachableReason(e),
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
      signal: callSignal(),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') return parsed as DeployLaneAnswer;
    return { ok: false, reason: `deploy route answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: unreachableReason(e) };
  }
}
