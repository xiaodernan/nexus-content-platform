/**
 * M5 v179 — the localStorage-backed store is DRIVABLE, not just constructible in a browser.
 *
 * v170 shipped `createLocalStorageSaveStore` with zero coverage: it reached for `window.localStorage`
 * directly, so the one store that persists across page reloads could not even be CONSTRUCTED in Node —
 * the store was honest about that (it threw), but honesty about being untestable is not a substitute for
 * tests. v179 makes the storage a seam (`options.storage`, the minimal `StorageLike` slice) while keeping
 * the browser default byte for byte, and these tests are the first consumers of that seam.
 *
 * The seam's first run also caught a real lie in the store itself: `writeAtomic`'s `durable` argument was
 * silently IGNORED — the memory store refuses it and the fs store checks for `flushSync`, so a durability
 * promise that outlives a browser tab was swallowed here. Now it refuses, and the refusal is tested with
 * the zero-write check the fs store's own tests use.
 */

import { describe, expect, it } from 'vitest';
import {
  createLocalStorageSaveStore,
  SAVE_TEMP_SUFFIX,
  type StorageLike,
} from '../src/saveStore.js';

/** A Map-backed `StorageLike` with set-failure injection, so the store's mid-flight cleanup can be
 *  exercised the way a real quota error would hit it. `keys()` exposes the raw keyspace — the store's
 *  own interface never does, and that is the point of checking what it leaves behind. */
function fakeStorage(seed: Record<string, string> = {}): StorageLike & {
  keys(): string[];
  failSetFrom(n: number): void;
} {
  const map = new Map<string, string>(Object.entries(seed));
  let setCount = 0;
  let failFrom = Number.POSITIVE_INFINITY;
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem(k, v) {
      setCount += 1;
      if (setCount >= failFrom) throw new Error(`fake storage quota exceeded (set #${setCount})`);
      map.set(k, v);
    },
    removeItem: (k) => void map.delete(k),
    keys: () => [...map.keys()].sort(),
    failSetFrom: (n) => void (failFrom = n),
  };
}

describe('createLocalStorageSaveStore — the injected seam (v179)', () => {
  it('constructs headlessly with an injected storage and reports its kind', () => {
    const store = createLocalStorageSaveStore('t', { storage: fakeStorage() });
    expect(store.kind).toBe('localStorage');
  });

  it('still refuses to construct without a namespace, injected or not', () => {
    expect(() => createLocalStorageSaveStore('', { storage: fakeStorage() })).toThrow(/non-empty namespace/);
    expect(() => createLocalStorageSaveStore('   ', { storage: fakeStorage() })).toThrow(/non-empty namespace/);
  });

  it('still refuses to construct in an environment with no storage at all', () => {
    // No `window` in Node, no injection — the honest throw v170 shipped, unchanged.
    expect(() => createLocalStorageSaveStore('t')).toThrow(/localStorage is not available/);
  });
});

