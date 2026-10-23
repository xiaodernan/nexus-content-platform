// v431 — the STORAGE SEAM's own rules, graded directly.
//
// saveStore.ts is the only module in this package that talks to somewhere outside the process, and it is
// the only place every save name passes through (resolveSavePath exactly once). It shipped with no test
// file of its own — measured on HEAD — which left the three stores' honesty rules ungraded: what a null
// from read means, which names may be CREATED versus merely read, what a host that cannot rename or
// flush is told, and why a listing is refused rather than answered with an empty array. These cases ask
// the seam directly, with injected hosts, the same way the module was built to be asked.
import { describe, it, expect } from 'vitest';
import {
  SAVE_TEMP_SUFFIX,
  createFsSaveStore,
  createLocalStorageSaveStore,
  createMemorySaveStore,
  resolveNewSavePath,
  resolveSavePath,
  savePathRefusal,
  type FsLike,
  type StorageLike,
} from '../src/index.js';

describe('resolveSavePath: one owner of the naming rule', () => {
  it('accepts a plain relative name and returns it unchanged', () => {
    expect(resolveSavePath('hero.json')).toBe('hero.json');
    expect(resolveSavePath('slots/hero.json')).toBe('slots/hero.json');
  });

  it('refuses the absolute spellings, in every form a host could read', () => {
    for (const p of ['/etc/passwd', '\\windows\\system32', 'C:\\saves\\hero.json', 'c:/saves/hero.json']) {
      expect(() => resolveSavePath(p), p).toThrow(/absolute path/);
    }
  });

  it('refuses a name that walks out with ".."', () => {
    expect(() => resolveSavePath('../escape.json')).toThrow(/walks out of the store/);
    expect(() => resolveSavePath('slots/../../escape.json')).toThrow(/walks out of the store/);
  });

  it('refuses empty and "." segments: a directory is not a file name', () => {
    expect(() => resolveSavePath('')).toThrow(/non-empty string/);
    expect(() => resolveSavePath('   ')).toThrow(/non-empty string/);
    expect(() => resolveSavePath('slots//hero.json')).toThrow(/empty or "\." segment/);
    expect(() => resolveSavePath('slots/./hero.json')).toThrow(/empty or "\." segment/);
    expect(() => resolveSavePath('slots/')).toThrow(/empty or "\." segment/);
  });

  it('refuses a backslash name by the RE-JOIN rule, not by scanning for a backslash', () => {
    // The clause that matters: the split already ate the backslash, so the segments never contain one.
    // A name that does not re-join to itself was split on a separator this store does not join with.
    expect(() => resolveSavePath('saves\\hero.json')).toThrow(/does not re-join to itself/);
    expect('saves\\hero.json'.split(/[\\/]/)).not.toContain('\\'); // the segment scan could never fire
  });

  it('refuses a non-string, naming what it got instead of coercing it', () => {
    expect(() => resolveSavePath(42 as unknown as string)).toThrow(/non-empty string/);
    expect(() => resolveSavePath(null as unknown as string)).toThrow(/non-empty string/);
  });

  it('savePathRefusal hands out the door OWN sentence, so the two can never drift apart', () => {
    expect(savePathRefusal('hero.json')).toBeNull();
    const sentence = savePathRefusal('../escape.json');
    expect(sentence).toContain('walks out of the store');
    // The sentence IS the throw: a caller that reports instead of dying reports the door's own words.
    let thrown: string | null = null;
    try {
      resolveSavePath('../escape.json');
    } catch (error) {
      thrown = (error as Error).message;
    }
    expect(sentence).toBe(thrown);
  });
});

describe('resolveNewSavePath: creation goes one rule further than reading', () => {
  it('accepts a legal name unchanged', () => {
    expect(resolveNewSavePath('slots/hero.json')).toBe('slots/hero.json');
  });

  it('refuses the temp suffix, naming the shorter save it would collide with', () => {
    expect(() => resolveNewSavePath(`x.json${SAVE_TEMP_SUFFIX}`)).toThrow(/ends in the temp suffix/);
    expect(() => resolveNewSavePath(`x.json${SAVE_TEMP_SUFFIX}`)).toThrow(/writeAtomic\("x\.json"\)/);
    // The empty-name collision is called out too: ".tmp" alone would be the temp of a save with no name.
    expect(() => resolveNewSavePath(SAVE_TEMP_SUFFIX)).toThrow(/the empty name, which is not a save either/);
  });
});

