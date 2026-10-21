// NEXUS — a ZERO-DEPENDENCY PNG decoder and pixel diff, so a harness screenshot can be COMPARED to a baseline.
//
// _Ledger note: the ADR entry for this increment is DEFERRED — the ledger file holds another lane's uncommitted
// entries (one of which DUPLICATES this lane's committed 258), so appending here would stage their work. The
// module, this proof and the harness wiring are complete and green; the record lands when that file is clean._
//
// `docs/KNOWN_ISSUES.md` has carried the same sentence since the harness existed: "the harness does not yet
// compare screenshots against a baseline." It CAPTURES PNGs (five are committed) and never looks at them again,
// so a visual regression is invisible to every gate. The missing half is not a browser — it is reading the
// bytes it already writes.
//
// What it asserts, in order:
//   §1 the decoder reads the FIVE real harness PNGs: dimensions match IHDR, the buffer is RGBA for every
//      colour type, the image is a COHERENT dark UI (a wrong un-filter would be noise, not a corner at the
//      Studio's own surface colour), and decoding is deterministic;
//   §2 the diff is exact and ACTIONABLE: self-diff 0, one perturbed pixel is named by x/y/delta, a tolerance
//      swallows it, and a size mismatch is refused rather than compared;
//   §3 the decoder REFUSES by name — not a PNG, an unsupported colour type, a 16-bit depth, an interlaced
//      file, a truncated chunk — rather than guessing at pixels it cannot read;
//   §4 the WIRING exists: the golden-path harness imports the module and compares a capture to a baseline
//      when one is present (a guarded arm — no baseline, no assertion, and it says so).
//
// Run:  node docs/evidence/studio/png-baseline-proof.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PngRefusal, crc32, decodePng, diffPixels } from '../../../tools/harness/png.mjs';

const SHOTS = [
  'docs/evidence/m7/harness/studio-publish.png',
  'docs/evidence/studio/harness/studio-after-compose.png',
  'docs/evidence/studio/harness/studio-assets.png',
  'docs/evidence/studio/harness/studio-scene3d.png',
  'docs/evidence/studio/harness/studio-world.png',
];
const buf = (p) => readFileSync(p);
const corner = (d) => [...d.pixels.subarray(0, 3)];

// ── §1 the decoder reads the real captures ──────────────────────────────────────────────────────────
{
  for (const p of SHOTS) {
    const b = buf(p);
    const d = decodePng(b);
    assert.equal(d.width, b.readUInt32BE(16), `${p}: width must match IHDR`);
    assert.equal(d.height, b.readUInt32BE(20), `${p}: height must match IHDR`);
    assert.equal(d.channels, 3, `${p}: these captures are RGB (colour type 2)`);
    assert.equal(d.pixels.length, d.width * d.height * 4, `${p}: the decoder always answers RGBA`);
    // A coherent dark UI: the top-left pixel is the Studio's own surface, not noise from a bad un-filter.
    const c = corner(d);
    const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    assert.ok(lum < 60, `${p}: the corner luminance ${lum.toFixed(1)} is not a dark Studio surface (a bad un-filter is noise, not a corner)`);
    // And the image is VARIED: white text exists somewhere, so the decode is not a flat fill.
    let max = 0;
    for (let i = 0; i < d.pixels.length; i += 4) if (d.pixels[i] > max) max = d.pixels[i];
    assert.ok(max > 200, `${p}: no near-white pixel found (max ${max}), so this does not look like a rendered UI`);
    // Determinism: the same bytes decode to the same pixels.
    assert.deepEqual(decodePng(b).pixels, d.pixels, `${p}: decoding must be deterministic`);
  }
  const first = decodePng(buf(SHOTS[0]));
  console.log(`[§1] decoded ${SHOTS.length} real captures · ${first.width}x${first.height} · corner rgb(${corner(first).join(',')}) · deterministic`);
}

