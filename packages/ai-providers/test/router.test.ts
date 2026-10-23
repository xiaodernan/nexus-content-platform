import { describe, expect, it, vi } from 'vitest';
import { createEmptyDocument } from '@nexus/design-model';
import { ModelRouter } from '../src/router.js';
import { DemoDesignProvider } from '../src/providers.js';
import { InMemoryCallRecorder } from '../src/call-recorder.js';
import type {
  DesignProvider,
  EmbeddingProvider,
  ImageProvider,
  RerankerProvider,
  Usage,
} from '../src/types.js';

// `router.ts` maps tasks to providers and refuses the ones that cannot serve (ADR 0009/0010). The
// happy paths are covered in `ai-providers.test.ts`; what is pinned HERE is the router's HONESTY
// contract, which is the part a demo-mode product can most easily get wrong:
//
//   1. an UNAVAILABLE provider is REFUSED BY NAME, never faked and never silently swapped for the
//      demo one (§60 / ADR 0010) — and the refusal happens BEFORE the provider is called;
//   2. `mode` reports 'live' the moment a live provider is injected, so the UI badge cannot claim
//      demo while a live capability is in play, and cannot claim live while every provider is demo;
//   3. an INJECTED provider is the one that actually serves, and its usage lands in the recorder
//      the router was built with.

/** A minimal but VALID op batch — the wire shape the router passes through untouched. */
function fakeBatch() {
  return { id: 'batch-1', ops: [], provenance: { mode: 'live' as const }, timestamp: 1 };
}

/** A usage row a fake live provider answers with. */
const LIVE_USAGE: Usage = {
  provider: 'fake-live',
  model: 'fake-1',
  mode: 'live',
  latencyMs: 1,
  estimatedCostUsd: 0,
};

function liveDesign(overrides: Partial<DesignProvider> = {}): DesignProvider {
  return {
    id: 'live-design',
    label: 'Live Design',
    available: true,
    generate: vi.fn(async () => ({ batch: fakeBatch(), usage: LIVE_USAGE, provenance: { mode: 'live' as const } })),
    edit: vi.fn(async () => ({ batch: fakeBatch(), usage: LIVE_USAGE, provenance: { mode: 'live' as const } })),
    ...overrides,
  };
}

function deadDesign(): DesignProvider {
  return liveDesign({ available: false });
}

function deadEmbedding(): EmbeddingProvider {
  return { id: 'dead-embed', label: 'Dead Embed', available: false, embed: vi.fn(async () => ({ vectors: [], dim: 0, usage: LIVE_USAGE })) };
}

function deadReranker(): RerankerProvider {
  return { id: 'dead-rerank', label: 'Dead Rerank', available: false, rank: vi.fn(async () => ({ ranked: [], usage: LIVE_USAGE })) };
}

function deadImage(): ImageProvider {
  return {
    id: 'dead-image',
    label: 'Dead Image',
    available: false,
    textToImage: vi.fn(async () => ({
      spec: { kind: 'demo-gradient' as const, from: '#000', to: '#fff', angle: 0 },
      width: 1,
      height: 1,
      usage: LIVE_USAGE,
      provenance: { mode: 'live' as const },
    })),
  };
}

describe('ModelRouter — the honesty contract (ADR 0010 / §60)', () => {
  it('an UNAVAILABLE design provider is REFUSED by name, on both of its tasks', async () => {
    // A provider that cannot serve must not be called at all: the router refuses BEFORE the call,
    // so a dead key can never look like an empty answer.
    const design = deadDesign();
    const router = new ModelRouter({ design });
    const doc = createEmptyDocument();

    await expect(router.generateDesign({ prompt: 'x', document: doc })).rejects.toThrow(
      /Provider "live-design" is unavailable for task "design.generate"/,
    );
    await expect(
      router.editDesign({ instruction: 'x', document: doc, selectedNodeIds: [] }),
    ).rejects.toThrow(/is unavailable for task "design.edit"/);
    expect(design.generate).not.toHaveBeenCalled();
    expect(design.edit).not.toHaveBeenCalled();
  });

  it('and the same refusal on the embedding, rerank and image tasks', async () => {
    // Every capability the router fronts gets the same gate — a half-refused router would be a
    // router that fakes some capabilities and refuses others.
    const router = new ModelRouter({
      embedding: deadEmbedding(),
      reranker: deadReranker(),
      image: deadImage(),
    });
    await expect(router.embed({ texts: ['a'] })).rejects.toThrow(/unavailable for task "embedding"/);
    await expect(router.rank({ query: 'q', documents: [] })).rejects.toThrow(/unavailable for task "rerank"/);
    await expect(router.textToImage({ prompt: 'p', width: 8, height: 8 })).rejects.toThrow(
      /unavailable for task "image.text-to-image"/,
    );
  });

  it('a refusal records NOTHING — a refused call is not a call', async () => {
    // The cost engine reads the recorder; a refused call that still recorded usage would bill a
    // reader for an answer they never got.
    const rec = new InMemoryCallRecorder();
    const router = new ModelRouter({ recorder: rec, design: deadDesign() });
    await expect(router.generateDesign({ prompt: 'x', document: createEmptyDocument() })).rejects.toThrow();
    expect(rec.totals().calls).toBe(0);
  });

  it('mode says DEMO while every provider is the demo one', () => {
    // The badge is the product's own honesty about itself (ADR 0010).
    expect(new ModelRouter().mode).toBe('demo');
  });

  it('and mode says LIVE the moment a live provider is injected', () => {
    // The badge must not claim demo while a live capability is in play.
    expect(new ModelRouter({ design: liveDesign() }).mode).toBe('live');
    // And a DEMO provider that cannot serve is still the demo provider: the badge is about which
    // capability is in play, not about whether it is up right now.
    const deadDemo: DesignProvider = Object.assign(new DemoDesignProvider(), { available: false });
    expect(new ModelRouter({ design: deadDemo }).mode).toBe('demo');
  });

  it('an INJECTED provider is the one that serves, and its usage is recorded', async () => {
    // A router that ignored its injections would pass every demo-mode test while serving nobody's
    // live key.
    const rec = new InMemoryCallRecorder();
    const design = liveDesign();
    const router = new ModelRouter({ recorder: rec, design });
    const res = await router.generateDesign({ prompt: 'x', document: createEmptyDocument() });
    expect(design.generate).toHaveBeenCalledTimes(1);
    expect(res.usage).toEqual(LIVE_USAGE);
    expect(rec.totals().calls).toBe(1);
    expect(rec.all()[0]).toEqual(LIVE_USAGE);
  });

  it('the EDIT task records its usage too, not only generate', async () => {
    // Both design tasks pay for themselves on the recorder; an edit that recorded nothing would
    // make the cost engine under-report exactly the work readers do most.
    const rec = new InMemoryCallRecorder();
    const design = liveDesign();
    const router = new ModelRouter({ recorder: rec, design });
    await router.editDesign({ instruction: 'recolor', document: createEmptyDocument(), selectedNodeIds: [] });
    expect(design.edit).toHaveBeenCalledTimes(1);
    expect(rec.totals().calls).toBe(1);
  });

  it('the providers getter exposes the four the router fronts', () => {
    const design = liveDesign();
    const router = new ModelRouter({ design });
    expect(router.providers.design).toBe(design);
    expect(router.providers.embedding.id.startsWith('nexus-demo')).toBe(true);
    expect(router.providers.reranker.id.startsWith('nexus-demo')).toBe(true);
    expect(router.providers.image.id.startsWith('nexus-demo')).toBe(true);
  });
});
