/**
 * v229 — the shared `MemDisk` and its three listing policies, pinned.
 *
 * Eleven suites in this directory each carried their own copy of this disk, and under the one name they
 * answered `readdirSync` three different ways (five threw, two answered an empty listing, three answered a
 * real one). They are one disk now, and the policy is a named option — so the policies themselves need cases:
 * a disk whose listing behaviour is nobody's assertion is the same hazard in a new place.
 *
 * The `'empty'` policy is pinned DELIBERATELY as the dangerous one: it answers "no entries" for a disk that
 * has entries, and only a case that says so makes that visible. `v206` is the reason the other two exist.
 */
import { describe, expect, it } from 'vitest';
import { createMemDisk } from './memDisk.js';

describe('the shared MemDisk\u2019s listing policies (v229)', () => {
  it("'refuse' throws, naming the policy and the directory it was asked for", () => {
    const disk = createMemDisk({ listing: 'refuse' });
    disk.writeFileSync('docs/a.md', 'a');

    expect(() => disk.readdirSync('docs')).toThrow(/not implemented for this suite/);
    expect(() => disk.readdirSync('docs')).toThrow(/listing: 'refuse'|'refuse' listing policy/);
    expect(() => disk.readdirSync('docs')).toThrow(/"docs"/);
  });

  it("'refuse' refuses the LISTING only — the file bodies still answer, so the policy is about one verb", () => {
    // A policy that threw for everything would be a different (and useless) disk. The point of v206's
    // comment was that `readdirSync`/`statSync` had NEITHER: one verb missing is a gap, two is a mock.
    const disk = createMemDisk({ listing: 'refuse' });
    disk.writeFileSync('docs/a.md', 'hello');

    expect(disk.readFileSync('docs/a.md')).toBe('hello');
    expect(disk.statSync('docs/a.md')).toEqual({ size: 5 });
    expect(() => disk.statSync('docs/missing.md')).toThrow(/no such file: docs\/missing\.md/);
  });

  it("'real' answers an EMPTY directory truthfully, which is the only honest way to get one", () => {
    // The eleven's 'empty' policy was removed because it was strictly dominated: it answered [] for a disk
    // that HAD entries, and every use of it was either that lie or this case — an empty disk, which 'real'
    // already answers correctly. Measured when the two suites carrying it were tightened (v229): both stayed
    // green, so the dangerous answer was never load-bearing anywhere.
    const empty = createMemDisk({ listing: 'real' });
    expect(empty.readdirSync('docs')).toEqual([]);

    const seeded = createMemDisk({ listing: 'real', seed: { 'docs/a.md': 'a' } });
    expect(seeded.readdirSync('docs').map((e) => e.name)).toEqual(['a.md']);
  });

  it("'real' lists the immediate children of a directory, files and directories both", () => {
    const disk = createMemDisk({ listing: 'real', seed: { 'docs/a.md': 'a', 'docs/sub/b.md': 'b', 'top.md': 't' } });

    expect(disk.readdirSync('docs').map((e) => `${e.name}:${e.isDirectory() ? 'dir' : 'file'}`)).toEqual(['a.md:file', 'sub:dir']);
    expect(disk.readdirSync('docs/sub').map((e) => e.name)).toEqual(['b.md']);
    expect(disk.readdirSync('top.md')).toEqual([]);
  });

  it("'real' reports a directory made by mkdirSync, and the root listing reaches a seeded tree", () => {
    // `mkdirSync` records the directory (durability's FakeDisk was the only one of the eleven that did), so a
    // case that makes one and lists its parent sees it — a no-op mkdirSync would make the verb a lie.
    const disk = createMemDisk({ listing: 'real' });
    disk.mkdirSync('out/nested');
    disk.writeFileSync('out/nested/x.md', 'x');

    expect(disk.readdirSync('out').map((e) => `${e.name}:${e.isDirectory() ? 'dir' : 'file'}`)).toEqual(['nested:dir']);
    expect(disk.readdirSync('').map((e) => e.name)).toEqual(['out']);
    expect(disk.readdirSync('out/nested').map((e) => e.name)).toEqual(['x.md']);
  });

  it("a writeFileSync does NOT invent its parent directory", () => {
    // The difference between this disk and `durability`'s would-be cousin: a file is a file, and whether its
    // parent exists is `mkdirSync`'s answer to give. Deriving here would list a directory nobody made.
    const disk = createMemDisk({ listing: 'real' });
    disk.writeFileSync('made/by/accident.md', 'x');

    expect(disk.readdirSync('')).toEqual([]);
    expect(disk.readdirSync('made')).toEqual([]);
  });

  it("a SEED derives its own directories, because a seed is a whole tree", () => {
    const disk = createMemDisk({ listing: 'real', seed: { 'out/a/x.md': 'x' } });

    expect(disk.readdirSync('').map((e) => e.name)).toEqual(['out']);
    expect(disk.readdirSync('out').map((e) => `${e.name}:${e.isDirectory() ? 'dir' : 'file'}`)).toEqual(['a:dir']);
    expect(disk.readdirSync('out/a').map((e) => e.name)).toEqual(['x.md']);
  });

  it("the default policy is the safe one, so a new suite starts by refusing to list", () => {
    const disk = createMemDisk();
    disk.writeFileSync('a.md', 'a');

    expect(() => disk.readdirSync('')).toThrow(/not implemented/);
  });

  it('the listing is deterministic and sorted, so a case never depends on Map order', () => {
    const disk = createMemDisk({ listing: 'real' });
    disk.writeFileSync('d/c.md', 'c');
    disk.writeFileSync('d/a.md', 'a');
    disk.writeFileSync('d/b.md', 'b');

    expect(disk.readdirSync('d').map((e) => e.name)).toEqual(['a.md', 'b.md', 'c.md']);
    expect(disk.readdirSync('d').map((e) => e.name)).toEqual(disk.readdirSync('d').map((e) => e.name));
  });
});
