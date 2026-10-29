import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '@nexus/design-model';
import { readLineage, readRemixedFrom, stampLineage } from './lineage';

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

/**
 * M8 v548 — WHERE **and WHEN**, for the reader that lists the forks a store holds. It builds on
 * `readRemixedFrom` (one guard chain per field) and adds the instant; a source alone still reaches a card.
 */
describe('readLineage — the record, both halves or nothing', () => {
  it('reads the pair the writer writes', () => {
    expect(readLineage({ _lineage: { sourceProjectId: 'proj-1', remixedAt: '2026-01-01T00:00:00Z' } })).toEqual({
      sourceProjectId: 'proj-1',
      remixedAt: '2026-01-01T00:00:00Z',
    });
  });

  it('answers null for a HALF-written lineage: a source with no instant is not a fork a library can date', () => {
    // The SOURCE alone is still readable by the M7 reader — see the suite above — but the record needs both.
    expect(readRemixedFrom({ _lineage: { sourceProjectId: 'proj-1' } })).toBe('proj-1');
    expect(readLineage({ _lineage: { sourceProjectId: 'proj-1' } })).toBe(null);
    expect(readLineage({ _lineage: { sourceProjectId: 'proj-1', remixedAt: '' } })).toBe(null);
    expect(readLineage({ _lineage: { remixedAt: 'now' } })).toBe(null);
    expect(readLineage({ _lineage: { sourceProjectId: '', remixedAt: 'now' } })).toBe(null);
    expect(readLineage({ _lineage: { sourceProjectId: 7, remixedAt: 7 } })).toBe(null);
  });

  it('answers null for anything that is not a document carrying a lineage at all', () => {
    expect(readLineage(null)).toBe(null);
    expect(readLineage('{"_lineage":{}}')).toBe(null);
    expect(readLineage({ id: 'p3', nodes: {} })).toBe(null);
    expect(readLineage({ _lineage: null })).toBe(null);
    expect(readLineage({ _lineage: 'proj-1' })).toBe(null);
  });

  it('agrees with `readRemixedFrom` about the source — the record extends that chain, it does not replace it', () => {
    const doc = stampLineage(createEmptyDocument('Harbour'), 'pub-source', '2026-10-20T00:00:00.000Z');
    expect(readLineage(doc)?.sourceProjectId).toBe(readRemixedFrom(doc));
    expect(readLineage(doc)?.remixedAt).toBe('2026-10-20T00:00:00.000Z');
  });
});

/**
 * M7 v267 — the WRITING half. The service's `remix` endpoint has always recorded the lineage; the Studio's
 * own remix path (fork in the editor, publish the fork) never did, so a publication made the way a person
 * actually remixes had no source at all.
 */
describe('stampLineage — the reserved _lineage key, written', () => {
  it('stamps the source and the instant, and the reader reads it back', () => {
    const doc = createEmptyDocument('Harbour');
    const stamped = stampLineage(doc, 'pub-source', '2026-10-20T00:00:00.000Z');
    expect(stamped._lineage).toEqual({ sourceProjectId: 'pub-source', remixedAt: '2026-10-20T00:00:00.000Z' });
    expect(readRemixedFrom(stamped)).toBe('pub-source');
  });

  it('is PURE — it returns a new document and never touches the one it was handed', () => {
    const doc = createEmptyDocument('Harbour');
    const stamped = stampLineage(doc, 'pub-source', '2026-10-20T00:00:00.000Z');
    expect(stamped).not.toBe(doc);
    expect(doc._lineage).toBeUndefined();
  });

  it('OVERWRITES an inherited lineage: a remix of a remix names ITS source, not the one further back', () => {
    const first = stampLineage(createEmptyDocument('A'), 'pub-original', '2026-10-19T00:00:00.000Z');
    // the fork SPREADS the document, so the copy inherits the source's lineage…
    const forked = { ...first, id: 'doc-forked' };
    expect(readRemixedFrom(forked)).toBe('pub-original');
    // …and the new stamp must replace it, or the copy would name the wrong source.
    const second = stampLineage(forked, 'pub-middle', '2026-10-20T00:00:00.000Z');
    expect(readRemixedFrom(second)).toBe('pub-middle');
    expect(readRemixedFrom(first)).toBe('pub-original');
  });

  it('REFUSES a blank source or a blank instant, by name — a lineage that names nothing is not a lineage', () => {
    const doc = createEmptyDocument('Harbour');
    expect(() => stampLineage(doc, '', '2026-10-20T00:00:00.000Z')).toThrow(/source project id/);
    expect(() => stampLineage(doc, '   ', '2026-10-20T00:00:00.000Z')).toThrow(/source project id/);
    expect(() => stampLineage(doc, 'pub-source', '')).toThrow(/instant/);
  });
});
