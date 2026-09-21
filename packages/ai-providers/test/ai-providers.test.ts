import { describe, expect, it } from 'vitest';
import { applyBatch, createEmptyDocument, childIdList } from '@nexus/design-model';
import {
  ModelRouter,
  composeDesignBatch,
  cosine,
  hashEmbed,
  InMemoryCallRecorder,
} from '../src/index.js';

describe('demo design composer', () => {
  it('is deterministic: same prompt+seed yields identical node ids', () => {
    const doc = createEmptyDocument();
    const a = composeDesignBatch({ prompt: 'a dark landing page', document: doc, seed: 42 });
    const b = composeDesignBatch({ prompt: 'a dark landing page', document: doc, seed: 42 });
    const idsA = a.batch.ops[0] && a.batch.ops[0].type === 'addSubtree' ? a.batch.ops[0].nodes.map((n) => n.id) : [];
    const idsB = b.batch.ops[0] && b.batch.ops[0].type === 'addSubtree' ? b.batch.ops[0].nodes.map((n) => n.id) : [];
    expect(idsA.length).toBeGreaterThan(8);
    expect(idsA).toEqual(idsB);
  });

  it('detects templates from prompt intent', () => {
    const doc = createEmptyDocument();
    expect(composeDesignBatch({ prompt: 'user login screen', document: doc }).template).toBe('auth');
    expect(composeDesignBatch({ prompt: 'sales dashboard', document: doc }).template).toBe('dashboard');
    expect(composeDesignBatch({ prompt: 'marketing homepage', document: doc }).template).toBe('landing');
    expect(composeDesignBatch({ prompt: 'photo portfolio grid', document: doc }).template).toBe('portfolio');
  });

  it('applies to a real document, producing a connected tree', () => {
    let doc = createEmptyDocument();
    const { batch } = composeDesignBatch({ prompt: 'build a hero landing', document: doc, seed: 7 });
    doc = applyBatch(doc, batch);
    const page = doc.nodes[doc.activePageId]!;
    const topId = childIdList(page)[0]!;
    const top = doc.nodes[topId]!;
    expect(top.type).toBe('frame');
    expect((top as { childIds: string[] }).childIds.length).toBeGreaterThan(0);
    // every added node resolves to a parent
    for (const id of childIdList(top)) expect(doc.nodes[id]?.parentId).toBe(top.id);
  });
});

describe('model router (demo mode)', () => {
  it('reports demo mode and records usage + zero cost', async () => {
    const rec = new InMemoryCallRecorder();
    const router = new ModelRouter({ recorder: rec });
    expect(router.mode).toBe('demo');
    const doc = createEmptyDocument();
    const res = await router.generateDesign({ prompt: 'landing', document: doc });
    expect(res.usage.mode).toBe('demo');
    expect(res.usage.estimatedCostUsd).toBe(0);
    expect(rec.totals().calls).toBe(1);
  });

  it('embeddings are stable and self-similar; rerank is lexical', async () => {
    const router = new ModelRouter();
    const e1 = await router.embed({ texts: ['hello world'] });
    const e2 = await router.embed({ texts: ['hello world'] });
    expect(e1.vectors[0]).toEqual(e2.vectors[0]);
    expect(e1.dim).toBe(64);
    expect(cosine(hashEmbed('abc'), hashEmbed('abc'))).toBeCloseTo(1, 5);

    const r = await router.rank({
      query: 'castle ruins',
      documents: [
        { id: 'a', text: 'a forgotten castle in ruins' },
        { id: 'b', text: 'spaceship engine room blueprint' },
      ],
    });
    expect(r.ranked[0]?.id).toBe('a');
  });

  it('image gen is deterministic per seed', async () => {
    const router = new ModelRouter();
    const a = await router.textToImage({ prompt: 'moonlit ruins', width: 512, height: 512, seed: 3 });
    const b = await router.textToImage({ prompt: 'moonlit ruins', width: 512, height: 512, seed: 3 });
    expect(a.spec).toEqual(b.spec);
    expect(a.provenance.mode).toBe('demo');
  });

  it('edit applies a real recolor op to selection', async () => {
    let doc = createEmptyDocument();
    const router = new ModelRouter();
    const gen = await router.generateDesign({ prompt: 'landing', document: doc, seed: 1 });
    doc = applyBatch(doc, gen.batch);
    const page = doc.nodes[doc.activePageId]!;
    const topId = childIdList(page)[0]!;
    const childId = childIdList(doc.nodes[topId]!)[0]!;
    const edited = await router.editDesign({ instruction: 'make it red', document: doc, selectedNodeIds: [childId] });
    expect(edited.batch.ops.length).toBeGreaterThan(0);
    const next = applyBatch(doc, edited.batch);
    const node = next.nodes[childId]!;
    const fill = (node as { fills: { kind: string; color?: { r: number } }[] }).fills[0];
    expect(fill?.kind).toBe('solid');
    expect(fill?.color?.r).toBeGreaterThan(0.5);
  });
});
