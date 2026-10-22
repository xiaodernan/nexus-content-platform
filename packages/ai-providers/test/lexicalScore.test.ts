/**
 * Direct coverage for `lexicalScore` (packages/ai-providers/src/demo/embedding.ts).
 *
 * A deterministic Jaccard-overlap reranker stand-in — pure, no model — but it was only reached
 * indirectly (through whatever wires the demo embedding provider), so its tokenization rules
 * (lowercase, unicode alphanumerics, length > 2 kept) and the 0-on-empty-set contract were never
 * asserted. Per house discipline an untested pure branch *is* the next increment.
 */
import { describe, expect, it } from 'vitest';
import { lexicalScore } from '../src/demo/embedding.js';

describe('lexicalScore (Jaccard overlap)', () => {
  it('is 1.0 for identical token sets', () => {
    expect(lexicalScore('cat dog', 'cat dog')).toBe(1);
  });

  it('is order-independent and case-insensitive', () => {
    expect(lexicalScore('hello world', 'WORLD hello')).toBe(1);
    expect(lexicalScore('Cat Dog', 'dog CAT')).toBe(1);
  });

  it('is the intersection/union ratio for partial overlap', () => {
    // {cat,dog,bird} ∩ {cat,dog,fish} = 2 ; union = 4
    expect(lexicalScore('cat dog bird', 'cat dog fish')).toBeCloseTo(0.5, 10);
  });

  it('is 0 when the two texts share no tokens', () => {
    expect(lexicalScore('cat dog', 'bird fish')).toBe(0);
  });

  it('is 0 when either side yields no tokens (empty query or all sub-length words)', () => {
    expect(lexicalScore('', 'dog')).toBe(0);
    expect(lexicalScore('a an to', 'to an a')).toBe(0); // every token length <= 2 is dropped
  });

  it('handles unicode letters and is deterministic', () => {
    expect(lexicalScore('café chat', 'café chat')).toBe(1);
    const once = lexicalScore('the quick brown fox', 'quick brown fox jumps');
    const twice = lexicalScore('the quick brown fox', 'quick brown fox jumps');
    expect(once).toBe(twice);
    expect(once).toBeCloseTo(3 / 5, 10); // {quick,brown,fox} ∩ {quick,brown,fox,jumps} = 3 ; union = 5
  });
});
