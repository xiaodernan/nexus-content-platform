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
/** A patch to an asset's metadata. Only the fields a caller may change are declared — an asset's BYTES are
 *  not editable, and neither is its id: `updateMetadata` merges what it is given over what it holds. */
export interface AssetPatch {
  name?: string;
  description?: string;
  tags?: string[];
}

/** A registered character's consistency options, flattened. */
export interface CharacterSummary {
  characterId: string;
  referenceImages: string[];
  consistencyStrength: number | null;
  styleTransfer: boolean | null;
}

/** What applying a character's consistency to a prompt produces: a DERIVED request, not an asset. The
 *  distinction is the point of the door's description — no generator has run when this answers. */
export interface ConsistencyResult {
  characterId: string;
  prompt: string;
  referenceImages: string[];
  consistencyStrength: number;
  referenceCount: number;
}

export interface AssetDriver {
  /** Which implementation is answering, so a result never has to guess. */
  readonly engine: string;
  generateImage(request: ImageRequest): GeneratedAssets | Promise<GeneratedAssets>;
  /** The same shape as `generateImage`, answered by the package's video generator. */
  generateVideo(request: ImageRequest): GeneratedAssets | Promise<GeneratedAssets>;
  listAssets(): AssetSummary[] | Promise<AssetSummary[]>;
  /** `null` when the library holds no such asset — a different answer from an empty one. */
  getAsset(id: string): AssetSummary | null | Promise<AssetSummary | null>;
  searchAssets(text: string, limit: number): AssetSummary[] | Promise<AssetSummary[]>;
  /** `false` when the library holds no such asset. */
  removeAsset(id: string): boolean | Promise<boolean>;
  /** `false` when the library holds no such asset. NOTE the library answers `true` for a patch that
   *  changes nothing, so the DOOR refuses an empty patch rather than reporting a no-op as a success. */
  updateAsset(id: string, patch: AssetPatch): boolean | Promise<boolean>;
  registerCharacter(spec: CharacterSummary): void | Promise<void>;
  listCharacters(): CharacterSummary[] | Promise<CharacterSummary[]>;
  /** `undefined` when no character is registered under that id — the door names it rather than forwarding
   *  the package's throw, which would surface as a raw error string. */
  applyConsistency(prompt: string, characterId: string): ConsistencyResult | undefined | Promise<ConsistencyResult | undefined>;
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
    name: 'asset.video.generate',
    description: 'Generate video ASSETS from a prompt. DEMO MODE: no video model is attached, so this produces deterministic metadata and no footage — the answer carries the generator’s own provenance and the door refuses one that does not.',
    permissions: ['write'],
    args: [
      { name: 'prompt', type: 'string', required: true },
      { name: 'count', type: 'number', required: false },
      { name: 'duration', type: 'number', required: false },
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
    name: 'asset.search',
    description: 'Search the library’s metadata by text. Read-class: no checkpoint is asked, and no bytes are returned.',
    permissions: ['read'],
    args: [
      { name: 'text', type: 'string', required: true },
      { name: 'limit', type: 'number', required: false },
    ],
  },
  {
    name: 'asset.update',
    description: 'Change an asset’s metadata (name, description, tags). An asset’s BYTES and its id are not editable. The door refuses a patch that names nothing, because the library answers "updated" for a no-op.',
    permissions: ['write'],
    args: [
      { name: 'assetId', type: 'string', required: true },
      { name: 'name', type: 'string', required: false },
      { name: 'description', type: 'string', required: false },
      { name: 'tags', type: 'string', required: false },
    ],
  },
  {
    name: 'asset.delete',
    description: 'Remove an asset from the library by id. The same removal the Studio panel’s Remove performs (M3 v159): the panel is ungated because it acts on its own in-memory library, while THIS door is write-class and asks the §28 checkpoint — the difference is who owns the library, not what removal means.',
    permissions: ['write'],
    args: [{ name: 'assetId', type: 'string', required: true }],
  },
  {
    name: 'asset.character.register',
    description: 'Register a character’s reference images so later generations can be made consistent with them. Reference images are URLs; nothing is fetched or stored here.',
    permissions: ['write'],
    args: [
      { name: 'characterId', type: 'string', required: true },
      { name: 'referenceImages', type: 'string', required: true },
      { name: 'consistencyStrength', type: 'number', required: false },
    ],
  },
  {
    name: 'asset.character.list',
    description: 'List the registered characters and the reference images each one anchors to. Read-class: no checkpoint is asked.',
    permissions: ['read'],
    args: [],
  },
  {
    name: 'asset.character.apply',
    description: 'Derive the request that WOULD be sent to a generator for a prompt under a character’s consistency. It answers a REQUEST, not an asset: no generator runs, and the result carries the reference images that would be attached.',
    permissions: ['read'],
    args: [
      { name: 'characterId', type: 'string', required: true },
      { name: 'prompt', type: 'string', required: true },
    ],
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
  /** The count rule, shared by both generate doors rather than written twice. */
  const readCount = (raw: unknown, door: string): number => {
    if (raw === undefined) return 1;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
      refused(`${door} count is ${JSON.stringify(raw)}; a count is a finite positive number`);
    }
    return Math.floor(raw);
  };

  /**
   * §60, enforced once for every generation door: an answer with no provenance is one a reader could
   * mistake for a real generation. The door refuses it instead of forwarding it — the check the whole
   * family exists to make, and it must not be re-implemented per door or the two could drift.
   */
  const requireProvenance = (result: GeneratedAssets | undefined, door: string): GeneratedAssets => {
    if (!result || typeof result.provenance !== 'object' || result.provenance === null || typeof result.provenance.mode !== 'string') {
      refused(
        `${door}: the ${driver.engine} driver answered without provenance, so this result could be mistaken for a real generation; this door returns only answers that say how they were made`,
      );
    }
    return result;
  };

