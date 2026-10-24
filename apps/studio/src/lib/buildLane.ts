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
function isBuildProbeShape(body: unknown): body is BuildLaneProbe {
  if (typeof body !== 'object' || body === null) return false;
  const p = body as Partial<BuildLaneProbe>;
  return (
    typeof p.available === 'boolean' &&
    typeof p.serverVersion === 'string' &&
    typeof p.reason === 'string' &&
    typeof p.arcId === 'string' &&
    typeof p.goal === 'string' &&
    typeof p.engine === 'string' &&
    Array.isArray(p.steps) &&
    p.steps.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string'))
  );
}

export async function probeBuildLane(): Promise<BuildLaneProbe> {
  try {
    const res = await fetch('/api/agent/build-arc', { cache: 'no-store', signal: callSignal() });
    if (!res.ok) {
      return { available: false, serverVersion: '', reason: `probe route answered ${res.status}`, arcId: '', goal: '', engine: '', steps: [] };
    }
    let probe: BuildLaneProbe;
    try {
      probe = (await res.json()) as BuildLaneProbe;
    } catch {
      // v485 — a 200 whose body cannot be read is a door that ANSWERED, badly. Answering
      // "unreachable" here would be the lie the house refuses: the server was there. The other doors
      // of this very file already say it plainly; the probe now says it too.
      return { available: false, serverVersion: '', reason: `build route answered ${res.status} with a non-JSON body`, arcId: '', goal: '', engine: '', steps: [] };
    }
    if (!isBuildProbeShape(probe)) {
      return { available: false, serverVersion: '', reason: `build route answered ${res.status} with a body that is not the probe’s shape`, arcId: '', goal: '', engine: '', steps: [] };
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
      signal: callSignal(),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') return parsed as BuildLaneAnswer;
    return { ok: false, reason: `build route answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: unreachableReason(e) };
  }
}
