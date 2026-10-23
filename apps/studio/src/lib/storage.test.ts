import { describe, expect, it } from 'vitest';

import { browserStorage, memoryStore, nullStore, STUDIO_DOC_KEY, type KvStore } from './storage';

/**
 * M7 v416 — the storage I/O seam itself, graded directly.
 *
 * `persist.ts` is pure and window-free by design; this module is the ONLY place that touches `window`
 * (ADR 0002 testability). Three contracts live here and nowhere else: the two fakes answer the KvStore
 * shape exactly (a missing key is null, an empty string is a VALUE), the browser resolution degrades
 * instead of dereferencing (SSR, headless, private mode), and the one key the whole persistence story
 * is stored under is a fact about every saved document on every device — a rename orphans them all.
 */
describe('nullStore — a store that forgets everything it is given (v416)', () => {
  it('every write is a no-op and every read answers null', () => {
    expect(() => nullStore.setItem('k', 'v')).not.toThrow();
    expect(nullStore.getItem('k')).toBeNull();
    expect(() => nullStore.removeItem('k')).not.toThrow();
  });
});

describe('memoryStore — the Map-backed fake (v416)', () => {
  it('a fresh store is empty — a missing key answers null, not undefined', () => {
    const store = memoryStore();
    expect(store.getItem('anything')).toBeNull();
  });

  it('a written value round-trips, and a second write replaces the first', () => {
    const store = memoryStore();
    store.setItem('k', 'v1');
    expect(store.getItem('k')).toBe('v1');
    store.setItem('k', 'v2');
    expect(store.getItem('k')).toBe('v2');
  });

  it('an empty string is a stored VALUE, not an absent key', () => {
    // The distinction matters: `getItem() ?? null` must not turn a stored empty string into an
    // absence, or a saved-then-cleared field would read as never-saved.
    const store = memoryStore();
    store.setItem('k', '');
    expect(store.getItem('k')).toBe('');
  });

  it('removeItem removes, and removing a missing key is a no-op', () => {
    const store = memoryStore({ k: 'v' });
    store.removeItem('k');
    expect(store.getItem('k')).toBeNull();
    expect(() => store.removeItem('never-was')).not.toThrow();
  });

  it('the seed is a SNAPSHOT — a later change to the caller’s record does not reach into the store', () => {
    const seed: Record<string, string> = { a: '1' };
    const store = memoryStore(seed);
    seed.a = '2';
    seed.b = '3';
    expect(store.getItem('a')).toBe('1');
    expect(store.getItem('b')).toBeNull();
  });
});

describe('STUDIO_DOC_KEY — the one key every saved document lives under (v416)', () => {
  it('is the stable namespaced key — a rename would orphan every document on every device', () => {
    expect(STUDIO_DOC_KEY).toBe('nexus.studio.doc.v1');
  });
});

describe('browserStorage — the guarded resolution (v416)', () => {
  // ORDER MATTERS in this block: the working-localStorage case CACHES, so the degrading cases are
  // graded first, while the module's cache is still empty.
  it('no window at all degrades to nullStore — SSR and headless never dereference it', () => {
    const store = browserStorage();
    expect(store.getItem('k')).toBeNull();
    expect(() => store.setItem('k', 'v')).not.toThrow();
  });

  it('a window whose localStorage THROWS (private mode, blocked) degrades to nullStore', () => {
    const globalWithWindow = globalThis as { window?: { localStorage: KvStore } };
    const original = globalWithWindow.window;
    globalWithWindow.window = {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota exceeded');
        },
        removeItem: () => {},
      },
    };
    try {
      const store = browserStorage();
      expect(store.getItem('k')).toBeNull();
      expect(() => store.setItem('k', 'v')).not.toThrow();
    } finally {
      globalWithWindow.window = original;
    }
  });

  it('a window with a working localStorage is used — and CACHED, so the probe runs once', () => {
    const backing = new Map<string, string>();
    const fake: KvStore = {
      getItem: (k) => backing.get(k) ?? null,
      setItem: (k, v) => void backing.set(k, v),
      removeItem: (k) => void backing.delete(k),
    };
    const globalWithWindow = globalThis as { window?: { localStorage: KvStore } };
    const original = globalWithWindow.window;
    globalWithWindow.window = { localStorage: fake };
    try {
      const first = browserStorage();
      first.setItem('k', 'v');
      expect(backing.get('k')).toBe('v');
      expect(browserStorage()).toBe(first);
    } finally {
      globalWithWindow.window = original;
    }
  });
});
