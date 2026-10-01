/**
 * Real-repo ingestion (M2 v2, §63 repo understanding). The runtime package stays free of
 * node:fs at module level: the caller injects a minimal fs adapter (node's API satisfies it),
 * which keeps this pure, hermetically testable, and honest about what touches the host (§60).
 */
export interface FsDirentLike {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

export interface FsLike {
  readdirSync(dir: string, options: { withFileTypes: true }): FsDirentLike[];
  statSync(p: string): { size: number };
  readFileSync(p: string, encoding: 'utf8'): string;
}

export interface IngestOptions {
  skipDirs?: Set<string>;
  extensions?: RegExp;
  maxBytes?: number;
  maxFiles?: number;
}

export const DEFAULT_SKIP_DIRS: Set<string> = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'coverage',
  '.turbo',
]);
const DEFAULT_EXTENSIONS = /\.(ts|tsx|js|jsx|md|json|css)$/i;
const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_MAX_FILES = 5000;

/** Walk `root` and return `path → content` (slash-relative, sorted) for buildIndex/InMemoryWorkspace. */
export function collectTextFiles(root: string, fsLike: FsLike, opts: IngestOptions = {}): Record<string, string> {
  const skip = opts.skipDirs ?? DEFAULT_SKIP_DIRS;
  const ext = opts.extensions ?? DEFAULT_EXTENSIONS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;

  const found: Record<string, string> = {};
  const base = root.replace(/[\\/]+$/, '');

  const walk = (absDir: string, relDir: string, preloaded?: FsDirentLike[]): void => {
    if (Object.keys(found).length >= maxFiles) return;
    let entries: FsDirentLike[];
    if (preloaded) {
      entries = preloaded;
    } else {
      try {
        entries = fsLike.readdirSync(absDir, { withFileTypes: true });
      } catch {
        return; // unreadable directory: skip rather than abort the walk
      }
    }
    for (const ent of entries) {
      if (Object.keys(found).length >= maxFiles) return;
      const abs = `${absDir}/${ent.name}`;
      const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        if (skip.has(ent.name)) continue;
        // A directory carrying its own `.git` is ANOTHER repository — a clone, a scratch checkout, a
        // submodule worktree — and its files belong to that tree, not this one. A name-based skip
        // cannot be the answer (`vnext/plane4` is not a magic name): the rule reads the directory.
        // Measured 2026-10-01 (ADR 0016 amendment 149): seven such clones under `.scratch/` made the
        // walked tree 1787 files instead of ~360, and their copies of `geometry.ts` took every slot
        // of the real file's top-5. The ROOT is never tested this way — a walk that started inside a
        // repository must not refuse it — so a submodule's content is not indexed here (it answers to
        // another tree; this repo has none).
        let childEntries: FsDirentLike[];
        try {
          childEntries = fsLike.readdirSync(abs, { withFileTypes: true });
        } catch {
          continue; // unreadable: the walk would have returned on this same read
        }
        if (childEntries.some((e) => e.name === '.git')) continue;
        walk(abs, rel, childEntries);
      } else if (ent.isFile() && ext.test(ent.name)) {
        try {
          if (fsLike.statSync(abs).size > maxBytes) continue;
          found[rel] = fsLike.readFileSync(abs, 'utf8');
        } catch {
          // oversized/binary/racing delete — skipping is honest, crashing is not
        }
      }
    }
  };

  walk(base, '');
  return Object.fromEntries(Object.entries(found).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
}
