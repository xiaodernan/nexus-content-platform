// NEXUS — a ZERO-DEPENDENCY PNG decoder and pixel diff, so a harness screenshot can be COMPARED to a baseline.
// (The ADR entry for this increment is deferred; see the note at the top of `docs/evidence/studio/png-baseline-proof.mjs`.)
//
// `docs/KNOWN_ISSUES.md` has carried the same sentence since the harness existed: *"the harness does not yet
// compare screenshots against a baseline."* It CAPTURES PNGs (five are committed under `docs/evidence/`) and
// never looks at them again, so a visual regression is invisible to every gate in this repository. The missing
// half is not a browser — it is reading the bytes it already writes.
//
// Pure and DOM-free: `node:zlib` is the only import (built in), which keeps the harness's zero-dependency
// promise. It decodes the shapes a browser's `Page.captureScreenshot` actually produces — 8-bit RGB (colour
// type 2) and 8-bit RGBA (type 6), non-interlaced — and REFUSES everything else BY NAME rather than guessing
// (a palette or 16-bit image decoded as if it were RGB is a diff against the wrong pixels, which is worse
// than a refusal).
import { inflateSync } from 'node:zlib';

/** Every refusal carries what was actually found, so a caller can say why rather than "not a PNG". */
export class PngRefusal extends Error {
  constructor(message) {
    super(message);
    this.name = 'PngRefusal';
  }
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Paeth's predictor (PNG spec §9.4) — the only filter that needs three neighbours. */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Reverse one scanline's filter IN PLACE. `prior` is the previous unfiltered row (zeros for the first). */
function unfilter(type, line, prior, bpp) {
  const n = line.length;
  switch (type) {
    case 0: // None
      return;
    case 1: // Sub
      for (let i = bpp; i < n; i++) line[i] = (line[i] + line[i - bpp]) & 255;
      return;
    case 2: // Up
      for (let i = 0; i < n; i++) line[i] = (line[i] + prior[i]) & 255;
      return;
    case 3: // Average
      for (let i = 0; i < n; i++) {
        const a = i >= bpp ? line[i - bpp] : 0;
        line[i] = (line[i] + ((a + prior[i]) >> 1)) & 255;
      }
      return;
    case 4: // Paeth
      for (let i = 0; i < n; i++) {
        const a = i >= bpp ? line[i - bpp] : 0;
        const c = i >= bpp ? prior[i - bpp] : 0;
        line[i] = (line[i] + paeth(a, prior[i], c)) & 255;
      }
      return;
    default:
      throw new PngRefusal(`unknown scanline filter ${type} (the spec defines 0–4)`);
  }
}

/**
 * Decode a PNG into `{ width, height, channels, pixels }`, where `pixels` is RGBA (4 bytes per pixel) for
 * EVERY supported colour type — a diff should not care whether the file carried an alpha channel.
 */
export function decodePng(buf) {
  if (!Buffer.isBuffer(buf)) throw new PngRefusal('decodePng needs a Buffer');
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new PngRefusal('not a PNG (bad signature)');

  let ihdr = null;
  const idat = [];
  for (let off = 8; off + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (off + 8 + len + 4 > buf.length) throw new PngRefusal(`truncated ${type} chunk`);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 8 + len + 4;
  }
  if (!ihdr) throw new PngRefusal('no IHDR chunk');
  if (!ihdr.width || !ihdr.height) throw new PngRefusal(`empty image ${ihdr.width}x${ihdr.height}`);
  if (ihdr.bitDepth !== 8) throw new PngRefusal(`unsupported bit depth ${ihdr.bitDepth} (this decoder reads 8-bit)`);
  if (ihdr.interlace !== 0) throw new PngRefusal('interlaced PNG is not supported');
  const channels = ihdr.colorType === 2 ? 3 : ihdr.colorType === 6 ? 4 : 0;
  if (!channels) throw new PngRefusal(`unsupported colour type ${ihdr.colorType} (this decoder reads RGB type 2 and RGBA type 6)`);
  if (!idat.length) throw new PngRefusal('no IDAT chunk');

  const raw = inflateSync(Buffer.concat(idat));
  const stride = ihdr.width * channels;
  if (raw.length < (stride + 1) * ihdr.height) {
    throw new PngRefusal(`decompressed ${raw.length} bytes, need ${(stride + 1) * ihdr.height} for ${ihdr.width}x${ihdr.height}`);
  }

  const pixels = Buffer.alloc(ihdr.width * ihdr.height * 4);
  const prior = Buffer.alloc(stride);
  const line = Buffer.alloc(stride);
  for (let y = 0; y < ihdr.height; y++) {
    const base = y * (stride + 1);
    const filter = raw[base];
    raw.copy(line, 0, base + 1, base + 1 + stride);
    unfilter(filter, line, prior, channels);
    for (let x = 0; x < ihdr.width; x++) {
      const s = x * channels;
      const d = (y * ihdr.width + x) * 4;
      pixels[d] = line[s];
      pixels[d + 1] = line[s + 1];
      pixels[d + 2] = line[s + 2];
      pixels[d + 3] = channels === 4 ? line[s + 3] : 255;
    }
    line.copy(prior);
  }
  return { width: ihdr.width, height: ihdr.height, channels, pixels };
}

/**
 * Compare two DECODED images. `tolerance` is the per-channel delta a pixel may differ by and still count as
 * equal (0 = exact). Answers the count, the ratio, the largest delta seen, and the first pixel over the line —
 * so a red is actionable ("pixel 12,340 differs by 18") rather than "images differ".
 */
export function diffPixels(a, b, { tolerance = 0 } = {}) {
  if (!a || !b || !a.pixels || !b.pixels) throw new PngRefusal('diffPixels needs two decoded images');
  if (a.width !== b.width || a.height !== b.height) {
    throw new PngRefusal(`size mismatch: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  const total = a.width * a.height;
  let differing = 0;
  let maxDelta = 0;
  let firstAt = null;
  for (let i = 0; i < total; i++) {
    const d = i * 4;
    const delta = Math.max(
      Math.abs(a.pixels[d] - b.pixels[d]),
      Math.abs(a.pixels[d + 1] - b.pixels[d + 1]),
      Math.abs(a.pixels[d + 2] - b.pixels[d + 2]),
      Math.abs(a.pixels[d + 3] - b.pixels[d + 3]),
    );
    if (delta > maxDelta) maxDelta = delta;
    if (delta > tolerance) {
      differing += 1;
      if (firstAt === null) firstAt = { x: i % a.width, y: Math.floor(i / a.width), delta };
    }
  }
  return { total, differing, ratio: total ? differing / total : 0, maxDelta, firstAt };
}
