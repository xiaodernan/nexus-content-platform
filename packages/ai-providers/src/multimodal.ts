import type { Provenance } from '@nexus/design-model';
import { hashString, mulberry32 } from './prng.js';

/**
 * M2 v91 (§63 multimodal assets). This module is the SEAM and the demo stand-in, and it says so:
 * every generator result carries `provenance.mode = 'demo'` (§60), ids are derived from the
 * prompt + seed through the shared PRNG (ADR 0010 — the first draft called `Math.random()`,
 * which made "generate twice with the same seed" a different asset every time), and the
 * `url`s are `asset://` references to bytes this build does not have.
 */
const PROVENANCE: Provenance = { mode: 'demo', provider: 'nexus-ai-providers/demo-multimodal' };

/** Prompt-derived when no seed is given, so the same request names the same assets. */
function seedFor(request: GenerationRequest): number {
  return request.seed ?? hashString(request.prompt);
}

export type AssetType = 'image' | 'video' | 'audio' | 'model3d' | 'document';

export interface AssetMetadata {
  id: string;
  type: AssetType;
  name: string;
  description?: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  format?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  checksum: string;
  source?: 'generated' | 'uploaded' | 'referenced';
  prompt?: string;
  model?: string;
  parameters?: Record<string, unknown>;
  references?: string[];
}

export interface AssetReference {
  assetId: string;
  type: AssetType;
  url: string;
  thumbnailUrl?: string;
  metadata: Partial<AssetMetadata>;
}

export interface GenerationRequest {
  type: AssetType;
  prompt: string;
  negativePrompt?: string;
  parameters?: Record<string, unknown>;
  model?: string;
  seed?: number;
  count?: number;
  referenceAssets?: AssetReference[];
}

export interface GenerationResult {
  assets: AssetReference[];
  /** §60: this build has no image/video model. Every result says demo, on its own face. */
  provenance: Provenance;
  metadata: {
    model: string;
    seed: number;
    parameters: Record<string, unknown>;
    generationTime: number;
  };
}

export interface AssetLibrary {
  add(asset: AssetReference, data: Buffer | Uint8Array): Promise<void>;
  get(id: string): Promise<{ metadata: AssetMetadata; data: Buffer } | null>;
  remove(id: string): Promise<boolean>;
  list(filter?: { type?: AssetType; tags?: string[]; limit?: number; offset?: number }): Promise<AssetReference[]>;
  search(query: string, opts?: { type?: AssetType; limit?: number }): Promise<AssetReference[]>;
  updateMetadata(id: string, metadata: Partial<AssetMetadata>): Promise<boolean>;
  getMetadata(id: string): Promise<AssetMetadata | null>;
}

export interface ImageGenerationOptions {
  width?: number;
  height?: number;
  steps?: number;
  guidanceScale?: number;
  sampler?: string;
  scheduler?: string;
  seed?: number;
}

export interface VideoGenerationOptions {
  width?: number;
  height?: number;
  duration?: number;
  fps?: number;
  motionBucketId?: number;
  noiseAugStrength?: number;
}

export interface CharacterConsistencyOptions {
  characterId: string;
  referenceImages: string[];
  consistencyStrength?: number;
  styleTransfer?: boolean;
}

export interface StoryboardFrame {
  id: string;
  order: number;
  prompt: string;
  imageRef?: AssetReference;
  duration?: number;
  cameraAngle?: string;
  characters?: string[];
  dialogue?: string;
  notes?: string;
}

export interface Storyboard {
  id: string;
  name: string;
  description?: string;
  frames: StoryboardFrame[];
  createdAt: number;
  updatedAt: number;
}

export class InMemoryAssetLibrary implements AssetLibrary {
  private assets = new Map<string, { metadata: AssetMetadata; data: Buffer }>();
  private index = new Map<string, Set<string>>();

