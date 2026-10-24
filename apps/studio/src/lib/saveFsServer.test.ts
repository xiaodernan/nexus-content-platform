import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import type { FsLike } from '@nexus/three-runtime';

import {
  STUDIO_SAVE_FS_SERVER_VERSION,
  STUDIO_SCENE_DISK_SAVE_PATH,
  STUDIO_SCENE_SAVES_ROOT,
  createStudioSceneSaveStore,
  deleteStudioSceneSave,
  nodeSaveFs,
  readStudioSceneSave,
  renameStudioSceneSave,
  saveFsState,
  writeStudioSceneSave,
} from './saveFsServer';
import { STUDIO_WORLD_SAVE_SERVER_VERSION } from './worldSaveServer';

/** Minimal in-memory FsLike — the store never knows it is not node:fs. Root join is by string,
 *  exactly like the real store does it. */
function memFs() {
  const files = new Map<string, string>();
  const fs: FsLike = {
    writeFileSync(path, data) {
      files.set(path, data);
    },
    readFileSync(path) {
      const value = files.get(path);
      if (value === undefined) throw new Error(`ENOENT: ${path}`);
      return value;
    },
    existsSync(path) {
      if (files.has(path)) return true;
      const prefix = `${path}/`;
      return [...files.keys()].some((key) => key.startsWith(prefix)); // directories exist as parents
    },
    unlinkSync(path) {
      files.delete(path);
    },
    readdirSync(path) {
      const prefix = `${path}/`;
      const names = new Set<string>();
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) {
          const first = key.slice(prefix.length).split('/')[0];
          if (first !== undefined) names.add(first);
        }
      }
      return [...names];
    },
    statSync(path) {
      const isFile = files.has(path);
      const prefix = `${path}/`;
      const hasChildren = [...files.keys()].some((key) => key.startsWith(prefix));
      return { isDirectory: () => !isFile && hasChildren, isFile: () => isFile };
    },
    renameSync(from, to) {
      const value = files.get(from);
      if (value === undefined) throw new Error(`ENOENT: ${from}`);
      files.delete(from);
      files.set(to, value);
    },
  };
  return { fs, files };
}

const SAVE_FILE = { format: 'nexus-three-runtime-save', version: 1, savedAt: 12, entities: [{ id: 'a' }] };

