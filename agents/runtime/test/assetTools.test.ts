import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../src/registry.js';
import {
  ASSET_TOOL_SPECS,
  registerAssetTools,
  type AssetDriver,
  type AssetSummary,
  type CharacterSummary,
  type StoryboardFrameSummary,
  type StoryboardSummary,
} from '../src/assetTools.js';

/**
 * M3 v145 — the `asset.*` family, and the FIRST consumer of the multimodal slice.
 *
 * The slice shipped with 13 green tests and no consumer outside its own suite. This suite is the
 * agent-side half of closing that; the REAL generators and library are wired behind the seam by
 * `docs/evidence/agents/asset-tools-proof.mjs`.
 *
 * §60 is the whole point of this family, so it is asserted rather than promised: a generation answer
 * without provenance is REFUSED, no door is named or described in a way that promises pixels, and no
 * result carries bytes.
 */

function fakeDriver(over: Partial<AssetDriver> = {}) {
  const assets = new Map<string, AssetSummary>();
  const storyboards = new Map<string, StoryboardSummary>();
  const characters = new Map<string, CharacterSummary>();
  const calls: string[] = [];
  let seq = 0;

  const base: AssetDriver = {
    engine: 'fake-assets',
    generateImage(request) {
      calls.push(`generateImage:${request.prompt}:${request.count}`);
      const made = Array.from({ length: request.count }, (_, i) => {
        const assetId = `img-${request.prompt.slice(0, 4)}-${i}`;
        const summary: AssetSummary = {
          id: assetId,
          type: 'image',
          name: `Generated: ${request.prompt}`,
          mimeType: 'image/png',
          size: 0,
          width: request.width ?? 1024,
          height: request.height ?? 1024,
          tags: ['generated', 'demo'],
          source: 'generated',
          prompt: request.prompt,
        };
        assets.set(assetId, summary);
        return { assetId, type: 'image', name: summary.name, url: `asset://${assetId}`, mimeType: 'image/png', width: summary.width, height: summary.height };
      });
      return {
        provenance: { mode: 'demo', provider: 'demo' },
        model: 'demo-model',
        seed: 12345,
        assets: made,
      };
    },
    listAssets() {
      return [...assets.values()];
    },
    getAsset(id) {
      return assets.get(id) ?? null;
    },
    createStoryboard(name, description) {
      calls.push(`createStoryboard:${name}`);
      const id = `sb-${++seq}`;
      const storyboard: StoryboardSummary = { id, name, description: description ?? null, frames: [] };
      storyboards.set(id, storyboard);
      return storyboard;
    },
    addFrame(storyboardId, frame) {
      calls.push(`addFrame:${storyboardId}`);
      const storyboard = storyboards.get(storyboardId);
      if (!storyboard) return null;
      const added: StoryboardFrameSummary = {
        id: `f-${++seq}`,
        order: storyboard.frames.length,
        prompt: frame.prompt,
        imageRef: frame.imageRef ?? null,
        duration: frame.duration ?? null,
        cameraAngle: frame.cameraAngle ?? null,
      };
      storyboard.frames.push(added);
      return added;
    },
    getStoryboard(id) {
      return storyboards.get(id);
    },
    // ── M3 v160: the deeper doors ────────────────────────────────────────────────────────────────────
    generateVideo(request) {
      calls.push(`generateVideo:${request.prompt}:${request.count}`);
      const made = Array.from({ length: request.count }, (_, i) => {
        const assetId = `vid-${request.prompt.slice(0, 4)}-${i}`;
        assets.set(assetId, {
          id: assetId,
          type: 'video',
          name: `Generated Video: ${request.prompt}`,
          mimeType: 'video/mp4',
          size: 0,
          width: 1024,
          height: 576,
          tags: ['generated', 'demo'],
          source: 'generated',
          prompt: request.prompt,
        });
        return { assetId, type: 'video', name: `Generated Video: ${request.prompt}`, url: `asset://${assetId}`, mimeType: 'video/mp4', width: 1024, height: 576 };
      });
      return { provenance: { mode: 'demo', provider: 'demo' }, model: 'demo-video-model', seed: 999, assets: made };
    },
    searchAssets(text, limit) {
      calls.push(`searchAssets:${text}:${limit}`);
      return [...assets.values()].filter((a) => a.name.includes(text) || (a.prompt ?? '').includes(text)).slice(0, limit);
    },
    removeAsset(id) {
      calls.push(`removeAsset:${id}`);
      return assets.delete(id);
    },
    updateAsset(id, patch) {
      calls.push(`updateAsset:${id}:${Object.keys(patch).join('+')}`);
      const existing = assets.get(id);
      if (!existing) return false;
      // The REAL library answers `true` for a patch that changes nothing — the behaviour the door refuses
      // an empty patch to avoid reporting.
      assets.set(id, { ...existing, ...patch });
      return true;
    },
    registerCharacter(spec) {
      calls.push(`registerCharacter:${spec.characterId}`);
      characters.set(spec.characterId, spec);
    },
    listCharacters() {
      return [...characters.values()];
    },
    applyConsistency(prompt, characterId) {
      calls.push(`applyConsistency:${characterId}`);
      const c = characters.get(characterId);
      if (!c) return undefined;
      return {
        characterId,
        prompt,
        referenceImages: c.referenceImages,
        consistencyStrength: c.consistencyStrength ?? 0.8,
        referenceCount: c.referenceImages.length,
      };
    },
  };
  return { driver: { ...base, ...over } as AssetDriver, calls, assets, storyboards, characters };
}

