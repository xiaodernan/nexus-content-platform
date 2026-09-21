import { describe, expect, it } from 'vitest';
import { buildIndex, chunkFile, extractSymbols, fileKind, queryIndex } from '../src/codeIndex.js';

const TS_FILE = [
  "import { create } from 'zustand';",
  'export const MAX = 3;',
  'export function buildThing(a: number): number {',
  '  return a + MAX;',
  '}',
  'class Runner {}',
].join('\n');

const MD_FILE = '# Title\n\nintro line\n\n## Setup\n\nrun npm test\n\n## Deep Topic\n\nexplanation of widget rotation baking\n';

describe('codeIndex: structure extraction', () => {
  it('classifies kinds by extension', () => {
    expect(fileKind('a/b.ts')).toBe('typescript');
    expect(fileKind('x.md')).toBe('markdown');
    expect(fileKind('y.json')).toBe('json');
    expect(fileKind('z.txt')).toBe('other');
  });
  it('extracts ts symbols and markdown headings deterministically', () => {
    expect(extractSymbols('typescript', TS_FILE)).toEqual(['MAX', 'buildThing', 'Runner']);
    expect(extractSymbols('markdown', MD_FILE)).toEqual(['Title', 'Setup', 'Deep Topic']);
  });
  it('chunks markdown by heading sections and code by 40-line windows', () => {
    const md = chunkFile('doc.md', MD_FILE);
    expect(md.map((c) => c.heading)).toEqual(['Title', 'Setup', 'Deep Topic']);
    expect(md[2]!.text).toContain('widget rotation baking');
    const code = chunkFile('big.ts', 'const x = 1;\n'.repeat(95));
    expect(code).toHaveLength(3);
    expect(code[0]!.endLine).toBe(40);
    expect(code[2]!.endLine).toBe(95);
  });
});

describe('codeIndex: hybrid query', () => {
  const index = buildIndex({
    'docs/rotate.md': MD_FILE,
    'src/store.ts': TS_FILE,
    'docs/unrelated.md': '# Cooking\n\nrecipe for soup\n',
  });

  it('builds sorted file entries and chunk coverage', () => {
    expect(index.files.map((f) => f.path)).toEqual(['docs/rotate.md', 'docs/unrelated.md', 'src/store.ts']);
    const total = index.chunks.reduce((s, c) => s + (c.endLine - c.startLine + 1), 0);
    expect(total).toBeGreaterThanOrEqual(index.files.reduce((s, f) => s + f.lines - 1, 0));
  });

  it('ranks the semantically relevant chunk first and is deterministic', () => {
    const hits = queryIndex(index, 'widget rotation baking', 3);
    expect(hits[0]!.path).toBe('docs/rotate.md');
    expect(hits[0]!.heading).toBe('Deep Topic');
    expect(queryIndex(index, 'widget rotation baking', 3)).toEqual(hits);
  });

  it('finds code by symbol name', () => {
    const hits = queryIndex(index, 'buildThing', 2);
    expect(hits[0]!.path).toBe('src/store.ts');
  });

  it('an empty index yields no hits', () => {
    expect(queryIndex(buildIndex({}), 'anything')).toEqual([]);
  });
});
