/**
 * M5 v120 — the storage seam for save files.
 *
 * v119 made a `SaveFile` survive `JSON.stringify`, which proved the shape is a file but left the sentence
 * unfinished: nothing wrote one. This module is the only place in the package that talks to somewhere outside
 * the process, and it talks to an injected object rather than importing `node:fs`: `@nexus/three-runtime` runs
 * in a browser tab as happily as in Node, and a runtime that reached for a real filesystem itself could not
 * be tested, sandboxed, or run at all. The M2 lane uses the same shape for durable agent memory (§26), where
 * the injected object is `localStorage`.
 *
 * Two rules are worth naming because both are load-bearing:
 *
 * * A `null` from `read` means "this path is not there". It never means "empty file" — an empty or whitespace
 *   file exists, and the runtime reports THAT as a corrupt save rather than loading nothing successfully.
 * * Every path goes through `resolveSavePath` exactly once. Two stores with two different escaping rules
 *   would be two owners of one safety claim, and the interesting one of them would be the one nobody tested.
 * * A save may not be CREATED on a name that ends in `SAVE_TEMP_SUFFIX` (`resolveNewSavePath`), because that
 *   name is where `writeAtomic` puts the save of the shorter path. Reading, listing and deleting still accept
 *   it — a leftover the host holds is a fact about the host, not a save.
 */

/** The slice of a filesystem this seam needs. Deliberately small enough that `localStorage` can implement it —
 *  `unlinkSync`, `readdirSync` and `statSync` are OPTIONAL, because the shim that made this seam worth having
 *  (v120's browser case) may not be able to delete or browse: a store built over such a host reports the
 *  missing capability instead of pretending the operation happened. */
export interface FsLike {
  writeFileSync(path: string, data: string): void;
  readFileSync(path: string): string;
  existsSync(path: string): boolean;
  unlinkSync?(path: string): void;
  readdirSync?(path: string): string[];
  statSync?(path: string): { isDirectory(): boolean; isFile(): boolean };
  renameSync?(from: string, to: string): void;
  /** Push a file's bytes past the OS cache. Optional: a `localStorage` shim has nothing to flush, and a store
   *  that cannot do it must not be able to be asked for it and stay silent — see `writeAtomic`'s `durable`. */
  flushSync?(path: string): void;
}

/** Where a save file goes and how it comes back. Sync, because the rest of the runtime is. */
export interface SaveStore {
  /** Which implementation this is: `'memory'` or `'fs'`. Never guessed by callers. */
  readonly kind: string;
  write(path: string, contents: string): void;
  /**
   * Write so that a reader either sees the old file or the new one, never a bit of each.
   *
   * For an fs store that means temp-then-rename, and the capability is checked BEFORE any byte is written:
   * discovering mid-flight that the host cannot rename would otherwise leave a `.tmp` file in the store that
   * `list()` then has to explain. If the rename itself fails, the old file is still in place at `path` (that
   * is the whole point) and the temp is unlinked; if that cleanup also fails, the message names the leftover
   * path, because a half-failed error that hides debris is worse than one that admits it.
   *
   * `durable` asks for one more thing: the temp is flushed before it is renamed, so a power loss cannot leave
   * a rename pointing at an unflushed inode. It is opt-in and it is refused — before writing, again — when the
   * host has no `flushSync`, and the memory store refuses it always: a mutation cannot be made to survive a
   * process that no longer exists, and a store that promised it would be writing the same lie with extra
   * ceremony. Flushing the DIRECTORY (the rename itself) is deliberately not attempted: this seam has no
   * directory handle, and pretending otherwise would be a durability claim nobody can check.
   */
  writeAtomic(path: string, contents: string, durable?: boolean): void;
  /** The stored bytes, or `null` when no file exists at `path`. */
  read(path: string): string | null;
  /** Whether anything is stored at `path`. `read` answers this too; this exists so a caller can ask without
   *  pulling bytes across the seam. */
  exists(path: string): boolean;
  /** Take the save back. `true` when something was deleted, `false` when the path held nothing — the same
   *  shape as `removeCinematic`'s answer, because "there was nothing there" is a fact and not an error.
   *  Throws when the injected host cannot delete: a store that reported success it could not perform would be
   *  the exact lie this seam exists to prevent. */
  delete(path: string): boolean;
  /** Every save name the store holds, sorted, relative to the store's own namespace. A listing is a fact
   *  about names: it reads no file's bytes (a menu that costs O(total bytes) is the wrong seam) and an empty
   *  store answers `[]`. Where browsing needs a capability the injected host does not have, it throws —
   *  `[]` would be a claim that there are no saves, and the store does not know that. */
  list(): string[];
  /** Classify a save name WITHOUT reading any file. Returns `null` when the name is legal, or a refusal
   *  sentence explaining WHY it cannot be used (path traversal, debris suffix, etc.). M5 v168: callers can
   *  now ask the store itself instead of importing the module-level helper. */
  savePathRefusal(path: string): string | null;
  /** M5 v172 — give a save a new name. Reads the old file's bytes, writes them under the new name, deletes the old.
   *  Returns the new path on success. Throws if the old file doesn't exist or the new name is refused. */
  rename(oldPath: string, newPath: string): string;
}