  const impls: Record<string, ToolImpl> = {
    'asset.image.generate': async (args) => {
      const door = 'asset.image.generate';
      const prompt = requireString(args.prompt, `${door} prompt`);
      const count = readCount(args.count, door);
      const width = optionalPositiveNumber(args.width, `${door} width`);
      const height = optionalPositiveNumber(args.height, `${door} height`);

      const result = requireProvenance(
        await driver.generateImage({
          prompt,
          count,
          ...(width !== undefined ? { width } : {}),
          ...(height !== undefined ? { height } : {}),
        }),
        door,
      );

      return {
        engine: driver.engine,
        prompt,
        provenance: result.provenance,
        model: result.model,
        seed: result.seed,
        assets: result.assets,
      };
    },

    'asset.video.generate': async (args) => {
      const door = 'asset.video.generate';
      const prompt = requireString(args.prompt, `${door} prompt`);
      const count = readCount(args.count, door);
      const duration = optionalPositiveNumber(args.duration, `${door} duration`);

      const result = requireProvenance(
        await driver.generateVideo({
          prompt,
          count,
          ...(duration !== undefined ? { duration } : {}),
        }),
        door,
      );

      // The assets' own `type` and `mimeType` come from the generator, not from this door — a door that
      // stamped `video` itself could label an image as footage if the driver answered with one.
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

    'asset.search': async (args) => {
      const text = requireString(args.text, 'asset.search text');
      const rawLimit = args.limit;
      let limit = 10;
      if (rawLimit !== undefined) {
        if (typeof rawLimit !== 'number' || !Number.isFinite(rawLimit) || rawLimit <= 0) {
          refused(`asset.search limit is ${JSON.stringify(rawLimit)}; a limit is a finite positive number`);
        }
        limit = Math.floor(rawLimit);
      }
      const assets = await driver.searchAssets(text, limit);
      return { engine: driver.engine, text, count: assets.length, assets };
    },

    'asset.update': async (args) => {
      const door = 'asset.update';
      const assetId = requireString(args.assetId, `${door} assetId`);
      const patch: AssetPatch = {};
      if (args.name !== undefined) patch.name = requireString(args.name, `${door} name`);
      if (args.description !== undefined) patch.description = requireString(args.description, `${door} description`);
      if (args.tags !== undefined) {
        // Tags arrive as a comma-separated string because `ToolArgSpec` has no array type; an empty list is
        // a legitimate patch (it clears them), so `''` means "no tags" rather than "not given".
        patch.tags = String(args.tags)
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
      }

      // The library's `updateMetadata` answers `true` for a patch that changes NOTHING, so a door that
      // forwarded an empty patch would report a successful update that updated nothing — a no-op wearing a
      // success, which is the class of defect this family exists to refuse.
      if (Object.keys(patch).length === 0) {
        refused(`${door}: a patch that names nothing would be reported as an update by the library, so this door refuses it; name at least one of name, description or tags`);
      }

      const updated = await driver.updateAsset(assetId, patch);
      if (!updated) {
        refused(`${door}: the ${driver.engine} library holds no asset ${assetId}`);
      }
      const asset = await driver.getAsset(assetId);
      return { engine: driver.engine, assetId, updated: true, asset: asset ?? null };
    },

    'asset.delete': async (args) => {
      const assetId = requireString(args.assetId, 'asset.delete assetId');
      const removed = await driver.removeAsset(assetId);
      // `false` is the library's own answer for an id it does not hold, and it is REPORTED rather than
      // raised: removing something twice is a caller's mistake, not a corrupt library.
      return { engine: driver.engine, assetId, removed };
    },

    'asset.character.register': async (args) => {
      const door = 'asset.character.register';
      const characterId = requireString(args.characterId, `${door} characterId`);
      const raw = requireString(args.referenceImages, `${door} referenceImages`);
      const referenceImages = raw
        .split(',')
        .map((u) => u.trim())
        .filter((u) => u.length > 0);
      if (referenceImages.length === 0) {
        refused(`${door}: a character with no reference images anchors nothing, so this door refuses it`);
      }
      const strength = optionalPositiveNumber(args.consistencyStrength, `${door} consistencyStrength`);
      if (strength !== undefined && strength > 1) {
        // The package's own default is 0.8 and its field means a fraction; a value above 1 would be stored
        // and never read the way the caller meant.
        refused(`${door} consistencyStrength is ${strength}; a strength is a fraction in (0, 1]`);
      }

      await driver.registerCharacter({
        characterId,
        referenceImages,
        consistencyStrength: strength ?? null,
        styleTransfer: null,
      });
      const characters = await driver.listCharacters();
      return { engine: driver.engine, characterId, referenceImages: referenceImages.length, characters: characters.length };
    },

    'asset.character.list': async () => {
      const characters = await driver.listCharacters();
      return { engine: driver.engine, count: characters.length, characters };
    },

    'asset.character.apply': async (args) => {
      const door = 'asset.character.apply';
      const characterId = requireString(args.characterId, `${door} characterId`);
      const prompt = requireString(args.prompt, `${door} prompt`);
      const applied = await driver.applyConsistency(prompt, characterId);
      if (!applied) {
        // The package THROWS for an unknown character; the driver answers `undefined` so this door can name
        // the fact instead of forwarding a raw error string.
        refused(`${door}: no character is registered as "${characterId}"; register one with asset.character.register first`);
      }
      // What this answers is a REQUEST. No generator ran, and the result says so rather than looking like
      // an asset — a door whose answer could be read as a generation would be the §60 defect in a new place.
      return { engine: driver.engine, derived: 'request', ...applied };
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
