/**
 * Direct coverage for `renamePairNotice` / `quotedPathNotice` (agents/exec-host/src/gitTools.ts).
 *
 * Both live behind `pathShapeNotices`, which gitTools.test.ts reaches indirectly, so their own
 * wording / pluralization / empty-array behaviour was never asserted directly. Per house
 * discipline an untested branch *is* the next increment.
 */
import { describe, expect, it } from 'vitest';
import { quotedPathNotice, renamePairNotice } from '../src/gitTools.js';

describe('renamePairNotice', () => {
  it('phrases a single pair with singular wording and both names', () => {
    const s = renamePairNotice([{ from: 'a.md', to: 'b.md' }]);
    expect(s).toContain('1 rename/copy PAIR(s)');
    expect(s).toContain('a.md -> b.md');
    expect(s).toContain('the left name is what HEAD knows and the right name is what is on disk');
  });

  it('joins multiple pairs with commas', () => {
    const s = renamePairNotice([
      { from: 'a.md', to: 'b.md' },
      { from: 'c.ts', to: 'd.ts' },
    ]);
    expect(s).toContain('2 rename/copy PAIR(s)');
    expect(s).toContain('a.md -> b.md, c.ts -> d.ts');
  });

  it('still produces a coherent sentence for an empty list (0 pairs)', () => {
    const s = renamePairNotice([]);
    expect(s).toContain('0 rename/copy PAIR(s)');
    expect(s).toContain('the left name is what HEAD knows');
  });
});

describe('quotedPathNotice', () => {
  it('phrases a single escaped path with singular wording', () => {
    const s = quotedPathNotice(['"a b.md"']);
    expect(s).toContain('1 path(s) arrive in git\'s C-QUOTED RENDERING with escapes inside ("a b.md")');
    expect(s).toContain('it will not open, will not match a pathspec, and must not be passed on as one');
  });

  it('lists every escaped path and reads plural for more than one', () => {
    const s = quotedPathNotice(['"a.md"', '"b c.ts"']);
    expect(s).toContain('2 path(s) arrive in git\'s C-QUOTED RENDERING with escapes inside ("a.md", "b c.ts")');
  });

  it('handles the empty list without throwing', () => {
    const s = quotedPathNotice([]);
    expect(s).toContain('0 path(s) arrive in git\'s C-QUOTED RENDERING with escapes inside ()');
  });
});
