import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WorldEngine } from '@nexus/world-engine';
import { describe, expect, it } from 'vitest';
import type { FsLike } from '@nexus/three-runtime';

import {
  STUDIO_WORLD_DISK_SAVE_PATH,
  STUDIO_WORLD_SAVES_ROOT,
  createStudioWorldSaveStore,
  readWorldSave,
  worldSaveState,
  writeWorldSave,
} from './worldSaveServer';
import { nodeSaveFs } from './saveFsServer';
import { buildStudioWorld } from './world';

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

/** A plausible engine save file: what WorldEngine.save() produces, parsed. */
const WORLD_SAVE_FILE = {
  world: {
    name: 'New World',
    genre: 'fantasy',
    characters: [],
    locations: [],
    factions: [],
    lore: [],
    timeline: [],
  },
  config: { ragEnabled: true },
  currentTick: 3,
};

describe('studio world save lane facts (v191)', () => {
  it('pins the lane as data: the saves root is the gitignored .nexus, the disk save is world-saved, and the store is the runtime fs store', () => {
    expect(STUDIO_WORLD_SAVES_ROOT).toBe('.nexus/world-saves');
    expect(STUDIO_WORLD_DISK_SAVE_PATH).toBe('world-saved');
    expect(createStudioWorldSaveStore().kind).toBe('fs');
    expect(nodeSaveFs.flushSync).toBeUndefined();
  });

  it('write → probe → read round-trips one world save through the store', () => {
    const { fs } = memFs();
    const options = { fs, root: 'studio-world-saves' };
    const write = writeWorldSave({ path: STUDIO_WORLD_DISK_SAVE_PATH, file: WORLD_SAVE_FILE }, options);
    expect(write.ok).toBe(true);
    expect(write.path).toBe('world-saved');
    expect(write.bytes).toBe(JSON.stringify(WORLD_SAVE_FILE).length);

    const probe = worldSaveState(options);
    expect(probe.available).toBe(true);
    expect(probe.kind).toBe('fs');
    expect(probe.root).toBe('studio-world-saves');
    expect(probe.saves).toEqual(['world-saved']);
    expect(probe.count).toBe(1);

    const read = readWorldSave({ path: STUDIO_WORLD_DISK_SAVE_PATH }, options);
    expect(read.ok).toBe(true);
    expect(read.file).toEqual(WORLD_SAVE_FILE);
  });

  it("a refused NAME is refused by the store's own sentence — this module paraphrases nobody", () => {
    const { fs } = memFs();
    const options = { fs, root: 'studio-world-saves' };
    const absolute = writeWorldSave({ path: 'C:/escape.json', file: WORLD_SAVE_FILE }, options);
    expect(absolute.ok).toBe(false);
    expect(absolute.reason).toContain('absolute path');
    const traversal = writeWorldSave({ path: 'a/../escape.json', file: WORLD_SAVE_FILE }, options);
    expect(traversal.ok).toBe(false);
    expect(traversal.reason).toContain('walks out');
    const probe = worldSaveState(options);
    expect(probe.saves).toEqual([]);
  });

  it('a non-object file is refused BEFORE any byte moves', () => {
    const { fs, files } = memFs();
    const options = { fs, root: 'studio-world-saves' };
    for (const file of [null, [1, 2], 'a string', 42]) {
      const answer = writeWorldSave({ path: 'world-saved', file }, options);
      expect(answer.ok).toBe(false);
      expect(answer.reason).toContain('not a world-save object');
      expect(answer.reason).toContain('nothing was written');
    }
    expect(files.size).toBe(0);
  });

  it('a file with no world in it is refused BEFORE any byte moves — the loader would refuse it, so the lane does first', () => {
    const { fs, files } = memFs();
    const options = { fs, root: 'studio-world-saves' };
    for (const [file, word] of [
      [{ config: {} }, 'no world'],
      [{ world: 'not an object' }, 'a string where the world should be'],
      [{ world: ['an', 'array'] }, 'an array where the world should be'],
      [{ world: null }, 'no world'],
    ] as const) {
      const answer = writeWorldSave({ path: 'world-saved', file }, options);
      expect(answer.ok).toBe(false);
      expect(answer.reason).toContain(word);
      expect(answer.reason).toContain('nothing was written');
    }
    expect(files.size).toBe(0);
  });

  it('read tells its failures apart by name: missing, not-JSON, parses-but-not-an-object, and carries-no-world', () => {
    const { fs, files } = memFs();
    const options = { fs, root: 'studio-world-saves' };
    const missing = readWorldSave({ path: 'nowhere' }, options);
    expect(missing.ok).toBe(false);
    expect(missing.reason).toContain('no world save under that name');
    writeWorldSave({ path: 'garbage', file: WORLD_SAVE_FILE }, options);
    files.set('studio-world-saves/garbage', 'not json at all');
    const notJson = readWorldSave({ path: 'garbage' }, options);
    expect(notJson.ok).toBe(false);
    expect(notJson.reason).toContain('does not hold JSON');
    files.set('studio-world-saves/bare', JSON.stringify([1, 2, 3]));
    const array = readWorldSave({ path: 'bare' }, options);
    expect(array.ok).toBe(false);
    expect(array.reason).toContain('holds an array, not a world-save object');
    files.set('studio-world-saves/worldless', JSON.stringify({ config: {} }));
    const worldless = readWorldSave({ path: 'worldless' }, options);
    expect(worldless.ok).toBe(false);
    expect(worldless.reason).toContain('carries no world');
  });

  it('round-trips the REAL engine save file: compose → save → write → read → load is lossless', async () => {
    const { fs } = memFs();
    const options = { fs, root: 'studio-world-saves' };
    const engine = new WorldEngine({ ragEnabled: true, autoSaveInterval: 0, ragScoreThreshold: 0.02 });
    buildStudioWorld(engine);
    const before = engine.getStats();

    const written = writeWorldSave({ path: STUDIO_WORLD_DISK_SAVE_PATH, file: JSON.parse(engine.save()) }, options);
    expect(written.ok).toBe(true);

    const read = readWorldSave({ path: STUDIO_WORLD_DISK_SAVE_PATH }, options);
    expect(read.ok).toBe(true);

    const restored = new WorldEngine({ ragEnabled: true, autoSaveInterval: 0, ragScoreThreshold: 0.02 });
    restored.load(JSON.stringify(read.file));
    expect(restored.getStats()).toEqual(before);
  });

  it('lands a REAL file when given the REAL filesystem (tmpdir round trip)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'world-saves-'));
    try {
      const options = { root: dir };
      const written = writeWorldSave({ path: 'world-saved', file: WORLD_SAVE_FILE }, options);
      expect(written.ok).toBe(true);
      const onDisk = join(dir, 'world-saved');
      expect(existsSync(onDisk)).toBe(true);
      const parsed = JSON.parse(readFileSync(onDisk, 'utf8')) as { world?: unknown };
      expect(parsed.world).toEqual(WORLD_SAVE_FILE.world);
      const read = readWorldSave({ path: 'world-saved' }, options);
      expect(read.ok).toBe(true);
      expect(read.file).toEqual(WORLD_SAVE_FILE);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