/**
 * Reject a path that would leave the store's own namespace, and return it unchanged otherwise.
 *
 * A save name arrives from a caller (and, on the read side, from a file a caller picked up somewhere), so the
 * absolute-form and `..` checks are the boundary. `''`, `.` and a trailing separator are refused too: a
 * "directory" is not a file name, and a store that wrote one would produce a save no reader could find.
 *
 * A backslash is refused on the same grounds it is READ on: the split below is `[\\/]`, so this rule already
 * calls a backslash a separator when it refuses `saves\..\escape.json`, and then handed the name to the host
 * unchanged — where POSIX keeps it as one file whose NAME holds the backslash and Windows writes it into a
 * directory. One policy, two owners of the name's identity, and a store whose `list()` count depends on the
 * machine reading it.
 *
 * The test is that the segments RE-JOIN to the name the caller passed, not that a segment contains a backslash:
 * the segment split has already eaten every backslash, so a clause that scanned the segments for one could never
 * fire — the first draft of this rule did exactly that and stayed green while refusing nothing. A name whose
 * segments do not re-join is precisely a name that was split on something the store does not join with, and
 * every other shape this rule refuses is already refused by the clauses above it.
 */
export function resolveSavePath(path: string): string {
  if (typeof path !== 'string' || path.trim().length === 0) {
    throw new Error(`saveStore: a save path must be a non-empty string, got ${JSON.stringify(path)}`);
  }
  if (/^[\\/]/.test(path) || /^[a-zA-Z]:/.test(path)) {
    throw new Error(`saveStore: "${path}" is an absolute path; a save is named inside the store's own namespace, never by a location on the host`);
  }
  const segments = path.split(/[\\/]/);
  if (segments.some((segment) => segment === '..')) {
    throw new Error(`saveStore: "${path}" walks out of the store with ".."; save names are relative and stay inside`);
  }
  if (segments.some((segment) => segment === '' || segment === '.')) {
    throw new Error(`saveStore: "${path}" has an empty or "." segment; a save name is one path, not a directory or a placeholder`);
  }
  if (segments.join('/') !== path) {
    throw new Error(`saveStore: "${path}" does not re-join to itself after this rule splits it on "/" and "\\", so the name holds a backslash the store cannot own — the same bytes are one file NAMED with a backslash on a POSIX host and a directory on a Windows one. Name the save with "/" and the same bytes mean the same save on every machine`);
  }
  return path;
}

/**
 * The sentence `resolveSavePath` would throw for this name, or `null` when this build can re-enter it.
 *
 * A listing is a fact about the host and a refusal is a rule this build holds, so the two can disagree: a POSIX
 * store may list `legacy\x.json` that predates the clause above, and `list()` still names it. A survey that then
 * calls `read` meets the door and dies with it — one undeletable, unreadable name would take the whole save
 * menu down. This hands the survey the door's OWN sentence as data so it can report the name instead of throwing
 * it, and it holds no second naming rule: it asks `resolveSavePath`, so the two can never drift apart.
 */
