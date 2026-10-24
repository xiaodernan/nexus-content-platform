import { describe, expect, it } from 'vitest';
import { normalizeInstanceOverrides, ownerInstanceId } from '../src/instances.js';
import type { InstanceNode } from '../src/types.js';

// `instances.ts` is exercised end-to-end by instances.test.ts, but `normalizeInstanceOverrides`
// (the override decoder that also folds the pre-v230 legacy `text` sibling) had no direct test.
// These pin the decode rules, including the ambiguous "child literally named text" case.

/** The decoder accepts UNTRUSTED / pre-v230 shapes by design; cast them past the canonical type. */
const legacy = (v: unknown): InstanceNode['overrides'] => v as unknown as InstanceNode['overrides'];

describe('normalizeInstanceOverrides', () => {
  it('passes through plain per-child patches', () => {
    const out = normalizeInstanceOverrides({ c1: { width: 50, x: 5, rotation: 30 } });
    expect(out).toEqual({ c1: { width: 50, x: 5, rotation: 30 } });
  });

  it('folds a legacy text-only sibling into { id: { text } }', () => {
    const out = normalizeInstanceOverrides(legacy({ text: { c1: 'hello', c2: 'world' } }));
    expect(out).toEqual({ c1: { text: 'hello' }, c2: { text: 'world' } });
  });

  it('merges a legacy text entry into an existing patch', () => {
    const out = normalizeInstanceOverrides(legacy({ c1: { width: 50 }, text: { c1: 'hi' } }));
    expect(out).toEqual({ c1: { width: 50, text: 'hi' } });
  });

  it('lets a new-shape text override win over the legacy sibling', () => {
    // existing.text is defined, so the legacy fold is skipped (new encoding wins)
    const out = normalizeInstanceOverrides(legacy({ c1: { text: 'new' }, text: { c1: 'old' } }));
    expect(out).toEqual({ c1: { text: 'new' } });
  });

  it('skips non-object / null values and an undefined input', () => {
    expect(normalizeInstanceOverrides(undefined)).toEqual({});
    expect(normalizeInstanceOverrides(legacy({ c1: 'not-an-object', c2: null }))).toEqual({});
  });

  it('reads a child literally named "text" with numeric fields as a patch, not legacy', () => {
    // the ambiguous shape: a `text` key whose value has non-string fields must answer as a patch
    const out = normalizeInstanceOverrides({ text: { width: 10, height: 20 } });
    expect(out).toEqual({ text: { width: 10, height: 20 } });
  });
});

describe('ownerInstanceId', () => {
  it('returns the owning top-level instance, or null when unknown', () => {
    const meta = { 'i1::c1': { instanceId: 'i1', masterId: 'c1' }, i1: { instanceId: 'i1', masterId: 'cmp' } };
    expect(ownerInstanceId(meta, 'i1::c1')).toBe('i1');
    expect(ownerInstanceId(meta, 'i1')).toBe('i1');
    expect(ownerInstanceId(meta, 'ghost')).toBeNull();
  });
});
