import { describe, expect, it } from 'vitest';
import { createFsSaveStore, createMemorySaveStore, resolveNewSavePath, resolveSavePath, SAVE_TEMP_SUFFIX, type FsLike } from '../src/saveStore.js';

/**
 * M5 v-next: one name may not play two roles.
 *
 * `writeAtomic(path)` puts its half-written file at `${path}${SAVE_TEMP_SUFFIX}`, and `sweepTempFiles` deletes
 * every listed name ending in that suffix. Until this grant `resolveSavePath` — the boundary every path crosses —
 * checked absolute forms, `..`, `''` and `.` and said nothing about the suffix, so `x.json.tmp` was a legal SAVE
 * name that was also the temp of the save called `x.json`. `.scratch/vnext/collisionProbe.mjs` measured what that
 * costs: write the first save, then atomically write the shorter one, and the temp replaces the first save's bytes
 * and is renamed away — one call, two saves gone, `list()` reporting nothing, no error thrown.
 *
 * The rule is on CREATION, not on existence, and the cases below test that narrowness in both directions rather
 * than only the refusal: a leftover the host already holds stays listable, readable and deletable, because a
 * runtime that browses its own store would otherwise crash on debris instead of classifying it.
 *
 * Every expectation here is derived from `SAVE_TEMP_SUFFIX`, so the day the suffix changes these cases move with
 * it instead of repeating it.
 */

const SAVE = '{"format":"nexus-three-runtime-save","savedAt":7,"note":"a real save"}';
const OTHER = '{"format":"nexus-three-runtime-save","savedAt":9,"note":"a different save"}';
const DEBRIS_NAME = `x.json${SAVE_TEMP_SUFFIX}`;
const COLLIDING_SAVE = 'x.json';

/** A host with every capability plus an `ops` log, so a case can say what actually moved. */
function host() {
  const tree = new Map<string, string>();
  const ops: string[] = [];
  const fs: FsLike = {
    writeFileSync: (p, data) => { ops.push(`write:${p}`); tree.set(p, data); },
    readFileSync: (p) => tree.get(p) ?? '',
    existsSync: (p) => tree.has(p) || p === 'saves/root',
    unlinkSync: (p) => { ops.push(`unlink:${p}`); tree.delete(p); },
    renameSync: (from, to) => { ops.push(`rename:${from}->${to}`); tree.set(to, tree.get(from) ?? ''); tree.delete(from); },
    readdirSync: (p) => [...new Set([...tree.keys()].filter((k) => k.startsWith(`${p}/`)).map((k) => k.slice(p.length + 1).split('/')[0]!))],
    statSync: (p) => ({ isDirectory: () => p === 'saves/root' || [...tree.keys()].some((k) => k.startsWith(`${p}/`)), isFile: () => tree.has(p) }),
  };
  return { fs, tree, ops, store: createFsSaveStore(fs, 'saves/root') };
}

const refusal = (fn: () => unknown): string => {
  try { fn(); return ''; } catch (e) { return (e as Error).message; }
};