  async add(asset: AssetReference, data: Buffer | Uint8Array): Promise<void> {
    const metadata: AssetMetadata = {
      id: asset.assetId,
      type: asset.type,
      name: asset.metadata.name ?? asset.assetId,
      description: asset.metadata.description,
      mimeType: asset.metadata.mimeType ?? 'application/octet-stream',
      size: data.length,
      width: asset.metadata.width,
      height: asset.metadata.height,
      duration: asset.metadata.duration,
      format: asset.metadata.format,
      tags: asset.metadata.tags ?? [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      checksum: this.computeChecksum(data),
      source: asset.metadata.source ?? 'uploaded',
      prompt: asset.metadata.prompt,
      model: asset.metadata.model,
      parameters: asset.metadata.parameters,
      references: asset.metadata.references,
    };

    this.assets.set(asset.assetId, { metadata, data: Buffer.from(data) });
    this.updateIndex(asset.assetId, metadata);
  }

  async get(id: string): Promise<{ metadata: AssetMetadata; data: Buffer } | null> {
    const entry = this.assets.get(id);
    return entry ? { metadata: entry.metadata, data: entry.data } : null;
  }

  async remove(id: string): Promise<boolean> {
    const entry = this.assets.get(id);
    if (!entry) return false;
    this.removeFromIndex(id, entry.metadata);
    this.assets.delete(id);
    return true;
  }

  async list(filter?: { type?: AssetType; tags?: string[]; limit?: number; offset?: number }): Promise<AssetReference[]> {
    // v91: sort the FULL metadata (which always has `updatedAt`), never the Partial reference
    // shape — the first draft subtracted two `number | undefined`s under `strict`.
    let picked: AssetMetadata[] = [];

    if (filter?.type) {
      const ids = this.index.get(`type:${filter.type}`) ?? new Set<string>();
      for (const id of ids) {
        const entry = this.assets.get(id);
        if (entry) picked.push(entry.metadata);
      }
    } else if (filter?.tags && filter.tags.length > 0) {
      const tagSets = filter.tags.map((t) => this.index.get(`tag:${t}`) ?? new Set<string>());
      const first = tagSets[0] ?? new Set<string>();
      const intersection = new Set([...first].filter((x) => tagSets.every((s) => s.has(x))));
      for (const id of intersection) {
        const entry = this.assets.get(id);
        if (entry) picked.push(entry.metadata);
      }
    } else {
      for (const entry of this.assets.values()) picked.push(entry.metadata);
    }

    picked.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));

    if (filter?.offset) picked = picked.slice(filter.offset);
    if (filter?.limit) picked = picked.slice(0, filter.limit);