describe('studio disk save lane facts (v184)', () => {
  it('pins the lane as data: the saves root is the gitignored .nexus, the disk save is last-saved, and nodeSaveFs offers NO flushSync (a durable ask is refused, not downgraded)', () => {
    expect(STUDIO_SCENE_SAVES_ROOT).toBe('.nexus/scene-saves');
    expect(STUDIO_SCENE_DISK_SAVE_PATH).toBe('last-saved');
    expect(createStudioSceneSaveStore().kind).toBe('fs');
    expect(nodeSaveFs.flushSync).toBeUndefined();
  });

  it('write → probe → read round-trips one save file through the store', () => {
    const { fs } = memFs();
    const options = { fs, root: 'studio-saves' };
    const write = writeStudioSceneSave({ path: STUDIO_SCENE_DISK_SAVE_PATH, file: SAVE_FILE }, options);
    expect(write.ok).toBe(true);
    expect(write.path).toBe('last-saved');
    expect(write.bytes).toBe(JSON.stringify(SAVE_FILE).length);

    const probe = saveFsState(options);
    expect(probe.available).toBe(true);
    expect(probe.kind).toBe('fs');
    expect(probe.root).toBe('studio-saves');
    expect(probe.saves).toEqual(['last-saved']);
    expect(probe.count).toBe(1);

    const read = readStudioSceneSave({ path: STUDIO_SCENE_DISK_SAVE_PATH }, options);
    expect(read.ok).toBe(true);
    expect(read.file).toEqual(SAVE_FILE);
  });

  it("a refused NAME is refused by the store's own sentence — this module paraphrases nobody", () => {
    const { fs } = memFs();
    const options = { fs, root: 'studio-saves' };
    const absolute = writeStudioSceneSave({ path: 'C:/escape.json', file: SAVE_FILE }, options);
    expect(absolute.ok).toBe(false);
    expect(absolute.reason).toContain('absolute path');
    const traversal = writeStudioSceneSave({ path: 'a/../escape.json', file: SAVE_FILE }, options);
    expect(traversal.ok).toBe(false);
    expect(traversal.reason).toContain('walks out');
    const probe = saveFsState(options);
    expect(probe.saves).toEqual([]);
  });

  it('a non-object file is refused BEFORE any byte moves (the v163 door rule, one seam over)', () => {
    const { fs, files } = memFs();
    const options = { fs, root: 'studio-saves' };
    for (const file of [null, [1, 2], 'a string', 42]) {
      const answer = writeStudioSceneSave({ path: 'last-saved', file }, options);
      expect(answer.ok).toBe(false);
      expect(answer.reason).toContain('not a save-file object');
      expect(answer.reason).toContain('nothing was written');
    }
    expect(files.size).toBe(0);
  });

  it('read tells its three failures apart by name: missing, not-JSON, and parses-but-not-an-object', () => {
    const { fs, files } = memFs();
    const options = { fs, root: 'studio-saves' };
    const missing = readStudioSceneSave({ path: 'nowhere' }, options);
    expect(missing.ok).toBe(false);
    expect(missing.reason).toContain('no save under that name');
    writeStudioSceneSave({ path: 'garbage', file: { a: 1 } }, options);
    files.set('studio-saves/garbage', 'not json at all');
    const garbage = readStudioSceneSave({ path: 'garbage' }, options);
    expect(garbage.ok).toBe(false);
    expect(garbage.reason).toContain('does not hold JSON');
    files.set('studio-saves/garbage', '[1,2]');
    const bare = readStudioSceneSave({ path: 'garbage' }, options);
    expect(bare.ok).toBe(false);
    expect(bare.reason).toContain('holds an array');
  });

  it('a host missing capabilities is named one capability at a time: no readdir → no listing; no renameSync → no atomic write', () => {
    const minimal: FsLike = {
      writeFileSync: () => {},
      readFileSync: () => '',
      existsSync: () => false,
    };
    const options = { fs: minimal, root: 'studio-saves' };
    const probe = saveFsState(options);
    expect(probe.available).toBe(false);
    expect(probe.reason).toContain('readdirSync');
    const write = writeStudioSceneSave({ path: 'last-saved', file: SAVE_FILE }, options);
    expect(write.ok).toBe(false);
    expect(write.reason).toContain('renameSync');
    expect(write.reason).toContain('nothing was written');
  });

  it('the production nodeSaveFs really lands bytes on disk — nested root included (tmpdir round trip)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'studio-save-fs-'));
    try {
      const root = join(dir, 'nested', 'saves'); // the root is allowed to be the FIRST thing on disk
      const write = writeStudioSceneSave({ path: STUDIO_SCENE_DISK_SAVE_PATH, file: SAVE_FILE }, { root });
      expect(write.ok).toBe(true);
      expect(existsSync(join(root, STUDIO_SCENE_DISK_SAVE_PATH))).toBe(true);
      const read = readStudioSceneSave({ path: STUDIO_SCENE_DISK_SAVE_PATH }, { root });
      expect(read.ok).toBe(true);
      expect(read.file).toEqual(SAVE_FILE);
      expect(saveFsState({ root }).saves).toEqual([STUDIO_SCENE_DISK_SAVE_PATH]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('studio disk delete/rename facts (v186)', () => {
  it('delete answers the store’s own boolean: true when taken, false when the name held nothing', () => {
    const { fs } = memFs();
    const options = { fs, root: 'studio-saves' };
    writeStudioSceneSave({ path: STUDIO_SCENE_DISK_SAVE_PATH, file: SAVE_FILE }, options);
    const taken = deleteStudioSceneSave({ path: STUDIO_SCENE_DISK_SAVE_PATH }, options);
    expect(taken.ok).toBe(true);
    expect(taken.deleted).toBe(true);
    expect(saveFsState(options).saves).toEqual([]);
    const again = deleteStudioSceneSave({ path: STUDIO_SCENE_DISK_SAVE_PATH }, options);
    expect(again.ok).toBe(true);
    expect(again.deleted).toBe(false); // "already gone" is an answer, not an error
  });

  it('rename moves the bytes: the new name lists, the old name is gone, the file reads back intact', () => {
    const { fs } = memFs();
    const options = { fs, root: 'studio-saves' };
    writeStudioSceneSave({ path: STUDIO_SCENE_DISK_SAVE_PATH, file: SAVE_FILE }, options);
    const renamed = renameStudioSceneSave({ from: STUDIO_SCENE_DISK_SAVE_PATH, to: 'renamed-save' }, options);
    expect(renamed.ok).toBe(true);
    expect(renamed.from).toBe(STUDIO_SCENE_DISK_SAVE_PATH);
    expect(renamed.to).toBe('renamed-save');
    expect(saveFsState(options).saves).toEqual(['renamed-save']);
    const read = readStudioSceneSave({ path: 'renamed-save' }, options);
    expect(read.ok).toBe(true);
    expect(read.file).toEqual(SAVE_FILE);
  });

  it('a rename whose OLD name holds nothing is refused by the store’s own sentence', () => {
    const { fs } = memFs();
    const options = { fs, root: 'studio-saves' };
    const answer = renameStudioSceneSave({ from: 'nowhere', to: 'somewhere' }, options);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('"nowhere" does not exist');
    expect(saveFsState(options).saves).toEqual([]);
  });

  it('the NEW name is a creation: absolute forms, traversal and the temp suffix are refused by the store’s rule, and nothing moved', () => {
    const { fs, files } = memFs();
    const options = { fs, root: 'studio-saves' };
    writeStudioSceneSave({ path: 'keep', file: SAVE_FILE }, options);
    const absolute = renameStudioSceneSave({ from: 'keep', to: 'C:/escape.json' }, options);
    expect(absolute.ok).toBe(false);
    expect(absolute.reason).toContain('absolute path');
    const traversal = renameStudioSceneSave({ from: 'keep', to: 'a/../escape.json' }, options);
    expect(traversal.ok).toBe(false);
    expect(traversal.reason).toContain('walks out');
    const temp = renameStudioSceneSave({ from: 'keep', to: 'escape.json.tmp' }, options);
    expect(temp.ok).toBe(false);
    expect(temp.reason).toContain('temp suffix');
    expect(saveFsState(options).saves).toEqual(['keep']); // every refusal left the save where it was
    expect([...files.keys()].filter((key) => key.includes('escape'))).toEqual([]);
  });

  it('a non-string path is refused before any store call — one sentence per missing half', () => {
    const { fs } = memFs();
    const options = { fs, root: 'studio-saves' };
    const badDelete = deleteStudioSceneSave({ path: 42 }, options);
    expect(badDelete.ok).toBe(false);
    expect(badDelete.reason).toContain('a disk delete needs a save path');
    const badTo = renameStudioSceneSave({ from: 'a', to: null }, options);
    expect(badTo.ok).toBe(false);
    expect(badTo.reason).toContain('a disk rename needs a to path');
    const badFrom = renameStudioSceneSave({ from: undefined, to: 'b' }, options);
    expect(badFrom.ok).toBe(false);
    expect(badFrom.reason).toContain('a disk rename needs a from path');
  });
});


/**
 * v471 — the scene-save probe’s VERSION STAMP, graded directly.
 *
 * The scene lane’s probe carries `STUDIO_SAVE_FS_SERVER_VERSION` on every answer so a client can
 * tell which build spoke, and the probe cases read the state but never asked about the stamp. The
 * world lane’s stamp was graded at v470; this is the same question on the other side of the pair.
 */
describe('the scene-save probe’s version stamp (v471)', () => {
  it('the stamp rides BOTH answers — available or not, a client can tell which build spoke', () => {
    const ok = saveFsState({ fs: memFs().fs });
    expect(ok.available).toBe(true);
    expect(ok.serverVersion).toBe(STUDIO_SAVE_FS_SERVER_VERSION);
    const down = saveFsState({ fs: memFs().fs, root: '../elsewhere' });
    expect(down.available).toBe(false);
    expect(down.serverVersion).toBe(STUDIO_SAVE_FS_SERVER_VERSION);
    expect(down.reason).toContain('walks out');
  });

  it('the stamp names its own lane and its build — a client reads both off it', () => {
    expect(STUDIO_SAVE_FS_SERVER_VERSION).toContain('studio-save-fs');
    expect(STUDIO_SAVE_FS_SERVER_VERSION).toMatch(/v\d+$/);
    expect(STUDIO_SAVE_FS_SERVER_VERSION.length).toBeGreaterThan(0);
  });

  it('the two disk lanes’ stamps are DIFFERENT words — the scene probe and the world probe cannot be mistaken', () => {
    expect(STUDIO_SAVE_FS_SERVER_VERSION).not.toBe(STUDIO_WORLD_SAVE_SERVER_VERSION);
  });

  it('the stamp rides the PROBE, not the write/read/delete/rename answers — each answer keeps its own shape', () => {
    const { fs } = memFs();
    const options = { fs, root: 'studio-saves' };
    const written = writeStudioSceneSave({ path: STUDIO_SCENE_DISK_SAVE_PATH, file: SAVE_FILE }, options);
    expect(written.ok).toBe(true);
    expect('serverVersion' in written).toBe(false);
    const read = readStudioSceneSave({ path: STUDIO_SCENE_DISK_SAVE_PATH }, options);
    expect(read.ok).toBe(true);
    expect('serverVersion' in read).toBe(false);
    const renamed = renameStudioSceneSave({ from: STUDIO_SCENE_DISK_SAVE_PATH, to: 'renamed-save' }, options);
    expect(renamed.ok).toBe(true);
    expect('serverVersion' in renamed).toBe(false);
    const deleted = deleteStudioSceneSave({ path: 'renamed-save' }, options);
    expect(deleted.ok).toBe(true);
    expect('serverVersion' in deleted).toBe(false);
  });
});


/**
 * v509 (ADR 0016 amendment 502) — WHOSE fault a failed disk ask is: the ask, or the machine.
 *
 * Until now every failure on this lane answered the same way — `ok: false` plus a sentence — and the
 * route above turned every one of them into a 400. But the sentences are two different truths: a name
 * the store refuses is the CALLER’s to see, and a disk that says EACCES is the machine’s. The answers
 * now carry the kind (doorFailure.ts), and the door derives its status from it: 400 for the ask, 503
 * for the machine. The device errors below are injected the way node:fs really throws — with a `code`
 * of their own — and the rename case is the store’s own wrapper, which keeps the failed syscall’s
 * words and drops its field.
 */
describe('the disk lane says WHOSE fault it was (v509)', () => {
  it('a device error is the machine’s — the raw fs sentence rides the answer with the kind that earns a 503', () => {
    const { fs } = memFs();
    const broken: FsLike = {
      ...fs,
      writeFileSync: () => {
        throw Object.assign(new Error("EACCES: permission denied, open 'studio-saves/last-saved.tmp'"), { code: 'EACCES' });
      },
    };
    const write = writeStudioSceneSave({ path: 'last-saved', file: SAVE_FILE }, { fs: broken, root: 'studio-saves' });
    expect(write.ok).toBe(false);
    expect(write.failure).toBe('the-machine');
    expect(write.reason).toContain('EACCES');
  });

  it('a failed RENAME is the machine’s too — the store kept the failed syscall’s words and dropped its code, and the classifier still knows', () => {
    const { fs, files } = memFs();
    const broken: FsLike = {
      ...fs,
      renameSync: () => {
        throw Object.assign(new Error('ENOSPC: no space left on device, rename'), { code: 'ENOSPC' });
      },
    };
    const write = writeStudioSceneSave({ path: 'last-saved', file: SAVE_FILE }, { fs: broken, root: 'studio-saves' });
    expect(write.ok).toBe(false);
    expect(write.failure).toBe('the-machine');
    expect(write.reason).toContain('renaming');
    expect(write.reason).toContain('ENOSPC');
    expect(files.has('studio-saves/last-saved.tmp'), 'the store cleaned its own temp up').toBe(false);
  });

  it('a refused NAME is the ask — the store’s own sentence, and the kind that earns a 400', () => {
    const { fs } = memFs();
    const options = { fs, root: 'studio-saves' };
    const write = writeStudioSceneSave({ path: 'C:/escape.json', file: SAVE_FILE }, options);
    expect(write.ok).toBe(false);
    expect(write.failure).toBe('the-ask');
    expect(write.reason).toContain('absolute path');
    const deleted = deleteStudioSceneSave({ path: 'C:/escape.json' }, options);
    expect(deleted.failure).toBe('the-ask');
    const renamed = renameStudioSceneSave({ from: 'a', to: 'C:/escape.json' }, options);
    expect(renamed.failure).toBe('the-ask');
  });

  it('a store that cannot be BUILT is the machine’s — this server’s own root, never the caller’s ask', () => {
    const { fs } = memFs();
    const bad = { fs, root: '../elsewhere' };
    const write = writeStudioSceneSave({ path: 'last-saved', file: SAVE_FILE }, bad);
    expect(write.ok).toBe(false);
    expect(write.failure).toBe('the-machine');
    expect(write.reason).toContain('walks out');
    const read = readStudioSceneSave({ path: 'last-saved' }, bad);
    expect(read.failure).toBe('the-machine');
    const deleted = deleteStudioSceneSave({ path: 'last-saved' }, bad);
    expect(deleted.failure).toBe('the-machine');
    const renamed = renameStudioSceneSave({ from: 'a', to: 'b' }, bad);
    expect(renamed.failure).toBe('the-machine');
  });

  it('a missing save names NO kind — “not there” is an answer about the name, and doorFailure reads no kind as the ask', () => {
    const { fs } = memFs();
    const read = readStudioSceneSave({ path: 'nowhere' }, { fs, root: 'studio-saves' });
    expect(read.ok).toBe(false);
    expect(read.failure).toBeUndefined();
    expect(read.reason).toContain('is not in the store');
  });
});
