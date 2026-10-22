import { describe, expect, it } from 'vitest';
import {
  createEmptyDocument,
  hexToRgba,
  ops,
  rectNode,
  type DesignDocument,
} from '@nexus/design-model';
import {
  DemoDesignProvider,
  DemoEmbeddingProvider,
  DemoImageProvider,
  DemoRerankerProvider,
} from '../src/providers.js';

// `providers.ts` holds the DEMO providers that back DEMO MODE (ADR 0009/0010/§60). They are real
// deterministic behavior, not mocks, and they must always report `mode: 'demo'` / `nexus-demo` so the
// UI badge is honest. These tests pin that contract + the edit-command decoder in `buildEditBatch`.

function docWithBox(): DesignDocument {
  const doc = createEmptyDocument('T');
  const node = rectNode('Box', { id: 'n1', parentId: doc.activePageId, width: 100, height: 50 });
  doc.nodes['n1'] = node;
  return doc;
}

describe('DemoDesignProvider', () => {
  const p = new DemoDesignProvider();
  it('generate is deterministic for the same prompt + seed and reports demo provenance', async () => {
    const doc = createEmptyDocument('T');
    const r1 = await p.generate({ prompt: 'a landing page', document: doc, seed: 7 });
    const r2 = await p.generate({ prompt: 'a landing page', document: doc, seed: 7 });
    expect(r1.batch.ops).toEqual(r2.batch.ops);
    expect(r1.provenance.mode).toBe('demo');
    expect(r1.usage.mode).toBe('demo');
    expect(r1.usage.provider).toBe('nexus-demo');
    expect(p.available).toBe(true);
  });

  it('decode edit instructions into the right ops', async () => {
    const doc = docWithBox();
    const rename = await p.edit({ document: doc, selectedNodeIds: ['n1'], instruction: 'rename "Hello"' });
    expect(rename.batch.ops).toEqual([ops.updateNode('n1', { name: 'Hello' })]);

    const hide = await p.edit({ document: doc, selectedNodeIds: ['n1'], instruction: 'hide this' });
    expect(hide.batch.ops).toEqual([ops.updateNode('n1', { visible: false })]);

    const show = await p.edit({ document: doc, selectedNodeIds: ['n1'], instruction: 'show it' });
    expect(show.batch.ops).toEqual([ops.updateNode('n1', { visible: true })]);

    const bigger = await p.edit({ document: doc, selectedNodeIds: ['n1'], instruction: 'make it bigger' });
    expect(bigger.batch.ops).toEqual([ops.updateNode('n1', { width: 120, height: 60 })]);

    const smaller = await p.edit({ document: doc, selectedNodeIds: ['n1'], instruction: 'make it smaller' });
    expect(smaller.batch.ops).toEqual([ops.updateNode('n1', { width: 80, height: 40 })]);

    const red = await p.edit({ document: doc, selectedNodeIds: ['n1'], instruction: 'color it red' });
    expect(red.batch.ops).toEqual([ops.updateNode('n1', { fills: [{ kind: 'solid', color: hexToRgba('#ef4444') }] })]);
  });

  it('returns no ops for an empty selection or an instruction with no recognizable verb', async () => {
    const doc = docWithBox();
    const none = await p.edit({ document: doc, selectedNodeIds: [], instruction: 'rename "x"' });
    expect(none.batch.ops).toHaveLength(0);
    const noverb = await p.edit({ document: doc, selectedNodeIds: ['n1'], instruction: 'do nothing useful' });
    expect(noverb.batch.ops).toHaveLength(0);
  });
});

describe('DemoEmbeddingProvider', () => {
  const p = new DemoEmbeddingProvider();
  it('produces deterministic vectors of the canonical dimension, in demo mode', async () => {
    const a = await p.embed({ texts: ['the quick brown fox', 'lazy dog'] });
    const b = await p.embed({ texts: ['the quick brown fox', 'lazy dog'] });
    expect(a.vectors).toEqual(b.vectors);
    expect(a.vectors).toHaveLength(2);
    expect(a.dim).toBeGreaterThan(0);
    expect(a.usage.mode).toBe('demo');
    expect(a.usage.provider).toBe('nexus-demo');
  });
});

describe('DemoRerankerProvider', () => {
  const p = new DemoRerankerProvider();
  const docs = [
    { id: 'a', text: 'the quick brown fox' },
    { id: 'b', text: 'lazy dog sleeps' },
    { id: 'c', text: 'quick silver fox' },
  ];
  it('is deterministic and ranks overlapping documents above non-overlapping ones', async () => {
    const r1 = await p.rank({ query: 'quick fox', documents: docs });
    const r2 = await p.rank({ query: 'quick fox', documents: docs });
    expect(r1.ranked).toEqual(r2.ranked);
    // b shares no tokens with the query, so it must be last
    expect(r1.ranked[r1.ranked.length - 1]!.id).toBe('b');
    expect(r1.usage.mode).toBe('demo');
  });
  it('respects topK', async () => {
    const r = await p.rank({ query: 'quick fox', documents: docs, topK: 1 });
    expect(r.ranked).toHaveLength(1);
  });
});

describe('DemoImageProvider', () => {
  const p = new DemoImageProvider();
  it('is deterministic for a fixed seed and reports demo provenance', async () => {
    const a = await p.textToImage({ prompt: 'sunset over hills', seed: 42, width: 256, height: 256 });
    const b = await p.textToImage({ prompt: 'sunset over hills', seed: 42, width: 256, height: 256 });
    expect(a.spec).toEqual(b.spec);
    expect(a.provenance.mode).toBe('demo');
    expect(a.provenance.seed).toBe(42);
    expect(a.usage.provider).toBe('nexus-demo');
  });
  it('derives the seed from the prompt when none is given (same prompt -> same image)', async () => {
    const a = await p.textToImage({ prompt: 'a red apple', width: 64, height: 64 });
    const b = await p.textToImage({ prompt: 'a red apple', width: 64, height: 64 });
    expect(a.spec).toEqual(b.spec);
    expect(a.provenance.seed).toBe(b.provenance.seed);
  });
});