    return picked.map((m) => this.toReference(m));
  }

  async search(query: string, opts?: { type?: AssetType; limit?: number }): Promise<AssetReference[]> {
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
    const scored: Array<{ ref: AssetReference; score: number }> = [];

    for (const entry of this.assets.values()) {
      if (opts?.type && entry.metadata.type !== opts.type) continue;

      let score = 0;
      const searchable = `${entry.metadata.name} ${entry.metadata.description ?? ''} ${entry.metadata.tags.join(' ')} ${entry.metadata.prompt ?? ''}`.toLowerCase();
      for (const term of terms) {
        if (searchable.includes(term)) score++;
      }
      if (score > 0) scored.push({ ref: this.toReference(entry.metadata), score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, opts?.limit ?? 20).map((s) => s.ref);
  }

  async updateMetadata(id: string, metadata: Partial<AssetMetadata>): Promise<boolean> {
    const entry = this.assets.get(id);
    if (!entry) return false;

    this.removeFromIndex(id, entry.metadata);
    entry.metadata = { ...entry.metadata, ...metadata, updatedAt: Date.now() };
    this.updateIndex(id, entry.metadata);
    return true;
  }

  async getMetadata(id: string): Promise<AssetMetadata | null> {
    return this.assets.get(id)?.metadata ?? null;
  }

  private computeChecksum(data: Buffer | Uint8Array): string {
    return hashString(`${data.length}:${Buffer.from(data).subarray(0, Math.min(1024, data.length)).toString('hex')}`).toString(36);
  }

  private toReference(metadata: AssetMetadata): AssetReference {
    return {
      assetId: metadata.id,
      type: metadata.type,
      url: `asset://${metadata.id}`,
      thumbnailUrl: metadata.type === 'image' ? `asset://${metadata.id}/thumb` : undefined,
      metadata: {
        name: metadata.name,
        mimeType: metadata.mimeType,
        width: metadata.width,
        height: metadata.height,
        duration: metadata.duration,
        tags: metadata.tags,
        source: metadata.source,
        prompt: metadata.prompt,
        model: metadata.model,
      },
    };
  }

  private updateIndex(id: string, metadata: AssetMetadata): void {
    const typeKey = `type:${metadata.type}`;
    if (!this.index.has(typeKey)) this.index.set(typeKey, new Set());
    this.index.get(typeKey)!.add(id);

    for (const tag of metadata.tags) {
      const tagKey = `tag:${tag}`;
      if (!this.index.has(tagKey)) this.index.set(tagKey, new Set());
      this.index.get(tagKey)!.add(id);
    }
  }

  private removeFromIndex(id: string, metadata: AssetMetadata): void {
    const typeKey = `type:${metadata.type}`;
    this.index.get(typeKey)?.delete(id);

    for (const tag of metadata.tags) {
      this.index.get(`tag:${tag}`)?.delete(id);
    }
  }
}

export class DemoImageGenerator {
  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const seed = seedFor(request);
    const rng = mulberry32(seed);
    const count = request.count ?? 1;
    const assets: AssetReference[] = [];

    for (let i = 0; i < count; i++) {
      const assetId = `img-${hashString(`${request.prompt}:${seed}:${i}`)}`;
      assets.push({
        assetId,
        type: 'image',
        url: `asset://${assetId}`,
        thumbnailUrl: `asset://${assetId}/thumb`,
        metadata: {
          name: `Generated: ${request.prompt.slice(0, 50)}`,
          type: 'image',
          mimeType: 'image/png',
          width: (request.parameters?.width as number) ?? 1024,
          height: (request.parameters?.height as number) ?? 1024,
          tags: ['generated', 'demo'],
          source: 'generated',
          prompt: request.prompt,
          model: request.model ?? 'demo-model',
          parameters: { ...request.parameters, demoVariant: Math.floor(rng() * 1000) },
        },
      });
    }

    return {
      assets,
      provenance: PROVENANCE,
      metadata: {
        model: request.model ?? 'demo-model',
        seed,
        parameters: request.parameters ?? {},
        generationTime: 0,
      },
    };
  }
}

export class DemoVideoGenerator {
  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const seed = seedFor(request);
    const rng = mulberry32(seed);
    const count = request.count ?? 1;
    const assets: AssetReference[] = [];

    for (let i = 0; i < count; i++) {
      const assetId = `vid-${hashString(`${request.prompt}:${seed}:${i}`)}`;
      assets.push({
        assetId,
        type: 'video',
        url: `asset://${assetId}`,
        thumbnailUrl: `asset://${assetId}/thumb`,
        metadata: {
          name: `Generated Video: ${request.prompt.slice(0, 50)}`,
          type: 'video',
          mimeType: 'video/mp4',
          width: (request.parameters?.width as number) ?? 1024,
          height: (request.parameters?.height as number) ?? 576,
          duration: (request.parameters?.duration as number) ?? 4,
          tags: ['generated', 'demo'],
          source: 'generated',
          prompt: request.prompt,
          model: request.model ?? 'demo-video-model',
          parameters: { ...request.parameters, demoVariant: Math.floor(rng() * 1000) },
        },
      });
    }

    return {
      assets,
      provenance: PROVENANCE,
      metadata: {
        model: request.model ?? 'demo-video-model',
        seed,
        parameters: request.parameters ?? {},
        generationTime: 0,
      },
    };
  }
}

export class CharacterConsistencyManager {
  private characters = new Map<string, CharacterConsistencyOptions>();

  registerCharacter(opts: CharacterConsistencyOptions): void {
    this.characters.set(opts.characterId, opts);
  }

  getCharacter(id: string): CharacterConsistencyOptions | undefined {
    return this.characters.get(id);
  }

  listCharacters(): CharacterConsistencyOptions[] {
    return [...this.characters.values()];
  }

