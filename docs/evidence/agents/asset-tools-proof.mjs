// NEXUS M3 v145 — the FIRST consumer of the multimodal slice in @nexus/ai-providers (ADR 0016 amendment 145).
//
// The slice (`InMemoryAssetLibrary`, `DemoImageGenerator`, `DemoVideoGenerator`,
// `CharacterConsistencyManager`, `StoryboardManager`) shipped with 13 green tests and NO consumer outside
// its own suite: `grep -rl` for its symbols across `apps/ agents/ packages/` matched the module, the barrel
// and the suite, and nothing else. That is the shape the 3D and world lanes were both in before v140/v144.
//
// Why a driver seam and not an import: `agents/runtime` does not depend on `@nexus/ai-providers`. It
// declares the narrow `AssetDriver` it needs and the HOST supplies the implementation — the shape
// `browserTools` uses for `BrowserDriver`, `sceneTools` for `SceneDriver` and `worldTools` for
// `WorldDriver`. A fake driver proves the family's own rules (that is what the vitest suite does); only
// wiring the REAL generators proves the seam is the right width. That is this file's job.
//
// What it asserts, in order:
//   §1 the real generator and library answer the seam, and every answer is checked against the LIBRARY's
//      own state rather than against the tool's echo;
//   §2 §60 is MEASURED, not promised: the generator's own provenance says `demo`, the assets it produces
//      are stored with a ZERO-LENGTH payload because this build has no pixels, and the door REFUSES a
//      driver answer that carries no provenance at all;
//   §3 the §28 gate is the registry's and it is the only one;
//   §4 the refusals are spoken by the side that knows the fact, and the library is unchanged by them;
//   §5 a storyboard frame references an asset the library really holds — the reference is followed, not
//      trusted;
//   §6 this repository's HEAD is byte-identical: everything here ran in memory.
// Run after `npm run build`:  node docs/evidence/agents/asset-tools-proof.mjs
import assert from 'node:assert/strict';
import { execFileSync } from '../lib/syncproc.mjs';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const { ToolRegistry, registerAssetTools, ASSET_TOOL_SPECS } = rt;
const ai = await import(pathToFileURL('./packages/ai-providers/dist/index.js').href);
const { InMemoryAssetLibrary, DemoImageGenerator, StoryboardManager } = ai;

const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

// ── the real generator, library and storyboard manager, behind the seam ──────────────────────────────
const library = new InMemoryAssetLibrary();
const generator = new DemoImageGenerator();
const storyboards = new StoryboardManager();

const toSummary = (m) => ({
  id: m.id,
  type: m.type,
  name: m.name,
  mimeType: m.mimeType,
  size: m.size,
  width: m.width ?? null,
  height: m.height ?? null,
  tags: [...m.tags],
  source: m.source ?? null,
  prompt: m.prompt ?? null,
});

const driver = {
  engine: 'ai-providers/multimodal',
  async generateImage(request) {
    const result = await generator.generate({
      type: 'image',
      prompt: request.prompt,
      count: request.count,
      ...(request.width !== undefined || request.height !== undefined
        ? { parameters: { ...(request.width !== undefined ? { width: request.width } : {}), ...(request.height !== undefined ? { height: request.height } : {}) } }
        : {}),
    });
    // DEMO MODE produces METADATA and no pixels, so the payload stored beside each asset is empty. That is
    // not a placeholder standing in for an image — it is the honest size of what exists, and §2 asserts it.
    for (const asset of result.assets) await library.add(asset, Buffer.alloc(0));
    return {
      provenance: result.provenance,
      model: result.metadata.model,
      seed: result.metadata.seed,
      assets: result.assets.map((a) => ({
        assetId: a.assetId,
        type: a.type,
        name: a.metadata.name,
        url: a.url,
        mimeType: a.metadata.mimeType,
        width: a.metadata.width ?? null,
        height: a.metadata.height ?? null,
      })),
    };
  },
  async listAssets() {
    const refs = await library.list();
    const out = [];
    for (const ref of refs) {
      const entry = await library.get(ref.assetId);
      if (entry) out.push(toSummary(entry.metadata));
    }
    return out;
  },
  async getAsset(id) {
    const entry = await library.get(id);
    return entry ? toSummary(entry.metadata) : null;
  },
  createStoryboard(name, description) {
    const sb = storyboards.create(name, description);
    return { id: sb.id, name: sb.name, description: sb.description ?? null, frames: [] };
  },
  addFrame(storyboardId, frame) {
    const added = storyboards.addFrame(storyboardId, {
      order: (storyboards.get(storyboardId)?.frames.length ?? 0),
      prompt: frame.prompt,
      ...(frame.imageRef !== undefined ? { imageRef: { assetId: frame.imageRef, type: 'image', url: `asset://${frame.imageRef}`, metadata: {} } } : {}),
      ...(frame.duration !== undefined ? { duration: frame.duration } : {}),
      ...(frame.cameraAngle !== undefined ? { cameraAngle: frame.cameraAngle } : {}),
    });
    if (!added) return null;
    return {
      id: added.id,
      order: added.order,
      prompt: added.prompt,
      imageRef: added.imageRef?.assetId ?? null,
      duration: added.duration ?? null,
      cameraAngle: added.cameraAngle ?? null,
    };
  },
  getStoryboard(id) {
    const sb = storyboards.get(id);
    if (!sb) return undefined;
    return {
      id: sb.id,
      name: sb.name,
      description: sb.description ?? null,
      frames: sb.frames.map((f) => ({
        id: f.id,
        order: f.order,
        prompt: f.prompt,
        imageRef: f.imageRef?.assetId ?? null,
        duration: f.duration ?? null,
        cameraAngle: f.cameraAngle ?? null,
      })),
    };
  },
};

