/**
 * M2 v172 (ADR 0016 amendment 172): the CLIENT half of the dock's container lane — a fetch
 * adapter, nothing more. It deliberately imports NOTHING from @nexus/exec-host: the one
 * package allowed to spawn stays server-side (app/api/agent/container), and the browser
 * bundle holds only this module's locally-stated types. When the server (or the runtime it
 * guards) is absent, the probe says so in its own words — unavailability is a NORMAL answer,
 * not an error.
 */

/** The route's GET answer (shape owned by containerServer.ts; re-stated here, not imported). */
export interface ContainerLaneProbe {
  available: boolean;
  serverVersion: string;
  reason: string;
  image: string;
  workdirRoot: string;
  rules: string[][];
}

/** The slice of the route's POST answer the panel renders. */
export interface ContainerExecAnswer {
  ok: boolean;
  ran?: boolean;
  detail?: string;
  reason?: string;
}

export interface ContainerExecRequest {
  argv: string[];
  cwd?: string;
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

export async function probeContainerLane(): Promise<ContainerLaneProbe> {
  try {
    const res = await fetch('/api/agent/container', { cache: 'no-store', signal: callSignal() });
    if (!res.ok) {
      return { available: false, serverVersion: '', reason: `probe route answered ${res.status}`, image: '', workdirRoot: '', rules: [] };
    }
    let probe: ContainerLaneProbe;
    try {
      probe = (await res.json()) as ContainerLaneProbe;
    } catch {
      // v485 — a 200 whose body cannot be read is a door that ANSWERED, badly. Answering
      // "unreachable" here would be the lie the house refuses: the server was there. The other doors
      // of this very file already say it plainly; the probe now says it too.
      return { available: false, serverVersion: '', reason: `container route answered ${res.status} with a non-JSON body`, image: '', workdirRoot: '', rules: [] };
    }
    return probe;
  } catch (e) {
    return {
      available: false,
      serverVersion: '',
      reason: unreachableReason(e),
      image: '',
      workdirRoot: '',
      rules: [],
    };
  }
}

export async function requestContainerExec(req: ContainerExecRequest): Promise<ContainerExecAnswer> {
  try {
    const res = await fetch('/api/agent/container', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: callSignal(),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') return parsed as ContainerExecAnswer;
    return { ok: false, reason: `container route answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: unreachableReason(e) };
  }
}