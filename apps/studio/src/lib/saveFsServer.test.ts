import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import type { FsLike } from '@nexus/three-runtime';

import {
  STUDIO_SCENE_DISK_SAVE_PATH,
  STUDIO_SCENE_SAVES_ROOT,
  createStudioSceneSaveStore,
  nodeSaveFs,
  readStudioSceneSave,
  saveFsState,
  writeStudioSceneSave,
} from './saveFsServer';

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