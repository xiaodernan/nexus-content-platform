// NEXUS M3 v153 — the Studio's asset surface, the FIRST PRODUCT consumer of the multimodal slice in
// @nexus/ai-providers (ADR 0016 amendment 153).
//
// v145 gave the multimodal lane its AGENT consumer (`agents/runtime/src/assetTools.ts` over an
// `AssetDriver` seam), and its own record still ended with *"nothing in the Studio imports it, so M3's
// PRODUCT face is still open."* This proof closes the product half, and it is built out of the SHIPPED
// bytes rather than a copy:
//
//   - the generators are `packages/ai-providers/dist` (build it first), in memory, DEMO MODE;
//   - the surface is `apps/studio/src/lib/assets.ts` — the ACTUAL Studio module, read off disk and run
//     through Node's own TypeScript type-stripper. A copy of its functions here would prove that the copy
//     works, which is the failure mode this file exists to avoid.
//
// What it asserts, in order:
//   §1 the Studio's composed assets ARE the library's: every id it returns is retrievable, with the name,
//      mimeType and prompt that were asked for;
//   §2 §60 is MEASURED rather than promised — the provenance word is the GENERATOR's own (`demo`), the
//      payload stored beside every asset is ZERO bytes because DEMO MODE has no pixels, and the report
//      names no model or provider;
//   §3 the report is DERIVED, not remembered: adding to the library through its own API moves it;
//   §4 a storyboard frame's `imageRef` is FOLLOWED, not trusted — each one resolves back into the library,
//      and the frames are in the order the shots declare;
//   §5 this repository's HEAD is byte-identical: everything here ran in memory.
//
// Run after `npm run build`:  node docs/evidence/studio/asset-surface-proof.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from '../lib/syncproc.mjs';

// ── the shipped generators, library and storyboard manager ───────────────────────────────────────────
const ai = await import(pathToFileURL('./packages/ai-providers/dist/index.js').href);
const { InMemoryAssetLibrary, DemoImageGenerator, DemoVideoGenerator, CharacterConsistencyManager, StoryboardManager } = ai;

// ── the SHIPPED Studio module, type-stripped rather than copied ──────────────────────────────────────
const { stripTypeScriptTypes } = await import('node:module');
const STUDIO_MODULE = './apps/studio/src/lib/assets.ts';
const stripped = stripTypeScriptTypes(readFileSync(STUDIO_MODULE, 'utf8'), { mode: 'strip' });
const box = mkdtempSync(join(tmpdir(), 'nexus-asset-surface-'));
const modulePath = join(box, 'assets.mjs');
writeFileSync(modulePath, stripped, 'utf8');
const studio = await import(pathToFileURL(modulePath).href);
const { buildStudioAssets, buildAssetReport, generateAsset, removeAsset, updateAssetMetadata, registerCharacter, applyCharacterConsistency, STUDIO_SHOTS } = studio;
assert.equal(typeof buildStudioAssets, 'function', 'the Studio module was really imported, not re-implemented');
assert.equal(typeof buildAssetReport, 'function', 'and so was its report builder');

const homeHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

// ── the real stack, in memory, DEMO MODE ─────────────────────────────────────────────────────────────
const generator = new DemoImageGenerator();
const library = new InMemoryAssetLibrary();
const storyboards = new StoryboardManager();
const consistency = new CharacterConsistencyManager();

const built = await buildStudioAssets(generator, library, storyboards);
const report = await buildAssetReport(library, storyboards, consistency, built.provenanceMode, built.storyboardId);

// ── §1 the Studio's assets ARE the library's ─────────────────────────────────────────────────────────
assert.equal(built.assetIds.length, STUDIO_SHOTS.length, 'one asset per declared shot');
assert.equal(report.assets.length, STUDIO_SHOTS.length, 'and the report lists them all');
for (const id of built.assetIds) {
  const entry = await library.get(id);
  assert.ok(entry, `asset ${id} is not retrievable from the library`);
  assert.equal(entry.metadata.source, 'generated');
  assert.equal(entry.metadata.type, 'image');
}
// The library returns assets NEWEST-FIRST (`updatedAt` descending, id as the tiebreak) — measured here
// rather than assumed, because a surface that presented its own insertion order as the library's would be
// showing the caller something the library never said.
const listed = await library.list();
assert.deepEqual(
  report.assets.map((a) => a.id),
  listed.map((r) => r.assetId),
  'the report lists assets in the LIBRARY’s own order, not in the Studio’s insertion order',
);
assert.deepEqual(
  [...report.assets.map((a) => a.prompt)].sort(),
  [...STUDIO_SHOTS.map((s) => s.prompt)].sort(),
  'every shot has an asset — as a SET, since the library does not promise the shots’ order',
);
console.log(`[§1] the Studio composed the LIBRARY's own assets: ${report.assets.length} generated, each retrievable · "${report.assets[0].name}" is ${report.assets[0].mimeType} ${report.assets[0].width}×${report.assets[0].height} · listed in the LIBRARY's order (newest-first by updatedAt), which is NOT the shots' order`);

