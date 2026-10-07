/**
 * M5 v184 (ADR 0016 amendment 184): the SERVER half of the 3D panel's disk-save face — the first
 * product consumer of the fs-backed SaveStore the runtime has carried since v120. The store's own
 * words still rule: the browser names a SAVE PATH and hands over a save FILE, and every naming
 * decision (no absolute forms, no `..`, no backslash, no temp suffix on creation) is made by the
 * runtime's `createFsSaveStore` over the REAL `node:fs` — this module injects the filesystem and
 * answers with what happened, it does not invent a second naming policy next to the tested one.
 *
 * The lane pattern is v174/v177's: the route (app/api/agent/save-fs) is the only door, this module
 * is the server-side capability, and the browser holds a fetch adapter (saveFsLane.ts) that imports
 * nothing from @nexus/three-runtime. Saves land under `.nexus/scene-saves` — the same `.nexus` the
 * deploy records live in, gitignored since v177.
 */
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { createFsSaveStore, type FsLike, type SaveStore } from '@nexus/three-runtime';

/** Where disk saves live, relative to the studio server's cwd (apps/studio in dev). */
export const STUDIO_SCENE_SAVES_ROOT = '.nexus/scene-saves';

/** The name the panel's disk controls use — the same name the localStorage save writes, so the
 *  two stores hold the same save and either can restore what the other lost. */
export const STUDIO_SCENE_DISK_SAVE_PATH = 'last-saved';

/** The probe's version stamp: the answer shape's owner, named so a client can tell. */
export const STUDIO_SAVE_FS_SERVER_VERSION = 'studio-save-fs-v1';

/**
 * The real `node:fs` as the runtime's `FsLike`. `flushSync` is deliberately absent: node offers no
 * sync fsync through this seam, so a `durable` write is refused by the store's own sentence instead
 * of being silently downgraded. `writeFileSync` creates the parent directory first — a store root
 * is allowed to be the FIRST thing on disk, exactly like the deploy records file since v177.
 */
export const nodeSaveFs: FsLike = {
  writeFileSync(path, data) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
  },
  readFileSync: (path) => readFileSync(path, 'utf8'),
  existsSync: (path) => {
    try {
      statSync(path);
      return true;
    } catch {
      return false;
    }
  },
  unlinkSync: (path) => unlinkSync(path),
  readdirSync: (path) => readdirSync(path),
  statSync: (path) => statSync(path),
  renameSync: (from, to) => renameSync(from, to),
};

export type StudioSaveFs = FsLike;

/** Build the disk store the route serves. Tests inject their own FsLike/root; production is node:fs. */
export function createStudioSceneSaveStore(options: { fs?: StudioSaveFs; root?: string } = {}): SaveStore {
  return createFsSaveStore(options.fs ?? nodeSaveFs, options.root ?? STUDIO_SCENE_SAVES_ROOT);
}

/** What GET answers: whether the disk lane is usable, and what the store already holds. */
export interface SaveFsState {
  available: boolean;
  serverVersion: string;
  /** Present when available: the store root (names are relative to THIS). */
  root?: string;
  /** Present when available: the store's own kind stamp ('fs'). */
  kind?: string;
  /** Present when available: every save name on file, sorted, relative to the root. */
  saves?: string[];
  /** Present when available: saves.length. */
  count?: number;
  /** Present when NOT available: why (the store's own refusal, paraphrased by nobody). */
  reason?: string;
}

