import type { ToolImpl, ToolRegistry } from './registry.js';
import type { ToolSpec } from './types.js';

/**
 * M3 v145 — the FIRST consumer of the multimodal slice in `@nexus/ai-providers`.
 *
 * `InMemoryAssetLibrary`, `DemoImageGenerator`, `DemoVideoGenerator`, `CharacterConsistencyManager` and
 * `StoryboardManager` shipped with 13 green tests and **no consumer outside their own test file**:
 * `grep -rl 'InMemoryAssetLibrary\|DemoImageGenerator\|StoryboardManager\|CharacterConsistencyManager'`
 * across `apps/ agents/ packages/` matched the module, its barrel and its suite, and nothing else. That is
 * the shape the 3D and world lanes were both in before v140 and v144.
 *
 * **A driver seam, not an import.** This module does NOT depend on `@nexus/ai-providers`. It declares the
 * narrow `AssetDriver` it needs and the HOST supplies the implementation — the shape `browserTools` uses
 * for `BrowserDriver`, `sceneTools` for `SceneDriver` and `worldTools` for `WorldDriver`.
 * `docs/evidence/agents/asset-tools-proof.mjs` wires the REAL generators and library behind it.
 *
 * **§60 is the whole point of this family, so it is enforced rather than promised.** There is no image or
 * video model in this build: every generator is DEMO MODE and says so in its own `provenance`. A tool result
 * that dropped that field would be indistinguishable from a real generation's — which is the
 * `base64-screenshot-placeholder` defect `browserTools` records. So `asset.image.generate` **REFUSES a
 * driver answer that carries no provenance**, rather than returning assets without it: the door cannot
 * produce a result a reader could mistake for a picture. And no door is NAMED or DESCRIBED in a way that
 * promises pixels — the suite asserts both.
 */

/** What one generated asset is, flattened to what a tool result should carry. There is no `data` field:
 *  this build produces no bytes, and a field that looked like one would be the defect above. */
export interface GeneratedAssetSummary {
  assetId: string;
  type: string;
  name: string;
  url: string;
  mimeType: string;
  width: number | null;
  height: number | null;
}

/** A generation answer, with the generator's OWN provenance carried through untouched. */
export interface GeneratedAssets {
  /** `mode` is the generator's own word — `demo` in this build. The door requires it to be present. */
  provenance: { mode: string; [key: string]: unknown };
  model: string;
  seed: number;
  assets: GeneratedAssetSummary[];
}

/** One asset's metadata, as the library reports it. */
export interface AssetSummary {
  id: string;
  type: string;
  name: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  tags: string[];
  source: string | null;
  prompt: string | null;
}

export interface StoryboardFrameSummary {
  id: string;
  order: number;
  prompt: string;
  imageRef: string | null;
  duration: number | null;
  cameraAngle: string | null;
}

export interface StoryboardSummary {
  id: string;
  name: string;
  description: string | null;
  frames: StoryboardFrameSummary[];
}

export interface ImageRequest {
  prompt: string;
  count: number;
  width?: number;
  height?: number;
}

export interface FrameRequest {
  prompt: string;
  duration?: number;
  cameraAngle?: string;
  imageRef?: string;
}

/**
 * The slice of the multimodal stack an agent is allowed to reach.
 *
 * Methods may answer directly or with a promise (the `TreeReaper` precedent), so a driver that has to await
 * a real generator is not forced into a fake synchronous shape.
 */
export interface AssetDriver {
  /** Which implementation is answering, so a result never has to guess. */
  readonly engine: string;
  generateImage(request: ImageRequest): GeneratedAssets | Promise<GeneratedAssets>;
  listAssets(): AssetSummary[] | Promise<AssetSummary[]>;
  /** `null` when the library holds no such asset — a different answer from an empty one. */
  getAsset(id: string): AssetSummary | null | Promise<AssetSummary | null>;
  createStoryboard(name: string, description?: string): StoryboardSummary | Promise<StoryboardSummary>;
  /** `null` when the storyboard does not exist. */
  addFrame(storyboardId: string, frame: FrameRequest): StoryboardFrameSummary | null | Promise<StoryboardFrameSummary | null>;
  /** `undefined` when the storyboard does not exist. */
  getStoryboard(id: string): StoryboardSummary | undefined | Promise<StoryboardSummary | undefined>;
}

