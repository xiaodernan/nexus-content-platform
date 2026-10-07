/**
 * M3 v153 — the Studio's asset surface, split the way v142 split the 3D one and v148 the world one: the
 * MODEL is pure and testable, the panel is a component.
 *
 * Why this file exists: the multimodal slice got its AGENT consumer in v145 (`assetTools.ts` over an
 * `AssetDriver` seam) and its own record still ends with *"nothing in the Studio imports it, so M3's
 * PRODUCT face is still open."* This is the product half.
 *
 * **§60 is the whole point of this surface, so it is built into the types.** There is no image or video
 * model in this build: `DemoImageGenerator` produces deterministic METADATA and no pixels. So
 *
 *   - every report carries the generator's OWN `provenance` word, never a Studio-invented one;
 *   - the byte count of each stored asset is reported, and it is **zero** — a field a reader can check
 *     rather than a sentence they have to believe;
 *   - nothing in this module names a provider, a model or a picture.
 *
 * v188 — the board is EDITABLE: the surface can remove a frame and reorder the rest, and what the
 * manager answers (`false` for an unknown frame, a rewritten `order` for the survivors) is what the
 * surface shows. A storyboard is an ordered set or it is a pile.
 *
 * v189 — CHARACTERS: the consistency trio's product doors (the agent lane has held them since v160,
 * and nothing in the Studio imported them). Registering anchors a character to reference images;
 * applying answers the DERIVED REQUEST a generator would receive — never an asset, because no
 * generator runs. The report says what the manager HOLDS (strength `null` when none was registered);
 * the derived summary says what the manager WOULD SEND (its own 0.8 default lands there). The two
 * are different numbers on purpose.
 *
 * The interfaces are STRUCTURAL rather than `import type { InMemoryAssetLibrary }`: Next.js evaluates this
 * module during SSR, where loading a generator is pointless work and a needless dependency edge. The panel
 * is the only place that touches the real classes.
 */

/** One asset's metadata, as the library reports it. `bytes` is what was actually STORED, not what an image
 *  of that size would weigh — in this build it is 0, and the report says so rather than omitting it. */
export interface StudioAssetSummary {
  id: string;
  type: string;
  name: string;
  /** v190 — what the library's metadata holds for this asset, read verbatim (`null` where none was given). */
  description: string | null;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  /** v187 — footage reports its duration; a still has none, and the report says null rather than 0. */
  duration: number | null;
  tags: string[];
  source: string | null;
  prompt: string | null;
}

export interface StudioFrameSummary {
  id: string;
  order: number;
  prompt: string;
  imageRef: string | null;
  duration: number | null;
  cameraAngle: string | null;
}

export interface StudioStoryboardSummary {
  id: string;
  name: string;
  description: string | null;
  frames: StudioFrameSummary[];
}

/** v189 — what the consistency manager HOLDS, read at rest. `consistencyStrength` is `null` when none was
 *  registered: the manager's own 0.8 default exists only inside an APPLY, and the report does not pre-apply
 *  it — the same null-means-absent rule a still's `duration` follows. */
export interface StudioCharacterSummary {
  characterId: string;
  referenceImages: string[];
  consistencyStrength: number | null;
}

/** The surface's state as a plain JSON-safe report. */
export interface AssetReport {
  schema: 1;
  /** The GENERATOR's own word for how these assets came to exist — `demo` in this build. */
  provenanceMode: string;
  /** Assets the surface generated and stored, in the order it made them. */
  assets: StudioAssetSummary[];
  /** Total bytes actually stored across every asset. Zero here, and asserted to be. */
  storedBytes: number;
  storyboard: StudioStoryboardSummary | null;
  /** v189 — the characters the consistency manager holds, read from the manager itself. */
  characters: StudioCharacterSummary[];
}

export interface GenerationRequestLike {
  type: string;
  prompt: string;
  count?: number;
  parameters?: Record<string, unknown>;
}

export interface GenerationResultLike {
  assets: {
    assetId: string;
    type: string;
    url: string;
    metadata: {
      name?: string;
      mimeType?: string;
      width?: number;
      height?: number;
      tags?: string[];
      source?: string;
      prompt?: string;
    };
  }[];
  /** Only `mode` is declared, because it is the only field this module reads. The real `Provenance` is a
   *  CLOSED interface with more of them, and a type carrying an index signature here would refuse it —
   *  a structural type should ask for what it uses, not for a bag that happens to be wider. */
  provenance: { mode: string };
  metadata: { model: string; seed: number };
}