export function saveFsState(options: { fs?: StudioSaveFs; root?: string } = {}): SaveFsState {
  let store: SaveStore;
  try {
    store = createStudioSceneSaveStore(options);
  } catch (e) {
    return { available: false, serverVersion: STUDIO_SAVE_FS_SERVER_VERSION, reason: e instanceof Error ? e.message : String(e) };
  }
  try {
    const saves = store.list();
    return {
      available: true,
      serverVersion: STUDIO_SAVE_FS_SERVER_VERSION,
      root: options.root ?? STUDIO_SCENE_SAVES_ROOT,
      kind: store.kind,
      saves,
      count: saves.length,
    };
  } catch (e) {
    return { available: false, serverVersion: STUDIO_SAVE_FS_SERVER_VERSION, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** What a successful write answers: where the bytes landed and how many there are. */
export interface SaveFsWriteAnswer {
  ok: boolean;
  path?: string;
  bytes?: number;
  reason?: string;
}

/**
 * Persist ONE save file under a save name. The file crosses as a JSON-serializable object (the
 * runtime's own save format); a non-object (bare, array, null) is refused BEFORE any byte moves —
 * the same rule the v163 scene.load door holds, and for the same reason: a corrupt save on disk is
 * a lie a later loader has to discover. A refused NAME is refused by the store's own sentence.
 */
export function writeStudioSceneSave(
  request: { path: unknown; file: unknown },
  options: { fs?: StudioSaveFs; root?: string } = {},
): SaveFsWriteAnswer {
  if (typeof request.path !== 'string' || request.path.trim().length === 0) {
    return { ok: false, reason: `a disk save needs a save path (a non-empty string), got ${JSON.stringify(request.path)}` };
  }
  if (typeof request.file !== 'object' || request.file === null || Array.isArray(request.file)) {
    return {
      ok: false,
      reason: `the body's file is ${Array.isArray(request.file) ? 'an array' : typeof request.file}, not a save-file object — nothing was written`,
    };
  }
  let store: SaveStore;
  try {
    store = createStudioSceneSaveStore(options);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  try {
    const contents = JSON.stringify(request.file);
    store.writeAtomic(request.path, contents);
    return { ok: true, path: request.path, bytes: contents.length };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** What a successful read answers: the parsed save file, ready for a loader. */
export interface SaveFsReadAnswer {
  ok: boolean;
  path?: string;
  file?: unknown;
  reason?: string;
}

/**
 * Read ONE save back by name. `null` from the store means the name is not there — an answer, not an
 * error. Bytes that are not JSON, or that parse to something a loader would refuse on sight (bare,
 * array), are refused by name rather than forwarded: the client's loader deserves the store's own
 * diagnosis, not a parse error one seam away from the bytes that caused it.
 */
export function readStudioSceneSave(
  request: { path: unknown },
  options: { fs?: StudioSaveFs; root?: string } = {},
): SaveFsReadAnswer {
  if (typeof request.path !== 'string' || request.path.trim().length === 0) {
    return { ok: false, reason: `a disk read needs a save path (a non-empty string), got ${JSON.stringify(request.path)}` };
  }
  let store: SaveStore;
  try {
    store = createStudioSceneSaveStore(options);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  let contents: string | null;
  try {
    contents = store.read(request.path);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  if (contents === null) {
    return { ok: false, reason: `"${request.path}" is not in the store — there is no save under that name` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return { ok: false, reason: `"${request.path}" does not hold JSON — the bytes on disk are not a save file this build can hand to a loader` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: `"${request.path}" holds ${Array.isArray(parsed) ? 'an array' : typeof parsed}, not a save-file object` };
  }
  return { ok: true, path: request.path, file: parsed };
}

/** What a successful delete answers: whether the name was there to take (the store's own boolean). */
export interface SaveFsDeleteAnswer {
  ok: boolean;
  path?: string;
  deleted?: boolean;
  reason?: string;
}

/**
 * Take ONE save back by name. `false` from the store means the name held nothing — "already gone"
 * is an ANSWER (ok: true, deleted: false), not an error, exactly as the store's contract words it.
 * A refusal to type the name is the caller's to see here; everything else is the store's own.
 */
export function deleteStudioSceneSave(
  request: { path: unknown },
  options: { fs?: StudioSaveFs; root?: string } = {},
): SaveFsDeleteAnswer {
  if (typeof request.path !== 'string' || request.path.trim().length === 0) {
    return { ok: false, reason: `a disk delete needs a save path (a non-empty string), got ${JSON.stringify(request.path)}` };
  }
  let store: SaveStore;
  try {
    store = createStudioSceneSaveStore(options);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  try {
    const deleted = store.delete(request.path);
    return { ok: true, path: request.path, deleted };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** What a successful rename answers: where the bytes ended up (the store's own resolution). */
export interface SaveFsRenameAnswer {
  ok: boolean;
  from?: string;
  to?: string;
  reason?: string;
}

/**
 * Give ONE save a new name. The NEW name is a creation, so it goes through the store's creation
 * rule (`resolveNewSavePath` — no absolute forms, no `..`, no temp-suffix collision); the OLD name
 * must exist, and when it does not the store says so by name. Both sentences arrive as
 * `ok: false` — this module paraphrases nobody.
 */
export function renameStudioSceneSave(
  request: { from: unknown; to: unknown },
  options: { fs?: StudioSaveFs; root?: string } = {},
): SaveFsRenameAnswer {
  if (typeof request.from !== 'string' || request.from.trim().length === 0) {
    return { ok: false, reason: `a disk rename needs a from path (a non-empty string), got ${JSON.stringify(request.from)}` };
  }
  if (typeof request.to !== 'string' || request.to.trim().length === 0) {
    return { ok: false, reason: `a disk rename needs a to path (a non-empty string), got ${JSON.stringify(request.to)}` };
  }
  let store: SaveStore;
  try {
    store = createStudioSceneSaveStore(options);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  try {
    const to = store.rename(request.from, request.to);
    return { ok: true, from: request.from, to };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
