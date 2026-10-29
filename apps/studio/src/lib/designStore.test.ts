import { describe, expect, it } from 'vitest';
import { createEmptyDocument, type DesignDocument } from '@nexus/design-model';

import {
  DESIGN_STORAGE_KEY,
  deserializeDesigns,
  loadDesign,
  loadDesigns,
  saveDesign,
  saveDesigns,
  serializeDesigns,
  type DesignKv,
} from './designStore';

/** A Map-backed double for the storage seam — the same shape `localStorage` satisfies. */
function kv(seed: Record<string, string> = {}): DesignKv {
  const map = new Map<string, string>(Object.entries(seed));
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value); } };
}

/** The stored text, so a test can prove what was WRITTEN and not only what was read back. */
function bytes(store: DesignKv): string | null {
  return store.getItem(DESIGN_STORAGE_KEY);
}

describe('designStore — the shelf’s designs, remembered locally', () => {
  it('a saved design reads back unchanged, and the written format is version 1', () => {
    const store = kv();
    const doc = createEmptyDocument('Publish me');
    const saved = saveDesign(store, doc);
    expect(saved.ok).toBe(true);

    const raw = JSON.parse(bytes(store) ?? '{}');
    expect(raw.version).toBe(1);
    expect(raw.documents).toHaveLength(1);

    const loaded = loadDesign(store, doc.id);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.document).toEqual(doc);
    const all = loadDesigns(store);
    expect(all.ok && all.source).toBe('stored');
  });

  it('a save REPLACES the document under the same id in place, and APPENDS a new one', () => {
    const store = kv();
    const first = createEmptyDocument('First');
    const second = createEmptyDocument('Second');
    expect(saveDesign(store, first).ok).toBe(true);
    expect(saveDesign(store, second).ok).toBe(true);

    const renamed: DesignDocument = { ...first, name: 'First, renamed' };
    expect(saveDesign(store, renamed).ok).toBe(true);

    const all = loadDesigns(store);
    expect(all.ok).toBe(true);
    if (all.ok) {
      expect(all.documents.map((doc) => doc.id)).toEqual([first.id, second.id]); // replaced in place, appended after
      expect(all.documents[0]!.name).toBe('First, renamed');
    }
  });

  it('an id the store does not hold is refused BY NAME — not answered with a blank document', () => {
    const store = kv();
    const read = loadDesign(store, 'doc-ghost');
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toMatch(/no design with id "doc-ghost" is stored/);
  });

  it('an ABSENT key is an empty store, which is not an error', () => {
    const loaded = loadDesigns(kv());
    expect(loaded.ok && loaded.source).toBe('empty');
    if (loaded.ok) expect(loaded.documents).toEqual([]);
  });

  it('a PRESENT key that is not JSON, or carries an unknown version, is refused by name', () => {
    const notJson = loadDesigns(kv({ [DESIGN_STORAGE_KEY]: 'not json' }));
    expect(notJson.ok).toBe(false);
    if (!notJson.ok) expect(notJson.reason).toMatch(/not JSON/);

    const unknown = loadDesigns(kv({ [DESIGN_STORAGE_KEY]: JSON.stringify({ version: 99, documents: [] }) }));
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toMatch(/unsupported design format version 99/);
  });

  it('a hand-edited document the MODEL refuses is refused on read, not handed to a caller', () => {
    const broken = createEmptyDocument('Broken');
    delete (broken.nodes as Record<string, unknown>)[broken.rootId]; // the root the graph names is gone
    const store = kv({ [DESIGN_STORAGE_KEY]: JSON.stringify({ version: 1, documents: [broken] }) });
    const loaded = loadDesigns(store);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.reason).toMatch(/not a valid Design Document: rootId .* is not in nodes/);
  });

  it('two documents under one id are refused by name, in the text and on the way in', () => {
    const doc = createEmptyDocument('Twice');
    const text = JSON.stringify({ version: 1, documents: [doc, doc] });
    const parsed = deserializeDesigns(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toMatch(/is stored twice/);

    const saved = saveDesigns(kv(), [doc, doc]);
    expect(saved.ok).toBe(false);
    if (!saved.ok) expect(saved.reason).toMatch(/is stored twice/);
  });

  it('refuses to SAVE a document the model refuses, and writes nothing', () => {
    const store = kv();
    const broken = createEmptyDocument('Broken');
    delete (broken.nodes as Record<string, unknown>)[broken.rootId];
    const saved = saveDesign(store, broken);
    expect(saved.ok).toBe(false);
    if (!saved.ok) expect(saved.reason).toMatch(/refusing to save an invalid design/);
    expect(bytes(store)).toBeNull();
  });

  it('refuses to overwrite an unreadable store instead of clobbering it', () => {
    const store = kv({ [DESIGN_STORAGE_KEY]: '{"version":1,"documents":' });
    const saved = saveDesign(store, createEmptyDocument('New'));
    expect(saved.ok).toBe(false);
    if (!saved.ok) expect(saved.reason).toMatch(/refusing to overwrite an unreadable design store/);
    expect(bytes(store)).toBe('{"version":1,"documents":');
  });

  it('the serializer is deterministic and does not alias the documents it is handed', () => {
    const doc = createEmptyDocument('Stable');
    expect(serializeDesigns([doc])).toBe(serializeDesigns([doc]));
    expect(JSON.parse(serializeDesigns([doc])).documents[0]).toEqual(doc);
  });
});