const registry = registerAssetTools(new ToolRegistry(), driver);
let checkpointCalls = 0;
const gate = { checkpoint: () => { checkpointCalls += 1; return true; } };
let seq = 0;
const invoke = (tool, args = {}, opts = gate) =>
  registry.invoke({ callId: `asset-proof-${++seq}`, tool, args }, opts);

// ── §1 the real generator and library answer the seam ────────────────────────────────────────────────
const listed0 = await invoke('asset.list', {}, {});
assert.equal(listed0.ok, true, `asset.list failed: ${listed0.error}`);
assert.equal(listed0.output.engine, 'ai-providers/multimodal', 'the answer names the engine that answered');
assert.equal(listed0.output.count, 0, 'the library starts empty');

const gen = await invoke('asset.image.generate', { prompt: 'a quiet harbour at dusk', count: 2, width: 512, height: 512 });
assert.equal(gen.ok, true, `asset.image.generate failed: ${gen.error}`);
assert.equal(gen.output.assets.length, 2);
const firstId = gen.output.assets[0].assetId;

// Read back through the LIBRARY, not through the tool.
const stored = await library.get(firstId);
assert.ok(stored, 'the library holds the asset the tool reported');
assert.equal(stored.metadata.prompt, 'a quiet harbour at dusk');
assert.equal(stored.metadata.width, 512);
assert.equal(stored.metadata.height, 512);
assert.equal(stored.metadata.source, 'generated');

const inspected = await invoke('asset.inspect', { assetId: firstId }, {});
assert.equal(inspected.ok, true);
assert.equal(inspected.output.id, firstId);
assert.equal(inspected.output.prompt, 'a quiet harbour at dusk');
console.log(`[§1] real generator + library behind the seam: ${gen.output.assets.length} asset(s) generated from one prompt, "${stored.metadata.name}" stored with mimeType ${stored.metadata.mimeType} · the library and the tool agree on the id, the prompt and the size`);

// ── §2 §60, MEASURED ─────────────────────────────────────────────────────────────────────────────────
// The generator's own provenance, carried through the door untouched.
assert.equal(gen.output.provenance.mode, 'demo', 'the REAL generator says demo, and the door carries that word through');
assert.equal(typeof gen.output.provenance.provider, 'string');

// And the assets have NO PIXELS: the payload stored beside them is zero bytes, which is the honest size of
// what DEMO MODE produces. A non-zero size here would mean something was fabricated.
assert.equal(stored.data.length, 0, 'DEMO MODE produces no bytes — the stored payload is empty');
assert.equal(stored.metadata.size, 0, 'and the metadata records that size rather than a plausible one');

// The door REFUSES an answer that dropped its provenance, so it cannot emit a result a reader could
// mistake for a real generation. This is the rule the family exists to make.
const naked = registerAssetTools(new ToolRegistry(), {
  ...driver,
  generateImage: () => ({ model: 'm', seed: 1, assets: [] }),
});
const nakedResult = await naked.invoke({ callId: 'naked', tool: 'asset.image.generate', args: { prompt: 'x' } }, gate);
assert.equal(nakedResult.ok, false, 'a provenance-less answer is refused');
assert.match(nakedResult.error, /answered without provenance/);

// And no door is even NAMED like an image producer.
for (const spec of ASSET_TOOL_SPECS) {
  assert.doesNotMatch(spec.name, /screenshot|render|pixel|photo|picture/i, `${spec.name} is named like an image producer`);
}
console.log(`[§2] §60 measured: provenance.mode = "${gen.output.provenance.mode}" carried through · the stored payload is ${stored.data.length} byte(s) because DEMO MODE has no pixels · a provenance-less answer is REFUSED ("answered without provenance") · none of the ${ASSET_TOOL_SPECS.length} doors is named like an image producer`);

