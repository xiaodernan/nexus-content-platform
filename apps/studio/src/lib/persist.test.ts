import { describe, expect, it } from 'vitest';
import { createEmptyDocument, textNode, rectNode, ops, applyBatch, SCHEMA_VERSION } from '@nexus/design-model';
import { APP_STORAGE_VERSION, deserializeApp, serializeApp } from './persist';
import { memoryStore } from './storage';

function sampleDoc() {
  const doc = createEmptyDocument('Round Trip');
  const page = doc.activePageId;
  const r = rectNode('Box', { x: 10, y: 10, width: 80, height: 60 });
  const t = textNode('Title', 'Hello', { fontFamilyToken: 'font.family.body', sizeToken: 'font.size.xl', weight: 700, lineHeight: 1.2, letterSpacing: 0, align: 'left' }, { x: 10, y: 90, width: 200, height: 40 });
  return applyBatch(doc, { id: 'b1', ops: [ops.addSubtree(page, 0, [r]), ops.addSubtree(page, 1, [t])], provenance: { mode: 'user' }, timestamp: 0 });
}

describe('persist round-trip', () => {
  it('serializes and deserializes the canonical document unchanged', () => {
    const doc = sampleDoc();
    const json = serializeApp(doc);
    const res = deserializeApp(json);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.doc).toEqual(doc);
      expect(Object.keys(res.doc.nodes).length).toBe(Object.keys(doc.nodes).length);
    }
  });

  it('hydrates an empty document', () => {
    const doc = createEmptyDocument('Blank');
    const res = deserializeApp(serializeApp(doc));
    expect(res.ok).toBe(true);
  });

  it('rejects a foreign app payload', () => {
    const bad = JSON.stringify({ app: 'someone-elses-tool', version: 1, doc: createEmptyDocument('X') });
    const res = deserializeApp(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/NEXUS Studio/);
  });

  it('rejects an unsupported snapshot version', () => {
    const bad = JSON.stringify({ app: 'nexus-studio', version: APP_STORAGE_VERSION + 99, doc: createEmptyDocument('X') });
    const res = deserializeApp(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/version/);
  });

  it('rejects a newer design-model schema', () => {
    const doc = { ...createEmptyDocument('Future'), schemaVersion: SCHEMA_VERSION + 5 };
    const res = deserializeApp(JSON.stringify({ app: 'nexus-studio', version: APP_STORAGE_VERSION, doc }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/schema/);
  });

  it('rejects non-JSON without throwing', () => {
    const res = deserializeApp('{ this is not json ');
    expect(res.ok).toBe(false);
  });

  it('rejects a snapshot whose GRAPH is inconsistent (v257)', () => {
    // The SHAPE is fine (root present, a page resolvable), but a childId names no node — the shallow checks
    // pass and the deep one must refuse it, by name.
    const doc = sampleDoc();
    const nodes = doc.nodes as unknown as Record<string, { childIds: string[] }>;
    nodes[doc.activePageId]!.childIds.push('ghost');
    const res = deserializeApp(JSON.stringify({ app: 'nexus-studio', version: APP_STORAGE_VERSION, doc }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/graph is inconsistent/);
  });

  it('persists through an injected KvStore and reads back', () => {
    const store = memoryStore();
    const doc = sampleDoc();
    store.setItem('nexus.studio.doc.v1', serializeApp(doc));
    const res = deserializeApp(store.getItem('nexus.studio.doc.v1') ?? '');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.doc.name).toBe('Round Trip');
  });
});

describe('deserializeApp — payload shape guards', () => {
  const wrap = (doc: unknown) =>
    JSON.stringify({ app: 'nexus-studio', version: APP_STORAGE_VERSION, doc });

  it('rejects JSON that parses to a non-object', () => {
    for (const bad of ['42', 'null', '"a string"']) {
      const res = deserializeApp(bad);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe('payload is not an object');
    }
  });

  it('rejects an envelope with no doc or no node store', () => {
    const res1 = deserializeApp(JSON.stringify({ app: 'nexus-studio', version: APP_STORAGE_VERSION }));
    expect(res1.ok).toBe(false);
    if (!res1.ok) expect(res1.reason).toBe('snapshot has no node store');

    const res2 = deserializeApp(wrap({ name: 'X', nodes: null }));
    expect(res2.ok).toBe(false);
    if (!res2.ok) expect(res2.reason).toBe('snapshot has no node store');
  });

  it('rejects an envelope with a missing version', () => {
    const res = deserializeApp(JSON.stringify({ app: 'nexus-studio' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/version/);
  });

  it('rejects a document whose rootId points nowhere', () => {
    const res = deserializeApp(
      wrap({
        name: 'X',
        nodes: { only: { type: 'group' } },
        schemaVersion: SCHEMA_VERSION,
        rootId: 'missing-root',
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('root node is missing');
  });

  it('rejects a document with no page node to display', () => {
    const res = deserializeApp(
      wrap({
        name: 'X',
        nodes: { root: { type: 'group' } },
        schemaVersion: SCHEMA_VERSION,
        rootId: 'root',
        activePageId: '',
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('no page node to display');
  });
});
