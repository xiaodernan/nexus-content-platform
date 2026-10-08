import { describe, expect, it } from 'vitest';
import {
  InMemoryAssetLibrary,
  DemoImageGenerator,
  DemoVideoGenerator,
  CharacterConsistencyManager,
  StoryboardManager,
  type AssetMetadata,
  type AssetReference,
  type AssetType,
  type CharacterConsistencyOptions,
  type GenerationRequest,
  type StoryboardFrame,
} from '../src/multimodal.js';

describe('multimodal asset library', () => {
  it('stores and retrieves assets with metadata', async () => {
    const lib = new InMemoryAssetLibrary();
    const asset: AssetReference = {
      assetId: 'test-asset-1',
      type: 'image',
      url: 'asset://test-asset-1',
      metadata: {
        name: 'Test Image',
        mimeType: 'image/png',
        width: 1024,
        height: 768,
        tags: ['test', 'demo'],
        source: 'uploaded',
      },
    };
    const data = Buffer.from('fake image data');

    await lib.add(asset, data);
    const retrieved = await lib.get('test-asset-1');

    expect(retrieved).not.toBeNull();
    expect(retrieved!.metadata.id).toBe('test-asset-1');
    expect(retrieved!.metadata.name).toBe('Test Image');
    expect(retrieved!.metadata.width).toBe(1024);
    expect(retrieved!.metadata.height).toBe(768);
    expect(retrieved!.metadata.tags).toEqual(['test', 'demo']);
    expect(retrieved!.data.equals(data)).toBe(true);
  });

  it('lists assets with filters', async () => {
    const lib = new InMemoryAssetLibrary();
    const data = Buffer.from('data');

    await lib.add({
      assetId: 'img-1',
      type: 'image',
      url: 'asset://img-1',
      metadata: { name: 'Image 1', mimeType: 'image/png', tags: ['a'], source: 'uploaded' },
    }, data);
    await lib.add({
      assetId: 'vid-1',
      type: 'video',
      url: 'asset://vid-1',
      metadata: { name: 'Video 1', mimeType: 'video/mp4', tags: ['b'], source: 'generated' },
    }, data);
    await lib.add({
      assetId: 'img-2',
      type: 'image',
      url: 'asset://img-2',
      metadata: { name: 'Image 2', mimeType: 'image/png', tags: ['a', 'c'], source: 'uploaded' },
    }, data);

    const all = await lib.list();
    expect(all.length).toBe(3);

    const images = await lib.list({ type: 'image' });
    expect(images.length).toBe(2);
    expect(images.every((a) => a.type === 'image')).toBe(true);

    const taggedA = await lib.list({ tags: ['a'] });
    expect(taggedA.length).toBe(2);

    const taggedAC = await lib.list({ tags: ['a', 'c'] });
    expect(taggedAC.length).toBe(1);
    expect(taggedAC[0]!.assetId).toBe('img-2');
  });

  it('searches assets by query terms', async () => {
    const lib = new InMemoryAssetLibrary();
    const data = Buffer.from('data');

    await lib.add({
      assetId: 'cat-img',
      type: 'image',
      url: 'asset://cat-img',
      metadata: {
        name: 'Cute Cat',
        mimeType: 'image/png',
        tags: ['animal'],
        source: 'generated',
        prompt: 'a cute cat sitting',
      },
    }, data);
    await lib.add({
      assetId: 'dog-img',
      type: 'image',
      url: 'asset://dog-img',
      metadata: {
        name: 'Happy Dog',
        mimeType: 'image/png',
        tags: ['animal'],
        source: 'generated',
        prompt: 'a happy dog running',
      },
    }, data);
    await lib.add({
      assetId: 'car-img',
      type: 'image',
      url: 'asset://car-img',
      metadata: {
        name: 'Red Car',
        mimeType: 'image/png',
        tags: ['vehicle'],
        source: 'uploaded',
      },
    }, data);

    const catResults = await lib.search('cat');
    expect(catResults.length).toBe(1);
    expect(catResults[0]!.assetId).toBe('cat-img');

    const animalResults = await lib.search('animal');
    expect(animalResults.length).toBe(2);

    const runningResults = await lib.search('running');
    expect(runningResults.length).toBe(1);
    expect(runningResults[0]!.assetId).toBe('dog-img');
  });

  it('updates and removes assets', async () => {
    const lib = new InMemoryAssetLibrary();
    const data = Buffer.from('data');

    await lib.add({
      assetId: 'update-test',
      type: 'image',
      url: 'asset://update-test',
      metadata: { name: 'Original', mimeType: 'image/png', tags: ['old'], source: 'uploaded' },
    }, data);

    const updated = await lib.updateMetadata('update-test', { name: 'Updated', tags: ['new'] });
    expect(updated).toBe(true);

    const meta = await lib.getMetadata('update-test');
    expect(meta?.name).toBe('Updated');
    expect(meta?.tags).toEqual(['new']);

    const removed = await lib.remove('update-test');
    expect(removed).toBe(true);
    expect(await lib.get('update-test')).toBeNull();
    expect(await lib.remove('update-test')).toBe(false);
  });
});