/** A function DECLARATION with an explicit `never` return, so TypeScript narrows control flow after it. */
function refused(message: string): never {
  throw new Error(message);
}

function requireString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value === '') {
    refused(`${what} must be a non-empty string, got ${JSON.stringify(value)}`);
  }
  return value;
}

function optionalPositiveNumber(value: unknown, what: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    refused(`${what} is ${JSON.stringify(value)}; a size is a finite positive number`);
  }
  return value;
}

export const ASSET_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'asset.image.generate',
    description: 'Generate image ASSETS from a prompt. DEMO MODE: no image model is attached, so this produces deterministic metadata and no pixels — the answer carries the generator’s own provenance and the door refuses one that does not.',
    permissions: ['write'],
    args: [
      { name: 'prompt', type: 'string', required: true },
      { name: 'count', type: 'number', required: false },
      { name: 'width', type: 'number', required: false },
      { name: 'height', type: 'number', required: false },
    ],
  },
  {
    name: 'asset.list',
    description: 'List the asset library’s metadata. Read-class: no checkpoint is asked, and no bytes are returned.',
    permissions: ['read'],
    args: [],
  },
  {
    name: 'asset.inspect',
    description: 'Read one asset’s metadata by id. Read-class: no checkpoint is asked.',
    permissions: ['read'],
    args: [{ name: 'assetId', type: 'string', required: true }],
  },
  {
    name: 'asset.storyboard.create',
    description: 'Create an empty storyboard and answer its id.',
    permissions: ['write'],
    args: [
      { name: 'name', type: 'string', required: true },
      { name: 'description', type: 'string', required: false },
    ],
  },
  {
    name: 'asset.storyboard.frame.add',
    description: 'Add a frame to a storyboard. A referenced image asset must already exist in the library.',
    permissions: ['write'],
    args: [
      { name: 'storyboardId', type: 'string', required: true },
      { name: 'prompt', type: 'string', required: true },
      { name: 'duration', type: 'number', required: false },
      { name: 'cameraAngle', type: 'string', required: false },
      { name: 'imageRef', type: 'string', required: false },
    ],
  },
  {
    name: 'asset.storyboard.inspect',
    description: 'Read a storyboard’s frames in order. Read-class: no checkpoint is asked.',
    permissions: ['read'],
    args: [{ name: 'storyboardId', type: 'string', required: true }],
  },
];

/**
 * Register the `asset.*` family over `driver`.
 *
 * The family owns four rules: it names a missing or malformed argument; it **refuses a generation answer
 * without provenance** rather than returning assets that could be read as real; it refuses a storyboard
 * frame whose `imageRef` names an asset the library does not hold — checked BEFORE the add, so a typo is
 * refused here rather than filing a frame that points at nothing; and it never returns bytes.
 */