export interface AssetGeneratorLike {
  generate(request: GenerationRequestLike): Promise<GenerationResultLike>;
}

/** v190 — the slice of an asset's metadata a caller may change. An asset's BYTES and its id are not
 *  editable: `updateMetadata` merges what it is given over what it holds. The same shape the agent door
 *  `asset.update` (v160) calls `AssetPatch`. */
export interface AssetMetadataPatch {
  name?: string;
  description?: string;
  tags?: string[];
}

export interface AssetLibraryLike {
  add(asset: unknown, data: Uint8Array): Promise<void>;
  remove(id: string): Promise<boolean>;
  list(): Promise<{ assetId: string; type: string }[]>;
  get(id: string): Promise<{ metadata: { id: string; type: string; name: string; mimeType: string; size: number; width?: number; height?: number; duration?: number; description?: string; tags: string[]; source?: string; prompt?: string }; data: Uint8Array } | null>;
  /** v190 — `false` when the library holds no such asset. NOTE the real library answers `true` for a
   *  patch that changes nothing, so the PANEL refuses an empty patch rather than reporting a no-op as a
   *  success — the same refusal the `asset.update` door has made since v160. */
  updateMetadata(id: string, patch: AssetMetadataPatch): Promise<boolean>;
}

export interface StoryboardManagerLike {
  create(name: string, description?: string): { id: string; name: string; description?: string };
  addFrame(storyboardId: string, frame: { order: number; prompt: string; imageRef?: unknown; duration?: number; cameraAngle?: string }): { id: string; order: number; prompt: string; imageRef?: { assetId: string }; duration?: number; cameraAngle?: string } | null;
  get(id: string): { id: string; name: string; description?: string; frames: { id: string; order: number; prompt: string; imageRef?: { assetId: string }; duration?: number; cameraAngle?: string }[] } | undefined;
  /** v188 — the surface can EDIT the board, and the manager's answers pass through untouched. */
  removeFrame(storyboardId: string, frameId: string): boolean;
  reorderFrames(storyboardId: string, frameIds: string[]): boolean;
}

/** The shape of a derived request this module READS. The real `applyConsistency` returns the package's own
 *  `GenerationRequest`; this asks only for the fields the summary is built from, so the wider real answer
 *  satisfies it without this module importing the package. */
export interface DerivedRequestLike {
  type: string;
  prompt: string;
  referenceAssets?: { assetId: string; type: string; url: string; metadata?: { tags?: string[] } }[];
  parameters?: Record<string, unknown>;
}

/** v189 — the consistency manager, structurally. The real `CharacterConsistencyManager` satisfies this:
 *  `registerCharacter` stores the anchors verbatim, `listCharacters` reads them back, and `applyConsistency`
 *  derives a request — THROWING for an unknown character, which is the manager's own answer and passes
 *  through untouched. */
export interface CharacterManagerLike {
  registerCharacter(opts: { characterId: string; referenceImages: string[]; consistencyStrength?: number }): void;
  listCharacters(): { characterId: string; referenceImages: string[]; consistencyStrength?: number }[];
  applyConsistency(request: GenerationRequestLike, characterId: string): Promise<DerivedRequestLike>;
}

/** What an APPLY answered, as plain data. `consistencyStrength` is what the DERIVED REQUEST carries — the
 *  manager's 0.8 default lands here when the character holds none, which is a different number from the
 *  `null` the at-rest report shows. */
export interface DerivedConsistencySummary {
  type: string;
  prompt: string;
  characterId: string | null;
  consistencyStrength: number | null;
  referenceAssets: number;
  referenceImages: string[];
}

/**
 * What the Studio's asset surface composes on mount: three shots, each with a generated still, filed as a
 * storyboard in order.
 *
 * The prompts describe a small scene rather than a product shot, because the surface's job is to show what
 * a storyboard IS — an ordered set of frames that reference assets which exist. Everything it stores goes
 * through the caller's library, so the bytes it reports are the bytes the library holds.
 */
export const STUDIO_SHOTS: readonly { prompt: string; cameraAngle: string; duration: number }[] = [
  { prompt: 'a quiet harbour at dusk, wide establishing shot', cameraAngle: 'wide', duration: 3 },
  { prompt: 'a skiff crossing the harbour, medium shot', cameraAngle: 'medium', duration: 2.5 },
  { prompt: 'the far quay, close on the mooring post', cameraAngle: 'close', duration: 2 },
];