describe('the memory store: one map, no claims it cannot keep', () => {
  it('round-trips a save, and delete answers whether there was something there', () => {
    const store = createMemorySaveStore();
    expect(store.kind).toBe('memory');

    store.write('b.json', 'second');
    store.write('a.json', 'first');
    expect(store.read('a.json')).toBe('first');
    expect(store.exists('a.json')).toBe(true);
    expect(store.list()).toEqual(['a.json', 'b.json']); // sorted, names only
    expect(store.read('nope.json')).toBeNull(); // null means "not there", never "empty file"
    expect(store.delete('nope.json')).toBe(false); // "there was nothing" is a fact, not an error
    expect(store.delete('a.json')).toBe(true);
    expect(store.exists('a.json')).toBe(false);
  });

  it('refuses durable writes by name, and keeps the temp suffix on the READ side', () => {
    const store = createMemorySaveStore();
    expect(() => store.writeAtomic('a.json', 'x', true)).toThrow(/cannot write durably/);

    // Creation refuses the debris suffix; reading it answers null rather than throwing. A .tmp the host
    // already holds is a fact about the host, and a browser that browses its own store must not die on one.
    expect(() => store.write(`x.json${SAVE_TEMP_SUFFIX}`, 'x')).toThrow(/temp suffix/);
    expect(store.read(`x.json${SAVE_TEMP_SUFFIX}`)).toBeNull();
    expect(store.exists(`x.json${SAVE_TEMP_SUFFIX}`)).toBe(false);
  });

  it('writeAtomic replaces in one step, and rename moves the bytes', () => {
    const store = createMemorySaveStore();
    store.writeAtomic('a.json', 'one');
    store.writeAtomic('a.json', 'two');
    expect(store.read('a.json')).toBe('two');

    expect(store.rename('a.json', 'b.json')).toBe('b.json');
    expect(store.read('a.json')).toBeNull();
    expect(store.read('b.json')).toBe('two');
    expect(store.list()).toEqual(['b.json']);
    expect(() => store.rename('gone.json', 'c.json')).toThrow(/does not exist/);
  });
});

/** A flat in-memory fs whose directory answers come from the keys it holds. */
function fakeFs(overrides: Partial<FsLike> = {}): FsLike & { files: Map<string, string>; calls: string[] } {
  const files = new Map<string, string>();
  const calls: string[] = [];
  const children = (dir: string): string[] => {
    const prefix = `${dir}/`;
    const names = new Set<string>();
    for (const key of files.keys()) {
      if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split('/')[0]!);
    }
    return [...names];
  };
  const base: FsLike = {
    writeFileSync(path, data) {
      calls.push(`write ${path}`);
      files.set(path, data);
    },
    readFileSync(path) {
      calls.push(`read ${path}`);
      const value = files.get(path);
      if (value === undefined) throw new Error(`ENOENT ${path}`);
      return value;
    },
    existsSync(path) {
      return files.has(path) || children(path).length > 0;
    },
    unlinkSync(path) {
      calls.push(`unlink ${path}`);
      files.delete(path);
    },
    readdirSync(dir) {
      return children(dir);
    },
    statSync(path) {
      const isDirectory = children(path).length > 0;
      return { isDirectory: () => isDirectory, isFile: () => !isDirectory };
    },
    renameSync(from, to) {
      calls.push(`rename ${from} -> ${to}`);
      files.set(to, files.get(from)!);
      files.delete(from);
    },
    flushSync(path) {
      calls.push(`flush ${path}`);
    },
  };
  return Object.assign(base, overrides, { files, calls });
}

