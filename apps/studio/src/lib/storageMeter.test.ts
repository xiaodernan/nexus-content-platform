import { describe, expect, it } from 'vitest';
import {
  footprintOf,
  formatBytes,
  formatFootprint,
  formatOriginEstimate,
  originStorageEstimate,
  quotaPct,
  type OriginStorageEstimateView,
  type StorageEstimateHost,
} from './storageMeter';

describe('footprintOf — the meter sums what the listing measured', () => {
  it('answers an empty footprint for an empty store', () => {
    expect(footprintOf([])).toEqual({ saves: 0, chars: 0 });
  });

  it('sums the chars it was given', () => {
    expect(footprintOf([{ chars: 100 }, { chars: 23 }])).toEqual({ saves: 2, chars: 123 });
  });

  it('counts entries it could not measure but never invents their size', () => {
    // A save whose header read failed stays in the save count (it IS listed) and contributes
    // nothing to the chars total — a meter that guessed a size would be a lie with digits.
    expect(footprintOf([{ chars: 50 }, {}, { chars: Number.NaN }])).toEqual({ saves: 3, chars: 50 });
  });
});

describe('formatFootprint — the store line names the namespace', () => {
  it('singularizes one save', () => {
    expect(formatFootprint({ saves: 1, chars: 2307 }, 'studio-scene')).toBe("1 save · 2307 chars in 'studio-scene'");
  });

  it('pluralizes the rest', () => {
    expect(formatFootprint({ saves: 3, chars: 99 }, 'ns')).toBe("3 saves · 99 chars in 'ns'");
  });
});

describe('formatBytes — 1024-based, one decimal, engine-neutral', () => {
  it('keeps whole bytes whole', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('steps up the ladder', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe('5.0 GB');
  });

  it('refuses to format what is not a number', () => {
    expect(formatBytes(Number.NaN)).toBe('unknown');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('unknown');
  });
});

describe('originStorageEstimate — the browser owns the origin number', () => {
  it('answers unavailable when there is no host at all', async () => {
    expect(await originStorageEstimate(undefined)).toEqual({ kind: 'unavailable' });
  });

  it('answers unavailable when the host has no storage manager', async () => {
    expect(await originStorageEstimate({})).toEqual({ kind: 'unavailable' });
    expect(await originStorageEstimate({ storage: {} })).toEqual({ kind: 'unavailable' });
  });

  it('passes the browser answer through, halved to what is actually numeric', async () => {
    const host: StorageEstimateHost = {
      storage: {
        estimate: async () => ({ usage: 1024, quota: 1024 * 1024 }),
      },
    };
    expect(await originStorageEstimate(host)).toEqual({ kind: 'estimate', usage: 1024, quota: 1024 * 1024 });
  });

  it('reports a half-answered estimate as unknown, never as zero', async () => {
    const host: StorageEstimateHost = { storage: { estimate: async () => ({ usage: 512 }) } };
    expect(await originStorageEstimate(host)).toEqual({ kind: 'estimate', usage: 512, quota: null });
    const bare: StorageEstimateHost = { storage: { estimate: async () => ({}) } };
    expect(await originStorageEstimate(bare)).toEqual({ kind: 'estimate', usage: null, quota: null });
  });

  it('answers unavailable when the estimate itself throws', async () => {
    const host: StorageEstimateHost = {
      storage: {
        estimate: () => Promise.reject(new Error('security error')),
      },
    };
    expect(await originStorageEstimate(host)).toEqual({ kind: 'unavailable' });
  });
});

describe('quotaPct — the reading, or an honest null', () => {
  const view = (usage: number | null, quota: number | null): OriginStorageEstimateView => ({ kind: 'estimate', usage, quota });

  it('computes the percent and clamps it into 0..100', () => {
    expect(quotaPct(view(100, 1000))).toBeCloseTo(10);
    expect(quotaPct(view(5000, 1000))).toBe(100);
    expect(quotaPct(view(0, 1000))).toBe(0);
  });

  it('refuses to divide by a missing or zero quota', () => {
    expect(quotaPct(view(100, null))).toBeNull();
    expect(quotaPct(view(100, 0))).toBeNull();
    expect(quotaPct(view(null, 1000))).toBeNull();
  });

  it('answers null for anything that is not a numeric estimate', () => {
    expect(quotaPct(null)).toBeNull();
    expect(quotaPct({ kind: 'unavailable' })).toBeNull();
  });
});

describe('formatOriginEstimate — every branch names what the browser said', () => {
  it('names a missing estimate instead of inventing one', () => {
    expect(formatOriginEstimate(null)).toBe('origin: the browser exposes no storage estimate here');
    expect(formatOriginEstimate({ kind: 'unavailable' })).toBe('origin: the browser exposes no storage estimate here');
  });

  it('frames the full estimate with the honesty tag', () => {
    const line = formatOriginEstimate({ kind: 'estimate', usage: 1024, quota: 1024 * 1024 * 1024 });
    expect(line).toContain('origin ≈ 1.0 KB of 1.0 GB used');
    expect(line).toContain('(0.00%');
    expect(line).toContain('browser estimate, all storage APIs');
  });

  it('says unknown % when a percent cannot be computed', () => {
    const line = formatOriginEstimate({ kind: 'estimate', usage: 10, quota: 0 });
    expect(line).toContain('(unknown %, browser estimate, all storage APIs)');
  });

  it('names the half the browser did answer', () => {
    expect(formatOriginEstimate({ kind: 'estimate', usage: 512, quota: null })).toBe(
      'origin ≈ 512 B used (quota unknown, browser estimate, all storage APIs)',
    );
    expect(formatOriginEstimate({ kind: 'estimate', usage: null, quota: 2048 })).toBe(
      'origin: quota 2.0 KB (usage unknown, browser estimate, all storage APIs)',
    );
  });

  it('says the estimate carried no numbers when it carried none', () => {
    expect(formatOriginEstimate({ kind: 'estimate', usage: null, quota: null })).toBe(
      "origin: the browser's estimate carried no numbers (browser estimate, all storage APIs)",
    );
  });
});

describe('storageMeter — unit ladder and honesty edges', () => {
  it('caps the ladder at TB for astronomically large numbers', () => {
    expect(formatBytes(1024 ** 4)).toBe('1.0 TB');
    const huge = formatBytes(1024 ** 6);
    expect(huge.endsWith(' TB')).toBe(true);
    expect(huge).not.toContain('undefined');
  });

  it('quotaPct clamps a negative usage into 0, never a negative bar', () => {
    expect(quotaPct({ kind: 'estimate', usage: -500, quota: 1000 })).toBe(0);
  });

  it('footprintOf ignores infinite chars but keeps the save counted', () => {
    expect(footprintOf([{ chars: Number.POSITIVE_INFINITY }, { chars: 10 }])).toEqual({ saves: 2, chars: 10 });
  });
});
