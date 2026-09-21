/**
 * Storage I/O seam (ADR 0002 testability). `persist.ts` stays pure; this is the only module that
 * touches `window`, and it is guarded so SSR / headless Node never dereference it. Tests inject a
 * `Map`-backed fake instead of a browser.
 */
export interface KvStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STUDIO_DOC_KEY = 'nexus.studio.doc.v1';

/** A no-op store used when `localStorage` is unavailable (SSR, private mode, tests). */
export const nullStore: KvStore = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/** A `Map`-backed store — the fake used in unit tests and the fallback for `nullStore`. */
export function memoryStore(seed?: Record<string, string>): KvStore {
  const m = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

let cached: KvStore | null = null;

/** Lazily resolve the browser `localStorage`, degrading to `nullStore` when unavailable. */
export function browserStorage(): KvStore {
  if (cached) return cached;
  if (typeof window === 'undefined') return nullStore;
  try {
    const probe = '__nexus_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    cached = window.localStorage;
    return cached;
  } catch {
    return nullStore;
  }
}