describe('DemoImageGenerator', () => {
  it('generates deterministic assets from prompt', async () => {
    const gen = new DemoImageGenerator();
    const request: GenerationRequest = {
      type: 'image',
      prompt: 'a beautiful sunset',
      seed: 42,
      count: 2,
    };

    const result = await gen.generate(request);

    expect(result.assets.length).toBe(2);
    expect(result.assets[0]!.type).toBe('image');
    expect(result.assets[0]!.metadata.source).toBe('generated');
    expect(result.assets[0]!.metadata.prompt).toBe('a beautiful sunset');
    expect(result.metadata.seed).toBe(42);
    expect(result.metadata.model).toBe('demo-model');
  });

  it('produces different assets for different seeds', async () => {
    const gen = new DemoImageGenerator();

    const r1 = await gen.generate({ type: 'image', prompt: 'test', seed: 1, count: 1 });
    const r2 = await gen.generate({ type: 'image', prompt: 'test', seed: 2, count: 1 });

    expect(r1.assets[0]!.assetId).not.toBe(r2.assets[0]!.assetId);
  });
});

describe('DemoVideoGenerator', () => {
  it('generates video assets with duration', async () => {
    const gen = new DemoVideoGenerator();
    const request: GenerationRequest = {
      type: 'video',
      prompt: 'a cinematic scene',
      seed: 123,
      count: 1,
      parameters: { duration: 5, width: 1920, height: 1080 },
    };

    const result = await gen.generate(request);

    expect(result.assets.length).toBe(1);
    expect(result.assets[0]!.type).toBe('video');
    expect(result.assets[0]!.metadata.duration).toBe(5);
    expect(result.assets[0]!.metadata.width).toBe(1920);
    expect(result.assets[0]!.metadata.height).toBe(1080);
  });
});

describe('CharacterConsistencyManager', () => {
  it('registers and applies character consistency', async () => {
    const mgr = new CharacterConsistencyManager();
    mgr.registerCharacter({
      characterId: 'hero',
      referenceImages: ['ref1.png', 'ref2.png'],
      consistencyStrength: 0.9,
    });

    const char = mgr.getCharacter('hero');
    expect(char).toBeDefined();
    expect(char?.referenceImages).toEqual(['ref1.png', 'ref2.png']);

    const request: GenerationRequest = {
      type: 'image',
      prompt: 'hero fighting dragon',
    };
    const enhanced = await mgr.applyConsistency(request, 'hero');

    expect(enhanced.referenceAssets).toBeDefined();
    expect(enhanced.referenceAssets!.length).toBe(2);
    expect(enhanced.parameters?.characterConsistency).toBeDefined();
    const consistency = enhanced.parameters!.characterConsistency as CharacterConsistencyOptions;
    expect(consistency.characterId).toBe('hero');
    expect(consistency.consistencyStrength).toBe(0.9);
  });

  it('throws for unknown character (no silent no-op)', async () => {
    const mgr = new CharacterConsistencyManager();
    const request: GenerationRequest = { type: 'image', prompt: 'test' };
    await expect(mgr.applyConsistency(request, 'unknown')).rejects.toThrowError(/no character registered as "unknown"/);
  });
});

