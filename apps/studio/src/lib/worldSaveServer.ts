/**
 * M4 v191 (ADR 0016 amendment 191): the SERVER half of the world panel's disk-persistence face —
 * the same shape the 3D panel's save lane took in v184, pointed at the world engine. The browser
 * holds the LIVE engine (WorldPanel composes it), the engine's own `save()` produces the file and
 * its own `load()` consumes it; this module is only the disk between them. Every naming decision
 * (no absolute forms, no `..`, no backslash, no temp suffix on creation) is made by the runtime's
 * `createFsSaveStore` over the REAL `node:fs` — the same tested store the scene lane rides — so no
 * second naming policy is invented next to it. One world-specific rule lives here, stated once:
 * a file that does not carry an object `world` is not a world save, and is refused by name BEFORE
 * bytes move (write) or BEFORE it reaches the loader (read) — the engine's loader deserves a file
 * it can actually parse, not a TypeError one seam away from the bytes that caused it.
 *
 * The lane pattern is v174/v177/v184's: the route (app/api/agent/world-saves) is the only door,
 * this module is the server-side capability, and the browser holds a fetch adapter
 * (worldSaveLane.ts) that imports nothing from @nexus/three-runtime or node:fs. World saves land
 * under `.nexus/world-saves` — the same gitignored `.nexus` the scene saves and the deploy
 * records live in.
 */
import { createFsSaveStore, type FsLike, type SaveStore } from '@nexus/three-runtime';

import { nodeSaveFs } from './saveFsServer';

import { askFailureKindOf, type AskFailureKind } from './doorFailure';

/** Where world saves live, relative to the studio server's cwd (apps/studio in dev). */
export const STUDIO_WORLD_SAVES_ROOT = '.nexus/world-saves';

/** The name the panel's disk controls write and read by default. */
export const STUDIO_WORLD_DISK_SAVE_PATH = 'world-saved';

/** The probe's version stamp: the answer shape's owner, named so a client can tell. */
export const STUDIO_WORLD_SAVE_SERVER_VERSION = 'studio-world-save-v1';

/** Build the disk store the route serves. Tests inject their own FsLike/root; production is node:fs. */
export function createStudioWorldSaveStore(options: { fs?: FsLike; root?: string } = {}): SaveStore {
  return createFsSaveStore(options.fs ?? nodeSaveFs, options.root ?? STUDIO_WORLD_SAVES_ROOT);
}

/** The one world-specific shape rule, stated in one place for both directions. */
function worldShapeRefusal(file: unknown): string | null {
  if (typeof file !== 'object' || file === null || Array.isArray(file)) {
    return `the body's file is ${Array.isArray(file) ? 'an array' : typeof file}, not a world-save object — nothing was written`;
  }
  const world = (file as { world?: unknown }).world;
  if (world === undefined || world === null) {
    return `the file carries no world — the engine's loader would refuse it, so nothing was written`;
  }
  if (typeof world !== 'object' || Array.isArray(world)) {
    return `the file carries ${Array.isArray(world) ? 'an array where the world should be' : `a ${typeof world} where the world should be`} — the engine's loader would refuse it, so nothing was written`;
  }
  return null;
}