// ── §2 §60, MEASURED ─────────────────────────────────────────────────────────────────────────────────
assert.equal(report.provenanceMode, 'demo', 'the provenance word is the GENERATOR’s own, carried through');
assert.equal(report.storedBytes, 0, 'DEMO MODE produces no bytes, so the library stores zero of them');
for (const a of report.assets) assert.equal(a.bytes, 0, `${a.name} reports a non-zero size`);

// And the payload the library really holds is empty — not merely reported as such.
for (const id of built.assetIds) {
  const entry = await library.get(id);
  assert.equal(entry.data.length, 0, `the stored payload beside ${id} is not empty`);
}

// The report names no model, provider or picture.
const flat = JSON.stringify(report).toLowerCase();
for (const word of ['openai', 'gpt', 'llm', 'provider', 'base64', 'data:image']) {
  assert.equal(flat.includes(word), false, `the asset report mentions "${word}", which would imply more than metadata exists`);
}
console.log(`[§2] §60 measured: provenance "${report.provenanceMode}" carried through · storedBytes = ${report.storedBytes} and every payload in the library is ${(await library.get(built.assetIds[0])).data.length} byte(s), because DEMO MODE has no pixels · the report names no model, provider or picture`);

// ── §3 the report is DERIVED, not remembered ─────────────────────────────────────────────────────────
const before = await buildAssetReport(library, storyboards, consistency, built.provenanceMode, built.storyboardId);
const extra = await generator.generate({ type: 'image', prompt: 'a shot the Studio never composed', count: 1 });
await library.add(extra.assets[0], new Uint8Array(0));
const after = await buildAssetReport(library, storyboards, consistency, built.provenanceMode, built.storyboardId);
assert.equal(after.assets.length, before.assets.length + 1, 'a change through the LIBRARY moves the report');
assert.ok(after.assets.some((a) => a.prompt === 'a shot the Studio never composed'), 'and the new asset is in it');
// The Studio's own frames are unaffected by a library that grew under them.
assert.equal(after.storyboard.frames.length, STUDIO_SHOTS.length);
console.log(`[§3] the report is derived, not remembered: adding to the LIBRARY moved the asset count ${before.assets.length} → ${after.assets.length}, and the storyboard still holds its ${after.storyboard.frames.length} frames`);

