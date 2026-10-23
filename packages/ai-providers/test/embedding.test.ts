/**
 * Direct coverage for `hashEmbed` and `cosine` (packages/ai-providers/src/demo/embedding.ts).
 *
 * Both functions are pure and both are load-bearing: the router embed/rank surface, the
 * agents-runtime token-bag seam and the vector stores all lean on them, and the runtime
 * hybrid score literally reads `0.6 * cosine(qv, e.vector) + 0.4 * coverage` — a formula
 * that only stays bounded because `hashEmbed` hands back unit vectors while `cosine` stays
 * a raw dot product. Neither half of that contract was ever asserted directly: the only
 * existing checks ask "same text, same vector" through the router and read one
 * self-similarity at 5 digits. Per house discipline an untested pure branch *is* the next
 * increment.
 */
import { describe, expect, it } from 'vitest';
import { EMBED_DIM, cosine, hashEmbed } from '../src/demo/embedding.js';

const norm = (v: readonly number[]): number => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

describe('hashEmbed — shape', () => {
  it('EMBED_DIM is 64 and is the default length', () => {
    expect(EMBED_DIM).toBe(64);
    expect(hashEmbed('anything')).toHaveLength(EMBED_DIM);
  });

  it('honours a custom dim', () => {
    expect(hashEmbed('anything', 8)).toHaveLength(8);
    expect(hashEmbed('anything', 1)).toHaveLength(1);
    expect(hashEmbed('anything', 257)).toHaveLength(257);
  });

  it('dim 0 yields an empty vector, not a crash and not NaN', () => {
    expect(hashEmbed('anything', 0)).toEqual([]);
  });

  it('treats the empty string as a legal input seeded by the FNV offset basis', () => {
    const v = hashEmbed('');
    expect(v).toHaveLength(EMBED_DIM);
    expect(v.every((x) => Number.isFinite(x))).toBe(true);
    expect(v.every((x) => x !== 0)).toBe(true);
  });

  it('accepts long and unicode text without losing finiteness', () => {
    const long = hashEmbed('x'.repeat(500));
    const unicode = hashEmbed('caf\u00e9 na\u00efve \u4e16\u754c');
    expect(long.every((x) => Number.isFinite(x))).toBe(true);
    expect(unicode.every((x) => Number.isFinite(x))).toBe(true);
  });
});

describe('hashEmbed — determinism', () => {
  it('same text gives byte-identical vectors across calls', () => {
    expect(hashEmbed('castle ruins')).toEqual(hashEmbed('castle ruins'));
  });

  it('same text gives byte-identical vectors at every dim', () => {
    expect(hashEmbed('castle ruins', 8)).toEqual(hashEmbed('castle ruins', 8));
    expect(hashEmbed('castle ruins', 64)).toEqual(hashEmbed('castle ruins', 64));
  });

  it('different texts give different vectors', () => {
    expect(hashEmbed('castle ruins')).not.toEqual(hashEmbed('castle keeps'));
    expect(cosine(hashEmbed('castle ruins'), hashEmbed('castle keeps'))).not.toBeCloseTo(1, 6);
  });
});

describe('hashEmbed — normalization (the half the runtime score formula leans on)', () => {
  it('returns unit-length vectors for every probed text', () => {
    const probes = ['', 'a', 'castle ruins', 'the quick brown fox jumps over the lazy dog', 'caf\u00e9 na\u00efve \u4e16\u754c', 'x'.repeat(500)];
    for (const text of probes) {
      expect(norm(hashEmbed(text))).toBeCloseTo(1, 10);
    }
  });

  it('keeps every component inside [-1, 1]', () => {
    for (const text of ['', 'castle ruins', '\u4e16\u754c']) {
      for (const x of hashEmbed(text)) {
        // unit length bounds each component; the slack absorbs float noise, not a real overflow
        expect(Math.abs(x)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it('never collapses to the all-zero vector, which would rank nothing', () => {
    // the `|| 1` guard inside normalize exists exactly for the zero-norm case; hashEmbed never hits it
    for (const text of ['', 'castle ruins', '\u4e16\u754c']) {
      expect(norm(hashEmbed(text))).toBeGreaterThan(0.99);
    }
  });
});

describe('cosine — a raw dot product; normalization is the caller half of the contract', () => {
  it('is 1 for a vector against itself', () => {
    const v = hashEmbed('castle ruins');
    expect(cosine(v, v)).toBeCloseTo(1, 12);
  });

  it('does not divide by the magnitudes, despite the name', () => {
    expect(cosine([2, 0], [3, 0])).toBe(6);
    expect(cosine([0.5, 0.5], [0.5, 0.5])).toBe(0.5);
  });

  it('is 0 for orthogonal vectors', () => {
    expect(cosine([1, 0], [0, 1])).toBe(0);
  });

  it('is -1 for antipodal unit vectors', () => {
    expect(cosine([1, 0], [-1, 0])).toBe(-1);
  });

  it('signs multiply: mixed signs score negative', () => {
    expect(cosine([1, -1], [-1, 1])).toBe(-2);
    expect(cosine([1, -1], [1, 1])).toBe(0);
  });

  it('is symmetric in its operands', () => {
    const a = hashEmbed('castle ruins');
    const b = hashEmbed('spaceship engine room');
    expect(cosine(a, b)).toBe(cosine(b, a));
  });

  it('is 0 for two empty vectors, not NaN', () => {
    expect(cosine([], [])).toBe(0);
  });
});

describe('cosine — mismatched lengths are padded with zeros, not rejected', () => {
  it('reads the shorter operand as zero-padded', () => {
    expect(cosine([1, 0], [1])).toBe(1);
    expect(cosine([1], [1, 0])).toBe(1);
    // the missing tail contributes 0 rather than throwing or wrapping around
    expect(cosine([1, 7], [1])).toBe(1);
    expect(cosine([1], [1, 7])).toBe(1);
  });

  it('makes the same text at two different dims score below identity', () => {
    // each dim count is its own normalization space, so the shared prefix is not the whole vector
    expect(cosine(hashEmbed('castle ruins', 4), hashEmbed('castle ruins', 8))).not.toBeCloseTo(1, 6);
  });
});

describe('the pair, as the retrieval stack actually uses them', () => {
  it('every embedding pair scores inside [-1, 1]', () => {
    const texts = ['castle ruins', 'castle keeps', 'spaceship engine room', '', '\u4e16\u754c', 'caf\u00e9'];
    const vectors = texts.map((t) => hashEmbed(t));
    for (const a of vectors) {
      for (const b of vectors) {
        const s = cosine(a, b);
        expect(s).toBeGreaterThanOrEqual(-1 - 1e-9);
        expect(s).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it('distinct texts are effectively independent directions, not near-duplicates', () => {
    // hashEmbed is a per-string projection, NOT token-aware: sharing a word does not by
    // itself raise the score — the token-bag averaging lives in the runtime seam, not here
    expect(cosine(hashEmbed('castle'), hashEmbed('castle ruins'))).toBeLessThan(0.1);
    expect(cosine(hashEmbed('castle'), hashEmbed('spaceship engine room'))).toBeLessThan(0.1);
  });
});
