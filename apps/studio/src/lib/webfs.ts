import type { FsDirentLike, FsWriteLike } from '@nexus/agent-runtime';

/**
 * M2 v13: the runtime's injected-fs seam mapped onto browser storage. Same interface the
 * node proofs use (`FsWriteLike`), so `saveMemory/loadMemoryStore` and `saveIndex/loadIndex`
 * run UNCHANGED in the page — durability here is exactly the machinery already proven
 * across a process boundary in Node (§60: no separate browser implementation to drift).
 */
export const WEBFS_NS = 'nexus.agentFs.v1:';
const INDEX = WEBFS_NS + '__keys';

interface Kv {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

const norm = (p: string): string => p.replace(/\\/g, '/');

export function createWebFs(kv: Kv): FsWriteLike {
  const keys = (): string[] => {
    const raw = kv.getItem(INDEX) ?? '';
    return raw === '' ? [] : [...new Set(raw.split('\n').filter(Boolean))];
  };
  const remember = (file: string): void => {
    const all = keys();
    if (!all.includes(file)) kv.setItem(INDEX, [...all, file].sort().join('\n'));
  };

  return {
    readdirSync(dir: string, opts: { withFileTypes: true }): FsDirentLike[] {
      void opts;
      const prefix = dir === '' || dir === '.' ? '' : `${norm(dir)}/`;
      const names = new Map<string, FsDirentLike>();
      for (const file of keys()) {
        if (!file.startsWith(prefix) || file === prefix) continue;
        const rest = file.slice(prefix.length);
        if (!rest) continue;
        const head = rest.split('/')[0]!;
        const isDir = rest.includes('/');
        names.set(`${prefix}${head}${isDir ? '/' : ''}`, {
          name: head,
          isDirectory: () => isDir,
          isFile: () => !isDir,
        });
      }
      return [...names.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
    statSync(p: string): { size: number } {
      const c = kv.getItem(WEBFS_NS + norm(p));
      if (c === null) throw new Error(`no such file: ${p}`);
      return { size: c.length };
    },
    readFileSync(p: string): string {
      const c = kv.getItem(WEBFS_NS + norm(p));
      if (c === null) throw new Error(`no such file: ${p}`);
      return c;
    },
    mkdirSync(): void {
      // key-value store: parents exist implicitly
    },
    writeFileSync(p: string, data: string): void {
      kv.setItem(WEBFS_NS + norm(p), data);
      remember(norm(p));
    },
  };
}

/** Wipe every agent-fs file + the index (tests, dock reset). Returns files removed. */
export function clearWebFs(kv: Kv): number {
  const files = (kv.getItem(INDEX) ?? '').split('\n').filter(Boolean);
  for (const f of files) {
    if (kv.removeItem) kv.removeItem(WEBFS_NS + f);
    else kv.setItem(WEBFS_NS + f, '');
  }
  if (kv.removeItem) kv.removeItem(INDEX);
  else kv.setItem(INDEX, '');
  return files.length;
}
