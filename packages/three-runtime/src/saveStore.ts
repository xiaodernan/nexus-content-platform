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
}

/** Where a save file goes and how it comes back. Sync, because the rest of the runtime is. */
export interface SaveStore {
  /** Which implementation this is: `'memory'` or `'fs'`. Never guessed by callers. */
  readonly kind: string;
  write(path: string, contents: string): void;
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
}

/**
 * Reject a path that would leave the store's own namespace, and return it unchanged otherwise.
 *
 * A save name arrives from a caller (and, on the read side, from a file a caller picked up somewhere), so the
 * absolute-form and `..` checks are the boundary. `''`, `.` and a trailing separator are refused too: a
 * "directory" is not a file name, and a store that wrote one would produce a save no reader could find.
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
  return path;
}

/** An in-memory store — what a headless runtime and every test in this package write into. */
export function createMemorySaveStore(): SaveStore {
  const files = new Map<string, string>();
  return {
    kind: 'memory',
    write(path, contents) {
      files.set(resolveSavePath(path), contents);
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
  return {
    kind: 'fs',
    write(path, contents) {
      fs.writeFileSync(at(path), contents);
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
  };
}