describe('saveStore: a save may not be created on a name debris owns (v-next)', () => {
  it('creation refuses a name that is another save half-written file, and says which save it would land on', () => {
    expect(() => resolveNewSavePath(DEBRIS_NAME)).toThrow(/ends in the temp suffix/);
    const message = refusal(() => resolveNewSavePath(DEBRIS_NAME));
    expect(message, 'the refusal names the save whose temp this is, not just that a suffix is bad').toContain(`writeAtomic("${COLLIDING_SAVE}")`);
    expect(message).toContain(DEBRIS_NAME);
  });

  it('a name that is nothing but the suffix is refused too, admitting the save it collides with is not a name', () => {
    expect(refusal(() => resolveNewSavePath(SAVE_TEMP_SUFFIX))).toContain('not a save either');
  });

  it('the rule is a suffix, not a substring: names that merely contain it stay legal', () => {
    for (const legal of [`a${SAVE_TEMP_SUFFIX}.json`, 'tmp.json', `progress${SAVE_TEMP_SUFFIX}2`, `${COLLIDING_SAVE}.tmp.bak`]) {
      expect(resolveNewSavePath(legal), `${legal} is not the temp of anything`).toBe(legal);
    }
  });

  it('the narrowness is real: the same name still passes the boundary that reading and deleting use', () => {
    expect(resolveSavePath(DEBRIS_NAME), 'resolveSavePath is confinement, and confinement still passes').toBe(DEBRIS_NAME);
  });

  it('both stores refuse the creation, because both cross the same creation rule', () => {
    const { store } = host();
    expect(() => store.write(DEBRIS_NAME, SAVE)).toThrow(/temp suffix/);
    expect(() => store.writeAtomic(DEBRIS_NAME, SAVE)).toThrow(/temp suffix/);
    const mem = createMemorySaveStore();
    expect(() => mem.write(DEBRIS_NAME, SAVE)).toThrow(/temp suffix/);
    expect(() => mem.writeAtomic(DEBRIS_NAME, SAVE)).toThrow(/temp suffix/);
    expect(mem.list(), 'a refused write wrote nothing').toEqual([]);
  });

  it('the measured collision is unconstructible: the save cannot be made, so the atomic write has nothing to land on', () => {
    const { store, ops, tree } = host();
    expect(refusal(() => store.write(DEBRIS_NAME, SAVE))).toContain('temp suffix');
    expect(tree.has(`saves/root/${DEBRIS_NAME}`), 'the refusal happened before any byte moved').toBe(false);
    store.writeAtomic(COLLIDING_SAVE, OTHER);
    expect(store.list(), 'one save and no debris left behind').toEqual([COLLIDING_SAVE]);
    expect(store.read(COLLIDING_SAVE)).toBe(OTHER);
    expect(ops, 'the temp is still made under that name — the rule did not blind the writer it protects').toEqual([
      `write:saves/root/${DEBRIS_NAME}`,
      `rename:saves/root/${DEBRIS_NAME}->saves/root/${COLLIDING_SAVE}`,
    ]);
  });

  it('debris the host already holds stays listable and readable, so browsing a store cannot crash on a leftover', () => {
    const { store, tree } = host();
    tree.set(`saves/root/${DEBRIS_NAME}`, 'half-written junk');
    expect(store.list(), 'a listing is a fact about the host, not a filter').toEqual([DEBRIS_NAME]);
    expect(store.read(DEBRIS_NAME), 'the sweeper and any diagnosis must still be able to ask what is there').toBe('half-written junk');
    expect(store.exists(DEBRIS_NAME)).toBe(true);
  });

  it('delete still takes a half-written file back, and says false the second time', () => {
    const { store, tree } = host();
    tree.set(`saves/root/${DEBRIS_NAME}`, 'half-written junk');
    expect(store.delete(DEBRIS_NAME), 'the sweeper asks for exactly this name').toBe(true);
    expect(store.list()).toEqual([]);
    expect(store.delete(DEBRIS_NAME), 'a second sweep finds nothing and says so').toBe(false);
  });

  it('delete keeps the confinement even though it never carried the save-name rule', () => {
    const { store } = host();
    expect(refusal(() => store.delete(`../escape${SAVE_TEMP_SUFFIX}`))).toMatch(/walks out/);
    expect(refusal(() => store.delete(`/abs${SAVE_TEMP_SUFFIX}`))).toMatch(/absolute path/);
    expect(() => store.delete(DEBRIS_NAME)).not.toThrow();
  });

  it('the memory store answers false for a name it never held instead of pretending', () => {
    const mem = createMemorySaveStore();
    expect(mem.delete(DEBRIS_NAME)).toBe(false);
    mem.write('normal.json', SAVE);
    expect(mem.list()).toEqual(['normal.json']);
  });
});