function wired(over: Partial<AssetDriver> = {}) {
  const f = fakeDriver(over);
  const registry = registerAssetTools(new ToolRegistry(), f.driver);
  const approve = { checkpoint: () => true };
  const invoke = (tool: string, args: Record<string, unknown> = {}, opts: unknown = approve) =>
    registry.invoke({ callId: `c-${tool}-${Math.random()}`, tool, args }, opts as never);
  return { ...f, registry, invoke };
}

describe('asset tools — the family routes every spec it declares', () => {
  it('registers every declared door', () => {
    const { registry } = wired();
    for (const spec of ASSET_TOOL_SPECS) {
      expect(registry.get(spec.name), `${spec.name} is not registered`).toBeDefined();
    }
  });

  it('declares exactly SIX read-class doors, and neither generation door is one', () => {
    // v145 shipped three; v160 added `asset.search`, `asset.character.list` and `asset.character.apply`.
    // The set is asserted EXACTLY, because a read door is one that skips the §28 gate — a door that mutated
    // and joined this list would be a write nothing checked.
    const read = ASSET_TOOL_SPECS.filter((s) => s.permissions.includes('read')).map((s) => s.name).sort();
    expect(read).toEqual([
      'asset.character.apply',
      'asset.character.list',
      'asset.inspect',
      'asset.list',
      'asset.search',
      'asset.storyboard.inspect',
    ]);
    const gen = ASSET_TOOL_SPECS.find((s) => s.name === 'asset.image.generate')!;
    expect(gen.permissions).not.toContain('read');
  });
});

