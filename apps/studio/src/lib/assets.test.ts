import { describe, expect, it } from 'vitest';
import {
  buildStudioAssets,
  buildAssetReport,
  generateAsset,
  removeAsset,
  STUDIO_SHOTS,
  type AssetGeneratorLike,
  type AssetLibraryLike,
  type StoryboardManagerLike,
} from './assets';

/**
 * M3 v153 — the Studio's asset surface, pure half.
 *
 * No React, no DOM, no ai-providers: the two claims a reviewer cares about — *what the surface composes*
 * and *what is actually stored* — are functions of narrow structural interfaces, so they can be asserted
 * here and again in a real browser by the CDP proof without the two disagreeing about what they checked.
 *
 * §60 is the crux, so it is asserted as NUMBERS: the provenance word is the generator's own, and the
 * stored byte count is zero because DEMO MODE produces no pixels.
 */

function fakeStack(over: Partial<AssetGeneratorLike> = {}) {
  const stored = new Map<string, { metadata: Record<string, unknown>; data: Uint8Array; updatedAt: number }>();
  const frames: { id: string; order: number; prompt: string; imageRef?: { assetId: string }; duration?: number; cameraAngle?: string }[] = [];
  const calls: string[] = [];
  let seq = 0;
  let clock = 1_000;
  let board: { id: string; name: string; description?: string } | null = null;

  const generator: AssetGeneratorLike = {
    async generate(request) {
      calls.push(`generate:${request.prompt}`);
      const assetId = `img-${++seq}`;
      return {
        assets: [
          {
            assetId,
            type: 'image',
            url: `asset://${assetId}`,
            metadata: {
              name: `Generated: ${request.prompt}`,
              mimeType: 'image/png',
              width: 1024,
              height: 1024,
              tags: ['generated', 'demo'],
              source: 'generated',
              prompt: request.prompt,
            },
          },
        ],
        provenance: { mode: 'demo', provider: 'demo' },
        metadata: { model: 'demo-model', seed: 12345 },
      };
    },
  };

  const library: AssetLibraryLike = {
    async add(asset, data) {
      const a = asset as { assetId: string; metadata: Record<string, unknown> };
      // The REAL library stamps `updatedAt` on add and returns assets NEWEST-FIRST with the id as the
      // tiebreak (`picked.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))`). A fake
      // that returned insertion order would let a case pass here that fails against the shipped library —
      // which is exactly what the first draft of this suite did, and the headless proof caught it.
      stored.set(a.assetId, { metadata: { id: a.assetId, ...a.metadata }, data, updatedAt: ++clock });
    },
    async remove(id) {
      return stored.delete(id);
    },
    async list() {
      return [...stored.entries()]
        .sort(([idA, a], [idB, b]) => b.updatedAt - a.updatedAt || idA.localeCompare(idB))
        .map(([assetId]) => ({ assetId, type: 'image' }));
    },
    async get(id) {
      const entry = stored.get(id);
      if (!entry) return null;
      const m = entry.metadata as Record<string, unknown>;
      return {
        metadata: {
          id: String(m.id),
          type: String(m.type ?? 'image'),
          name: String(m.name),
          mimeType: String(m.mimeType),
          size: entry.data.length,
          width: m.width as number | undefined,
          height: m.height as number | undefined,
          tags: (m.tags as string[]) ?? [],
          source: m.source as string | undefined,
          prompt: m.prompt as string | undefined,
        },
        data: entry.data,
      };
    },
  };

  const storyboards: StoryboardManagerLike = {
    create(name, description) {
      board = { id: `sb-${++seq}`, name, description };
      return board;
    },
    addFrame(storyboardId, frame) {
      if (!board || storyboardId !== board.id) return null;
      const added = { id: `f-${++seq}`, order: frame.order, prompt: frame.prompt, imageRef: frame.imageRef as { assetId: string } | undefined, duration: frame.duration, cameraAngle: frame.cameraAngle };
      frames.push(added);
      return added;
    },
    get(id) {
      if (!board || id !== board.id) return undefined;
      return { ...board, frames };
    },
  };

  return { generator: { ...generator, ...over } as AssetGeneratorLike, library, storyboards, stored, frames, calls };
}