// ── §2 the diff is exact and actionable ─────────────────────────────────────────────────────────────
{
  const a = decodePng(buf(SHOTS[1]));
  assert.deepEqual(diffPixels(a, a), { total: a.width * a.height, differing: 0, ratio: 0, maxDelta: 0, firstAt: null }, 'self-diff must be exactly zero');
  // Perturb ONE pixel by 7 in red, deep in the image.
  const b = { width: a.width, height: a.height, channels: a.channels, pixels: Buffer.from(a.pixels) };
  const at = 123456;
  const off = at * 4;
  b.pixels[off] = (b.pixels[off] + 7) & 255;
  const one = diffPixels(a, b);
  assert.equal(one.differing, 1, 'exactly one pixel differs');
  assert.equal(one.maxDelta, 7, 'the delta is reported');
  assert.ok(one.firstAt && one.firstAt.x === at % a.width && one.firstAt.y === Math.floor(at / a.width), 'the first differing pixel is named by x/y');
  // A tolerance swallows a delta at or below it, and not one above it.
  assert.equal(diffPixels(a, b, { tolerance: 7 }).differing, 0, 'tolerance 7 swallows a delta of 7');
  assert.equal(diffPixels(a, b, { tolerance: 6 }).differing, 1, 'tolerance 6 does not');
  // A size mismatch is refused, not compared.
  assert.throws(() => diffPixels(a, { ...a, width: a.width + 1 }), PngRefusal, 'different sizes must be refused');
  console.log(`[§2] diff: self 0 · one perturbed pixel named at ${one.firstAt.x},${one.firstAt.y} delta ${one.maxDelta} · tolerance honoured · size mismatch refused`);
}

// ── §3 refusals, by name ────────────────────────────────────────────────────────────────────────────
{
  const good = buf(SHOTS[2]);
  // Mutate an IHDR FIELD and REPAIR the chunk's CRC, so the field check is what fires — with a stale CRC the
  // integrity check would fire first and these arms would never reach the reader they are testing.
  const refuseField = (at, value, re, label) => {
    const bad = Buffer.from(good);
    bad[16 + at] = value;
    bad.writeUInt32BE(crc32(bad.subarray(12, 29)), 29);
    assert.throws(() => decodePng(bad), (e) => e instanceof PngRefusal && re.test(e.message), `${label} must be refused by name`);
  };
  assert.throws(() => decodePng(Buffer.from('not a png at all')), PngRefusal, 'a non-PNG is refused');
  refuseField(9, 3, /colour type 3/, 'a palette PNG');
  refuseField(8, 16, /bit depth 16/, 'a 16-bit PNG');
  refuseField(12, 1, /interlaced/, 'an interlaced PNG');
  assert.throws(() => decodePng(good.subarray(0, 40)), PngRefusal, 'a truncated file is refused');
  // A corrupted byte the CRC catches: refused, rather than decoded to plausible garbage and DIFFED against a
  // baseline (a wrong answer that looks like a real one).
  let idatAt = -1;
  for (let o = 8; o + 8 <= good.length; ) {
    const len = good.readUInt32BE(o);
    if (good.toString('ascii', o + 4, o + 8) === 'IDAT') { idatAt = o + 8; break; }
    o += 8 + len + 4;
  }
  assert.ok(idatAt > 0, 'the fixture has an IDAT chunk to corrupt');
  const corrupt = Buffer.from(good);
  corrupt[idatAt] ^= 0xff;
  assert.throws(() => decodePng(corrupt), (e) => e instanceof PngRefusal && /CRC mismatch in the IDAT/.test(e.message), 'a corrupted IDAT is refused by CRC');
  console.log('[§3] refused by name: non-PNG · palette · 16-bit · interlaced · truncated · corrupted IDAT (CRC)');
}

// ── §4 the wiring exists (a guarded arm, not a claim of a green comparison) ─────────────────────────
{
  const src = readFileSync('tools/harness/studio-golden-path.mjs', 'utf8');
  assert.ok(/from '\.\/png\.mjs'/.test(src) || /from "\.\/png\.mjs"/.test(src), 'the golden-path harness imports the png module');
  assert.ok(/decodePng\(/.test(src) && /diffPixels\(/.test(src), 'it decodes and diffs the capture');
  assert.ok(/baseline/i.test(src), 'it compares against a baseline');
  console.log('[§4] wiring: the golden-path harness imports, decodes and diffs against a baseline when one exists');
}

console.log('[png-baseline-proof] ALL SECTIONS PASSED');