describe('asset tools — §60, enforced rather than promised', () => {
  it('NO door is named or described in a way that promises pixels', () => {
    // The `base64-screenshot-placeholder` defect in a new costume would be a door whose NAME or
    // DESCRIPTION let a reader believe a picture comes back. Both are asserted, per door.
    for (const spec of ASSET_TOOL_SPECS) {
      expect(spec.name, `${spec.name} is named like an image producer`).not.toMatch(/screenshot|render|pixel|photo|picture/i);
      expect(spec.description, `${spec.name}'s description promises an image`).not.toMatch(/returns? (an? )?(image|picture|pixels?)|produces (an? )?(image|picture)/i);
    }
    // And the generation door says the opposite in words, on its own face.
    const gen = ASSET_TOOL_SPECS.find((s) => s.name === 'asset.image.generate')!;
    expect(gen.description).toMatch(/DEMO MODE/);
    expect(gen.description).toMatch(/no pixels/);
  });

  it('a generation answer WITHOUT provenance is REFUSED, not forwarded', () => {
    // The rule the whole family exists to make: a result that dropped its provenance would be
    // indistinguishable from a real generation's. The door refuses it rather than passing it on.
    const { invoke } = wired({
      generateImage: () => ({ model: 'm', seed: 1, assets: [] }) as never,
    });
    return invoke('asset.image.generate', { prompt: 'a quiet harbour' }).then((r) => {
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/answered without provenance/);
      expect(r.error).toMatch(/could be mistaken for a real generation/);
    });
  });

  it('a generation answer with provenance IS forwarded, and carries it untouched', async () => {
    const { invoke } = wired();
    const r = await invoke('asset.image.generate', { prompt: 'a quiet harbour' });
    expect(r.ok).toBe(true);
    expect(r.output).toMatchObject({
      engine: 'fake-assets',
      prompt: 'a quiet harbour',
      provenance: { mode: 'demo', provider: 'demo' },
      model: 'demo-model',
      seed: 12345,
    });
  });

  it('no result carries bytes — there is no field that could hold them', async () => {
    const { invoke } = wired();
    const generated = await invoke('asset.image.generate', { prompt: 'x' });
    const listed = await invoke('asset.list');
    for (const out of [generated.output, listed.output]) {
      expect(JSON.stringify(out)).not.toMatch(/base64|data:image|placeholder/i);
      expect(out).not.toHaveProperty('data');
    }
  });
});

