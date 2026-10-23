import { describe, expect, it } from 'vitest';
import { InMemoryCallRecorder, nowMs } from '../src/call-recorder.js';
import type { Usage } from '../src/types.js';

// `call-recorder.ts` (the Cost Engine / Observability recorder, §53/§56) had no direct unit
// coverage before this file. Pins the aggregation + the defensive `?? 0` on optional usage fields.

function usage(partial: Partial<Usage>): Usage {
  return {
    provider: 'nexus-demo',
    model: 'm',
    mode: 'demo',
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    estimatedCostUsd: 0,
    ...partial,
  };
}

describe('InMemoryCallRecorder', () => {
  it('records and returns a defensive copy of all usages', () => {
    const r = new InMemoryCallRecorder();
    r.record(usage({ inputTokens: 10, outputTokens: 20 }));
    const all = r.all();
    expect(all).toHaveLength(1);
    // mutating the returned array must not change internal state
    all.push(usage({}));
    expect(r.all()).toHaveLength(1);
  });

  it('totals aggregate calls, tokens, cost and latency, defaulting missing fields to 0', () => {
    const r = new InMemoryCallRecorder();
    r.record(usage({ inputTokens: 10, outputTokens: 20, estimatedCostUsd: 0.5, latencyMs: 100 }));
    // a sparse usage missing inputTokens/outputTokens should not poison the sum
    r.record(usage({ estimatedCostUsd: 0.25, latencyMs: 50 }));
    const t = r.totals();
    expect(t).toEqual({ calls: 2, inputTokens: 10, outputTokens: 20, estimatedCostUsd: 0.75, latencyMs: 150 });
  });

  it('totals are zero for an empty recorder', () => {
    expect(new InMemoryCallRecorder().totals()).toEqual({
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      latencyMs: 0,
    });
  });
});

describe('nowMs', () => {
  it('returns a non-negative number (monotonic-ish clock)', () => {
    expect(nowMs()).toBeGreaterThanOrEqual(0);
    expect(typeof nowMs()).toBe('number');
  });
});