describe('createLocalStorageSaveStore — the store itself', () => {
  const PREFIX = 'nexus-save:t';

  it('writes and reads back byte for byte; a miss reads as null, never empty', () => {
    const storage = fakeStorage();
    const store = createLocalStorageSaveStore('t', { storage });
    const contents = '{"scene":"Ford","bodies":[{"id":"mira"}]}\ntrailing whitespace kept ';
    store.write('ford.json', contents);
    expect(store.exists('ford.json')).toBe(true);
    expect(store.read('ford.json')).toBe(contents);
    expect(store.exists('nope.json')).toBe(false);
    expect(store.read('nope.json')).toBeNull();
  });

  it('deletes a real save (true) and answers false for nothing — never an error', () => {
    const storage = fakeStorage();
    const store = createLocalStorageSaveStore('t', { storage });
    store.write('a.json', 'A');
    expect(store.delete('a.json')).toBe(true);
    expect(store.delete('a.json')).toBe(false);
    expect(store.read('a.json')).toBeNull();
  });

  it('lists from the index — sorted, no index key, no debris', () => {
    const storage = fakeStorage();
    const store = createLocalStorageSaveStore('t', { storage });
    expect(store.list()).toEqual([]);
    store.write('zeta.json', 'Z');
    store.write('alpha.json', 'A');
    expect(store.list()).toEqual(['alpha.json', 'zeta.json']);
    // The index lives under its own key; a listing never names it.
    expect(storage.keys().some((k) => k.includes('__index'))).toBe(true);
    expect(store.list().some((n) => n.includes('__index'))).toBe(false);
    store.delete('alpha.json');
    expect(store.list()).toEqual(['zeta.json']);
  });

  it('keeps namespaces apart over ONE backing storage', () => {
    const storage = fakeStorage();
    const a = createLocalStorageSaveStore('app-a', { storage });
    const b = createLocalStorageSaveStore('app-b', { storage });
    a.write('hero.json', 'A-hold');
    b.write('hero.json', 'B-hold');
    expect(a.read('hero.json')).toBe('A-hold');
    expect(b.read('hero.json')).toBe('B-hold');
    expect(a.list()).toEqual(['hero.json']);
    expect(b.list()).toEqual(['hero.json']);
    a.delete('hero.json');
    expect(b.read('hero.json')).toBe('B-hold');
    // The emptied `__index` key remains by design; no SAVE key of app-a survives the delete.
    expect(storage.keys().filter((k) => k.startsWith('nexus-save:app-a:') && !k.endsWith('__index'))).toEqual([]);
    expect(storage.keys().filter((k) => k.startsWith('nexus-save:app-b:')).length).toBeGreaterThan(0);
  });

  it('refuses names that leave the namespace — and classifies them without reading', () => {
    const store = createLocalStorageSaveStore('t', { storage: fakeStorage() });
    const traversal = store.savePathRefusal('../escape.json');
    expect(traversal).not.toBeNull();
    expect(traversal).toMatch(/\.\./);
    expect(() => store.write('../escape.json', 'x')).toThrow();
    expect(() => store.read('../escape.json')).toThrow();
    expect(() => store.delete('/abs.json')).toThrow(/absolute/);
    expect(() => store.read('saves\\win.json')).toThrow(/backslash/); // a backslash name is refused by the same rule
  });

  it('refuses to CREATE a save on the temp suffix name, but still READS a leftover one', () => {
    const storage = fakeStorage();
    const store = createLocalStorageSaveStore('t', { storage });
    expect(() => store.write(`debris.json${SAVE_TEMP_SUFFIX}`, 'x')).toThrow(/temp suffix/);
    // A `.tmp` the HOST already holds is a fact about the host: read-side verbs accept it.
    storage.setItem(`${PREFIX}:legacy.json${SAVE_TEMP_SUFFIX}`, 'leftover');
    expect(store.read(`legacy.json${SAVE_TEMP_SUFFIX}`)).toBe('leftover');
    expect(store.delete(`legacy.json${SAVE_TEMP_SUFFIX}`)).toBe(true);
  });

  it('writeAtomic round-trips and leaves NO temp key behind', () => {
    const storage = fakeStorage();
    const store = createLocalStorageSaveStore('t', { storage });
    store.writeAtomic('scene.json', '{"v":2}');
    expect(store.read('scene.json')).toBe('{"v":2}');
    expect(storage.keys().some((k) => k.endsWith(SAVE_TEMP_SUFFIX))).toBe(false);
    // Overwriting an existing save through the atomic path keeps the reader on one side or the other.
    store.writeAtomic('scene.json', '{"v":3}');
    expect(store.read('scene.json')).toBe('{"v":3}');
  });

  it('refuses a DURABLE atomic write with zero bytes written (v179: the argument is no longer ignored)', () => {
    const storage = fakeStorage();
    const store = createLocalStorageSaveStore('t', { storage });
    expect(() => store.writeAtomic('d.json', '{"x":1}', true)).toThrow(/cannot write durably/);
    // The refusal must be real: no target, no temp, nothing in the index.
    expect(storage.keys()).toEqual([]);
    expect(store.list()).toEqual([]);
    // And a plain atomic write right after still works — the refusal is not a broken store.
    store.writeAtomic('d.json', '{"x":1}');
    expect(store.read('d.json')).toBe('{"x":1}');
  });

  it('cleans up the temp when the copy fails mid-flight, and says nothing was written', () => {
    const storage = fakeStorage();
    const store = createLocalStorageSaveStore('t', { storage });
    // Set #1 is the temp; set #2 is the copy — failing there is the quota-style mid-flight.
    storage.failSetFrom(2);
    expect(() => store.writeAtomic('m.json', 'M')).toThrow(/mid-flight/);
    expect(store.read('m.json')).toBeNull();
    expect(storage.keys().some((k) => k.endsWith(SAVE_TEMP_SUFFIX))).toBe(false);
  });

  it('answers a corrupt index honestly: [] instead of a guess, valid names filtered by type', () => {
    // A non-JSON index (a hostile or ancient host) — the store refuses to invent names from it.
    const garbage = fakeStorage({ [`${PREFIX}:__index`]: 'not json at all' });
    expect(createLocalStorageSaveStore('t', { storage: garbage }).list()).toEqual([]);
    // An index holding non-strings keeps only the strings it can own.
    const mixed = fakeStorage({ [`${PREFIX}:__index`]: '["ok.json",42,null]' });
    expect(createLocalStorageSaveStore('t', { storage: mixed }).list()).toEqual(['ok.json']);
  });

  it('rename moves the bytes and the index together — the old name forgets, the new one answers', () => {
    const storage = fakeStorage();
    const store = createLocalStorageSaveStore('t', { storage });
    store.write('old.json', 'same-bytes');
    const renamed = store.rename('old.json', 'new.json');
    expect(renamed).toBe('new.json');
    expect(store.read('new.json')).toBe('same-bytes');
    expect(store.exists('old.json')).toBe(false);
    expect(store.list()).toEqual(['new.json']);
    expect(() => store.rename('ghost.json', 'anywhere.json')).toThrow(/does not exist/);
  });
});

