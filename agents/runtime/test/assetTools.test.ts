import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../src/registry.js';
import {
  ASSET_TOOL_SPECS,
  registerAssetTools,
  type AssetDriver,
  type AssetSummary,
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
  };
  return { driver: { ...base, ...over } as AssetDriver, calls, assets, storyboards };
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

  it('declares exactly THREE read-class doors, and generation is not one of them', () => {
    const read = ASSET_TOOL_SPECS.filter((s) => s.permissions.includes('read')).map((s) => s.name).sort();
    expect(read).toEqual(['asset.inspect', 'asset.list', 'asset.storyboard.inspect']);
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
    const assetId = (gen.output as { assets: { assetId: string }[] }).assets[0].assetId;
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
    const assetId = (gen.output as { assets: { assetId: string }[] }).assets[0].assetId;
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