/**
 * Compose the surface's assets: generate one still per shot, store each in the library, and file them as
 * frames of one storyboard IN ORDER.
 *
 * Every asset is stored with an EMPTY payload, because DEMO MODE produces no pixels. That is not a
 * placeholder standing in for an image — it is the honest size of what exists, and `buildAssetReport`
 * reports it as a number so a reader can check rather than believe.
 */
export async function buildStudioAssets(
  generator: AssetGeneratorLike,
  library: AssetLibraryLike,
  storyboards: StoryboardManagerLike,
): Promise<{ assetIds: string[]; storyboardId: string; provenanceMode: string }> {
  const assetIds: string[] = [];
  let provenanceMode = '';

  for (const shot of STUDIO_SHOTS) {
    const result = await generator.generate({ type: 'image', prompt: shot.prompt, count: 1 });
    provenanceMode = result.provenance?.mode ?? provenanceMode;
    for (const asset of result.assets) {
      await library.add(asset, new Uint8Array(0));
      assetIds.push(asset.assetId);
    }
  }

  const storyboard = storyboards.create('Harbour at dusk', 'Three beats, one still each.');
  STUDIO_SHOTS.forEach((shot, index) => {
    const assetId = assetIds[index];
    storyboards.addFrame(storyboard.id, {
      order: index,
      prompt: shot.prompt,
      ...(assetId ? { imageRef: { assetId, type: 'image', url: `asset://${assetId}`, metadata: {} } } : {}),
      duration: shot.duration,
      cameraAngle: shot.cameraAngle,
    });
  });

  return { assetIds, storyboardId: storyboard.id, provenanceMode };
}

/**
 * Generate ONE asset for a caller-supplied prompt and store it in the library, so the interactive
 * surface can GROW the library rather than only reading the three shots it composed on mount.
 *
 * v187 — the surface can ask for FOOTAGE: the type crosses to the generator untouched ('image' or
 * 'video'), and whichever asset comes back is stored by the library's own rules. The module never
 * checks the type itself — what the generator answered is what gets stored, and the report reads
 * the metadata the library actually holds.
 *
 * Like every other write in this module, the stored payload is EMPTY (DEMO MODE has no pixels and
 * no footage) and the returned provenance word is the GENERATOR's own, carried through untouched.
 */
export async function generateAsset(
  generator: AssetGeneratorLike,
  library: AssetLibraryLike,
  prompt: string,
  type: 'image' | 'video' = 'image',
): Promise<{ assetId: string; provenanceMode: string }> {
  const result = await generator.generate({ type, prompt, count: 1 });
  const provenanceMode = result.provenance?.mode ?? '';
  const asset = result.assets[0];
  if (!asset) throw new Error(`the ${type} generator returned no assets`);

  await library.add(asset, new Uint8Array(0));
  return { assetId: asset.assetId, provenanceMode };
}

/**
 * Remove one asset from the library by id. Returns the library's own answer (the real
 * `InMemoryAssetLibrary` answers `false` for an asset it does not hold, so an unknown id is a
 * `false`, not an error).
 */
export async function removeAsset(library: AssetLibraryLike, assetId: string): Promise<boolean> {
  return library.remove(assetId);
}

/**
 * v190 — edit the LIBRARY's metadata. The agent door `asset.update` has existed since v160 and nothing
 * in the Studio imported it; this is its product door, and it passes the LIBRARY's own answer through:
 * `false` for an asset the library does not hold. What may be patched is metadata only — an asset's
 * bytes and its id are not editable — and an EMPTY patch is the panel's refusal, because the library
 * would answer `true` for a patch that changes nothing.
 */
export async function updateAssetMetadata(
  library: AssetLibraryLike,
  assetId: string,
  patch: AssetMetadataPatch,
): Promise<boolean> {
  return library.updateMetadata(assetId, patch);
}

/**
 * v188 — edit the BOARD. The storyboard was read-only on this surface since v153; the manager has had
 * `removeFrame` and `reorderFrames` all along, and these are their thin product doors.
 *
 * Both pass the MANAGER's own answer through: `removeFrame` answers false for a frame it does not hold
 * (and leaves the surviving frames' `order` exactly as it was — a hole is the manager's honest state,
 * not something the panel papers over), and `reorderFrames` rewrites `order` to 0..n-1 in the sequence
 * given. Neither touches the library — the frames reference assets, they are not assets.
 */
