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

  it('persists through an injected KvStore and reads back', () => {
    const store = memoryStore();
    const doc = sampleDoc();
    store.setItem('nexus.studio.doc.v1', serializeApp(doc));
    const res = deserializeApp(store.getItem('nexus.studio.doc.v1') ?? '');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.doc.name).toBe('Round Trip');
  });
});
