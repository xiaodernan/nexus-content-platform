/**
 * M4 v191 (ADR 0016 amendment 191): the CLIENT half of the world panel's disk-persistence face —
 * a fetch adapter, nothing more. It imports NOTHING from @nexus/three-runtime, from worldSaveServer.ts
 * (which reaches for node:fs) or from @nexus/world-engine: the store, the naming rules and the real
 * filesystem stay server-side (app/api/agent/world-saves), and the browser bundle holds only this
 * module's locally-stated types. Unavailability is a NORMAL answer, not an error.
 */

/** The name the panel's disk controls write and read by default. Re-stated locally: the server
 *  module stays server-side (it imports node:fs). */
export const WORLD_SAVE_LANE_DISK_SAVE_PATH = 'world-saved';

/** The route's GET answer (shape owned by worldSaveServer.ts; re-stated here, not imported). */
export interface WorldSaveLaneProbe {
  available: boolean;
  serverVersion: string;
  root?: string;
  kind?: string;
  /** Every save name on the server's disk, sorted, relative to the root. */
  saves?: string[];
  count?: number;
  reason?: string;
}

/** The slice of the write answer the panel renders. */
export interface WorldSaveLaneWriteAnswer {
  ok: boolean;
  path?: string;
  bytes?: number;
  reason?: string;
}

/** The slice of the read answer the panel renders: the parsed save file, ready for engine.load. */
export interface WorldSaveLaneReadAnswer {
  ok: boolean;
  path?: string;
  file?: unknown;
  reason?: string;
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

export async function probeWorldSaves(): Promise<WorldSaveLaneProbe> {
  try {
    const res = await fetch('/api/agent/world-saves', { cache: 'no-store', signal: callSignal() });
    if (!res.ok) {
      return { available: false, serverVersion: '', reason: `probe route answered ${res.status}` };
    }
    return (await res.json()) as WorldSaveLaneProbe;
  } catch (e) {
    return {
      available: false,
      serverVersion: '',
      reason: unreachableReason(e),
    };
  }
}

/**
 * The browser names a SAVE and hands over the save file the engine's own `save()` produced — never
 * a location: the path's own rules (no absolute forms, no `..`, no backslash) are the server
 * store's, and a refusal arrives as `ok: false` plus the store's own sentence.
 */
export async function writeWorldSaveToDisk(path: string, file: unknown): Promise<WorldSaveLaneWriteAnswer> {
  try {
    const res = await fetch('/api/agent/world-saves', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'write', path, file }),
      signal: callSignal(),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') return parsed as WorldSaveLaneWriteAnswer;
    return { ok: false, reason: `world-saves route answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: unreachableReason(e) };
  }
}

/** Read one world save back by name; the file arrives parsed, ready for the engine's own `load()`. */
export async function readWorldSaveFromDisk(path: string): Promise<WorldSaveLaneReadAnswer> {
  try {
    const res = await fetch('/api/agent/world-saves', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'read', path }),
      signal: callSignal(),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') return parsed as WorldSaveLaneReadAnswer;
    return { ok: false, reason: `world-saves route answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: unreachableReason(e) };
  }
}