export function removeStoryboardFrame(
  storyboards: StoryboardManagerLike,
  storyboardId: string,
  frameId: string,
): boolean {
  return storyboards.removeFrame(storyboardId, frameId);
}

export function reorderStoryboardFrames(
  storyboards: StoryboardManagerLike,
  storyboardId: string,
  frameIds: string[],
): boolean {
  return storyboards.reorderFrames(storyboardId, frameIds);
}

/**
 * v189 — CHARACTERS. The consistency trio has had agent doors since v160 (`asset.character.register` /
 * `list` / `apply`), and nothing in the Studio imported them; these are their product doors, and the
 * shape follows the doors'.
 *
 * `registerCharacter` stores the anchors verbatim — the panel refuses what the manager would silently
 * hold (an empty id, no anchor, a strength outside (0, 1]), and everything else is the manager's.
 * `applyCharacterConsistency` answers a DERIVED REQUEST, never an asset: no generator runs, and the
 * summary counts what the derivation actually attached. An unknown character is the MANAGER's own
 * throw, quoted as it came.
 */
export function registerCharacter(
  manager: CharacterManagerLike,
  opts: { characterId: string; referenceImages: string[]; consistencyStrength?: number },
): void {
  manager.registerCharacter(opts);
}

export async function applyCharacterConsistency(
  manager: CharacterManagerLike,
  prompt: string,
  characterId: string,
  type: 'image' | 'video' = 'image',
): Promise<DerivedConsistencySummary> {
  const derived = await manager.applyConsistency({ type, prompt, count: 1 }, characterId);
  const cc = (derived.parameters?.characterConsistency ?? null) as
    | { characterId?: string; referenceImages?: string[]; consistencyStrength?: number }
    | null;
  return {
    type: derived.type,
    prompt: derived.prompt,
    characterId: typeof cc?.characterId === 'string' ? cc.characterId : null,
    consistencyStrength: typeof cc?.consistencyStrength === 'number' ? cc.consistencyStrength : null,
    referenceAssets: derived.referenceAssets?.length ?? 0,
    referenceImages: Array.isArray(cc?.referenceImages) ? [...cc.referenceImages] : [],
  };
}

/**
 * Read the library, the storyboard and the character register back as a plain report.
 *
 * `storedBytes` is summed from what the LIBRARY holds rather than from what the generator claimed, so a
 * surface that stored nothing reports zero and a surface that stored something reports its real size. A
 * frame's `imageRef` is reported as the id it names; whether that asset EXISTS is the panel's check, and
 * the surface's own composition guarantees it. The characters are what the register HOLDS — a strength
 * nobody registered reads `null`, never the manager's apply-time default.
 */
export async function buildAssetReport(
  library: AssetLibraryLike,
  storyboards: StoryboardManagerLike,
  characters: CharacterManagerLike,
  provenanceMode: string,
  storyboardId: string | null,
): Promise<AssetReport> {
  const refs = await library.list();
  const assets: StudioAssetSummary[] = [];
  let storedBytes = 0;

  for (const ref of refs) {
    const entry = await library.get(ref.assetId);
    if (!entry) continue;
    const m = entry.metadata;
    storedBytes += entry.data.length;
    assets.push({
      id: m.id,
      type: m.type,
      name: m.name,
      description: (m as { description?: string }).description ?? null,
      mimeType: m.mimeType,
      bytes: entry.data.length,
      width: m.width ?? null,
      height: m.height ?? null,
      duration: m.duration ?? null,
      tags: [...m.tags],
      source: m.source ?? null,
      prompt: m.prompt ?? null,
    });
  }

  const board = storyboardId ? storyboards.get(storyboardId) : undefined;
  const characterRows = characters.listCharacters().map((c) => ({
    characterId: c.characterId,
    referenceImages: [...c.referenceImages],
    consistencyStrength: typeof c.consistencyStrength === 'number' ? c.consistencyStrength : null,
  }));
  return {
    schema: 1,
    provenanceMode,
    assets,
    storedBytes,
    characters: characterRows,
    storyboard: board
      ? {
          id: board.id,
          name: board.name,
          description: board.description ?? null,
          frames: board.frames.map((f) => ({
            id: f.id,
            order: f.order,
            prompt: f.prompt,
            imageRef: f.imageRef?.assetId ?? null,
            duration: f.duration ?? null,
            cameraAngle: f.cameraAngle ?? null,
          })),
        }
      : null,
  };
}