describe('the fs store: confined to its root, honest about its host', () => {
  it('refuses a root that itself walks out, at construction', () => {
    expect(() => createFsSaveStore(fakeFs(), '../outside')).toThrow(/itself walks out/);
    expect(() => createFsSaveStore(fakeFs(), 'saves/../..')).toThrow(/itself walks out/);
  });

  it('writes and reads inside the root, and nowhere else', () => {
    const fs = fakeFs();
    const store = createFsSaveStore(fs, 'saves');
    store.write('hero.json', 'bytes');
    expect(fs.files.has('saves/hero.json')).toBe(true);
    expect(fs.files.has('hero.json')).toBe(false);
    expect(store.read('hero.json')).toBe('bytes');
    expect(store.read('gone.json')).toBeNull();
  });

  it('writeAtomic writes the temp, flushes when asked, renames, and leaves no debris', () => {
    const fs = fakeFs();
    const store = createFsSaveStore(fs, 'saves');

    store.writeAtomic('hero.json', 'bytes', true);

    expect(fs.calls).toEqual([
      'write saves/hero.json.tmp',
      'flush saves/hero.json.tmp',
      'rename saves/hero.json.tmp -> saves/hero.json',
    ]);
    expect(fs.files.has('saves/hero.json')).toBe(true);
    expect(fs.files.has('saves/hero.json.tmp')).toBe(false);
    expect(store.read('hero.json')).toBe('bytes');
  });

  it('refuses an atomic write the host cannot perform BEFORE any byte moves', () => {
    const noRename = fakeFs();
    delete (noRename as { renameSync?: unknown }).renameSync;
    expect(() => createFsSaveStore(noRename, 'saves').writeAtomic('hero.json', 'bytes')).toThrow(/no renameSync/);
    expect(noRename.files.size).toBe(0); // nothing was written, so there is no temp to explain

    const noFlush = fakeFs();
    delete (noFlush as { flushSync?: unknown }).flushSync;
    expect(() => createFsSaveStore(noFlush, 'saves').writeAtomic('hero.json', 'bytes', true)).toThrow(/no flushSync/);
    expect(noFlush.files.size).toBe(0);
  });

  it('a failed rename leaves the old file untouched and removes the temp, saying so', () => {
    const fs = fakeFs({
      renameSync() {
        throw new Error('cross-device link');
      },
    });
    const store = createFsSaveStore(fs, 'saves');
    store.write('hero.json', 'old');

    expect(() => store.writeAtomic('hero.json', 'new')).toThrow(/untouched/);
    expect(store.read('hero.json')).toBe('old'); // the whole point of the temp
    expect(fs.files.has('saves/hero.json.tmp')).toBe(false); // the temp was cleaned up
  });

  it('a failed rename whose cleanup also fails NAMES the leftover instead of hiding it', () => {
    const fs = fakeFs({
      renameSync() {
        throw new Error('cross-device link');
      },
    });
    delete (fs as { unlinkSync?: unknown }).unlinkSync;
    const store = createFsSaveStore(fs, 'saves');
    store.write('hero.json', 'old');

    expect(() => store.writeAtomic('hero.json', 'new')).toThrow(/could not be removed/);
    expect(() => store.writeAtomic('hero.json', 'new')).toThrow(/left at "hero\.json\.tmp"/);
    expect(store.read('hero.json')).toBe('old');
  });

  it('delete throws when the host cannot delete: false would be a lie the store must not tell', () => {
    const fs = fakeFs();
    delete (fs as { unlinkSync?: unknown }).unlinkSync;
    const store = createFsSaveStore(fs, 'saves');
    store.write('hero.json', 'bytes');
    expect(() => store.delete('hero.json')).toThrow(/no unlinkSync/);
  });

  it('list refuses rather than answering [] when the host cannot browse, walks nested names, and answers [] for a missing root', () => {
    const noBrowse = fakeFs();
    delete (noBrowse as { readdirSync?: unknown }).readdirSync;
    expect(() => createFsSaveStore(noBrowse, 'saves').list()).toThrow(/needs BOTH readdirSync and statSync/);

    const fs = fakeFs();
    const store = createFsSaveStore(fs, 'saves');
    expect(store.list()).toEqual([]); // a root that is not there holds nothing, and that is knowable
    store.write('a.json', 'a');
    store.write('slots/b.json', 'b');
    store.write('slots/deep/c.json', 'c');
    expect(store.list()).toEqual(['a.json', 'slots/b.json', 'slots/deep/c.json']);
  });

  it('rename uses the host rename when it has one and falls back to read-write-delete when it does not', () => {
    const withRename = fakeFs();
    const store = createFsSaveStore(withRename, 'saves');
    store.write('a.json', 'bytes');
    expect(store.rename('a.json', 'b.json')).toBe('b.json');
    expect(withRename.files.has('saves/b.json')).toBe(true);
    expect(withRename.files.has('saves/a.json')).toBe(false);

    const noRename = fakeFs();
    delete (noRename as { renameSync?: unknown }).renameSync;
    const fallback = createFsSaveStore(noRename, 'saves');
    fallback.write('a.json', 'bytes');
    expect(fallback.rename('a.json', 'b.json')).toBe('b.json');
    expect(fallback.read('b.json')).toBe('bytes');
    expect(fallback.read('a.json')).toBeNull();
    expect(() => fallback.rename('gone.json', 'c.json')).toThrow(/does not exist/);
  });
});

