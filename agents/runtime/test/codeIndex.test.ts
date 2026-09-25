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

// M2 v79: `heading?: string` is OPTIONAL, and "absent" is the only shape that survives being written
// to disk — so a markdown chunk before the first `#` must not carry the key with an undefined value.
// The window (non-markdown) branch already omitted it; the markdown branch is now bound to agree.
describe('a chunk with no heading omits the key (v79)', () => {
  const PREAMBLE_MD = ['intro line, no heading yet', '', '# Section', 'body under a heading'].join('\n');

  it('leaves the pre-heading chunk with no `heading` key at all', () => {
    const chunks = chunkFile('notes.md', PREAMBLE_MD);
    expect(chunks.length).toBeGreaterThan(1);
    expect('heading' in chunks[0]!).toBe(false);
    expect(Object.keys(chunks[0]!).sort()).toEqual(['endLine', 'path', 'startLine', 'text']);
  });

  it('keeps the key where a heading exists, so the two shapes are not collapsed', () => {
    const withHeading = chunkFile('notes.md', PREAMBLE_MD).find((c) => 'heading' in c);
    expect(withHeading?.heading).toBe('Section');
  });

  it('matches the window branch, which never had the key either', () => {
    const code = chunkFile('a.ts', 'export const x = 1;\n').concat(chunkFile('notes.md', PREAMBLE_MD));
    expect(code.filter((c) => 'heading' in c).length).toBe(1);
  });
});