describe('StoryboardManager', () => {
  it('creates and manages storyboards with frames', () => {
    const mgr = new StoryboardManager();
    const sb = mgr.create('My Story', 'A test storyboard');

    expect(sb.id).toBeDefined();
    expect(sb.name).toBe('My Story');
    expect(sb.frames).toEqual([]);

    const frame1 = mgr.addFrame(sb.id, { order: 1, prompt: 'Opening scene', duration: 5 });
    expect(frame1).not.toBeNull();
    expect(frame1!.id).toBeDefined();

    const frame2 = mgr.addFrame(sb.id, { order: 2, prompt: 'Action scene', duration: 10 });
    expect(frame2).not.toBeNull();

    const frames = mgr.get(sb.id)!.frames;
    expect(frames.length).toBe(2);
    expect(frames[0]!.prompt).toBe('Opening scene');
    expect(frames[1]!.prompt).toBe('Action scene');
  });

  it('updates, removes, and reorders frames', () => {
    const mgr = new StoryboardManager();
    const sb = mgr.create('Test');
    const f1 = mgr.addFrame(sb.id, { order: 1, prompt: 'Scene 1' })!;
    const f2 = mgr.addFrame(sb.id, { order: 2, prompt: 'Scene 2' })!;

    const updated = mgr.updateFrame(sb.id, f1.id, { prompt: 'Updated Scene 1', duration: 7 });
    expect(updated?.prompt).toBe('Updated Scene 1');
    expect(updated?.duration).toBe(7);

    const removed = mgr.removeFrame(sb.id, f2.id);
    expect(removed).toBe(true);
    expect(mgr.get(sb.id)!.frames.length).toBe(1);

    mgr.addFrame(sb.id, { order: 2, prompt: 'New Scene 2' });
    mgr.addFrame(sb.id, { order: 3, prompt: 'Scene 3' });
    const reordered = mgr.reorderFrames(sb.id, [f1.id, mgr.get(sb.id)!.frames[1]!.id, mgr.get(sb.id)!.frames[2]!.id]);
    expect(reordered).toBe(true);
    const finalFrames = mgr.get(sb.id)!.frames;
    expect(finalFrames[0]!.id).toBe(f1.id);
    expect(finalFrames[0]!.order).toBe(0);
    expect(finalFrames[1]!.order).toBe(1);
    expect(finalFrames[2]!.order).toBe(2);
  });

  it('exports storyboard to prompts', () => {
    const mgr = new StoryboardManager();
    const sb = mgr.create('Export Test');
    mgr.addFrame(sb.id, { order: 1, prompt: 'Scene A', cameraAngle: 'wide', characters: ['hero'] });
    mgr.addFrame(sb.id, { order: 2, prompt: 'Scene B', dialogue: 'Hello!' });

    const prompts = mgr.exportToPrompt(sb.id);
    expect(prompts.length).toBe(2);
    expect(prompts[0]).toContain('Scene A');
    expect(prompts[0]).toContain('Camera: wide');
    expect(prompts[0]).toContain('Characters: hero');
    expect(prompts[1]).toContain('Scene B');
    expect(prompts[1]).toContain('Dialogue: Hello!');
  });

  it('lists and deletes storyboards', () => {
    const mgr = new StoryboardManager();
    const sb1 = mgr.create('Story 1');
    const sb2 = mgr.create('Story 2');

    expect(mgr.list().length).toBe(2);
    expect(mgr.delete(sb1.id)).toBe(true);
    expect(mgr.list().length).toBe(1);
    expect(mgr.get(sb1.id)).toBeUndefined();
    expect(mgr.delete('nonexistent')).toBe(false);
  });
});