// ── §3 the §28 gate is the registry's, and it is the only one ────────────────────────────────────────
const assetsBefore = (await invoke('asset.list', {}, {})).output.count;
const before = checkpointCalls;
const denied = await invoke('asset.image.generate', { prompt: 'denied' }, {});
assert.equal(denied.ok, false, 'an unapproved write door is refused');
assert.match(denied.error, /checkpoint/i, 'and the refusal names the gate');
assert.equal((await invoke('asset.list', {}, {})).output.count, assetsBefore, 'the LIBRARY did not move: nothing was generated into it');
assert.equal(checkpointCalls, before, 'the gate was never consulted — no checkpoint function was supplied');

const allowed = await invoke('asset.image.generate', { prompt: 'allowed' });
assert.equal(allowed.ok, true);
assert.equal((await invoke('asset.list', {}, {})).output.count, assetsBefore + 1, 'the approved call did add one');
assert.equal(checkpointCalls, before + 1, 'exactly one checkpoint for exactly one write');
console.log(`[§3] §28: 1 refused write moved the library by 0 and asked the gate 0 times · 1 approved write moved it by 1 and asked once · registry is the only gate`);

// ── §4 refusals are spoken by the side that knows the fact ───────────────────────────────────────────
const countBefore = (await invoke('asset.list', {}, {})).output.count;
const badCount = await invoke('asset.image.generate', { prompt: 'x', count: 0 });
assert.equal(badCount.ok, false);
assert.match(badCount.error, /count is 0/);

const ghostAsset = await invoke('asset.inspect', { assetId: 'img-ghost' }, {});
assert.equal(ghostAsset.ok, false);
assert.match(ghostAsset.error, /holds no asset img-ghost/, 'the door names the asset it refused');

const sb = await invoke('asset.storyboard.create', { name: 'Shot list', description: 'three beats' });
assert.equal(sb.ok, true, `asset.storyboard.create failed: ${sb.error}`);
const storyboardId = sb.output.storyboardId;

const ghostFrame = await invoke('asset.storyboard.frame.add', { storyboardId, prompt: 'wide', imageRef: 'img-ghost' });
assert.equal(ghostFrame.ok, false);
assert.match(ghostFrame.error, /holds no asset img-ghost/);
assert.equal(storyboards.get(storyboardId).frames.length, 0, 'the refused frame was NOT filed');

const ghostBoard = await invoke('asset.storyboard.inspect', { storyboardId: 'sb-ghost' }, {});
assert.equal(ghostBoard.ok, false);
assert.match(ghostBoard.error, /holds no storyboard sb-ghost/);

assert.equal((await invoke('asset.list', {}, {})).output.count, countBefore, 'four refused calls moved the library by nothing');
console.log(`[§4] 4 refusals, each naming its own fact, and the library moved by 0: a count of zero · an asset the library does not hold · a frame referencing an absent asset · a storyboard that does not exist`);

// ── §5 a frame's reference is FOLLOWED, not trusted ──────────────────────────────────────────────────
const filed = await invoke('asset.storyboard.frame.add', { storyboardId, prompt: 'wide establishing shot', imageRef: firstId, duration: 2.5, cameraAngle: 'wide' });
assert.equal(filed.ok, true, `asset.storyboard.frame.add failed: ${filed.error}`);
assert.equal(filed.output.frame.imageRef, firstId);

const board = await invoke('asset.storyboard.inspect', { storyboardId }, {});
assert.equal(board.ok, true);
assert.equal(board.output.frameCount, 1);
const ref = board.output.frames[0].imageRef;
// The reference resolves against the LIBRARY — the frame points at something that is really there.
const resolved = await library.get(ref);
assert.ok(resolved, `the frame's imageRef ${ref} resolves in the library`);
assert.equal(resolved.metadata.prompt, 'a quiet harbour at dusk');
console.log(`[§5] a storyboard frame's reference is followed: imageRef ${ref} resolves in the library to "${resolved.metadata.name}", and the manager holds ${storyboards.get(storyboardId).frames.length} frame(s)`);

// ── §6 the home repository never moved ───────────────────────────────────────────────────────────────
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§6: this repository HEAD byte-identical — everything here ran in memory');

console.log(`\n[summary] the FIRST consumer of the multimodal slice: ${ASSET_TOOL_SPECS.length} asset.* doors over a driver seam, driven through the registry's §28 gate, with the REAL generator + library + storyboard manager behind it · ${gen.output.assets.length} asset(s) generated and stored with a ZERO-LENGTH payload because DEMO MODE has no pixels · provenance carried through and a provenance-less answer REFUSED · a frame's imageRef followed back into the library · home HEAD byte-identical: yes`);
console.log('[asset-tools-proof] ALL ASSERTIONS PASSED (the multimodal lane now has a consumer, and it cannot return a result that pretends to be a picture)');