describe('buildStudioAssets — what the surface composes', () => {
  it('generates one still per shot, in the declared order', async () => {
    const { generator, library, storyboards, calls } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);

    expect(built.assetIds).toHaveLength(STUDIO_SHOTS.length);
    expect(calls).toEqual(STUDIO_SHOTS.map((s) => `generate:${s.prompt}`));
    // The order is the SHOTS' order, not a set — a storyboard is ordered or it is a pile.
    expect(new Set(built.assetIds).size).toBe(STUDIO_SHOTS.length);
  });

  it('stores every generated asset in the library', async () => {
    const { generator, library, storyboards, stored } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    for (const id of built.assetIds) expect(stored.has(id), `${id} was not stored`).toBe(true);
    expect(stored.size).toBe(STUDIO_SHOTS.length);
  });

  it('§60: every asset is stored with a ZERO-length payload, because DEMO MODE has no pixels', async () => {
    // The number a reviewer should check. A plausible non-zero size here would be a fabrication.
    const { generator, library, storyboards, stored } = fakeStack();
    await buildStudioAssets(generator, library, storyboards);
    for (const entry of stored.values()) expect(entry.data.length).toBe(0);
  });

  it('§60: the provenance word is the GENERATOR’s, carried through untouched', async () => {
    const { generator, library, storyboards } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    expect(built.provenanceMode).toBe('demo');
  });

  it('files one frame per shot, in order, each referencing the asset it belongs to', async () => {
    const { generator, library, storyboards, frames } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    expect(frames).toHaveLength(STUDIO_SHOTS.length);
    expect(frames.map((f) => f.order)).toEqual([0, 1, 2]);
    expect(frames.map((f) => f.imageRef?.assetId)).toEqual(built.assetIds);
    expect(frames.map((f) => f.cameraAngle)).toEqual(STUDIO_SHOTS.map((s) => s.cameraAngle));
  });

  it('the shots describe a scene with DISTINCT prompts and camera angles', () => {
    expect(new Set(STUDIO_SHOTS.map((s) => s.prompt)).size).toBe(STUDIO_SHOTS.length);
    expect(new Set(STUDIO_SHOTS.map((s) => s.cameraAngle)).size).toBe(STUDIO_SHOTS.length);
    for (const shot of STUDIO_SHOTS) expect(shot.duration).toBeGreaterThan(0);
  });
});

describe('buildAssetReport — what is actually stored', () => {
  it('reports every stored asset, its metadata and the provenance word', async () => {
    const { generator, library, storyboards } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    const report = await buildAssetReport(library, storyboards, built.provenanceMode, built.storyboardId);

    expect(report.schema).toBe(1);
    expect(report.provenanceMode).toBe('demo');
    expect(report.assets).toHaveLength(STUDIO_SHOTS.length);
    for (const a of report.assets) {
      expect(a).toMatchObject({ type: 'image', mimeType: 'image/png', source: 'generated', width: 1024 });
      // Every asset carries the prompt of SOME declared shot — matched as a set, because the library
      // returns newest-first and the Studio composed in shot order.
      expect(STUDIO_SHOTS.map((s) => s.prompt)).toContain(a.prompt);
    }
  });

  it('lists assets in the LIBRARY’s order, which is NOT the order the Studio composed them in', async () => {
    // The library returns newest-first by `updatedAt`; the Studio composes in shot order. A report that
    // presented the Studio's insertion order as the library's would be showing a caller something the
    // library never said — the same class of error as a title claiming a number it does not own.
    const { generator, library, storyboards } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    const report = await buildAssetReport(library, storyboards, built.provenanceMode, built.storyboardId);

    const libraryOrder = (await library.list()).map((r) => r.assetId);
    expect(report.assets.map((a) => a.id)).toEqual(libraryOrder);
    expect(report.assets.map((a) => a.id)).toEqual([...built.assetIds].reverse()); // newest-first
    expect(report.assets.map((a) => a.id)).not.toEqual(built.assetIds); // and NOT the composition order
    // Every shot still has an asset — as a SET, since the library promises no order among them.
    expect([...report.assets.map((a) => a.prompt)].sort()).toEqual([...STUDIO_SHOTS.map((s) => s.prompt)].sort());
  });

  it('the storyboard IS ordered, and it is where order is guaranteed', async () => {
    const { generator, library, storyboards } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    const report = await buildAssetReport(library, storyboards, built.provenanceMode, built.storyboardId);
    expect(report.storyboard!.frames.map((f) => f.order)).toEqual([0, 1, 2]);
    expect(report.storyboard!.frames.map((f) => f.prompt)).toEqual(STUDIO_SHOTS.map((s) => s.prompt));
  });

  it('§60: storedBytes is ZERO and every asset reports zero bytes', async () => {
    const { generator, library, storyboards } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    const report = await buildAssetReport(library, storyboards, built.provenanceMode, built.storyboardId);

    expect(report.storedBytes).toBe(0);
    for (const a of report.assets) expect(a.bytes).toBe(0);
  });

  it('the storyboard reports its frames in order, with the asset each one references', async () => {
    const { generator, library, storyboards } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    const report = await buildAssetReport(library, storyboards, built.provenanceMode, built.storyboardId);

    expect(report.storyboard).not.toBeNull();
    const frames = report.storyboard!.frames;
    expect(frames.map((f) => f.order)).toEqual([0, 1, 2]);
    expect(frames.map((f) => f.imageRef)).toEqual(built.assetIds);
    expect(frames.map((f) => f.duration)).toEqual(STUDIO_SHOTS.map((s) => s.duration));
  });

  it('an empty library answers with empty collections rather than a fabricated asset', async () => {
    const { library, storyboards } = fakeStack();
    const report = await buildAssetReport(library, storyboards, 'demo', null);
    expect(report.assets).toEqual([]);
    expect(report.storedBytes).toBe(0);
    expect(report.storyboard).toBeNull(); // not "a storyboard with no frames"
  });

  it('the report is JSON-safe — no Maps, no Uint8Array, nothing a harness cannot read', async () => {
    const { generator, library, storyboards } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    const report = await buildAssetReport(library, storyboards, built.provenanceMode, built.storyboardId);
    const round = JSON.parse(JSON.stringify(report));
    expect(round).toEqual(report);
    expect(JSON.stringify(report)).not.toMatch(/base64|data:image/i);
  });

  it('§60: the report names no provider, model or picture', async () => {
    const { generator, library, storyboards } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    const report = await buildAssetReport(library, storyboards, built.provenanceMode, built.storyboardId);
    const flat = JSON.stringify(report).toLowerCase();
    for (const word of ['openai', 'gpt', 'llm', 'pixel', 'base64']) {
      expect(flat.includes(word), `the report mentions "${word}"`).toBe(false);
    }
  });
});


