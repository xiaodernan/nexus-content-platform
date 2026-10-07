import { describe, expect, it } from 'vitest';
import {
  buildStudioAssets,
  buildAssetReport,
  generateAsset,
  removeAsset,
  removeStoryboardFrame,
  reorderStoryboardFrames,
  registerCharacter,
  applyCharacterConsistency,
  STUDIO_SHOTS,
  type AssetGeneratorLike,
  type AssetLibraryLike,
  type CharacterManagerLike,
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
      const a = asset as { assetId: string; type?: string; metadata: Record<string, unknown> };
      // The REAL library stamps `updatedAt` on add and returns assets NEWEST-FIRST with the id as the
      // tiebreak (`picked.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))`). A fake
      // that returned insertion order would let a case pass here that fails against the shipped library —
      // which is exactly what the first draft of this suite did, and the headless proof caught it.
      // v187: the real `add` also fills metadata.type from the REFERENCE's own type — a fake that
      // dropped it would mislabel every asset `image` (and did, in the first v187 run).
      stored.set(a.assetId, { metadata: { id: a.assetId, ...(a.type !== undefined ? { type: a.type } : {}), ...a.metadata }, data, updatedAt: ++clock });
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
          // v187: duration is part of the shape the REAL library round-trips; a whitelist that
          // dropped it would report every still-and-footage pair as `null` (and did).
          ...(m.duration !== undefined ? { duration: m.duration as number } : {}),
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
    // v188: aligned with the REAL manager — remove splices and leaves the survivors' `order` untouched
    // (a hole is honest state), reorder rewrites `order` to 0..n-1 in the sequence GIVEN and appends any
    // frame the sequence did not name, in its previous shape.
    removeFrame(storyboardId, frameId) {
      if (!board || storyboardId !== board.id) return false;
      const idx = frames.findIndex((f) => f.id === frameId);
      if (idx < 0) return false;
      frames.splice(idx, 1);
      return true;
    },
    reorderFrames(storyboardId, frameIds) {
      if (!board || storyboardId !== board.id) return false;
      if (new Set(frameIds).size !== frameIds.length) return false;
      const map = new Map(frames.map((f) => [f.id, f] as const));
      const next: typeof frames = [];
      for (let i = 0; i < frameIds.length; i++) {
        const f = map.get(frameIds[i]!);
        if (!f) return false;
        next.push({ ...f, order: i });
      }
      for (const f of frames) if (!frameIds.includes(f.id)) next.push(f);
      frames.length = 0;
      frames.push(...next);
      return true;
    },
  };

  // v189: mirrors the REAL manager's own answers — `applyConsistency` THROWS for a character it does not
  // hold, attaches one reference asset per anchor url, and stamps `characterConsistency` with the
  // manager's own 0.8 default where the register held none. A fake that pre-filled 0.8 at rest would let
  // the report and the derivation agree where the real pair deliberately disagrees.
  const characterMap = new Map<string, { characterId: string; referenceImages: string[]; consistencyStrength?: number }>();
  const characters: CharacterManagerLike = {
    registerCharacter(opts) {
      characterMap.set(opts.characterId, {
        characterId: opts.characterId,
        referenceImages: [...opts.referenceImages],
        ...(opts.consistencyStrength !== undefined ? { consistencyStrength: opts.consistencyStrength } : {}),
      });
    },
    listCharacters() {
      return [...characterMap.values()].map((c) => ({ ...c, referenceImages: [...c.referenceImages] }));
    },
    async applyConsistency(request, characterId) {
      const c = characterMap.get(characterId);
      if (!c) throw new Error(`no character registered as "${characterId}"`);
      return {
        ...request,
        referenceAssets: c.referenceImages.map((url, i) => ({
          assetId: `ref-${characterId}-${i}`,
          type: 'image',
          url,
          metadata: { tags: ['character-reference', characterId] },
        })),
        parameters: {
          ...request.parameters,
          characterConsistency: {
            characterId,
            referenceImages: [...c.referenceImages],
            consistencyStrength: c.consistencyStrength ?? 0.8,
          },
        },
      };
    },
  };

  return { generator: { ...generator, ...over } as AssetGeneratorLike, library, storyboards, characters, stored, frames, calls };
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
    const { generator, library, storyboards, characters } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    const report = await buildAssetReport(library, storyboards, characters, built.provenanceMode, built.storyboardId);

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
    const { generator, library, storyboards, characters } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    const report = await buildAssetReport(library, storyboards, characters, built.provenanceMode, built.storyboardId);

    const libraryOrder = (await library.list()).map((r) => r.assetId);
    expect(report.assets.map((a) => a.id)).toEqual(libraryOrder);
    expect(report.assets.map((a) => a.id)).toEqual([...built.assetIds].reverse()); // newest-first
    expect(report.assets.map((a) => a.id)).not.toEqual(built.assetIds); // and NOT the composition order
    // Every shot still has an asset — as a SET, since the library promises no order among them.
    expect([...report.assets.map((a) => a.prompt)].sort()).toEqual([...STUDIO_SHOTS.map((s) => s.prompt)].sort());
  });

  it('the storyboard IS ordered, and it is where order is guaranteed', async () => {
    const { generator, library, storyboards, characters } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    const report = await buildAssetReport(library, storyboards, characters, built.provenanceMode, built.storyboardId);
    expect(report.storyboard!.frames.map((f) => f.order)).toEqual([0, 1, 2]);
    expect(report.storyboard!.frames.map((f) => f.prompt)).toEqual(STUDIO_SHOTS.map((s) => s.prompt));
  });

  it('§60: storedBytes is ZERO and every asset reports zero bytes', async () => {
    const { generator, library, storyboards, characters } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    const report = await buildAssetReport(library, storyboards, characters, built.provenanceMode, built.storyboardId);

    expect(report.storedBytes).toBe(0);
    for (const a of report.assets) expect(a.bytes).toBe(0);
  });

  it('the storyboard reports its frames in order, with the asset each one references', async () => {
    const { generator, library, storyboards, characters } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    const report = await buildAssetReport(library, storyboards, characters, built.provenanceMode, built.storyboardId);

    expect(report.storyboard).not.toBeNull();
    const frames = report.storyboard!.frames;
    expect(frames.map((f) => f.order)).toEqual([0, 1, 2]);
    expect(frames.map((f) => f.imageRef)).toEqual(built.assetIds);
    expect(frames.map((f) => f.duration)).toEqual(STUDIO_SHOTS.map((s) => s.duration));
  });

  it('an empty library answers with empty collections rather than a fabricated asset', async () => {
    const { library, storyboards, characters } = fakeStack();
    const report = await buildAssetReport(library, storyboards, characters, 'demo', null);
    expect(report.assets).toEqual([]);
    expect(report.storedBytes).toBe(0);
    expect(report.storyboard).toBeNull(); // not "a storyboard with no frames"
  });

  it('the report is JSON-safe — no Maps, no Uint8Array, nothing a harness cannot read', async () => {
    const { generator, library, storyboards, characters } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    const report = await buildAssetReport(library, storyboards, characters, built.provenanceMode, built.storyboardId);
    const round = JSON.parse(JSON.stringify(report));
    expect(round).toEqual(report);
    expect(JSON.stringify(report)).not.toMatch(/base64|data:image/i);
  });

  it('§60: the report names no provider, model or picture', async () => {
    const { generator, library, storyboards, characters } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    const report = await buildAssetReport(library, storyboards, characters, built.provenanceMode, built.storyboardId);
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
    const { generator, library, storyboards, characters } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    const before = await buildAssetReport(library, storyboards, characters, built.provenanceMode, built.storyboardId);
    await generateAsset(generator, library, 'a shot outside the storyboard');
    const after = await buildAssetReport(library, storyboards, characters, built.provenanceMode, built.storyboardId);
    if (!before.storyboard || !after.storyboard) throw new Error('the storyboard report should exist');
    expect(after.assets.length).toBe(before.assets.length + 1);
    expect(after.storyboard.frames.length).toBe(before.storyboard.frames.length);
  });

  it('removeAsset deletes by id and the derived report follows', async () => {
    const { generator, library, storyboards, characters } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    const victim = built.assetIds[0];
    if (!victim) throw new Error('the composed assets should include an id to remove');
    const ok = await removeAsset(library, victim);
    expect(ok).toBe(true);
    expect(await library.get(victim)).toBeNull();
    const report = await buildAssetReport(library, storyboards, characters, built.provenanceMode, built.storyboardId);
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

describe('video generation — the surface can ask for FOOTAGE (v187)', () => {
  /** A fake shaped like the REAL pair: the type crosses untouched, each kind answers its own metadata. */
  function dispatchingStack() {
    const base = fakeStack();
    const generator: AssetGeneratorLike = {
      async generate(request) {
        base.calls.push(`generate:${request.type}:${request.prompt}`);
        const assetId = `gen-${request.type}-1`;
        const video = request.type === 'video';
        return {
          assets: [
            {
              assetId,
              type: request.type,
              url: `asset://${assetId}`,
              metadata: {
                name: `${video ? 'Generated Video' : 'Generated'}: ${request.prompt}`,
                mimeType: video ? 'video/mp4' : 'image/png',
                width: 1024,
                height: video ? 576 : 1024,
                ...(video ? { duration: 4 } : {}),
                tags: ['generated', 'demo'],
                source: 'generated',
                prompt: request.prompt,
              },
            },
          ],
          provenance: { mode: 'demo', provider: 'demo' },
          metadata: { model: video ? 'demo-video-model' : 'demo-model', seed: 12345 },
        };
      },
    };
    return { ...base, generator };
  }

  it("the ask's type crosses to the generator untouched, and the footage metadata lands in the library", async () => {
    const { generator, library, calls } = dispatchingStack();
    const out = await generateAsset(generator, library, 'a skiff crossing the harbour', 'video');
    expect(calls).toContain('generate:video:a skiff crossing the harbour');
    const entry = await library.get(out.assetId);
    if (!entry) throw new Error('the generated asset should exist');
    expect(entry.metadata.type).toBe('video');
    expect(entry.metadata.mimeType).toBe('video/mp4');
    expect(entry.metadata.duration).toBe(4);
    expect(out.provenanceMode).toBe('demo'); // the generator's own word, still untouched
  });

  it('the report carries duration for footage and null for a still — 0 would read as a measured zero', async () => {
    const { generator, library, storyboards, characters } = dispatchingStack();
    await generateAsset(generator, library, 'a still beat', 'image');
    await generateAsset(generator, library, 'a filmed beat', 'video');
    const report = await buildAssetReport(library, storyboards, characters, 'demo', null);
    const still = report.assets.find((a) => a.mimeType === 'image/png');
    const footage = report.assets.find((a) => a.mimeType === 'video/mp4');
    expect(still?.duration).toBeNull();
    expect(footage?.duration).toBe(4);
    expect(footage?.width).toBe(1024);
    expect(footage?.height).toBe(576);
  });

  it("§60 holds for footage too: the stored payload is EMPTY and the provenance word is the generator's", async () => {
    const { generator, library, stored } = dispatchingStack();
    const out = await generateAsset(generator, library, 'footage, but demo', 'video');
    const entry = await library.get(out.assetId);
    if (!entry) throw new Error('the generated asset should exist');
    expect(entry.data.length).toBe(0);
    expect([...stored.values()].every((s) => s.data.length === 0)).toBe(true);
  });

  it('an empty VIDEO answer is refused by name, like an empty image answer is', async () => {
    const { library } = fakeStack();
    const empty: AssetGeneratorLike = { async generate() { return { assets: [], provenance: { mode: 'demo' }, metadata: { model: 'demo-video-model', seed: 1 } }; } };
    await expect(generateAsset(empty, library, 'nothing came back', 'video')).rejects.toThrow(/the video generator returned no assets/);
  });

  it('the default ask is still a STILL — no caller had to change for v187', async () => {
    const { generator, library, calls } = dispatchingStack();
    await generateAsset(generator, library, 'plain default');
    expect(calls).toContain('generate:image:plain default');
  });
});

describe('storyboard editing — the surface can edit the BOARD (v188)', () => {
  /**
   * The manager had `removeFrame` and `reorderFrames` all along; v188 is the product face. The claims are
   * the MANAGER's own semantics: a removal leaves a hole in `order` (honest state, not renumbered), a
   * reorder rewrites `order` to 0..n-1 in the sequence GIVEN, and neither verb touches the library.
   */
  it('remove drops the named frame and leaves the survivors\' order HONEST — a hole, not a renumber', async () => {
    const { storyboards } = fakeStack();
    const built = await buildStudioAssets(noopGenerator(), noopLibrary(), storyboards);
    const board = storyboards.get(built.storyboardId)!;
    const middle = board.frames[1]!;
    expect(removeStoryboardFrame(storyboards, built.storyboardId, middle.id)).toBe(true);
    const after = storyboards.get(built.storyboardId)!.frames;
    expect(after).toHaveLength(2);
    expect(after.map((f) => f.order)).toEqual([0, 2]); // the hole stays; nothing renumbered it behind the reader's back
    expect(after.map((f) => f.id)).not.toContain(middle.id);
  });

  it('reorder rewrites order to 0..n-1 in the sequence GIVEN, and the report shows that sequence', async () => {
    const { storyboards } = fakeStack();
    const built = await buildStudioAssets(noopGenerator(), noopLibrary(), storyboards);
    const board = storyboards.get(built.storyboardId)!;
    const ids = board.frames.map((f) => f.id);
    const reversed = [...ids].reverse();
    expect(reorderStoryboardFrames(storyboards, built.storyboardId, reversed)).toBe(true);
    const after = storyboards.get(built.storyboardId)!.frames;
    expect(after.map((f) => f.id)).toEqual(reversed);
    expect(after.map((f) => f.order)).toEqual([0, 1, 2]); // rewritten by the manager, contiguous again
  });

  it('remove answers FALSE for a frame the board does not hold, and the board is untouched', async () => {
    const { storyboards } = fakeStack();
    const built = await buildStudioAssets(noopGenerator(), noopLibrary(), storyboards);
    expect(removeStoryboardFrame(storyboards, built.storyboardId, 'frame-nowhere')).toBe(false);
    expect(storyboards.get(built.storyboardId)!.frames).toHaveLength(3);
    expect(removeStoryboardFrame(storyboards, 'sb-nowhere', 'f-1')).toBe(false);
  });

  it('reorder refuses an unknown id and a duplicated id — a partial resequence is exactly the quiet side effect nobody wants', async () => {
    const { storyboards } = fakeStack();
    const built = await buildStudioAssets(noopGenerator(), noopLibrary(), storyboards);
    const board = storyboards.get(built.storyboardId)!;
    const ids = board.frames.map((f) => f.id);
    const before = board.frames.map((f) => f.order);
    expect(reorderStoryboardFrames(storyboards, built.storyboardId, [...ids.slice(0, 2), 'frame-nowhere'])).toBe(false);
    expect(reorderStoryboardFrames(storyboards, built.storyboardId, [ids[0]!, ids[0]!, ids[1]!])).toBe(false);
    expect(storyboards.get(built.storyboardId)!.frames.map((f) => f.order)).toEqual(before);
  });

  it('editing the board does NOT touch the library — the frames reference assets, they are not assets', async () => {
    const { generator, library, storyboards, stored } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    const board = storyboards.get(built.storyboardId)!;
    removeStoryboardFrame(storyboards, built.storyboardId, board.frames[0]!.id);
    reorderStoryboardFrames(storyboards, built.storyboardId, board.frames.map((f) => f.id).reverse());
    expect(stored.size).toBe(3);
    expect((await library.list()).map((r) => r.assetId).sort()).toEqual([...built.assetIds].sort());
  });

  it('§60 holds: a frame edit moves no bytes, because there were none to move', async () => {
    const { generator, library, storyboards, stored } = fakeStack();
    const built = await buildStudioAssets(generator, library, storyboards);
    const board = storyboards.get(built.storyboardId)!;
    reorderStoryboardFrames(storyboards, built.storyboardId, board.frames.map((f) => f.id).reverse());
    for (const entry of stored.values()) expect(entry.data.length).toBe(0);
  });
});

describe('character consistency — the surface can ANCHOR a character (v189)', () => {
  /**
   * The consistency trio has had agent doors since v160; v189 is the product face. The claims are the
   * MANAGER's own semantics, and they hold TWO different numbers on purpose: the report says what the
   * manager HOLDS (strength `null` when none was registered), the derived summary says what the manager
   * WOULD SEND (its own 0.8 default lands there). Pre-applying the default into the report would be the
   * report inventing a number it does not own.
   */
  it('register anchors a character, and the at-rest report shows the strength it HOLDS — null when none', async () => {
    const { generator, library, storyboards, characters, stored } = fakeStack();
    await buildStudioAssets(generator, library, storyboards);
    registerCharacter(characters, { characterId: 'mira', referenceImages: ['asset://img-1'] });
    const report = await buildAssetReport(library, storyboards, characters, 'demo', null);
    expect(report.characters).toEqual([
      { characterId: 'mira', referenceImages: ['asset://img-1'], consistencyStrength: null },
    ]);
    expect(stored.size).toBe(3); // a character is an anchor set, not an asset — nothing was stored
  });

  it('register carries a strength the register was GIVEN, and the report reads it as a number', async () => {
    const { generator, library, storyboards, characters } = fakeStack();
    await buildStudioAssets(generator, library, storyboards);
    registerCharacter(characters, { characterId: 'toma', referenceImages: ['asset://img-2'], consistencyStrength: 0.5 });
    const report = await buildAssetReport(library, storyboards, characters, 'demo', null);
    expect(report.characters[0]).toEqual({ characterId: 'toma', referenceImages: ['asset://img-2'], consistencyStrength: 0.5 });
  });

  it('apply answers the DERIVED REQUEST: the manager’s own 0.8 default lands where the register held none', async () => {
    const { generator, library, storyboards, characters, calls } = fakeStack();
    await buildStudioAssets(generator, library, storyboards);
    registerCharacter(characters, { characterId: 'mira', referenceImages: ['asset://img-1', 'asset://img-2'] });
    const derived = await applyCharacterConsistency(characters, 'mira on the quay, medium shot', 'mira');
    expect(derived).toEqual({
      type: 'image',
      prompt: 'mira on the quay, medium shot',
      characterId: 'mira',
      consistencyStrength: 0.8, // the manager's default — a DIFFERENT number from the null the report held
      referenceAssets: 2,
      referenceImages: ['asset://img-1', 'asset://img-2'],
    });
    // No generator ran for the apply: the calls are exactly the composition's own three, nothing more.
    expect(calls).toEqual([
      'generate:a quiet harbour at dusk, wide establishing shot',
      'generate:a skiff crossing the harbour, medium shot',
      'generate:the far quay, close on the mooring post',
    ]);
  });

  it('apply carries the strength the register HOLDS when it holds one, and the ask’s type crosses untouched', async () => {
    const { generator, library, storyboards, characters } = fakeStack();
    await buildStudioAssets(generator, library, storyboards);
    registerCharacter(characters, { characterId: 'toma', referenceImages: ['asset://img-3'], consistencyStrength: 0.5 });
    const derived = await applyCharacterConsistency(characters, 'toma crossing the harbour', 'toma', 'video');
    expect(derived.type).toBe('video');
    expect(derived.consistencyStrength).toBe(0.5);
    expect(derived.characterId).toBe('toma');
    expect(derived.referenceAssets).toBe(1);
    expect(derived.referenceImages).toEqual(['asset://img-3']);
  });

  it('an unknown character is the MANAGER’s own throw, quoted as it came', async () => {
    const { generator, library, storyboards, characters } = fakeStack();
    await buildStudioAssets(generator, library, storyboards);
    await expect(applyCharacterConsistency(characters, 'a ghost beat', 'nobody')).rejects.toThrow(
      'no character registered as "nobody"',
    );
  });

  it('register and apply touch NEITHER the library NOR the generator — a derivation answers a request, it stores nothing', async () => {
    const { generator, library, storyboards, characters, stored, calls } = fakeStack();
    await buildStudioAssets(generator, library, storyboards);
    const storedBefore = stored.size;
    const callsBefore = calls.length;
    registerCharacter(characters, { characterId: 'mira', referenceImages: ['asset://img-1'] });
    await applyCharacterConsistency(characters, 'mira on the quay', 'mira');
    expect(stored.size).toBe(storedBefore);
    expect(calls.length).toBe(callsBefore);
    expect((await library.list()).length).toBe(storedBefore);
  });
});

/** Minimal no-op halves for storyboard-only cases — the board is the state under test, not the library. */
function noopGenerator(): AssetGeneratorLike {
  return { async generate() { return { assets: [], provenance: { mode: 'demo' }, metadata: { model: 'demo-model', seed: 1 } }; } };
}
function noopLibrary(): AssetLibraryLike {
  return { async add() {}, async remove() { return false; }, async list() { return []; }, async get() { return null; } };
}
