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

export async function probeWorldSaves(): Promise<WorldSaveLaneProbe> {
  try {
    const res = await fetch('/api/agent/world-saves', { cache: 'no-store' });
    if (!res.ok) {
      return { available: false, serverVersion: '', reason: `probe route answered ${res.status}` };
    }
    return (await res.json()) as WorldSaveLaneProbe;
  } catch (e) {
    return {
      available: false,
      serverVersion: '',
      reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}`,
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
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') return parsed as WorldSaveLaneWriteAnswer;
    return { ok: false, reason: `world-saves route answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Read one world save back by name; the file arrives parsed, ready for the engine's own `load()`. */
export async function readWorldSaveFromDisk(path: string): Promise<WorldSaveLaneReadAnswer> {
  try {
    const res = await fetch('/api/agent/world-saves', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'read', path }),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') return parsed as WorldSaveLaneReadAnswer;
    return { ok: false, reason: `world-saves route answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}