describe('generateAsset / removeAsset — the interactive surface can grow and shrink the library', () => {
  it('generateAsset calls the generator with the prompt and stores one asset (empty payload)', async () => {
    const { generator, library, calls } = fakeStack();
    const out = await generateAsset(generator, library, 'a new beat the user asked for');
    expect(calls).toContain('generate:a new beat the user asked for');
    expect(out.provenanceMode).toBe('demo');
    const entry = await library.get(out.assetId);
    expect(entry).not.toBeNull();
    if (!entry) throw new Error('the generated asset should exist');
    expect(entry.data.length).toBe(0);
    expect(entry.metadata.prompt).toBe('a new beat the user asked for');
  });

  it('generateAsset leaves the storyboard untouched — the library and the board are separate state', async () => {
    const { generator, library, storyboards } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    const before = await buildAssetReport(library, storyboards, built.provenanceMode, built.storyboardId);
    await generateAsset(generator, library, 'a shot outside the storyboard');
    const after = await buildAssetReport(library, storyboards, built.provenanceMode, built.storyboardId);
    if (!before.storyboard || !after.storyboard) throw new Error('the storyboard report should exist');
    expect(after.assets.length).toBe(before.assets.length + 1);
    expect(after.storyboard.frames.length).toBe(before.storyboard.frames.length);
  });

  it('removeAsset deletes by id and the derived report follows', async () => {
    const { generator, library, storyboards } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    const victim = built.assetIds[0];
    if (!victim) throw new Error('the composed assets should include an id to remove');
    const ok = await removeAsset(library, victim);
    expect(ok).toBe(true);
    expect(await library.get(victim)).toBeNull();
    const report = await buildAssetReport(library, storyboards, built.provenanceMode, built.storyboardId);
    expect(report.assets.map((a) => a.id)).not.toContain(victim);
  });

  it('removeAsset on an id the library never held answers false (not an error)', async () => {
    const { library } = fakeStack();
    expect(await removeAsset(library, 'img-does-not-exist')).toBe(false);
  });

  it('the interactive write path keeps §60: the new asset still stores zero bytes', async () => {
    const { generator, library } = fakeStack();
    const out = await generateAsset(generator, library, 'still metadata only');
    const entry = await library.get(out.assetId);
    if (!entry) throw new Error('the generated asset should exist');
    expect(entry.data.length).toBe(0);
  });
});
