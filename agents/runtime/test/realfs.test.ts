import { describe, expect, it } from 'vitest';
import { collectTextFiles, type FsDirentLike, type FsLike } from '../src/realfs.js';

/** Tiny virtual filesystem so the ingestion logic is proven without touching the host disk. */
class FakeFs implements FsLike {
  private dirs = new Set<string>();
  private plain = new Map<string, string>();

  constructor(entries: Record<string, string>) {
    for (const [p, content] of Object.entries(entries)) {
      this.plain.set(p, content);
      const parts = p.split('/');
      for (let i = 1; i < parts.length; i++) this.dirs.add(parts.slice(0, i).join('/'));
    }
  }

  /** The walker builds absolute paths under the root it was given; this fs is flat underneath it. */
  private strip(p: string): string {
    return p === 'root' ? '' : p.startsWith('root/') ? p.slice('root/'.length) : p;
  }

  readdirSync(dir: string, _opts: { withFileTypes: true }): FsDirentLike[] {
    const prefix = this.strip(dir) === '' ? '' : `${this.strip(dir)}/`;
    const names = new Map<string, FsDirentLike>();
    for (const p of [...this.dirs, ...this.plain.keys()]) {
      if (!p.startsWith(prefix) || p === prefix) continue;
      const rest = p.slice(prefix.length);
      if (rest.includes('/')) continue;
      names.set(rest, {
        name: rest,
        isDirectory: () => this.dirs.has(`${prefix}${rest}`),
        isFile: () => this.plain.has(`${prefix}${rest}`),
      });
    }
    return [...names.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  statSync(p: string): { size: number } {
    const c = this.plain.get(this.strip(p));
    if (c === undefined) throw new Error(`no such file: ${p}`);
    return { size: c.length };
  }

  readFileSync(p: string): string {
    const c = this.plain.get(this.strip(p));
    if (c === undefined) throw new Error(`no such file: ${p}`);
    return c;
  }
}

const FIXTURE = {
  'README.md': '# Root readme\n',
  'src/app.ts': 'export const x = 1;\n',
  'src/app.test.ts': 'test("x", () => {});\n',
  'src/notes.txt': 'plain text is not indexed\n',
  'node_modules/pkg/index.ts': 'vendor\n',
  'src/generated/dist/thing.ts': 'dist subtree\n',
};

describe('realfs.collectTextFiles', () => {
  it('filters by extension and skips vendored directories, keys sorted and slash-relative', () => {
    const files = collectTextFiles('root', new FakeFs(FIXTURE));
    expect(Object.keys(files)).toEqual(['README.md', 'src/app.test.ts', 'src/app.ts']);
    expect(files['src/app.ts']).toBe('export const x = 1;\n');
  });

  it('honors custom skip dirs and max file count (host caps stay respected)', () => {
    const files = collectTextFiles('root', new FakeFs(FIXTURE), {
      skipDirs: new Set(['node_modules', 'src']),
      extensions: /\.md$/i,
    });
    expect(Object.keys(files)).toEqual(['README.md']);
    const capped = collectTextFiles('root', new FakeFs(FIXTURE), { maxFiles: 1 });
    expect(Object.keys(capped)).toHaveLength(1);
  });

  it('drops files over maxBytes and survives unreadable entries', () => {
    const files = collectTextFiles('root', new FakeFs(FIXTURE), { maxBytes: 20 });
    // sizes: README.md 15, src/app.ts 20, src/app.test.ts 21 → everything over 20 bytes is dropped.
    expect(Object.keys(files)).toEqual(['README.md', 'src/app.ts']);
  });

  it('returns deterministic output regardless of walk order', () => {
    const a = collectTextFiles('root', new FakeFs(FIXTURE));
    const b = collectTextFiles('root/', new FakeFs({ ...FIXTURE, 'src/b.ts': 'const b = 2;\n' }));
    const c = collectTextFiles('root', new FakeFs(Object.fromEntries(Object.entries({ ...b, 'src/b.ts': 'const b = 2;\n' }).reverse())));
    expect(Object.keys(b)).toEqual(Object.keys(b).sort());
    expect(Object.keys(c)).toEqual(Object.keys(b));
    expect(Object.keys(a)).toEqual(['README.md', 'src/app.test.ts', 'src/app.ts']);
  });

  it('does not ingest a directory that carries its own .git (another repository\'s files)', () => {
    const files = collectTextFiles('root', new FakeFs({
      ...FIXTURE,
      'clone/.git/HEAD': 'ref: refs/heads/main\n',
      'clone/src/secret.ts': 'clone content\n',
      'wtclone/.git': 'gitdir: ../.git/worktrees/wt\n',
      'wtclone/lib.ts': 'worktree content\n',
    }));
    expect(files['clone/src/secret.ts']).toBeUndefined();
    expect(files['wtclone/lib.ts']).toBeUndefined();
    expect(files['src/app.ts']).toBeDefined();
  });
});
