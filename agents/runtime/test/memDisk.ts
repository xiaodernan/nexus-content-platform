/**
 * v229 — ONE in-memory `FsWriteLike`, and the directory-listing policy declared instead of implied.
 *
 * Eleven suites in this directory each defined their own `MemDisk`/`FakeDisk` for the same seam, and under
 * that one name they answered `readdirSync` THREE different ways: five threw "not implemented for this
 * suite", two answered an EMPTY listing, three answered a REAL one (three of those byte-identical), and
 * `durability` carried a fourth shape with directories and `withFileTypes`. Same name, different disk — so
 * "the mock" meant something different in every file, and a suite that needed a listing had no way to say so.
 *
 * This is that disk once. The bodies are identical everywhere they existed (`readFileSync`/`statSync`/
 * `mkdirSync`/`writeFileSync` differed only in the `statSync` of the two empty ones), so only the LISTING
 * POLICY is a choice, and it is named at each call site:
 *
 *  - `'refuse'` — this suite never lists, and a directory read here is a bug in the TEST. It throws, which is
 *    the answer v206 argued for: "a mock that reports 'no entries' for a disk that HAS entries is the kind of
 *    lie a future test would pass against."
 *  - `'empty'` — the code path under test may ask, and the honest answer for THIS suite is that it holds
 *    nothing. Deliberately the dangerous one: it is indistinguishable from "the listing is broken", so it
 *    exists only where a case measured that it is what the suite means.
 *  - `'real'` — a true flat listing of `files`, directories included, which is what `loadMemoryStore`,
 *    `rescanIndex` and the vector store actually need.
 *
 * What each suite takes is a POLICY, not a copy: the three byte-identical 'real' disks became one call, and
 * the five byte-identical 'refuse' disks became one call, so a fix to the listing is a fix in one place.
 */
import type { FsDirentLike } from '../src/realfs.js';

/** What this disk answers when a caller reads a directory. */
export type MemDiskListing = 'refuse' | 'empty' | 'real';

export interface MemDiskOptions {
  /** The listing policy. Defaults to `'refuse'` — the safe one. */
  listing?: MemDiskListing;
  /** Files to start with. Directories are derived from the paths, so `'real'` can report them. */
  seed?: Record<string, string>;
}

export interface MemDisk {
  files: Map<string, string>;
  /** Every directory any seeded or written path implies, as `durability`'s FakeDisk tracked them. */
  dirs: Set<string>;
  readdirSync(dir: string): FsDirentLike[];
  statSync(p: string): { size: number };
  readFileSync(p: string): string;
  mkdirSync(dir: string): void;
  writeFileSync(p: string, data: string): void;
}

/** The one flat listing, shared by every policy that answers one: the immediate children of `dir`, with
 *  directories reported as directories. A `dir` of `''` is the root, the shape `durability` needed. */
function listingOf(disk: MemDisk, dir: string): FsDirentLike[] {
  const prefix = dir === '' ? '' : `${dir}/`;
  const names = new Map<string, FsDirentLike>();
  const add = (name: string, isDir: boolean) => {
    if (name.length === 0 || names.has(name)) return;
    names.set(name, { name, isDirectory: () => isDir, isFile: () => !isDir });
  };
  for (const p of disk.dirs) {
    if (!p.startsWith(prefix) || p === prefix) continue;
    const rest = p.slice(prefix.length);
    if (!rest.includes('/')) add(rest, true);
  }
  for (const p of disk.files.keys()) {
    if (!p.startsWith(prefix) || p === prefix) continue;
    const rest = p.slice(prefix.length);
    if (!rest.includes('/')) add(rest, false);
  }
  return [...names.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function createMemDisk(options: MemDiskOptions = {}): MemDisk {
  const listing = options.listing ?? 'refuse';
  const disk: MemDisk = {
    files: new Map(),
    dirs: new Set(),
    readdirSync(dir: string): FsDirentLike[] {
      if (listing === 'refuse') {
        throw new Error(`MemDisk.readdirSync is not implemented for this suite — this disk was built with the 'refuse' listing policy and nothing here lists (asked for ${JSON.stringify(dir)})`);
      }
      if (listing === 'empty') return [];
      return listingOf(disk, dir);
    },
    statSync(p: string): { size: number } {
      const c = disk.files.get(p);
      if (c === undefined) throw new Error(`no such file: ${p}`);
      return { size: c.length };
    },
    readFileSync(p: string): string {
      const c = disk.files.get(p);
      if (c === undefined) throw new Error(`no such file: ${p}`);
      return c;
    },
    mkdirSync(dir: string): void {
      // `durability`'s FakeDisk is the only one of the eleven that records a directory at all, and a case
      // that makes one and then lists its parent expects to SEE it — so this is the shared answer rather
      // than the no-op the 'real' suites carried. A no-op here would make `mkdirSync` a lie.
      for (const p of dir.split('/')) void p;
      const parts = dir.split('/');
      for (let i = 1; i <= parts.length; i++) disk.dirs.add(parts.slice(0, i).join('/'));
    },
    writeFileSync(p: string, data: string): void {
      // Writes do NOT derive directories, matching `durability`: a file is a file, and whether its parent
      // exists is `mkdirSync`'s answer to give. Deriving here would make a listing report a directory the
      // caller never made.
      disk.files.set(p, data);
    },
  };
  for (const [p, content] of Object.entries(options.seed ?? {})) {
    // A SEED path implies its parent directories, the way `durability`'s FakeDisk constructor derived them
    // (`out/a/x.md` makes `out` and `out/a`) — a walk that reads the root must be able to reach a nested seed.
    // A later `writeFileSync` does NOT derive (see below): only the initial seed, which is a whole tree, does.
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) disk.dirs.add(parts.slice(0, i).join('/'));
    disk.writeFileSync(p, content);
  }
  return disk;
}