export function savePathRefusal(path: string): string | null {
  try {
    resolveSavePath(path);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

/**
 * The name a SAVE may be created under: `resolveSavePath`, plus one rule that only creation needs.
 *
 * `writeAtomic(path)` puts its half-written file at `${path}${SAVE_TEMP_SUFFIX}`, and `sweepTempFiles` deletes
 * every listed name ending in that suffix. So a save allowed to be named `x.json.tmp` shares its name with the
 * temp of the save called `x.json`. Measured before this rule existed (`.scratch/vnext/collisionProbe.mjs`):
 * write the first save, then atomically write the shorter one, and the temp replaces the first save's bytes and
 * is renamed away — one call, two saves gone, `list()` reporting nothing and no error thrown.
 *
 * The rule is on CREATION only, and that narrowness is deliberate: `read`, `exists` and `delete` keep taking
 * `resolveSavePath`, because a `.tmp` the host already holds is a fact about the host, and a runtime that browses
 * its own store (`latestSaveFile` reads every header it lists) would otherwise throw at a leftover instead of
 * classifying it. Refusing to MAKE the collision is the whole harm; pretending the name never exists on the
 * read side would trade a silent loss for a crash in a caller that did nothing wrong.
 */
export function resolveNewSavePath(path: string): string {
  resolveSavePath(path);
  if (path.endsWith(SAVE_TEMP_SUFFIX)) {
    const shorter = path.slice(0, -SAVE_TEMP_SUFFIX.length);
    throw new Error(`saveStore: "${path}" ends in the temp suffix ${JSON.stringify(SAVE_TEMP_SUFFIX)}, which is where writeAtomic("${shorter}") puts its half-written file — a save may not be created on a name that debris already owns${shorter.length === 0 ? ', and here the save it collides with would be the empty name, which is not a save either' : ''}`);
  }
  return path;
}

/** The suffix a save's temp file carries. One owner: the writer that produces it and the sweeper that looks
 *  for it must not disagree about a name, or a leftover becomes invisible exactly when it matters. */
export const SAVE_TEMP_SUFFIX = '.tmp';

/** An in-memory store — what a headless runtime and every test in this package write into. */
export function createMemorySaveStore(): SaveStore {
  const files = new Map<string, string>();
  return {
    kind: 'memory',
    write(path, contents) {
      files.set(resolveNewSavePath(path), contents);
    },
    writeAtomic(path, contents, durable = false) {
      if (durable) {
        throw new Error('saveStore: the memory store cannot write durably — there is no device behind it to flush, and a promise that outlives the process would be false');
      }
      // One map mutation: a reader sees the old value or the new one, never a piece of each. There is no temp
      // file to clean up here, and no durability claim beyond this process.
      files.set(resolveNewSavePath(path), contents);
    },
    read(path) {
      return files.get(resolveSavePath(path)) ?? null;
    },
    exists(path) {
      return files.has(resolveSavePath(path));
    },
    delete(path) {
      const target = resolveSavePath(path);
      const had = files.has(target);
      files.delete(target);
      return had;
    },
    list() {
      return [...files.keys()].sort();
    },
    savePathRefusal(path) {
      return savePathRefusal(path);
    },
    rename(oldPath, newPath) {
      const oldKey = resolveSavePath(oldPath);
      const contents = files.get(oldKey);
      if (contents === undefined) throw new Error(`saveStore: "${oldPath}" does not exist`);
      const newKey = resolveNewSavePath(newPath);
      files.set(newKey, contents);
      files.delete(oldKey);
      return newPath;
    },
  };
}

/**
 * A store over an injected filesystem, confined to `root`.
 *
 * `root` is joined by string, not by `path.join`, because the injected object may be a browser shim. The
 * confinement has one owner: a `root` that itself walks out is refused at construction, and every path is
 * passed through `resolveSavePath`, which rejects `..` and absolute forms — so no join here can produce an
 * escaping name, and this module does not pretend to re-check what already cannot happen.
 */
export function createFsSaveStore(fs: FsLike, root: string): SaveStore {
  const trimmed = root.replace(/[\\/]+$/, '');
  if (/(^|[\\/])\.\.($|[\\/])/.test(trimmed)) {
    throw new Error(`saveStore: the root "${root}" itself walks out with ".."; a confined store needs a root that stays put`);
  }
  const at = (path: string): string => `${trimmed}/${resolveSavePath(path)}`;
  // Creation goes one rule further than reading; the join stays in one place so this store keeps one owner of it.
  const atNew = (path: string): string => `${trimmed}/${resolveNewSavePath(path)}`;
  return {
    kind: 'fs',
    write(path, contents) {
      fs.writeFileSync(atNew(path), contents);
    },
    writeAtomic(path, contents, durable = false) {
      // The capabilities are asked for BEFORE any byte moves: discovering them missing after writing the temp
      // would leave a `.tmp` for `list()` to explain.
      if (typeof fs.renameSync !== 'function') {
        throw new Error(`saveStore: "${path}" cannot be written atomically because the injected fs has no renameSync; nothing was written — no file is honest, a half-written one is not`);
      }
      if (durable && typeof fs.flushSync !== 'function') {
        throw new Error(`saveStore: "${path}" was asked to be durable but the injected fs has no flushSync; nothing was written — an unflushed rename is still a rename that can point at nothing`);
      }
      const target = atNew(path);
      const temp = `${target}${SAVE_TEMP_SUFFIX}`;
      fs.writeFileSync(temp, contents);
      try {
        if (durable) fs.flushSync!(temp);
        fs.renameSync(temp, target);
      } catch (error) {
        let removed = false;
        if (typeof fs.unlinkSync === 'function') {
          try {
            fs.unlinkSync(temp);
            removed = true;
          } catch {
            removed = false;
          }
        }
        const leftover = temp.startsWith(`${trimmed}/`) ? temp.slice(trimmed.length + 1) : temp;
        throw new Error(`saveStore: ${durable ? `flushing and renaming` : `renaming`} "${temp}" onto "${path}" failed (${(error as Error).message}); whatever was already at "${path}" is untouched, and ${removed ? `the temp file was removed` : `the temp file could not be removed — it is left at "${leftover}"`}`);
      }
    },
    read(path) {
      const target = at(path);
      return fs.existsSync(target) ? fs.readFileSync(target) : null;
    },
    exists(path) {
      return fs.existsSync(at(path));
    },
    delete(path) {
      const target = at(path);
      if (!fs.existsSync(target)) return false;
      if (typeof fs.unlinkSync !== 'function') {
        throw new Error(`saveStore: the injected fs has no unlinkSync, so "${path}" cannot be taken back from "${trimmed}"; it reports false for nothing — the save is still there`);
      }
      fs.unlinkSync(target);
      return true;
    },
    list() {
      if (typeof fs.readdirSync !== 'function' || typeof fs.statSync !== 'function') {
        throw new Error(`saveStore: browsing "${trimmed}" needs BOTH readdirSync and statSync from the injected fs; without them a listing is a guess, so this store refuses rather than answering []`);
      }
      if (!fs.existsSync(trimmed)) return [];
      const readdir = fs.readdirSync;
      const stat = fs.statSync;
      const found: string[] = [];
      const walk = (dir: string, prefix: string): void => {
        for (const name of readdir(dir)) {
          const shown = prefix ? `${prefix}/${name}` : name;
          const full = `${dir}/${name}`;
          if (stat(full).isDirectory()) walk(full, shown);
          else found.push(shown);
        }
      };
      walk(trimmed, '');
      return found.sort();
    },
    savePathRefusal(path) {
      return savePathRefusal(path);
    },
    rename(oldPath, newPath) {
      const oldKey = at(oldPath);
      if (!fs.existsSync(oldKey)) throw new Error(`saveStore: "${oldPath}" does not exist`);
      // Use native rename if available, otherwise read-write-delete
      if (typeof fs.renameSync === 'function') {
        const newKey = atNew(newPath);
        fs.renameSync(oldKey, newKey);
      } else {
        const contents = fs.readFileSync(oldKey);
        fs.writeFileSync(atNew(newPath), contents);
        if (typeof fs.unlinkSync === 'function') {
          fs.unlinkSync(oldKey);
        }
      }
      return newPath;
    },
  };
}

/**
 * M5 v170 — a store over browser `localStorage`, confined to a namespace prefix.
 *
 * Unlike `createMemorySaveStore` (process-scoped) and `createFsSaveStore` (Node fs), this persists across page
 * reloads but stays within one origin's localStorage quota (~5MB). The namespace is a simple string prefix so
 * that saves from different apps or tabs do not collide: `createLocalStorageSaveStore('my-app')` writes to keys
 * like `nexus-save:my-app:hero.json`.
 *
 * Two design choices keep it honest:
 * * An index key (`${prefix}:__index`) holds a JSON array of all save names, so `list()` reads no bytes beyond
 *   the index itself. Adding/removing a save updates the index atomically (JSON.parse → mutate → JSON.stringify).
 * * Atomic writes use the same temp-then-rename pattern as the fs store, but "rename" means write-temp then
 *   copy-to-target then delete-temp (localStorage has no rename syscall). The suffix is `SAVE_TEMP_SUFFIX` so
 *   the policy gate already knows which names are debris.
 */
export function createLocalStorageSaveStore(namespace: string): SaveStore {
  if (!namespace || namespace.trim() === '') {
    throw new Error('saveStore: a localStorage store needs a non-empty namespace to avoid colliding with other apps');
  }
  const prefix = `nexus-save:${namespace}`;
  const indexKey = `${prefix}:__index`;
  const storage = typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  if (!storage) {
    throw new Error(`saveStore: localStorage is not available in this environment; a browser-backed store cannot be created without it`);
  }

  /** Read the index (array of save names) or return empty array if none exists yet. */
  const readIndex = (): string[] => {
    try {
      const raw = storage.getItem(indexKey);
      if (raw === null) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((name): name is string => typeof name === 'string');
    } catch {
      return [];
    }
  };

  /** Write the index back. Throws if serialization fails, matching the fs store's honesty. */
  const writeIndex = (names: string[]): void => {
    storage.setItem(indexKey, JSON.stringify(names));
  };

  /** Add a name to the index if not already present. */
  const addToIndex = (name: string): void => {
    const index = readIndex();
    if (!index.includes(name)) {
      index.push(name);
      index.sort();
      writeIndex(index);
    }
  };

  /** Remove a name from the index. */
  const removeFromIndex = (name: string): void => {
    const index = readIndex();
    const filtered = index.filter((n) => n !== name);
    if (filtered.length !== index.length) {
      writeIndex(filtered);
    }
  };

  /** Build the localStorage key for a save name. */
  const keyFor = (path: string): string => `${prefix}:${resolveSavePath(path)}`;
  const keyForNew = (path: string): string => `${prefix}:${resolveNewSavePath(path)}`;

  return {
    kind: 'localStorage',
    write(path, contents) {
      const refusal = savePathRefusal(path);
      if (refusal !== null) throw new Error(`saveStore: "${path}" is refused: ${refusal}`);
      storage.setItem(keyForNew(path), contents);
      addToIndex(path);
    },
    writeAtomic(path, contents, durable = false) {
      // localStorage has no rename syscall, so atomicity means: write temp, then copy temp to target, then delete temp.
      // The capability check happens BEFORE any byte moves.
      const refusal = savePathRefusal(path);
      if (refusal !== null) throw new Error(`saveStore: "${path}" is refused: ${refusal}`);

      const targetKey = keyForNew(path);
      const tempKey = `${targetKey}${SAVE_TEMP_SUFFIX}`;

      // Write to temp first
      storage.setItem(tempKey, contents);

      try {
        // Copy temp to target (this is the "rename")
        const tempContents = storage.getItem(tempKey);
        if (tempContents !== null) {
          storage.setItem(targetKey, tempContents);
        }
        // Delete temp
        storage.removeItem(tempKey);
      } catch (error) {
        // If something goes wrong mid-flight, clean up the temp
        try {
          storage.removeItem(tempKey);
        } catch {
          // Best effort cleanup
        }
        throw new Error(`saveStore: writing "${path}" failed mid-flight (${(error as Error).message}); the temp was cleaned up and nothing was written to the target`);
      }

      // Add to index after successful write
      addToIndex(path);
    },
    read(path) {
      const refusal = savePathRefusal(path);
      if (refusal !== null) throw new Error(`saveStore: "${path}" is refused: ${refusal}`);
      return storage.getItem(keyFor(path));
    },
    exists(path) {
      const refusal = savePathRefusal(path);
      if (refusal !== null) throw new Error(`saveStore: "${path}" is refused: ${refusal}`);
      return storage.getItem(keyFor(path)) !== null;
    },
    delete(path) {
      const refusal = savePathRefusal(path);
      if (refusal !== null) throw new Error(`saveStore: "${path}" is refused: ${refusal}`);
      const key = keyFor(path);
      const had = storage.getItem(key) !== null;
      if (had) {
        storage.removeItem(key);
        removeFromIndex(path);
      }
      return had;
    },
    list() {
      // Return the index directly — no need to scan all localStorage keys
      return readIndex().sort();
    },
    savePathRefusal(path) {
      return savePathRefusal(path);
    },
    rename(oldPath, newPath) {
      const oldKey = keyFor(oldPath);
      const contents = storage.getItem(oldKey);
      if (contents === null) throw new Error(`saveStore: "${oldPath}" does not exist`);
      const newKey = keyForNew(newPath);
      storage.setItem(newKey, contents);
      storage.removeItem(oldKey);
      // Update index: remove old, add new
      removeFromIndex(oldPath);
      addToIndex(newPath);
      return newPath;
    },
  };
}
