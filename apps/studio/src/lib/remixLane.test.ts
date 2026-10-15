import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyDocument } from '@nexus/design-model';
import { extractRemixDocument, remixIdFromSearch } from './remixLane';
import { useStudio } from './store';

const st = () => useStudio.getState();

beforeEach(() => {
  st().newProject();
});

describe('extractRemixDocument (M7 v233)', () => {
  it('accepts a read answer that carries a well-formed document', () => {
    const doc = createEmptyDocument('Published');
    const out = extractRemixDocument({ ok: true, document: doc });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.document).toBe(doc);
  });

  it('refuses a non-object answer', () => {
    expect(extractRemixDocument(null)).toEqual({ ok: false, reason: 'the read answer is not an object' });
    expect(extractRemixDocument('nope').ok).toBe(false);
  });

  it('passes the SERVICE reason through when the read failed', () => {
    const out = extractRemixDocument({ ok: false, reason: 'nexus-api is not reachable' });
    expect(out).toEqual({ ok: false, reason: 'nexus-api is not reachable' });
  });

  it('states its own reason when the read failed with no reason', () => {
    expect(extractRemixDocument({ ok: false })).toEqual({ ok: false, reason: 'the read answer reported failure with no reason' });
  });

  it('separates "no document" from "service down" — a different fact, a different reason', () => {
    expect(extractRemixDocument({ ok: true })).toEqual({ ok: false, reason: 'the publication carries no document' });
    expect(extractRemixDocument({ ok: true, document: null })).toEqual({ ok: false, reason: 'the publication carries no document' });
  });

  it('names the field that makes a document unusable', () => {
    const base = createEmptyDocument('X') as unknown as Record<string, unknown>;
    expect(extractRemixDocument({ ok: true, document: { ...base, id: '' } })).toEqual({ ok: false, reason: 'the document has no string id' });
    expect(extractRemixDocument({ ok: true, document: { ...base, rootId: 7 } })).toEqual({ ok: false, reason: 'the document has no string rootId' });
    expect(extractRemixDocument({ ok: true, document: { ...base, nodes: undefined } })).toEqual({ ok: false, reason: 'the document has no nodes object' });
    expect(extractRemixDocument({ ok: true, document: { ...base, activePageId: '' } })).toEqual({ ok: false, reason: 'the document has no string activePageId' });
  });

  it('refuses a document whose GRAPH is inconsistent, naming the problem (v243)', () => {
    // The SHAPE is fine (every field is a non-empty string / object), but the root names no node.
    const broken = JSON.parse(JSON.stringify(createEmptyDocument('X'))) as Record<string, unknown>;
    broken.rootId = 'ghost';
    const out = extractRemixDocument({ ok: true, document: broken });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('not a consistent graph');
  });
});

describe('remixIdFromSearch (M7 v234)', () => {
  it('reads the remix target from a query string, with or without the leading "?"', () => {
    expect(remixIdFromSearch('?remix=pub-1')).toBe('pub-1');
    expect(remixIdFromSearch('remix=pub-1')).toBe('pub-1');
    expect(remixIdFromSearch('?a=1&remix=pub-2&b=2')).toBe('pub-2');
  });

  it('decodes an encoded id', () => {
    expect(remixIdFromSearch('?remix=' + encodeURIComponent('my pub/id'))).toBe('my pub/id');
  });

  it('answers null for absence — a bare ?remix= is not a project named ""', () => {
    expect(remixIdFromSearch('')).toBeNull();
    expect(remixIdFromSearch('?')).toBeNull();
    expect(remixIdFromSearch('?remix=')).toBeNull();
    expect(remixIdFromSearch('?remix=%20')).toBeNull();
    expect(remixIdFromSearch('?other=1')).toBeNull();
  });
});

describe('store: remixDocument (M7 v233)', () => {
  it('opens a publication as a FORK, so its id is fresh and re-publishing cannot overwrite the source', () => {
    const source = st().doc;
    const sourceId = source.id;
    st().remixDocument(source, 'pub-1');
    const after = st().doc;
    expect(after.id).not.toBe(sourceId);
    expect(after.rootId).toBe(after.id);
    expect(after.nodes[after.id]?.id).toBe(after.id);
    // the node graph is preserved — the fork is the same drawing under a new project id
    expect(Object.keys(after.nodes).length).toBe(Object.keys(source.nodes).length);
    expect(st().status).toBe('Remixed pub-1 — this is now your project');
  });

  it('does not mutate the source document it was handed', () => {
    const source = st().doc;
    const before = JSON.stringify(source);
    st().remixDocument(source, 'pub-2');
    expect(JSON.stringify(source)).toBe(before);
  });
});
