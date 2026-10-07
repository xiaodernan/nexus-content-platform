/**
 * M5 v184 (ADR 0016 amendment 184): the CLIENT half of the 3D panel's disk-save face — a fetch
 * adapter, nothing more. It imports NOTHING from @nexus/three-runtime or from saveFsServer.ts
 * (which reaches for node:fs): the store, the naming rules and the real filesystem stay
 * server-side (app/api/agent/save-fs), and the browser bundle holds only this module's
 * locally-stated types. Unavailability is a NORMAL answer, not an error.
 */

/** The name the panel's disk controls write and read — the same name the localStorage save holds,
 *  so either store can restore what the other lost. Re-stated locally: the server module stays
 *  server-side (it imports node:fs). */
export const SAVE_FS_LANE_DISK_SAVE_PATH = 'last-saved';

/** The route's GET answer (shape owned by saveFsServer.ts; re-stated here, not imported). */
export interface SaveFsLaneProbe {
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
export interface SaveFsLaneWriteAnswer {
  ok: boolean;
  path?: string;
  bytes?: number;
  reason?: string;
}

/** The slice of the read answer the panel renders: the parsed save file, ready for a loader. */
export interface SaveFsLaneReadAnswer {
  ok: boolean;
  path?: string;
  file?: unknown;
  reason?: string;
}

export async function probeSaveFs(): Promise<SaveFsLaneProbe> {
  try {
    const res = await fetch('/api/agent/save-fs', { cache: 'no-store' });
    if (!res.ok) {
      return { available: false, serverVersion: '', reason: `probe route answered ${res.status}` };
    }
    return (await res.json()) as SaveFsLaneProbe;
  } catch (e) {
    return {
      available: false,
      serverVersion: '',
      reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * The browser names a SAVE and hands over the save file it already holds — never a location: the
 * path's own rules (no absolute forms, no `..`, no backslash) are the server store's, and a
 * refusal arrives as `ok: false` plus the store's own sentence.
 */
export async function writeSaveToDisk(path: string, file: unknown): Promise<SaveFsLaneWriteAnswer> {
  try {
    const res = await fetch('/api/agent/save-fs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'write', path, file }),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') return parsed as SaveFsLaneWriteAnswer;
    return { ok: false, reason: `save-fs route answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Read one save back by name; the file arrives parsed, ready for `surface.load`. */
export async function readSaveFromDisk(path: string): Promise<SaveFsLaneReadAnswer> {
  try {
    const res = await fetch('/api/agent/save-fs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'read', path }),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') return parsed as SaveFsLaneReadAnswer;
    return { ok: false, reason: `save-fs route answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** The slice of the delete answer the panel renders: whether the name was there to take. */
export interface SaveFsLaneDeleteAnswer {
  ok: boolean;
  path?: string;
  deleted?: boolean;
  reason?: string;
}

/**
 * v186 — take one disk save back by name. "Already gone" arrives as ok:true + deleted:false (the
 * store's own boolean); a refused name arrives as ok:false + the store's own sentence.
 */
export async function deleteSaveOnDisk(path: string): Promise<SaveFsLaneDeleteAnswer> {
  try {
    const res = await fetch('/api/agent/save-fs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'delete', path }),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') return parsed as SaveFsLaneDeleteAnswer;
    return { ok: false, reason: `save-fs route answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** The slice of the rename answer the panel renders: where the bytes ended up. */
export interface SaveFsLaneRenameAnswer {
  ok: boolean;
  from?: string;
  to?: string;
  reason?: string;
}

/**
 * v186 — give one disk save a new name. The new name is a CREATION on the server: its rules (no
 * absolute forms, no `..`, no temp suffix) are the store's creation rule, and a refusal arrives as
 * ok:false plus the store's own sentence.
 */
export async function renameSaveOnDisk(from: string, to: string): Promise<SaveFsLaneRenameAnswer> {
  try {
    const res = await fetch('/api/agent/save-fs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'rename', from, to }),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') return parsed as SaveFsLaneRenameAnswer;
    return { ok: false, reason: `save-fs route answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}