/** What GET answers: whether the disk lane is usable, and what the store already holds. */
export interface WorldSaveState {
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

export function worldSaveState(options: { fs?: FsLike; root?: string } = {}): WorldSaveState {
  let store: SaveStore;
  try {
    store = createStudioWorldSaveStore(options);
  } catch (e) {
    return { available: false, serverVersion: STUDIO_WORLD_SAVE_SERVER_VERSION, reason: e instanceof Error ? e.message : String(e) };
  }
  try {
    const saves = store.list();
    return {
      available: true,
      serverVersion: STUDIO_WORLD_SAVE_SERVER_VERSION,
      root: options.root ?? STUDIO_WORLD_SAVES_ROOT,
      kind: store.kind,
      saves,
      count: saves.length,
    };
  } catch (e) {
    return { available: false, serverVersion: STUDIO_WORLD_SAVE_SERVER_VERSION, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** What a successful write answers: where the bytes landed and how many there are. */
export interface WorldSaveWriteAnswer {
  ok: boolean;
  /**
   * v509: which kind of “no” this is, when ok is false — the ask (a 400) or the machine (a 503).
   * Absent on a refused ask: doorFailure.ts reads an answer that names no kind as the ask.
   */
  failure?: AskFailureKind;
  path?: string;
  bytes?: number;
  reason?: string;
}

/**
 * Persist ONE world save under a save name. The file crosses as a JSON-serializable object —
 * what the engine's own `save()` produced, parsed back by the panel so it crosses the fetch
 * boundary as JSON. A non-object, or an object with no world in it, is refused BEFORE any byte
 * moves; a refused NAME is refused by the store's own sentence.
 */
export function writeWorldSave(
  request: { path: unknown; file: unknown },
  options: { fs?: FsLike; root?: string } = {},
): WorldSaveWriteAnswer {
  if (typeof request.path !== 'string' || request.path.trim().length === 0) {
    return { ok: false, reason: `a world save needs a save path (a non-empty string), got ${JSON.stringify(request.path)}` };
  }
  const shape = worldShapeRefusal(request.file);
  if (shape) return { ok: false, reason: shape };
  let store: SaveStore;
  try {
    store = createStudioWorldSaveStore(options);
  } catch (e) {
    // v509: the store could not even be BUILT — that is this server’s own configuration, never
    // the caller’s ask, so the kind is the machine’s and the door answers 503 for it.
    return { ok: false, reason: e instanceof Error ? e.message : String(e), failure: 'the-machine' };
  }
  try {
    const contents = JSON.stringify(request.file);
    store.writeAtomic(request.path, contents);
    return { ok: true, path: request.path, bytes: contents.length };
  } catch (e) {
    // v509: the store threw. A refused NAME is the ask; a device error (ENOSPC, EACCES, the
    // rename wrapper) is the machine. The classifier reads the difference off the error, and the
    // door derives its status from the kind instead of answering 400 for both.
    return { ok: false, reason: e instanceof Error ? e.message : String(e), failure: askFailureKindOf(e) };
  }
}

/** What a successful read answers: the parsed save file, ready for the engine's own loader. */
export interface WorldSaveReadAnswer {
  ok: boolean;
  /**
   * v509: which kind of “no” this is, when ok is false — the ask (a 400) or the machine (a 503).
   * Absent on a refused ask: doorFailure.ts reads an answer that names no kind as the ask.
   */
  failure?: AskFailureKind;
  path?: string;
  file?: unknown;
  reason?: string;
}

/**
 * Read ONE world save back by name. `null` from the store means the name is not there — an
 * answer, not an error. Bytes that are not JSON, that parse to a bare value or an array, or that
 * carry no world are refused by name rather than forwarded: the engine's `load()` deserves the
 * store's own diagnosis, not a TypeError one seam away from the bytes that caused it.
 */
export function readWorldSave(
  request: { path: unknown },
  options: { fs?: FsLike; root?: string } = {},
): WorldSaveReadAnswer {
  if (typeof request.path !== 'string' || request.path.trim().length === 0) {
    return { ok: false, reason: `a world read needs a save path (a non-empty string), got ${JSON.stringify(request.path)}` };
  }
  let store: SaveStore;
  try {
    store = createStudioWorldSaveStore(options);
  } catch (e) {
    // v509: the store could not even be BUILT — that is this server’s own configuration, never
    // the caller’s ask, so the kind is the machine’s and the door answers 503 for it.
    return { ok: false, reason: e instanceof Error ? e.message : String(e), failure: 'the-machine' };
  }
  let contents: string | null;
  try {
    contents = store.read(request.path);
  } catch (e) {
    // v509: the store threw. A refused NAME is the ask; a device error (ENOSPC, EACCES, the
    // rename wrapper) is the machine. The classifier reads the difference off the error, and the
    // door derives its status from the kind instead of answering 400 for both.
    return { ok: false, reason: e instanceof Error ? e.message : String(e), failure: askFailureKindOf(e) };
  }
  if (contents === null) {
    return { ok: false, reason: `"${request.path}" is not in the store — there is no world save under that name` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return { ok: false, reason: `"${request.path}" does not hold JSON — the bytes on disk are not a world save this build can hand to a loader` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: `"${request.path}" holds ${Array.isArray(parsed) ? 'an array' : typeof parsed}, not a world-save object` };
  }
  const world = (parsed as { world?: unknown }).world;
  if (typeof world !== 'object' || world === null || Array.isArray(world)) {
    return { ok: false, reason: `"${request.path}" carries no world — the engine's loader would refuse it` };
  }
  return { ok: true, path: request.path, file: parsed };
}
