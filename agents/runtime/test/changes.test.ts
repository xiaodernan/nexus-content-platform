import { describe, expect, it } from 'vitest';
import { applyPatch, computeFilePatch, createChangeSet, formatUnifiedDiff, inversePatch } from '../src/changes.js';

const BEFORE = 'line1\nline2\nline3\nline4\nline5\n';
const AFTER = 'line1\nline2\ninserted\nline3\nline4\nchanged5\n';

describe('changes: patch round-trips', () => {
  it('computeFilePatch → applyPatch reproduces the after-content', () => {
    const p = computeFilePatch('f.txt', BEFORE, AFTER);
    expect(applyPatch(BEFORE, p)).toBe(AFTER);
    expect(p.added).toBe(2);
    expect(p.removed).toBe(1);
  });

  it('inversePatch reverts to the before-content', () => {
    const p = computeFilePatch('f.txt', BEFORE, AFTER);
    expect(applyPatch(AFTER, inversePatch(p))).toBe(BEFORE);
  });

  it('identical inputs yield a pure-context patch with zero adds/dels', () => {
    const p = computeFilePatch('f.txt', BEFORE, BEFORE);
    expect(p.added).toBe(0);
    expect(p.removed).toBe(0);
    expect(p.ops.every((o) => o.type === 'ctx')).toBe(true);
  });

  it('created and removed files degrade to all-add / all-del', () => {
    const created = computeFilePatch('new.ts', '', 'a\nb\n');
    expect(created.ops.every((o) => o.type !== 'del')).toBe(true);
    expect(applyPatch('', created)).toBe('a\nb\n');
    const removed = computeFilePatch('gone.ts', 'a\nb\n', '');
    expect(applyPatch('a\nb\n', removed)).toBe('');
  });

  it('applyPatch refuses mismatched inputs instead of corrupting', () => {
    const p = computeFilePatch('f.txt', BEFORE, AFTER);
    expect(() => applyPatch('totally\ndifferent\n', p)).toThrow(/does not apply/);
  });
});

describe('changes: change sets + unified diff', () => {
  it('createChangeSet reports only changed, sorted paths', () => {
    const cs = createChangeSet('run-1', { 'b.ts': 'x\n', 'a.ts': 'y\n', 'c.ts': 'same\n' }, { 'b.ts': 'x2\n', 'a.ts': 'y\n', 'c.ts': 'same\n', 'd.ts': 'new\n' });
    expect(cs.files.map((f) => f.path)).toEqual(['b.ts', 'd.ts']);
    expect(cs.files[1]!.ops.every((o) => o.type !== 'del')).toBe(true);
  });

  it('formatUnifiedDiff emits headers, hunk ranges and +/- lines with context', () => {
    const p = computeFilePatch('f.txt', BEFORE, AFTER);
    const text = formatUnifiedDiff(p, 1);
    const lines = text.split('\n');
    expect(lines[0]).toBe('--- a/f.txt');
    expect(lines[1]).toBe('+++ b/f.txt');
    expect(lines[2]).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@$/);
    expect(lines.some((l) => l.startsWith('+inserted'))).toBe(true);
    expect(lines.some((l) => l.startsWith('-line5'))).toBe(true);
    expect(lines.some((l) => l.startsWith(' line3'))).toBe(true);
    expect(text.endsWith('\n')).toBe(true);
  });

  it('a change set round-trips a whole snapshot through its patches', () => {
    const before: Record<string, string> = { 'a.md': '# A\n\ntext\n', 'b.md': '# B\n' };
    const after: Record<string, string> = { 'a.md': '# A\n\ntext edited\n', 'b.md': '# B\n', 'c.md': '# C\n' };
    const cs = createChangeSet('run-2', before, after);
    const rebuilt: Record<string, string> = { ...before };
    for (const f of cs.files) rebuilt[f.path] = applyPatch(before[f.path] ?? '', f);
    expect(rebuilt).toEqual(after);
  });
});