export function registerAssetTools(registry: ToolRegistry, driver: AssetDriver): ToolRegistry {
  const impls: Record<string, ToolImpl> = {
    'asset.image.generate': async (args) => {
      const prompt = requireString(args.prompt, 'asset.image.generate prompt');
      const rawCount = args.count;
      let count = 1;
      if (rawCount !== undefined) {
        if (typeof rawCount !== 'number' || !Number.isFinite(rawCount) || rawCount <= 0) {
          refused(`asset.image.generate count is ${JSON.stringify(rawCount)}; a count is a finite positive number`);
        }
        count = Math.floor(rawCount);
      }
      const width = optionalPositiveNumber(args.width, 'asset.image.generate width');
      const height = optionalPositiveNumber(args.height, 'asset.image.generate height');

      const result = await driver.generateImage({
        prompt,
        count,
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
      });

      // §60, enforced: a generation answer with no provenance is one a reader could mistake for a real
      // image. The door refuses it instead of forwarding it — the check the whole family exists to make.
      if (!result || typeof result.provenance !== 'object' || result.provenance === null || typeof result.provenance.mode !== 'string') {
        refused(
          `asset.image.generate: the ${driver.engine} driver answered without provenance, so this result could be mistaken for a real generation; this door returns only answers that say how they were made`,
        );
      }

      return {
        engine: driver.engine,
        prompt,
        provenance: result.provenance,
        model: result.model,
        seed: result.seed,
        assets: result.assets,
      };
    },

    'asset.list': async () => {
      const assets = await driver.listAssets();
      return { engine: driver.engine, count: assets.length, assets };
    },

    'asset.inspect': async (args) => {
      const assetId = requireString(args.assetId, 'asset.inspect assetId');
      const asset = await driver.getAsset(assetId);
      if (!asset) {
        refused(`asset.inspect: the ${driver.engine} library holds no asset ${assetId}`);
      }
      return { engine: driver.engine, ...asset };
    },

    'asset.storyboard.create': async (args) => {
      const name = requireString(args.name, 'asset.storyboard.create name');
      const description = args.description === undefined ? undefined : requireString(args.description, 'asset.storyboard.create description');
      const storyboard = await driver.createStoryboard(name, description);
      return { engine: driver.engine, storyboardId: storyboard.id, name: storyboard.name, frames: storyboard.frames.length };
    },

    'asset.storyboard.frame.add': async (args) => {
      const storyboardId = requireString(args.storyboardId, 'asset.storyboard.frame.add storyboardId');
      const prompt = requireString(args.prompt, 'asset.storyboard.frame.add prompt');
      const duration = optionalPositiveNumber(args.duration, 'asset.storyboard.frame.add duration');
      const cameraAngle = args.cameraAngle === undefined ? undefined : requireString(args.cameraAngle, 'asset.storyboard.frame.add cameraAngle');
      const imageRef = args.imageRef === undefined ? undefined : requireString(args.imageRef, 'asset.storyboard.frame.add imageRef');

      if (imageRef !== undefined) {
        // The referenced asset must EXIST. The library would happily file a frame pointing at nothing; this
        // door will not, because a storyboard whose frames reference absent images is one a reader cannot
        // open — the same rule `world.character.add` applies to a location id.
        const asset = await driver.getAsset(imageRef);
        if (!asset) {
          refused(`asset.storyboard.frame.add: the ${driver.engine} library holds no asset ${imageRef}; generate or add it first`);
        }
      }

      const frame = await driver.addFrame(storyboardId, {
        prompt,
        ...(duration !== undefined ? { duration } : {}),
        ...(cameraAngle !== undefined ? { cameraAngle } : {}),
        ...(imageRef !== undefined ? { imageRef } : {}),
      });
      if (!frame) {
        refused(`asset.storyboard.frame.add: the ${driver.engine} driver holds no storyboard ${storyboardId}`);
      }
      return { engine: driver.engine, storyboardId, frame };
    },

    'asset.storyboard.inspect': async (args) => {
      const storyboardId = requireString(args.storyboardId, 'asset.storyboard.inspect storyboardId');
      const storyboard = await driver.getStoryboard(storyboardId);
      if (!storyboard) {
        refused(`asset.storyboard.inspect: the ${driver.engine} driver holds no storyboard ${storyboardId}`);
      }
      return { engine: driver.engine, ...storyboard, frameCount: storyboard.frames.length };
    },
  };

  for (const spec of ASSET_TOOL_SPECS) {
    const impl = impls[spec.name];
    if (!impl) throw new Error(`unrouted asset tool ${spec.name}`);
    registry.register(spec, impl);
  }
  return registry;
}