// ── §4 a frame's reference is FOLLOWED, not trusted ──────────────────────────────────────────────────
const frames = report.storyboard.frames;
assert.equal(frames.length, STUDIO_SHOTS.length);
assert.deepEqual(frames.map((f) => f.order), STUDIO_SHOTS.map((_, i) => i), 'the frames are in the shots’ order');
for (const frame of frames) {
  assert.ok(frame.imageRef, `frame #${frame.order} references nothing`);
  const resolved = await library.get(frame.imageRef);
  assert.ok(resolved, `frame #${frame.order}'s imageRef ${frame.imageRef} does not resolve in the library`);
  assert.equal(resolved.metadata.prompt, frame.prompt, 'and it resolves to the asset for THAT shot');
}
assert.deepEqual(frames.map((f) => f.cameraAngle), STUDIO_SHOTS.map((s) => s.cameraAngle), 'the camera angles are the shots’');
console.log(`[§4] every frame's reference is followed: ${frames.length}/${frames.length} imageRefs resolve in the library to the asset for their own shot, in order (${frames.map((f) => `#${f.order}:${f.cameraAngle}`).join(' ')})`);

// ── §5 the surface is INTERACTIVE: grow and shrink the REAL library ──────────────────────────────────────
// v159 added a generate/remove door to the shipped module. This grows the library through the SAME generator
// the surface composed its shots with, then shrinks it again — and checks the report follows both ways, and
// that §60 still holds on the freshly generated asset.
//
// The baseline is read HERE rather than reused from §1's report: §3 already grew the library by one, so a
// baseline captured at mount time would be stale and the first draft of this section asserted 4 against a
// real 5. Measuring against the current count is the difference between testing the door and testing an
// arithmetic assumption about the sections before it.
const beforeGrow = await buildAssetReport(library, storyboards, consistency, report.provenanceMode, built.storyboardId);
const grown = await generateAsset(generator, library, 'a beat the surface never composed on mount');
assert.equal(grown.provenanceMode, 'demo', 'the interactive write carries the generator’s own provenance word');
const grownEntry = await library.get(grown.assetId);
assert.ok(grownEntry, 'the interactive generate stored a retrievable asset');
assert.equal(grownEntry.data.length, 0, 'and it stored zero bytes, because DEMO MODE has no pixels');
const afterGrow = await buildAssetReport(library, storyboards, consistency, report.provenanceMode, built.storyboardId);
assert.equal(afterGrow.assets.length, beforeGrow.assets.length + 1, 'the interactive generate grew the derived report by exactly one');
assert.ok(afterGrow.assets.some((a) => a.id === grown.assetId), 'and the new asset is in it');
const removed = await removeAsset(library, grown.assetId);
assert.equal(removed, true, 'the interactive remove deletes by id');
const afterShrink = await buildAssetReport(library, storyboards, consistency, report.provenanceMode, built.storyboardId);
assert.equal(afterShrink.assets.length, beforeGrow.assets.length, 'the interactive remove shrank the derived report back');
assert.ok(!afterShrink.assets.some((a) => a.id === grown.assetId), 'and the removed asset is gone');
assert.equal(await removeAsset(library, grown.assetId), false, 'removing an id the library no longer holds answers false, not an error');
// §60 survives the interaction: growing the library did not give anything a size, and the storyboard is
// untouched by a library change — the two are separate state, and the report says so.
assert.equal(afterGrow.storedBytes, 0, 'a freshly generated asset did not give the library a byte count');
assert.equal(afterGrow.storyboard.frames.length, beforeGrow.storyboard.frames.length, 'generating into the library did not move the storyboard');
console.log(`[§5] the surface is interactive: generateAsset grew the report ${beforeGrow.assets.length} -> ${afterGrow.assets.length}, removeAsset shrank it back to ${afterShrink.assets.length}, the new asset stored ${grownEntry.data.length} byte(s), the storyboard stayed at ${afterGrow.storyboard.frames.length} frame(s), and removing the id again answers false`);

// ── §6 the surface can ask for FOOTAGE (M3 v187) ─────────────────────────────────────────────────────
// `generateAsset` gained a `type`, and the PANEL dispatches on it: an ask for 'video' goes to the video
// generator, an ask for 'image' to the image one. That dispatch is not decoration — the two demo generators
// both answer whatever they are asked, so a single-generator stack would answer a video ask with a STILL
// and store it under a video name. This section measures that first, then shows the dispatch fixing it.
const imageOnly = new DemoImageGenerator();
const mislabelled = await imageOnly.generate({ type: 'video', prompt: 'a skiff crossing', count: 1 });
assert.equal(
  mislabelled.assets[0].metadata.mimeType,
  'image/png',
  'the image generator answers a VIDEO ask with a still — the defect the dispatch exists to prevent',
);
console.log(`[§6a] measured the defect the dispatch prevents: asking the image generator for 'video' answers a ${mislabelled.assets[0].metadata.mimeType} — so a single-generator stack would store a still under a video ask`);

// The stack the PANEL builds: one `generate` that routes by the ask's type.
const videos = new DemoVideoGenerator();
const routed = {
  generate: async (request) => (request.type === 'video' ? videos.generate(request) : imageOnly.generate(request)),
};

const beforeVideo = await buildAssetReport(library, storyboards, consistency, report.provenanceMode, built.storyboardId);
const footage = await generateAsset(routed, library, 'a skiff crossing the harbour, three seconds', 'video');
const footageEntry = await library.get(footage.assetId);
assert.ok(footageEntry, 'the footage is retrievable from the library');
assert.equal(footageEntry.metadata.type, 'video', 'and it is a video, because the dispatch sent the ask to the video generator');
assert.equal(footageEntry.metadata.mimeType, 'video/mp4');
assert.equal(footage.provenanceMode, 'demo', 'the provenance is still the generator’s own word');
assert.equal(footageEntry.data.length, 0, 'and the payload is still EMPTY — DEMO MODE has no footage either');

// A STILL has no duration and the report says `null`; footage reports the seconds it was made for. A report
// that printed 0 for both would be claiming a still is a zero-length video.
const still = await generateAsset(routed, library, 'a still beside the footage', 'image');
const stillEntry = await library.get(still.assetId);
assert.equal(stillEntry.metadata.type, 'image');
assert.equal(stillEntry.metadata.duration, undefined, 'a still carries no duration at all');
const afterBoth = await buildAssetReport(library, storyboards, consistency, report.provenanceMode, built.storyboardId);
const footageRow = afterBoth.assets.find((a) => a.id === footage.assetId);
const stillRow = afterBoth.assets.find((a) => a.id === still.assetId);
assert.ok(footageRow && stillRow, 'both are in the report');
assert.equal(typeof footageRow.duration, 'number', 'the report gives footage its duration');
assert.equal(footageRow.duration > 0, true, 'and it is a positive number of seconds');
assert.equal(stillRow.duration, null, 'while a still reports null rather than 0 — not the same claim');
assert.equal(afterBoth.storedBytes, 0, 'and NEITHER write gave the library a byte count');
// The type is the generator's, so the report can tell the two apart without being told.
assert.equal(footageRow.type, 'video');
assert.equal(stillRow.type, 'image');
console.log(`[§6b] the dispatch works: a 'video' ask reached the video generator ("${footageEntry.metadata.mimeType}", ${footageRow.duration}s reported) and an 'image' ask reached the image one (${stillEntry.metadata.mimeType}, duration ${JSON.stringify(stillRow.duration)}) · both stored ${footageEntry.data.length} byte(s) · the report tells them apart by the GENERATOR's type, not by anything this module set`);

// ── §7 CHARACTERS: the consistency trio's product doors (M3 v189) ────────────────────────────────────
// The agent lane has held `asset.character.register` / `list` / `apply` since v160; nothing in the Studio
// imported them. v189 is the product face, and it keeps the lane's one rule: APPLY ANSWERS A REQUEST,
// NEVER AN ASSET — no generator runs. The measured crux is TWO numbers that must NOT agree: the report
// says what the manager HOLDS (a strength nobody registered reads `null`), the derived summary says what
// the manager WOULD SEND (its own 0.8 default lands there). A surface that pre-applied the default into
// the report would be showing the reader a number the register does not own.
const atRest = await buildAssetReport(library, storyboards, consistency, report.provenanceMode, built.storyboardId);
assert.deepEqual(atRest.characters, [], 'an empty register reports an empty character list');
const miraUrl = `asset://${built.assetIds[0]}`;
const tomaUrl = `asset://${built.assetIds[1]}`;
registerCharacter(consistency, { characterId: 'mira', referenceImages: [miraUrl] });
registerCharacter(consistency, { characterId: 'toma', referenceImages: [tomaUrl], consistencyStrength: 0.5 });
const held = await buildAssetReport(library, storyboards, consistency, report.provenanceMode, built.storyboardId);
assert.deepEqual(
  held.characters,
  [
    { characterId: 'mira', referenceImages: [miraUrl], consistencyStrength: null },
    { characterId: 'toma', referenceImages: [tomaUrl], consistencyStrength: 0.5 },
  ],
  "the at-rest report shows the strength the register HOLDS — null where none was given, never a pre-applied default",
);

const miraDerived = await applyCharacterConsistency(consistency, 'mira on the far quay, medium shot', 'mira');
assert.deepEqual(
  miraDerived,
  {
    type: 'image',
    prompt: 'mira on the far quay, medium shot',
    characterId: 'mira',
    consistencyStrength: 0.8,
    referenceAssets: 1,
    referenceImages: [miraUrl],
  },
  "the derivation carries the manager's own 0.8 where the register held none, and counts what it actually attached",
);
assert.notEqual(
  held.characters[0].consistencyStrength,
  miraDerived.consistencyStrength,
  "the two numbers are different ON PURPOSE — the register holds null, the derivation carries the manager's 0.8",
);

const tomaDerived = await applyCharacterConsistency(consistency, 'toma crossing the harbour, three seconds', 'toma', 'video');
assert.equal(tomaDerived.type, 'video', "the ask's type crosses to the derivation untouched");
assert.equal(tomaDerived.consistencyStrength, 0.5, 'a strength the register HOLDS lands in the derivation as itself');

await assert.rejects(
  applyCharacterConsistency(consistency, 'a ghost beat', 'nobody'),
  /no character registered as "nobody"/,
  "an unknown character is the MANAGER's own throw, quoted as it came",
);
assert.equal(held.assets.length, atRest.assets.length, 'register and apply moved NEITHER the library NOR the generator — a derivation answers a request, it stores nothing');
console.log(`[§7] characters are anchored and derivable: mira holds ${JSON.stringify(held.characters[0].consistencyStrength)} at rest while her derivation carries ${miraDerived.consistencyStrength} (the manager's own 0.8, landing where the register held none) · ${miraDerived.referenceAssets} reference asset(s) attached · toma's 0.5 crossed as ${tomaDerived.consistencyStrength} on a '${tomaDerived.type}' ask · an unknown character threw the manager's own words · assets unchanged at ${held.assets.length}`);

// ── §9 the library is EDITABLE: updateMetadata's product door (M3 v190) ─────────────────────────────
// The `asset.update` agent door has existed since v160, and its first sentence is a refusal: an empty
// patch would be REPORTED as an update by the library, which answers `true` for a patch that changes
// nothing. What may be patched is metadata only — an asset's BYTES and its id are not editable — and
// the merge is over what the library HOLDS, so what the patch leaves out keeps its value. Measured
// here against the SHIPPED library, and read back through the report the surface would show.
const renameTarget = built.assetIds[0];
const nameBefore = (await library.getMetadata(renameTarget)).name;
assert.equal(await updateAssetMetadata(library, renameTarget, { name: 'renamed by the surface', description: 'a beat the surface annotated', tags: ['annotated', 'kept'] }), true, '§9: the library answers true for a patch on an asset it holds');
const afterPatch = await library.getMetadata(renameTarget);
assert.equal(afterPatch.name, 'renamed by the surface', '§9: the name the library HOLDS is the patched name');
assert.equal(afterPatch.description, 'a beat the surface annotated', '§9: the description landed in the metadata the library holds');
assert.deepEqual(afterPatch.tags, ['annotated', 'kept'], '§9: tags landed as the array the patch gave');
assert.equal(typeof afterPatch.updatedAt, 'number', '§9: the merge re-stamped updatedAt — the library keeps its own bookkeeping');
assert.equal((await library.getMetadata(renameTarget)).id, renameTarget, '§9: the id is NOT editable — the patch could not move it');
assert.equal((await library.get(renameTarget)).data.length, 0, '§9: the BYTES are NOT editable — the payload is still the zero the demo stored');
const updatedReport = await buildAssetReport(library, storyboards, consistency, report.provenanceMode, built.storyboardId);
const updatedRow = updatedReport.assets.find((a) => a.id === renameTarget);
assert.equal(updatedRow.name, 'renamed by the surface', '§9: the report the surface shows reads the patched name');
assert.equal(updatedRow.description, 'a beat the surface annotated', '§9: the report reads the patched description');
assert.deepEqual(updatedRow.tags, ['annotated', 'kept'], '§9: the report reads the patched tags');
assert.equal(updatedRow.name !== nameBefore, true, '§9: the name CHANGED — this is an update, not a no-op wearing one');
assert.equal(await updateAssetMetadata(library, 'no-such-asset', { name: 'ghost' }), false, '§9: an id the library does not hold is the library’s own false');
assert.equal(updatedReport.assets.length, held.assets.length, '§9: the library holds the SAME count after an update — a patch edits, it neither grows nor shrinks');
console.log(`[§9] the library is editable: "${nameBefore}" → "${updatedRow.name}" (description + [${updatedRow.tags.join(', ')}] landed, id and zero bytes untouched) · the report reads the merge back · an unknown id answered the library's own false · ${updatedReport.assets.length} assets, unchanged in count`);

// ── §8 the home repository never moved ───────────────────────────────────────────────────────────────
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), homeHead, '§8: this repository HEAD byte-identical — everything here ran in memory');

rmSync(box, { recursive: true, force: true });

console.log(`\n[summary] the FIRST product consumer of the multimodal slice: the Studio's asset surface, graded from the SHIPPED Studio module (type-stripped, not copied) over the SHIPPED generators · ${report.assets.length} assets generated and stored with ZERO bytes each · 1 storyboard, ${frames.length} frames, every imageRef followed back into the library · the report proven DERIVED by growing the library under it · ${held.characters.length} characters anchored, an apply answering a REQUEST and never an asset · the library's metadata EDITABLE ("${updatedRow.name}") with bytes and id untouchable · no model attached and none claimed · home HEAD byte-identical: yes`);
console.log('[asset-surface-proof] ALL ASSERTIONS PASSED (the multimodal lane is reachable from the product, and the surface cannot show a size that implies pixels exist)');
