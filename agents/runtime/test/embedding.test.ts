import { describe, expect, it } from 'vitest';
import { embedTokens, hybridScore, tokenize } from '../src/embedding.js';

describe('embedding seam (v6)', () => {
  it('tokenizes: lowercased, >1 char, unicode words kept', () => {
    expect(tokenize('buildThing rotate — 旋转 ok x')).toEqual(['buildthing', 'rotate', '旋转', 'ok']);
  });

  it('zero shared tokens scores exactly 0 — cosine noise alone never ranks', () => {
    expect(hybridScore('zzq xyz', 'completely different words here')).toBe(0);
    expect(hybridScore('', 'anything')).toBe(0);
  });

  it('more shared tokens ⇒ higher score, and results are deterministic', () => {
    const partial = hybridScore('rotation baking guide', 'rotation explained somewhere');
    const full = hybridScore('rotation baking guide', 'a guide about rotation and baking');
    expect(full).toBeGreaterThan(partial);
    expect(partial).toBeGreaterThan(0);
    expect(hybridScore('rotation baking guide', 'a guide about rotation and baking')).toBe(full);
  });

  it('embedTokens returns unit-length vectors', () => {
    const v = embedTokens('rotation baking guide tokens');
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 10);
  });
});