describe('asset tools — the §28 gate is the registry’s', () => {
  it('a write door does not run without a checkpoint', async () => {
    const { invoke, calls } = wired();
    const r = await invoke('asset.image.generate', { prompt: 'x' }, {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/checkpoint/i);
    expect(calls).toEqual([]);
  });

  it('all three read doors run with NO checkpoint', async () => {
    const { invoke } = wired();
    const sb = await invoke('asset.storyboard.create', { name: 'Shot list' });
    expect((await invoke('asset.list', {}, {})).ok).toBe(true);
    expect((await invoke('asset.inspect', { assetId: 'nope' }, {})).ok).toBe(false); // refused for absence, not for the gate
    expect((await invoke('asset.storyboard.inspect', { storyboardId: (sb.output as { storyboardId: string }).storyboardId }, {})).ok).toBe(true);
  });

  it('args are validated by the registry before the driver sees them', async () => {
    const { invoke, calls } = wired();
    const r = await invoke('asset.image.generate', {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/missing required/);
    expect(calls).toEqual([]);
  });
});

describe('asset tools — refusals that name the fact', () => {
  it('a count or size that is not a finite positive number is refused', async () => {
    const { invoke } = wired();
    expect((await invoke('asset.image.generate', { prompt: 'x', count: 0 })).error).toMatch(/count is 0/);
    expect((await invoke('asset.image.generate', { prompt: 'x', count: -1 })).error).toMatch(/count is -1/);
    expect((await invoke('asset.image.generate', { prompt: 'x', width: 0 })).error).toMatch(/width is 0/);
  });

  it('inspecting an asset the library does not hold is refused by name', async () => {
    const { invoke } = wired();
    const r = await invoke('asset.inspect', { assetId: 'img-ghost' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/holds no asset img-ghost/);
  });

  it('a frame may not reference an asset the library does not hold', async () => {
    const { invoke, calls } = wired();
    const sb = await invoke('asset.storyboard.create', { name: 'Shot list' });
    const storyboardId = (sb.output as { storyboardId: string }).storyboardId;
    const r = await invoke('asset.storyboard.frame.add', { storyboardId, prompt: 'wide', imageRef: 'img-ghost' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/holds no asset img-ghost/);
    expect(calls.filter((c) => c.startsWith('addFrame'))).toEqual([]); // refused BEFORE the add
  });

  it('and IS filed when the asset exists', async () => {
    const { invoke, storyboards } = wired();
    const gen = await invoke('asset.image.generate', { prompt: 'a quiet harbour' });
    const assetId = (gen.output as { assets: { assetId: string }[] }).assets[0]!.assetId;
    const sb = await invoke('asset.storyboard.create', { name: 'Shot list' });
    const storyboardId = (sb.output as { storyboardId: string }).storyboardId;

    const r = await invoke('asset.storyboard.frame.add', { storyboardId, prompt: 'wide', imageRef: assetId, duration: 2.5 });
    expect(r.ok).toBe(true);
    expect((r.output as { frame: StoryboardFrameSummary }).frame).toMatchObject({ prompt: 'wide', imageRef: assetId, duration: 2.5 });
    expect(storyboards.get(storyboardId)!.frames).toHaveLength(1);
  });

  it('adding a frame to a storyboard that does not exist is refused by name', async () => {
    const { invoke } = wired();
    const r = await invoke('asset.storyboard.frame.add', { storyboardId: 'sb-ghost', prompt: 'wide' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/holds no storyboard sb-ghost/);
  });

  it('inspecting a storyboard that does not exist is refused by name', async () => {
    const { invoke } = wired();
    const r = await invoke('asset.storyboard.inspect', { storyboardId: 'sb-ghost' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/holds no storyboard sb-ghost/);
  });

  it('an empty required string is refused, not passed through', async () => {
    const { invoke } = wired();
    expect((await invoke('asset.storyboard.create', { name: '' })).error).toMatch(/name must be a non-empty string/);
  });
});

describe('asset tools — what a door answers', () => {
  it('generate reports the count it asked for and the assets it got', async () => {
    const { invoke, calls } = wired();
    const r = await invoke('asset.image.generate', { prompt: 'a quiet harbour', count: 3 });
    expect(r.ok).toBe(true);
    expect((r.output as { assets: unknown[] }).assets).toHaveLength(3);
    expect(calls).toContain('generateImage:a quiet harbour:3');
  });

  it('generate defaults to ONE asset when no count is named', async () => {
    const { invoke, calls } = wired();
    await invoke('asset.image.generate', { prompt: 'x' });
    expect(calls).toContain('generateImage:x:1');
  });

  it('list reports the library and how many it holds', async () => {
    const { invoke } = wired();
    await invoke('asset.image.generate', { prompt: 'a' });
    await invoke('asset.image.generate', { prompt: 'b' });
    const r = await invoke('asset.list');
    expect(r.ok).toBe(true);
    expect((r.output as { count: number }).count).toBe(2);
  });

  it('inspect answers one asset’s metadata', async () => {
    const { invoke } = wired();
    const gen = await invoke('asset.image.generate', { prompt: 'a quiet harbour' });
    const assetId = (gen.output as { assets: { assetId: string }[] }).assets[0]!.assetId;
    const r = await invoke('asset.inspect', { assetId });
    expect(r.ok).toBe(true);
    expect(r.output).toMatchObject({ id: assetId, type: 'image', source: 'generated', prompt: 'a quiet harbour' });
  });

  it('storyboard.inspect reports the frames in order, and how many', async () => {
    const { invoke } = wired();
    const sb = await invoke('asset.storyboard.create', { name: 'Shot list', description: 'three beats' });
    const storyboardId = (sb.output as { storyboardId: string }).storyboardId;
    await invoke('asset.storyboard.frame.add', { storyboardId, prompt: 'wide' });
    await invoke('asset.storyboard.frame.add', { storyboardId, prompt: 'close' });

    const r = await invoke('asset.storyboard.inspect', { storyboardId });
    expect(r.ok).toBe(true);
    const out = r.output as { frames: StoryboardFrameSummary[]; frameCount: number; description: string };
    expect(out.frameCount).toBe(2);
    expect(out.frames.map((f) => f.prompt)).toEqual(['wide', 'close']);
    expect(out.frames.map((f) => f.order)).toEqual([0, 1]);
    expect(out.description).toBe('three beats');
  });

  it('a driver that answers with a PROMISE is awaited like one that answers directly', async () => {
    const { invoke } = wired({
      listAssets: async () => [],
      createStoryboard: async (name: string) => ({ id: `async-${name}`, name, description: null, frames: [] }),
    });
    expect((await invoke('asset.list')).output).toMatchObject({ count: 0 });
    expect((await invoke('asset.storyboard.create', { name: 'S' })).output).toMatchObject({ storyboardId: 'async-S' });
  });

  it('a driver that throws becomes a failed CALL, not a crash of the registry', async () => {
    const { invoke } = wired({
      listAssets: () => {
        throw new Error('asset store exploded');
      },
    });
    const r = await invoke('asset.list', {}, {});
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/asset store exploded/);
  });
});

describe('asset tools — the deeper doors (M3 v160)', () => {
  it('every door v160 ADDED that mutates is write-class, and the three new read doors are the queries', () => {
    // The full read set is pinned by the v145 case above; what this one owns is that the FOUR mutating
    // doors v160 added did not sneak in as reads. `asset.character.apply` runs no generator, so it is a
    // query — but it is listed here as an explicit decision rather than an omission.
    const byName = new Map(ASSET_TOOL_SPECS.map((s) => [s.name, s]));
    for (const name of ['asset.video.generate', 'asset.update', 'asset.delete', 'asset.character.register']) {
      expect(byName.get(name)?.permissions, `${name} is not write-class`).toContain('write');
      expect(byName.get(name)?.permissions, `${name} is read-class`).not.toContain('read');
    }
    for (const name of ['asset.search', 'asset.character.list', 'asset.character.apply']) {
      expect(byName.get(name)?.permissions, `${name} is not read-class`).toContain('read');
    }
  });

  it('every newly declared door is ROUTED (an unrouted tool is a silent hole)', () => {
    const { registry } = wired();
    for (const name of ['asset.video.generate', 'asset.search', 'asset.update', 'asset.delete', 'asset.character.register', 'asset.character.list', 'asset.character.apply']) {
      expect(registry.get(name), `${name} is not registered`).toBeDefined();
    }
  });

  it('asset.video.generate reports the assets the VIDEO generator made, type and mimeType included', async () => {
    const { invoke, calls } = wired();
    const r = await invoke('asset.video.generate', { prompt: 'a skiff crossing', duration: 6 });
    expect(r.ok).toBe(true);
    expect(r.output).toMatchObject({ engine: 'fake-assets', provenance: { mode: 'demo' }, model: 'demo-video-model' });
    const assets = (r.output as { assets: { type: string; mimeType: string }[] }).assets;
    expect(assets[0]!.type).toBe('video'); // the GENERATOR's word, not a label this door stamped
    expect(assets[0]!.mimeType).toBe('video/mp4');
    expect(calls).toContain('generateVideo:a skiff crossing:1');
  });

  it('BOTH generate doors refuse a provenance-less answer — the rule is shared, not duplicated', async () => {
    const naked = { provenance: undefined } as never;
    for (const [tool, args] of [
      ['asset.image.generate', { prompt: 'x' }],
      ['asset.video.generate', { prompt: 'x' }],
    ] as const) {
      const { invoke } = wired(tool.includes('video') ? { generateVideo: () => naked } : { generateImage: () => naked });
      const r = await invoke(tool, args);
      expect(r.ok, `${tool} forwarded a provenance-less answer`).toBe(false);
      expect(r.error).toMatch(/answered without provenance/);
    }
  });

  it('asset.search passes the text and limit through, and reports what came back', async () => {
    const { invoke, calls } = wired();
    await invoke('asset.image.generate', { prompt: 'a quiet harbour' });
    const r = await invoke('asset.search', { text: 'harbour', limit: 3 });
    expect(r.ok).toBe(true);
    expect(calls).toContain('searchAssets:harbour:3');
    expect((r.output as { count: number }).count).toBe(1);
    expect((r.output as { assets: { prompt: string }[] }).assets[0]!.prompt).toBe('a quiet harbour');
  });

  it('asset.search defaults to a limit of 10 and refuses a bad one', async () => {
    const { invoke, calls } = wired();
    await invoke('asset.search', { text: 'x' });
    expect(calls).toContain('searchAssets:x:10');
    expect((await invoke('asset.search', { text: 'x', limit: 0 })).error).toMatch(/limit is 0/);
  });

  it('asset.update changes the metadata the caller named, and reports the asset it now holds', async () => {
    const { invoke, assets } = wired();
    const gen = await invoke('asset.image.generate', { prompt: 'a quiet harbour' });
    const assetId = (gen.output as { assets: { assetId: string }[] }).assets[0]!.assetId;

    const r = await invoke('asset.update', { assetId, name: 'Harbour, renamed', tags: 'final, dusk' });
    expect(r.ok).toBe(true);
    expect(assets.get(assetId)!.name).toBe('Harbour, renamed');
    expect(assets.get(assetId)!.tags).toEqual(['final', 'dusk']); // a comma-separated string becomes a list
    expect((r.output as { asset: AssetSummary }).asset.name).toBe('Harbour, renamed');
  });

  it('asset.update REFUSES a patch that names nothing — the library would call it an update', async () => {
    // The library's `updateMetadata` answers `true` for a patch that changes nothing, so a door that
    // forwarded an empty patch would report a success that changed nothing. This is the rule.
    const { invoke, calls } = wired();
    const gen = await invoke('asset.image.generate', { prompt: 'a quiet harbour' });
    const assetId = (gen.output as { assets: { assetId: string }[] }).assets[0]!.assetId;
    const before = calls.length;

    const r = await invoke('asset.update', { assetId });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/a patch that names nothing would be reported as an update/);
    expect(calls.length).toBe(before); // and it never reached the driver
  });

  it('asset.update on an asset the library does not hold is refused by name', async () => {
    const { invoke } = wired();
    const r = await invoke('asset.update', { assetId: 'img-ghost', name: 'x' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/holds no asset img-ghost/);
  });

  it('asset.delete removes by id, and answers false for one the library does not hold', async () => {
    const { invoke, assets } = wired();
    const gen = await invoke('asset.image.generate', { prompt: 'a quiet harbour' });
    const assetId = (gen.output as { assets: { assetId: string }[] }).assets[0]!.assetId;

    const gone = await invoke('asset.delete', { assetId });
    expect(gone.ok).toBe(true);
    expect((gone.output as { removed: boolean }).removed).toBe(true);
    expect(assets.has(assetId)).toBe(false);

    // Twice is a caller's mistake, not a corrupt library — reported, not raised.
    const again = await invoke('asset.delete', { assetId });
    expect(again.ok).toBe(true);
    expect((again.output as { removed: boolean }).removed).toBe(false);
  });

  it('the delete door SAYS how it relates to the panel’s Remove (two removal semantics, explained)', async () => {
    // v159 gave the Studio an ungated Remove on its own in-memory library; this door is write-class behind
    // the §28 checkpoint. The difference is who owns the library — and the door's own description says so
    // rather than leaving a reader to guess why one removal asks a checkpoint and the other does not.
    const spec = ASSET_TOOL_SPECS.find((s) => s.name === 'asset.delete')!;
    expect(spec.permissions).toContain('write');
    expect(spec.description).toMatch(/panel/i);
    expect(spec.description).toMatch(/write-class/);
  });

  it('asset.character.register stores the reference images and reports the roster size', async () => {
    const { invoke, characters } = wired();
    const r = await invoke('asset.character.register', { characterId: 'mira', referenceImages: 'a.png, b.png', consistencyStrength: 0.7 });
    expect(r.ok).toBe(true);
    expect(r.output).toMatchObject({ characterId: 'mira', referenceImages: 2, characters: 1 });
    expect(characters.get('mira')!.referenceImages).toEqual(['a.png', 'b.png']);
    expect(characters.get('mira')!.consistencyStrength).toBe(0.7);
  });

  it('registering a character with NO reference images is refused — it would anchor nothing', async () => {
    const { invoke, calls } = wired();
    const before = calls.length;
    const r = await invoke('asset.character.register', { characterId: 'mira', referenceImages: ' , , ' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/anchors nothing/);
    expect(calls.length).toBe(before);
  });

  it('a consistency strength above 1 is refused — the field means a fraction', async () => {
    const { invoke } = wired();
    const r = await invoke('asset.character.register', { characterId: 'mira', referenceImages: 'a.png', consistencyStrength: 2 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/a fraction in \(0, 1\]/);
  });

  it('asset.character.list reports the roster', async () => {
    const { invoke } = wired();
    await invoke('asset.character.register', { characterId: 'mira', referenceImages: 'a.png' });
    await invoke('asset.character.register', { characterId: 'vane', referenceImages: 'c.png' });
    const r = await invoke('asset.character.list');
    expect(r.ok).toBe(true);
    expect((r.output as { count: number }).count).toBe(2);
  });

  it('asset.character.apply answers a DERIVED REQUEST, and says so rather than looking like an asset', async () => {
    // No generator runs here. A door whose answer could be read as a generation would be the §60 defect in
    // a new place, so the result carries `derived: 'request'` and the reference images that WOULD be sent.
    const { invoke, calls } = wired();
    await invoke('asset.character.register', { characterId: 'mira', referenceImages: 'a.png, b.png', consistencyStrength: 0.7 });

    const r = await invoke('asset.character.apply', { characterId: 'mira', prompt: 'a wide shot' });
    expect(r.ok).toBe(true);
    expect(r.output).toMatchObject({ derived: 'request', characterId: 'mira', prompt: 'a wide shot', referenceCount: 2, consistencyStrength: 0.7 });
    expect((r.output as { referenceImages: string[] }).referenceImages).toEqual(['a.png', 'b.png']);
    // Nothing generated: the only driver call was the apply itself.
    expect(calls.filter((c) => c.startsWith('generate')).length).toBe(0);
    expect((r.output as Record<string, unknown>)).not.toHaveProperty('assets');
  });

  it('applying consistency for an unregistered character is refused by name, not as a raw throw', async () => {
    const { invoke } = wired();
    const r = await invoke('asset.character.apply', { characterId: 'nobody', prompt: 'a wide shot' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no character is registered as "nobody"/);
  });

  it('the new write doors refuse without a checkpoint, and the new read doors do not', async () => {
    const { invoke } = wired();
    for (const [tool, args] of [
      ['asset.video.generate', { prompt: 'x' }],
      ['asset.update', { assetId: 'a', name: 'x' }],
      ['asset.delete', { assetId: 'a' }],
      ['asset.character.register', { characterId: 'c', referenceImages: 'a.png' }],
    ] as const) {
      const denied = await invoke(tool, args, {});
      expect(denied.ok, `${tool} ran without a checkpoint`).toBe(false);
      expect(denied.error).toMatch(/checkpoint/i);
    }
    for (const [tool, args] of [
      ['asset.search', { text: 'x' }],
      ['asset.character.list', {}],
      ['asset.character.apply', { characterId: 'c', prompt: 'p' }],
    ] as const) {
      // `apply`/`list` answer for an empty roster; what matters is that the GATE did not refuse them.
      const r = await invoke(tool, args, {});
      expect(r.error ?? '', `${tool} was refused by the gate`).not.toMatch(/checkpoint/i);
    }
  });
});
