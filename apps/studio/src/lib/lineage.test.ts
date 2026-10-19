import { describe, expect, it } from 'vitest';
import { readRemixedFrom } from './lineage';

describe('readRemixedFrom — the reserved _lineage key, read defensively', () => {
  it('reads the source project id the service wrote', () => {
    expect(readRemixedFrom({ _lineage: { sourceProjectId: 'proj-1', remixedAt: '2026-01-01T00:00:00Z' } })).toBe('proj-1');
  });

  it('reads it from a full document, not a bare lineage object', () => {
    const doc = { id: 'p2', name: 'x', nodes: {}, _lineage: { sourceProjectId: 'proj-9', remixedAt: 'now' } };
    expect(readRemixedFrom(doc)).toBe('proj-9');
  });

  it('answers null for a document that is not an object at all', () => {
    expect(readRemixedFrom(null)).toBe(null);
    expect(readRemixedFrom(undefined)).toBe(null);
    expect(readRemixedFrom('{"_lineage":{}}')).toBe(null);
    expect(readRemixedFrom(42)).toBe(null);
  });

  it('answers null when there is no _lineage key — a first publish, not a remix', () => {
    expect(readRemixedFrom({ id: 'p3', nodes: {} })).toBe(null);
  });

  it('answers null when _lineage is present but the wrong shape', () => {
    expect(readRemixedFrom({ _lineage: null })).toBe(null);
    expect(readRemixedFrom({ _lineage: 'proj-1' })).toBe(null);
    expect(readRemixedFrom({ _lineage: 7 })).toBe(null);
    expect(readRemixedFrom({ _lineage: [] })).toBe(null);
  });

  it('answers null when sourceProjectId is missing, not a string, or empty — never "" a UI would print', () => {
    expect(readRemixedFrom({ _lineage: { remixedAt: 'now' } })).toBe(null);
    expect(readRemixedFrom({ _lineage: { sourceProjectId: 17 } })).toBe(null);
    expect(readRemixedFrom({ _lineage: { sourceProjectId: '' } })).toBe(null);
    expect(readRemixedFrom({ _lineage: { sourceProjectId: { id: 'x' } } })).toBe(null);
  });

  it('does not confuse the document\'s OWN id with its lineage', () => {
    expect(readRemixedFrom({ id: 'my-own-id', _lineage: null })).toBe(null);
  });
});