/** A localStorage stand-in: a map, plus an optional quota that refuses NEW keys past a size. */
function fakeStorage(quotaKeys = -1): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      if (quotaKeys >= 0 && !map.has(key) && map.size >= quotaKeys) {
        const error = new Error('The quota has been exceeded.');
        error.name = 'QuotaExceededError';
        throw error;
      }
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe('the localStorage store: the browser case, driven headlessly', () => {
  it('needs a namespace and a storage; neither is guessed', () => {
    expect(() => createLocalStorageSaveStore('   ')).toThrow(/non-empty namespace/);
    expect(() => createLocalStorageSaveStore('my-app')).toThrow(/localStorage is not available/);
  });

  it('writes under its namespace, lists from the index, and deletes from both', () => {
    const storage = fakeStorage();
    const store = createLocalStorageSaveStore('my-app', { storage });

    store.write('b.json', 'second');
    store.write('a.json', 'first');
    expect(storage.map.has('nexus-save:my-app:a.json')).toBe(true);
    expect(storage.map.has('nexus-save:my-app:__index')).toBe(true);
    expect(store.list()).toEqual(['a.json', 'b.json']);
    expect(store.read('a.json')).toBe('first');
    expect(store.read('gone.json')).toBeNull();

    expect(store.delete('a.json')).toBe(true);
    expect(store.delete('a.json')).toBe(false);
    expect(store.list()).toEqual(['b.json']);
    expect(storage.map.has('nexus-save:my-app:a.json')).toBe(false);
  });

  it('writeAtomic goes through the temp key and leaves it behind nowhere', () => {
    const storage = fakeStorage();
    const store = createLocalStorageSaveStore('my-app', { storage });
    store.writeAtomic('a.json', 'bytes');
    expect(storage.map.has('nexus-save:my-app:a.json.tmp')).toBe(false);
    expect(store.read('a.json')).toBe('bytes');
    expect(store.list()).toEqual(['a.json']);
  });

  it('refuses durable by name: the browser storage has no flush handle', () => {
    const store = createLocalStorageSaveStore('my-app', { storage: fakeStorage() });
    expect(() => store.writeAtomic('a.json', 'x', true)).toThrow(/cannot write durably/);
  });

  it('a quota refusal is re-thrown naming the quota AND that nothing was written', () => {
    const store = createLocalStorageSaveStore('my-app', { storage: fakeStorage(0) });
    expect(() => store.write('a.json', 'bytes')).toThrow(/quota is full and NOTHING was written/);
  });

  it('a non-quota error is re-thrown untouched, not swallowed by the quota reader', () => {
    const storage = fakeStorage();
    storage.setItem = () => {
      throw new Error('boom');
    };
    const store = createLocalStorageSaveStore('my-app', { storage });
    expect(() => store.write('a.json', 'bytes')).toThrow('boom');
  });

  it('rename moves the bytes and the index entry, and refuses a name that is not there', () => {
    const storage = fakeStorage();
    const store = createLocalStorageSaveStore('my-app', { storage });
    store.write('a.json', 'bytes');
    expect(store.rename('a.json', 'b.json')).toBe('b.json');
    expect(store.list()).toEqual(['b.json']);
    expect(storage.map.has('nexus-save:my-app:a.json')).toBe(false);
    expect(() => store.rename('gone.json', 'c.json')).toThrow(/does not exist/);
  });
});
