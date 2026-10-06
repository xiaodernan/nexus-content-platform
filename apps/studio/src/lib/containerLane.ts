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

export async function probeContainerLane(): Promise<ContainerLaneProbe> {
  try {
    const res = await fetch('/api/agent/container', { cache: 'no-store' });
    if (!res.ok) {
      return { available: false, serverVersion: '', reason: `probe route answered ${res.status}`, image: '', workdirRoot: '', rules: [] };
    }
    return (await res.json()) as ContainerLaneProbe;
  } catch (e) {
    return {
      available: false,
      serverVersion: '',
      reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}`,
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
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') return parsed as ContainerExecAnswer;
    return { ok: false, reason: `container route answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}