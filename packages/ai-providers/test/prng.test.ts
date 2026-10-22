import { describe, expect, it } from 'vitest';
import { hashString, mulberry32, pick } from '../src/prng.js';

// `prng.ts` underpins DEMO MODE reproducibility (ADR 0010): the same seed must
// always yield the same generator stream, so generated assets/nodes are stable
// across runs. These tests pin that contract and guard against silent formula drift.

describe('hashString (FNV-1a 32-bit)', () => {
  it('is deterministic for the same input', () => {
    expect(hashString('hello world')).toBe(hashString('hello world'));
  });

  it('is case/character sensitive', () => {
    expect(hashString('hello')).not.toBe(hashString('Hello'));
    expect(hashString('a')).not.toBe(hashString('b'));
  });

  it('returns an unsigned 32-bit integer (>=0, <2^32, integral)', () => {
    for (const s of ['', 'a', 'hello', 'Hello', 'a much longer string with unicode ✨']) {
      const h = hashString(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });

  it('matches pinned anchor values (guards formula drift)', () => {
    expect(hashString('')).toBe(2166136261);
    expect(hashString('a')).toBe(3826002220);
    expect(hashString('hello')).toBe(1335831723);
    expect(hashString('Hello')).toBe(4116459851);
  });
});

describe('mulberry32 (deterministic PRNG)', () => {
  const anchors: Record<number, number[]> = {
    0: [0.26642920868471265, 0.0003297457005828619, 0.2232720274478197, 0.1462021479383111, 0.46732782293111086],
    1: [0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741, 0.9683778982143849],
    42: [0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693, 0.17481389874592423],
  };

  it('produces a fixed stream for pinned seeds (guards formula drift)', () => {
    for (const [seed, expected] of Object.entries(anchors)) {
      const rng = mulberry32(Number(seed));
      const got = Array.from({ length: expected.length }, () => rng());
      expect(got).toEqual(expected);
    }
  });

  it('is deterministic across independent instances with the same seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('diverges for different seeds', () => {
    const a = mulberry32(7);
    const b = mulberry32(8);
    expect(a()).not.toBe(b());
  });

  it('every value stays inside [0, 1)', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('coerces the seed to an unsigned 32-bit integer', () => {
    // 0x100000000 (2^32) wraps to 0 under >>>0, so its stream must match seed 0's.
    const seed0 = Array.from({ length: 5 }, () => mulberry32(0)());
    const seedWrap = Array.from({ length: 5 }, () => mulberry32(2 ** 32)());
    expect(seedWrap).toEqual(seed0);
  });
});

describe('pick (rng-backed selection)', () => {
  it('always returns a member of the array', () => {
    const arr = ['x', 'y', 'z'] as const;
    const rng = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      expect(arr).toContain(pick(rng, arr));
    }
  });

  it('is deterministic for the same seed + array', () => {
    const arr = ['alpha', 'beta', 'gamma', 'delta'] as const;
    const a = mulberry32(2024);
    const b = mulberry32(2024);
    expect(pick(a, arr)).toBe(pick(b, arr));
  });

  it('returns undefined for an empty array (current contract)', () => {
    // `arr[Math.floor(rng()*0) % 0]` evaluates to arr[NaN] -> undefined.
    expect(pick(mulberry32(1), [])).toBeUndefined();
  });
});