  /**
   * v91: an unknown character is an ERROR. The first draft returned the request untouched, which
   * let a caller believe consistency had been applied when nothing had been — a silent no-op
   * wearing a success.
   */
  async applyConsistency(request: GenerationRequest, characterId: string): Promise<GenerationRequest> {
    const character = this.characters.get(characterId);
    if (!character) throw new Error(`no character registered as "${characterId}"`);

    return {
      ...request,
      referenceAssets: [
        ...(request.referenceAssets ?? []),
        ...character.referenceImages.map((url) => ({
          assetId: `ref-${hashString(url)}`,
          type: 'image' as AssetType,
          url,
          metadata: { tags: ['character-reference', characterId] },
        })),
      ],
      parameters: {
        ...request.parameters,
        characterConsistency: {
          characterId,
          referenceImages: character.referenceImages,
          consistencyStrength: character.consistencyStrength ?? 0.8,
        },
      },
    };
  }
}

export class StoryboardManager {
  private storyboards = new Map<string, Storyboard>();
  private seq = 0;

  create(name: string, description?: string): Storyboard {
    const id = `storyboard-${++this.seq}`;
    const storyboard: Storyboard = {
      id,
      name,
      description,
      frames: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.storyboards.set(id, storyboard);
    return storyboard;
  }

  get(id: string): Storyboard | undefined {
    return this.storyboards.get(id);
  }

  list(): Storyboard[] {
    return [...this.storyboards.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  delete(id: string): boolean {
    return this.storyboards.delete(id);
  }

  addFrame(storyboardId: string, frame: Omit<StoryboardFrame, 'id'>): StoryboardFrame | null {
    const storyboard = this.storyboards.get(storyboardId);
    if (!storyboard) return null;

    const newFrame: StoryboardFrame = { ...frame, id: `frame-${++this.seq}` };
    storyboard.frames.push(newFrame);
    storyboard.frames.sort((a, b) => a.order - b.order);
    storyboard.updatedAt = Date.now();
    return newFrame;
  }

  removeFrame(storyboardId: string, frameId: string): boolean {
    const storyboard = this.storyboards.get(storyboardId);
    if (!storyboard) return false;

    const idx = storyboard.frames.findIndex((f) => f.id === frameId);
    if (idx < 0) return false;

    storyboard.frames.splice(idx, 1);
    storyboard.updatedAt = Date.now();
    return true;
  }

  /**
   * v91: `id` and `order` are PINNED to the slot. `id` because a frame that can rename itself
   * breaks every reference to it; `order` because reordering has its own door (`reorderFrames`)
   * and a partial update that silently resequenced the storyboard is exactly the kind of quiet
   * side effect this project refuses.
   */
  updateFrame(storyboardId: string, frameId: string, updates: Partial<StoryboardFrame>): StoryboardFrame | null {
    const storyboard = this.storyboards.get(storyboardId);
    if (!storyboard) return null;

    const idx = storyboard.frames.findIndex((f) => f.id === frameId);
    const current = idx >= 0 ? storyboard.frames[idx] : undefined;
    if (!current) return null;

    storyboard.frames[idx] = { ...current, ...updates, id: current.id, order: current.order };
    storyboard.updatedAt = Date.now();
    return storyboard.frames[idx] ?? null;
  }

  reorderFrames(storyboardId: string, frameIds: string[]): boolean {
    const storyboard = this.storyboards.get(storyboardId);
    if (!storyboard) return false;
    if (new Set(frameIds).size !== frameIds.length) return false;

    const frameMap = new Map(storyboard.frames.map((f) => [f.id, f]));
    const newFrames: StoryboardFrame[] = [];

    for (let i = 0; i < frameIds.length; i++) {
      const frame = frameMap.get(frameIds[i]!);
      if (!frame) return false;
      newFrames.push({ ...frame, order: i });
    }

    for (const frame of storyboard.frames) {
      if (!frameIds.includes(frame.id)) {
        newFrames.push(frame);
      }
    }

    storyboard.frames = newFrames;
    storyboard.updatedAt = Date.now();
    return true;
  }

  exportToPrompt(storyboardId: string): string[] {
    const storyboard = this.storyboards.get(storyboardId);
    if (!storyboard) return [];

    return storyboard.frames.map((f) => {
      const parts = [f.prompt];
      if (f.cameraAngle) parts.push(`Camera: ${f.cameraAngle}`);
      if (f.characters?.length) parts.push(`Characters: ${f.characters.join(', ')}`);
      if (f.dialogue) parts.push(`Dialogue: ${f.dialogue}`);
      return parts.join(' | ');
    });
  }
}