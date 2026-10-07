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

export interface AssetLibraryLike {
  add(asset: unknown, data: Uint8Array): Promise<void>;
  remove(id: string): Promise<boolean>;
  list(): Promise<{ assetId: string; type: string }[]>;
  get(id: string): Promise<{ metadata: { id: string; type: string; name: string; mimeType: string; size: number; width?: number; height?: number; duration?: number; tags: string[]; source?: string; prompt?: string }; data: Uint8Array } | null>;
}

export interface StoryboardManagerLike {
  create(name: string, description?: string): { id: string; name: string; description?: string };
  addFrame(storyboardId: string, frame: { order: number; prompt: string; imageRef?: unknown; duration?: number; cameraAngle?: string }): { id: string; order: number; prompt: string; imageRef?: { assetId: string }; duration?: number; cameraAngle?: string } | null;
  get(id: string): { id: string; name: string; description?: string; frames: { id: string; order: number; prompt: string; imageRef?: { assetId: string }; duration?: number; cameraAngle?: string }[] } | undefined;
  /** v188 — the surface can EDIT the board, and the manager's answers pass through untouched. */
  removeFrame(storyboardId: string, frameId: string): boolean;
  reorderFrames(storyboardId: string, frameIds: string[]): boolean;
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
 * Read the library and the storyboard back as a plain report.
 *
 * `storedBytes` is summed from what the LIBRARY holds rather than from what the generator claimed, so a
 * surface that stored nothing reports zero and a surface that stored something reports its real size. A
 * frame's `imageRef` is reported as the id it names; whether that asset EXISTS is the panel's check, and
 * the surface's own composition guarantees it.
 */
export async function buildAssetReport(
  library: AssetLibraryLike,
  storyboards: StoryboardManagerLike,
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
  return {
    schema: 1,
    provenanceMode,
    assets,
    storedBytes,
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