describe('a quota refusal is NAMED, not quoted raw (v180)', () => {
  it('write re-throws a quota-shaped setItem failure with the quota sentence and NOTHING was written', () => {
    const storage = fakeStorage();
    const store = createLocalStorageSaveStore('t', { storage });
    storage.failSetFrom(1);
    const thrown = (() => {
      try {
        store.write('full.json', 'F');
        return null;
      } catch (error) {
        return (error as Error).message;
      }
    })();
    expect(thrown).toMatch(/quota is full/);
    expect(thrown).toMatch(/NOTHING was written/);
    expect(thrown).toMatch(/fake storage quota exceeded/); // the original words ride along
    // The refusal is real: no target, no index entry, nothing.
    expect(storage.keys()).toEqual([]);
    expect(store.list()).toEqual([]);
  });

  it('writeAtomic names a quota refusal at the TEMP step (before any byte moved) and leaves no debris', () => {
    const storage = fakeStorage();
    const store = createLocalStorageSaveStore('t', { storage });
    storage.failSetFrom(1); // set #1 is the temp write
    expect(() => store.writeAtomic('a.json', 'A')).toThrow(/quota is full/);
    expect(storage.keys()).toEqual([]);
    // The mid-flight sentence stays owned by the COPY step (v179), where the temp already exists.
    const storage2 = fakeStorage();
    const store2 = createLocalStorageSaveStore('t', { storage: storage2 });
    storage2.failSetFrom(2); // set #1 temp, set #2 copy — the refusal fires MID-flight, not before
    expect(() => store2.writeAtomic('b.json', 'B')).toThrow(/mid-flight/);
  });

  it('an error the store cannot classify is re-thrown untouched — no invented diagnosis', () => {
    const hostile: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new TypeError('boom: setter vanished');
      },
      removeItem: () => undefined,
    };
    const store = createLocalStorageSaveStore('t', { storage: hostile });
    expect(() => store.write('x.json', 'X')).toThrow(/boom: setter vanished/);
    expect(() => store.write('x.json', 'X')).not.toThrow(/quota is full/);
  });

  it('rename re-throws a quota refusal on the NEW name and the old save survives untouched', () => {
    const storage = fakeStorage();
    const store = createLocalStorageSaveStore('t', { storage });
    store.write('keep.json', 'K');
    storage.failSetFrom(2); // set #1 was the original write; set #2 is the rename's setItem
    expect(() => store.rename('keep.json', 'big.json')).toThrow(/quota is full/);
    expect(() => store.rename('keep.json', 'big.json')).toThrow(/"big\.json"/); // the refusal names the NEW name
    // The old name still holds its bytes and its index entry — a failed rename moved nothing.
    expect(store.read('keep.json')).toBe('K');
    expect(store.list()).toEqual(['keep.json']);
  });
});
