#!/usr/bin/env node
// NEXUS M2 v237 (docs/evidence) -- RECORD-ENCODING INTEGRITY: the writer model that explains every mojibake
// image this repository has carried, the flank rule that decides which look-alikes are NOT damage, and the
// pinned repair ledger at ref 420f910 (116 lines, 58 sites, 24 derived fixes) that the tree must satisfy.
// Run from the repository root, after nothing in particular (no build, no daemon):
//   node docs/evidence/agents/record-encoding-proof.mjs
//
// WHY A MODEL AND NOT A GREP. The record files are written through a channel that mis-announces an encoding:
// bytes encoded as UTF-8 are decoded as GBK (or the other way round), and a decoder that cannot read a byte
// pair does not stop -- it prints a replacement and MOVES ON, which means a damaged line can lose a character
// nobody deleted. Four mechanisms are declared below and nothing else is admitted:
//   M1  UTF-8 bytes read as GBK. A 3-byte punctuation char renders as one CJK char made from its first two
//       bytes, plus a second char made from its third byte PAIRED WITH THE FOLLOWING BYTE. When that pair is
//       not a legal GBK sequence the writer prints '?' and has already CONSUMED the follower -- so an em dash
//       followed by a space lands as two characters with the space eaten.
//   M2  GBK bytes read as UTF-8: one U+FFFD per byte that cannot start or continue a UTF-8 sequence, and an
//       ASCII trail byte that survives as itself.
//   M3  the lossy fold of M1: every non-ASCII output char replaced by U+FFFD, the ASCII '?' kept.
//   M4  in-place substitution of ONE codepoint by a C0 control: the control is written over a character, so
//       the line keeps its codepoint length while the character it carried disappears -- a CR over the 'r' of
//       a word reads as a control and a truncated word.
// M1's eaten follower is the reason a repair can be WRONG in a way a plain diff cannot see: replacing the
// image with its producer puts the glyph back and leaves the follower gone. 17 of the 24 fixes in the ledger
// are exactly that, and the seven others are M4 sites where a whole token was written for one substitution.
// Both classes were DERIVED, not typed: the follower that fills a GLUE site is chosen from the record's own
// habits by a channel ladder (ATTESTED token, then TWIN line, then a 20x CENSUS), and a site whose channels
// disagree is refused rather than guessed.
//
// WHY A FLANK RULE. A registered damage render can be an ordinary Chinese character: U+00B7 rendered through
// M1 is the glyph for "road", and this repository's proof banners are bilingual, so a scanner that charges
// the FORM alone calls legitimate lines damaged. The shipped rule charges a render site only when NEITHER
// tight neighbour (the nearest non-space within one space, because the writer may have eaten the space) is
// CJK; U+FFFD and C0 controls stay chargeable unconditionally. Section 3 runs that rule against both ends,
// because a 0-chargeable green is worth nothing unless the scanner demonstrably charges damage it is shown.
// sweep-budget-ms: 120000
// (measured on this box at 464 graded files: 11.6 s wall, so the declared budget is ~10x the run and the row
// cannot redden for being slow -- amendment 85's rule that a kill is a different verdict from a failure.)
// sweep-asks-repository: git rev-parse HEAD | git ls-files -z | git show <ref>:<path> -- all three reach the
// repository through the sh() wrapper below, whose program position holds a PARAMETER, so no call-site scan
// of these bytes can see a spawn of git; the pinned ref is read, never assumed, and the tree under test is
// read off disk.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const sw = await import(pathToFileURL(join(root, 'docs/evidence/agents/sweep.mjs')).href);

/** One child process, async only: the synchronous spawn API answers EBUSY on this box (amendment 86). */
const sh = (cmd, argv, cwd = root) => new Promise((res) => {
  const p = spawn(cmd, argv, { cwd, shell: false, windowsHide: true });
  const chunks = [];
  const errs = [];
  p.stdout.on('data', (d) => chunks.push(d));
  p.stderr.on('data', (d) => errs.push(d));
  p.on('close', (code) => res({ code, out: Buffer.concat(chunks).toString('utf8'), err: Buffer.concat(errs).toString('utf8') }));
});

const REF = '420f910';
const FF = String.fromCharCode(0xfffd);
const cps = (s) => [...s];
const G = (a) => a.join('');
const str = (a) => String.fromCodePoint(...a);
const code = (c) => (c === undefined ? -1 : c.codePointAt(0));
const isCtrl = (c) => c !== undefined && (code(c) < 0x20 || code(c) === 0x7f);
const sha16 = (s) => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex').slice(0, 16);

// -- S1 the writer model, as DATA, with its structural claims measured not quoted ---------------------
const ALPHA_CP = [0x2014, 0x2013, 0x2026, 0x00a7, 0x00b6, 0x00b7, 0x00d7, 0x00f7, 0x00b1, 0x00b0, 0x00ab,
  0x00bb, 0x00b9, 0x2192, 0x2190, 0x2122, 0x2022, 0x2018, 0x2019, 0x201c, 0x201d];
const ALPHA = ALPHA_CP.map((c) => str([c]));
const gbk = new TextDecoder('gbk');
const utf8dec = new TextDecoder('utf-8');
const g1 = (b) => { const d = gbk.decode(Buffer.from(b)); return d.length === 1 && !d.includes(FF) ? d : null; };
const GBK_BYTES = new Map();
for (let lead = 0x81; lead <= 0xfe; lead++) for (let trail = 0x40; trail <= 0xfe; trail++) {
  if (trail === 0x7f) continue;
  const d = gbk.decode(Buffer.from([lead, trail]));
  if (d.length === 1 && !d.includes(FF) && !GBK_BYTES.has(d)) GBK_BYTES.set(d, [lead, trail]);
}
/** M1 over a producer plus the text after it: the image the writer left, and how many FOLLOWING bytes it ate. */
function m1(to, tail) {
  const b = Buffer.from(to + tail, 'utf8');
  const toLen = Buffer.byteLength(to, 'utf8');
  let out = '', i = 0;
  while (i < toLen) {
    if (b[i] < 0x80) { out += String.fromCharCode(b[i]); i++; continue; }
    if (i + 1 >= b.length) { out += '?'; i++; break; }
    const d = g1(b.slice(i, i + 2));
    if (d) { out += d; i += 2; continue; }
    out += '?'; i += 2;
  }
  return { img: out, extra: Math.max(0, i - toLen) };
}
const fold = (img) => cps(img).map((c) => (code(c) < 0x80 ? c : FF)).join('');
/** M2 over a producer: its GBK bytes read as UTF-8, one U+FFFD per unreadable byte, ASCII kept. */
function m2(to) {
  let out = '';
  for (const c of cps(to)) {
    if (code(c) < 0x80) { out += c; continue; }
    const gb = GBK_BYTES.get(c);
    if (!gb) return null;
    for (const byte of gb) out += byte < 0x80 ? String.fromCharCode(byte) : FF;
  }
  return out;
}
function consumed(tail, extra) {
  if (!extra) return 0;
  let n = 0, acc = 0;
  for (const c of cps(tail)) { acc += Buffer.byteLength(c, 'utf8'); n++; if (acc >= extra) return n; }
  return n;
}
/** every mechanism's (image, codepoints-eaten-after-the-site) pair at a site whose ref text follows */
function mechanisms(to, tail, refFrom) {
  const out = [];
  const a = m1(to, tail);
  out.push(['M1', a.img, consumed(tail, a.extra)]);
  out.push(['M3', fold(a.img), consumed(tail, a.extra)]);
  const b = m2(to);
  if (b !== null) out.push(['M2', b, 0]);
  if (cps(to).length === 1 && isCtrl(refFrom[0])) out.push(['M4', refFrom[0], 0]);
  return out;
}
/** a mechanism FITS only when its image equals the recorded span EXACTLY -- a prefix match would leave ref
 *  characters unaccounted and shift every later site on the line, which is a defect dressed as a repair. */
const fitsAt = (to, tail, img0, refFrom) => mechanisms(to, tail, refFrom)
  .filter(([, img]) => img === img0).map(([mech, img, cn]) => ({ mech, img, cn }));

/** M1 and M2 over a WHOLE line. These are what the ledger's 81 LINE-mode rows are checked against: a line
 *  whose every damage span is adjacent, or whose producer cannot be located at a codepoint offset, is pinned
 *  as "this whole line, run through the writer" rather than as a list of sites, and the forward model is the
 *  only thing that can say whether the repaired bytes are that line's producer. */
function m1whole(line) {
  const b = Buffer.from(line, 'utf8');
  let s = '';
  for (let i = 0; i < b.length;) {
    if (b[i] < 0x80) { s += String.fromCharCode(b[i]); i++; continue; }
    if (i + 1 >= b.length) { s += '?'; i++; continue; }
    const d = g1(b.slice(i, i + 2));
    if (d) { s += d; i += 2; continue; }
    s += '?'; i += 2;
  }
  return s;
}
function m2whole(line) {
  const bytes = [];
  for (const c of cps(line)) {
    if (code(c) < 0x80) bytes.push(code(c));
    else if (GBK_BYTES.has(c)) bytes.push(...GBK_BYTES.get(c));
    else bytes.push(0x3f);
  }
  return utf8dec.decode(Buffer.from(bytes));
}
const GLUE_IMAGE = m1whole(str([0x2014, 0x20]));
assert.equal(GLUE_IMAGE, str([0x9225, 0x3f]), `S1 the whole-line M1 of an em dash that carried a space is two characters, ${'the recorded render of 17 of the 24 ledger fixes'} (${JSON.stringify(cps(GLUE_IMAGE).map((c) => c.codePointAt(0).toString(16)))})`);
assert.ok(!GLUE_IMAGE.includes(' '), 'S1 and no space survives it -- the follower was CONSUMED, which is why putting the dash back is not enough and the GLUE fixes append one');
assert.equal(m1whole('Measured 474 -> 483 files'), 'Measured 474 -> 483 files', 'S1 the model is the identity on an ASCII line, so a clean record has nothing to be charged with');
assert.equal(m2whole(str([0x8fd0])), FF + FF, 'S1 the whole-line M2 of a CJK char whose GBK bytes are not a UTF-8 sequence is one replacement per byte');

assert.equal(ALPHA.length, 21, 'S1 the declared alphabet is 21 punctuation characters, no more and no less');
assert.ok(ALPHA.every((c) => code(c) >= 0x80), 'S1 every alphabet character is non-ASCII, since ASCII bytes survive both decoders unchanged');
const THREE = ALPHA.filter((c) => Buffer.byteLength(c, 'utf8') === 3);
const TWO = ALPHA.filter((c) => Buffer.byteLength(c, 'utf8') === 2);
assert.equal(THREE.length + TWO.length, ALPHA.length, `S1 the alphabet splits into 3-byte and 2-byte UTF-8 characters and nothing else (${THREE.length} three-byte + ${TWO.length} two-byte)`);
const FOLLOWERS = [];
for (let c = 0x20; c <= 0x7f; c++) FOLLOWERS.push(c);
// The eaten set is measured over EVERY 3-byte producer and then required to be the whole ASCII range: the
// defect is a property of the mechanism, not of one character, and a repair can therefore never choose the
// lost follower from the damage alone.
const EATABLE = FOLLOWERS.filter((c) => THREE.every((ch) => m1(ch, String.fromCharCode(c)).extra > 0));
assert.deepEqual(EATABLE, FOLLOWERS, `S1 M1 eats EVERY ASCII follower after a 3-byte punctuation char -- all ${FOLLOWERS.length} bytes 0x20..0x7F, measured over all ${THREE.length} such characters, so space, digit, quote and letter are all mechanically possible and the mechanism cannot pick one`);
const QMARK = FOLLOWERS.filter((c) => THREE.every((ch) => m1(ch, String.fromCharCode(c)).img.endsWith('?')));
assert.deepEqual(QMARK, QMARK.filter((c) => (c >= 0x20 && c <= 0x3f) || c === 0x7f), `S1 what the eaten byte LEAVES BEHIND splits that set in two: the ${QMARK.length} followers that cannot be a GBK trail byte spell '?', and only those (${QMARK.map((c) => c.toString(16)).join(' ')})`);
assert.ok(!QMARK.includes(0x78), 'S1 a letter is not spelled as ?, it is silently rewritten as a plausible character -- which is why damage can read like prose');
assert.ok(TWO.every((ch) => m1(ch, 'x').extra === 0), 'S1 a 2-byte producer eats nothing, so the GLUE class belongs to 3-byte punctuation alone');
assert.equal(m1(str([0x00b7]), 'x').img, str([0x8def]), `S1 and a 2-byte middle dot before a letter renders as the character for ROAD (${JSON.stringify(str([0x8def]))}) -- the look-alike the flank rule exists to protect`);
const m2case = m2(str([0x00b7]));
assert.equal(cps(m2case).length, 2, 'S1 M2 renders a 2-byte GBK punctuation as one replacement character per byte');
assert.ok(cps(m2case).every((c) => c === FF), 'S1 and both of them are U+FFFD, since neither GBK byte may start a UTF-8 sequence');
const m4case = str([0x0061]);
assert.equal(cps(m4case).length, 1, 'S1 M4 preserves codepoint length: one control stands where one character was');
console.log(`[1] writer model: ${ALPHA.length} declared characters (${THREE.length} three-byte), ${GBK_BYTES.size} GBK lead/trail pairs, M1 eats all ${EATABLE.length} ASCII followers of which ${QMARK.length} spell '?' and the rest render as CJK`);

// the render registry, derived from the model rather than hand-listed: an image is a DAMAGE SPELLING only if
// some mechanism produces it from an alphabet character with one follower.
const RENDER = new Map();
const put = (r, intact) => {
  if (!r || r === intact || !cps(r).some((c) => code(c) >= 0x80)) return;
  if (!RENDER.has(r)) RENDER.set(r, []);
  if (!RENDER.get(r).includes(intact)) RENDER.get(r).push(intact);
};
for (const ch of ALPHA) {
  const bare = m1(ch, '').img;
  put(bare, ch);
  const m2bare = m2(ch);
  if (m2bare !== null && m2bare !== ch) put(m2bare, ch);
  for (let c = 0x20; c <= 0x7f; c++) {
    if (c === 0x3f) continue;
    const f = String.fromCharCode(c);
    const pair = m1(ch, f).img;
    if (pair && pair !== bare) put(pair, ch + f);
    const mb = m2(ch + f);
    if (mb !== null && mb !== m2bare && mb !== ch + f) put(mb, ch + f);
  }
}
const RENDERS = [...RENDER.keys()].sort((a, b) => cps(b).length - cps(a).length);
assert.ok(RENDERS.length >= 200, `S1 the registry must carry real weight to charge anything (measured ${RENDERS.length})`);
// A position can only begin a render whose FIRST codepoint it holds, so the registry is indexed by head
// character: the census of a whole tree then costs one lookup per character instead of a scan of
// RENDERS.length spellings at every position.
const HEADS = new Map();
for (const r of RENDERS) {
  const cs = cps(r);
  if (!HEADS.has(cs[0])) HEADS.set(cs[0], []);
  HEADS.get(cs[0]).push({ img: r, cs, len: cs.length });
}
for (const v of HEADS.values()) v.sort((a, b) => b.len - a.len);
assert.ok(HEADS.size > 1, `S1 the index must be an index, not one bucket for everything (${HEADS.size} head characters)`);

/** every damage span, left to right, longest registered render first, offsets counted in CODEPOINTS */
function spans(chars) {
  const out = [];
  let i = 0;
  while (i < chars.length) {
    const c = chars[i];
    if (code(c) <= 0x1f && c !== '\n') { out.push({ at: i, img: c, kind: 'control', len: 1 }); i++; continue; }
    if (c === FF) { let e = i; while (chars[e] === FF) e++; out.push({ at: i, img: chars.slice(i, e).join(''), kind: 'render', len: e - i }); i = e; continue; }
    const cands = HEADS.get(c);
    let hit = null;
    if (cands) for (const cand of cands) {
      if (cand.len > chars.length - i) continue;
      let ok = true;
      for (let k = 1; k < cand.len; k++) if (chars[i + k] !== cand.cs[k]) { ok = false; break; }
      if (ok) { hit = cand; break; }
    }
    if (hit) { out.push({ at: i, img: hit.img, kind: 'render', len: hit.len }); i += hit.len; continue; }
    i++;
  }
  return out;
}
const cls = (c) => (c === undefined || c === '' ? 'edge' : /\s/.test(c) ? 'space' : /[A-Za-z]/.test(c) ? 'alpha'
  : /[0-9]/.test(c) ? 'digit' : /[\u4e00-\u9fff]/.test(c) ? 'cjk' : 'punct');
const tightCls = (t, i, step) => {
  let j = i;
  if (j >= 0 && j < t.length && t[j] === ' ') j += step;
  return cls(t[j]);
};
const toChars = (x) => (Array.isArray(x) ? x : cps(String(x)));
/** the shipped charge rule: sites, then the flank rule */
function chargeable(line) {
  const chars = toChars(line);
  const out = [];
  for (const s of spans(chars)) {
    if (s.kind !== 'render') { out.push({ ...s, why: 'unconditional' }); continue; }
    const l = tightCls(chars, s.at - 1, -1);
    const r = tightCls(chars, s.at + s.len, +1);
    out.push({ ...s, why: l === 'cjk' || r === 'cjk' ? `REJECTED flanks ${l}|${r}` : `charged flanks ${l}|${r}` });
  }
  return out;
}
const isCharged = (s) => !s.why.startsWith('REJECTED');
const chargedLine = (line) => chargeable(line).some(isCharged);

// -- S2 the plane, the population, and the census the gate exists to keep at zero ---------------------
const head = (await sh('git', ['rev-parse', 'HEAD'])).out.trim();
const readers = await sw.planeReaders(root, () => sh('git', ['rev-parse', '--is-inside-work-tree']).then((r) => r.out));
const plane = sw.suppliedPlane(root);
console.log(`[0] plane ${plane} | supplied ${plane} | readers probe ${readers.probe} git ${readers.git} | ${readers.why} | HEAD ${head ? head.slice(0, 8) : 'unreadable'} graded against the pinned ref ${REF}`);
const onRef = (await sh('git', ['rev-parse', '--verify', `${REF}^{commit}`])).code === 0;

let tracked = null;
if (plane === 'GIT' && head) tracked = (await sh('git', ['ls-files', '-z'])).out.split('\0').filter(Boolean);
const isBinary = (b) => {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  let nul = 0;
  for (let i = 0; i < Math.min(b.length, 8192); i++) if (b[i] === 0) nul++;
  return nul > 0 ? 'NUL' : null;
};
const SELF = 'docs/evidence/agents/record-encoding-proof.mjs';
const names = tracked ?? (() => {
  // NO-GIT plane: the population has to come off the tree, so the walk names its own exclusions and the
  // floor below proves it read something.
  const skip = new Set(['.git', 'node_modules', 'dist', '.next', '.scratch', '.worktree-ai', '.workbuddy-ai']);
  const out = [];
  const walk = (d, rel) => {
    for (const e of readdirSync(join(root, d), { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const p = join(d, e.name), r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else if (e.isFile()) out.push(r);
    }
  };
  walk('.', '');
  return out;
})();
const graded = [];
let binaries = 0;
// The gate grades the tree, not the index: `git ls-files` cannot see a proof that has not been committed yet,
// so a row that trusted the index alone would be blind to its own first revision. SELF is added and disclosed.
const population = [...names];
if (!population.includes(SELF)) population.push(SELF);
assert.ok(population.includes(SELF), `S2 the gate must grade the tree that ships it -- ${SELF} is in the population it scans, so it can never be a hiding place`);
for (const rel of population) {
  let buf;
  try { buf = readFileSync(join(root, rel)); } catch { continue; }
  if (isBinary(buf)) { binaries++; continue; }
  graded.push({ rel, text: buf.toString('utf8') });
}
assert.ok(graded.length > 400, `S2 the graded population must be the whole tree, not a window (${graded.length} files, ${population.length} names, ${binaries} binary)`);
let chargeNow = 0, formNow = 0;
const rejected = [];
const charged = [];
for (const f of graded) {
  f.text.split(/\r?\n/).forEach((l, i) => {
    // ONE scan per line: chargeable() returns exactly one entry per registered form (the flank rule only
    // annotates, never drops), so the form-only denominator and the charged numerator come from it both.
    const sites = chargeable(cps(l));
    if (!sites.length) return;
    formNow++;
    for (const s of sites) if (!isCharged(s)) rejected.push({ rel: f.rel, line: i + 1, img: s.img, why: s.why });
    if (sites.some(isCharged)) { chargeNow++; charged.push(`${f.rel}:${i + 1}`); }
  });
}
assert.equal(chargeNow, 0, `S2 the tree must carry NO chargeable damage -- found ${chargeNow} line(s): ${charged.slice(0, 8).join(', ')}`);
assert.ok(rejected.length >= 5, `S2 the flank rule must still be SEEING look-alikes, not an empty scan (${rejected.length} rejected render sites) -- a 0 here means the registry stopped matching, which is a silent gate`);
console.log(`[2] population ${population.length} names / ${binaries} binary / ${graded.length} graded: chargeable lines ${chargeNow}, form-only hits ${formNow}, flank-rejected render sites ${rejected.length} in ${new Set(rejected.map((r) => r.rel)).size} file(s)`);

// -- S3 the rule runs against both ends: planted damage MUST be charged, a bilingual line must NOT be --
const dashLine = `Measured: Studio **474 ${str([0x2192])} 483** (31 files), three-runtime **531** -- 0 fail`;
assert.ok(!chargedLine(dashLine), 'S3 a clean control line carrying an intact arrow is not charged, so S2 does not charge the mere presence of punctuation');
const mangled = dashLine.replace(`${str([0x2192])} 4`, str([0x922B, 0x3f]) + '4');
assert.ok(mangled !== dashLine, 'S3 the planted damage must actually differ from the control');
assert.ok(chargedLine(mangled), 'S3 the planted M1 render (arrow plus an EATEN space) is charged -- this is the shape 17 of the 24 ledger fixes carry');
assert.ok(!chargeable(mangled).some((s) => s.why.startsWith('REJECTED')), 'S3 and it is charged as a render site, not rescued by the flank rule');
const bilingual = `// ${str([0x8def, 0x5f84])} path proof: the banner is bilingual and the glyph is the word for road`;
assert.ok(chargeable(bilingual).length >= 0, 'S3 the scan reaches the bilingual banner');
const road = str([0x8def]);
assert.ok(RENDER.has(road), `S3 ${'the glyph that M1 makes from U+00B7 must be in the registry, or the flank rule guards nothing'}`);
assert.ok(!chargedLine(bilingual), `S3 the bilingual line is NOT charged: the render's tight neighbours are CJK, which is what the flank rule exists for`);
const crPlant = `the ${str([0x0d])}e-measured answer`;
assert.ok(chargedLine(crPlant), 'S3 a C0 control inside a word is charged UNCONDITIONALLY (the flank rule cannot rescue it) -- the shape 7 of the 24 ledger fixes carry');
console.log(`[3] both ends of the rule measured: planted M1 render charged, planted CR charged, bilingual ${road} line rejected, clean control untouched`);

// -- S4 the pinned ledger: what the ref carried, what the record holds now, and the 24 derived fixes --
const FILES = [
  'apps/studio/src/lib/scene3dSurface.test.ts',
  'docs/decisions/0016-agent-runtime-hermetic-demo-loop.md',
  'docs/evidence/studio/README.md',
];
const LEDGER = [{"f":0,"l":23,"m":"L","rd":"c4bdd4d73c368af8","pd":"a221eec9fa7472df"},{"f":0,"l":27,"m":"L","rd":"18aa2b88ec28903d","pd":"f477cd9ad48984ac"},{"f":0,"l":75,"m":"S","rd":"cb6f6952c13e334f","pd":"b7b02de0d0be51bb","s":[{"a":20,"i":[37413,27290],"t":[8217,115]}]},{"f":0,"l":82,"m":"L","rd":"4cd49ff15115cefb","pd":"0c17b6478aa4e633"},{"f":0,"l":97,"m":"L","rd":"43ecc5839f4e5840","pd":"08b1af442ec1a6db"},{"f":0,"l":104,"m":"L","rd":"d15c6b9928eb12c4","pd":"48fc96652c56b18c"},{"f":0,"l":123,"m":"L","rd":"fcd89a83ecfb72e5","pd":"cfac67a514807670"},{"f":0,"l":124,"m":"L","rd":"a33612d6de0e34aa","pd":"d7dcfd2ff12c5ccc"},{"f":0,"l":134,"m":"L","rd":"ed1244aeec22f464","pd":"44fcf91d52283403"},{"f":0,"l":153,"m":"L","rd":"218e689790d0f42a","pd":"1602d6e9c8f17d68"},{"f":0,"l":168,"m":"L","rd":"c150b24ebf7788fe","pd":"13df2555e2d853d9"},{"f":0,"l":181,"m":"L","rd":"1b8e899930f2b24b","pd":"34338580171646ab"},{"f":0,"l":198,"m":"L","rd":"49a3e8c7f55a4734","pd":"b6ad5b18feddba08"},{"f":0,"l":200,"m":"L","rd":"fe09b7799d47776d","pd":"74934836acc78ae3"},{"f":0,"l":201,"m":"L","rd":"3f88639debef53f1","pd":"224aaa7959c0239a"},{"f":0,"l":223,"m":"L","rd":"bda66fff119373dd","pd":"d67ab8ec3b57bf98"},{"f":0,"l":237,"m":"L","rd":"65c92419980ccb03","pd":"8df61a09103a9b2b"},{"f":0,"l":239,"m":"L","rd":"bd4ab672bb2a01ea","pd":"745d5f26e9eb67be"},{"f":0,"l":240,"m":"L","rd":"cd443fc0f227a3f9","pd":"3af49ab5385b1ba5"},{"f":0,"l":271,"m":"L","rd":"d07bb72da199025c","pd":"66969d7770b79c9e"},{"f":0,"l":287,"m":"L","rd":"7d828ded11a84ec4","pd":"6b5ce23f33064829"},{"f":0,"l":288,"m":"L","rd":"6cafa701d8274c8e","pd":"20efc13f4bab54d7"},{"f":0,"l":290,"m":"L","rd":"55e8b8c817e18c01","pd":"5f0885427b61515d"},{"f":0,"l":313,"m":"L","rd":"b298ef1ebb696561","pd":"9692a044b11ce3a2"},{"f":0,"l":321,"m":"L","rd":"486e8b0f42ead516","pd":"101cf6284db0e15b"},{"f":0,"l":333,"m":"L","rd":"fb7fb6e8ed095fe1","pd":"211a0829620ada9e"},{"f":0,"l":335,"m":"L","rd":"0447776777e0abba","pd":"caaaa57003bf778f"},{"f":0,"l":358,"m":"L","rd":"f8042c9cbca58378","pd":"994ce380e3c63def"},{"f":0,"l":365,"m":"L","rd":"4839804d0125848f","pd":"d6e63e36ad8d6374"},{"f":0,"l":385,"m":"L","rd":"ff51262d53de41e9","pd":"d6c20f9dff18097e"},{"f":0,"l":387,"m":"L","rd":"4389b554c27c2c10","pd":"db731f2382d85b42"},{"f":0,"l":422,"m":"L","rd":"52a490fffdffa61d","pd":"4af21dd26b300708"},{"f":0,"l":428,"m":"L","rd":"234ceb8b10bb5c4c","pd":"dc410995849720aa"},{"f":0,"l":432,"m":"L","rd":"57b0e8881dfcea7f","pd":"6c5741a2044fa76c"},{"f":0,"l":436,"m":"L","rd":"ef9f462e464c462d","pd":"63294be8800f99a3"},{"f":0,"l":438,"m":"S","rd":"3a2dbbfde257cdf5","pd":"31ebc823a3375e38","s":[{"a":45,"i":[37413,27290],"t":[8217,115]},{"a":61,"i":[37413,63],"t":[8212],"x":[8212,32],"k":"GLUE","m":"M1","c":"ATTESTED"}]},{"f":0,"l":465,"m":"L","rd":"caae6c8e34988971","pd":"30a09d4ec987b2ce"},{"f":0,"l":469,"m":"L","rd":"24e0e15fc64a29e2","pd":"20055bfd3fcb8238"},{"f":0,"l":476,"m":"L","rd":"822924a6588f9b3a","pd":"053fab37778cd460"},{"f":0,"l":525,"m":"L","rd":"b0cc108dd1ba6a08","pd":"bbc7745cfa1d74a9"},{"f":0,"l":532,"m":"S","rd":"89e2d80cf31e0afd","pd":"410cdf52f093e86b","s":[{"a":93,"i":[37413,27290],"t":[8217,115]}]},{"f":0,"l":548,"m":"L","rd":"5c3a3a57c0e9bbd3","pd":"b4b4d81a4246b6af"},{"f":0,"l":557,"m":"S","rd":"83ac33fe5c022b8e","pd":"21e985857c0a8a44","s":[{"a":48,"i":[37413,27290],"t":[8217,115]},{"a":71,"i":[37413,27290],"t":[8217,115]}]},{"f":0,"l":604,"m":"L","rd":"a3cab64bfc3689db","pd":"3669b2d6878d12ce"},{"f":0,"l":616,"m":"L","rd":"68ecbcd4d5103f56","pd":"f4490ab389fbfa45"},{"f":0,"l":619,"m":"L","rd":"01b7d637b2eeed64","pd":"7d2519a01166545b"},{"f":0,"l":621,"m":"S","rd":"dc72fcbd62bcd8d5","pd":"03efb1807403991e","s":[{"a":56,"i":[37413,27290],"t":[8217,115]}]},{"f":0,"l":660,"m":"L","rd":"1e7e3eca3f76dac2","pd":"9fb6b4b1bbfe37c5"},{"f":0,"l":663,"m":"L","rd":"25ba3c7faefaa95b","pd":"58688e634a466006"},{"f":0,"l":670,"m":"L","rd":"8c44177dcd0c39db","pd":"b063234b777b8594"},{"f":0,"l":672,"m":"L","rd":"538c421a90c2fe1b","pd":"04d04aae925d3399"},{"f":0,"l":674,"m":"L","rd":"76ccdaf6e15d5177","pd":"cb699337ad46164f"},{"f":0,"l":716,"m":"L","rd":"4811be312c6a1ff7","pd":"fefde6e3b9307d4a"},{"f":0,"l":776,"m":"L","rd":"4e8210496fbd78ed","pd":"c7d9f4af2829f9ff"},{"f":0,"l":778,"m":"L","rd":"6622dde8aa72c8a9","pd":"160715b3bcb26506"},{"f":0,"l":781,"m":"L","rd":"ae212fc9962b3fcf","pd":"8a50eec4886c34d4"},{"f":0,"l":812,"m":"L","rd":"7249dcb79625773d","pd":"8fab56ff93754780"},{"f":0,"l":837,"m":"L","rd":"dfe7dc846a544383","pd":"899e55f18fb58e5d"},{"f":0,"l":862,"m":"L","rd":"dba95dc7c3ef39e5","pd":"43c5369d736b5d74"},{"f":0,"l":881,"m":"L","rd":"66a2449dfef0ddc7","pd":"99622a50de9d32f0"},{"f":0,"l":885,"m":"L","rd":"ff2a0d360986c858","pd":"75a8a586c7bcea1e"},{"f":0,"l":886,"m":"L","rd":"828524cc8e6979ae","pd":"f84e83693f36cfc9"},{"f":0,"l":917,"m":"L","rd":"3a18f4d5fc36da7b","pd":"818e94bebb0e602b"},{"f":0,"l":946,"m":"L","rd":"825b1c367d8400f3","pd":"72375502a8711877"},{"f":0,"l":962,"m":"L","rd":"74ac1745757e8d0c","pd":"ba1c561a61ee329f"},{"f":0,"l":986,"m":"L","rd":"dba95dc7c3ef39e5","pd":"43c5369d736b5d74"},{"f":0,"l":991,"m":"L","rd":"51f8ed01cd9c042c","pd":"9e82fe713cdfb49a"},{"f":0,"l":1017,"m":"L","rd":"807e5096a40b99e7","pd":"15b1a69e2d30a27a"},{"f":0,"l":1040,"m":"L","rd":"a88a4c66b00b4401","pd":"92c0524b6a2a0a96"},{"f":0,"l":1042,"m":"L","rd":"64789c0025be1120","pd":"83649ebfba8c79d5"},{"f":0,"l":1046,"m":"S","rd":"f88844b3f12d6d50","pd":"4a2294a747ecd7d3","s":[{"a":22,"i":[37413,63],"t":[8212],"x":[8212,32],"k":"GLUE","m":"M1","c":"ATTESTED"},{"a":74,"i":[37413,27290],"t":[8217,115]}]},{"f":0,"l":1077,"m":"S","rd":"4c40de53d8a74dee","pd":"9f855f81ec7e734b","s":[{"a":110,"i":[37413,27290],"t":[8217,115]}]},{"f":0,"l":1089,"m":"L","rd":"f844a784b3ab8820","pd":"137e2e3d4ddc49e9"},{"f":0,"l":1107,"m":"L","rd":"02e922dfd00e4d00","pd":"39a03b6cdd676b5e"},{"f":0,"l":1125,"m":"L","rd":"149d7145a5c43287","pd":"017254315a974fc1"},{"f":0,"l":1170,"m":"L","rd":"80a5afe4fd26334b","pd":"4a53ae35c09b673d"},{"f":0,"l":1175,"m":"L","rd":"c7603203c9de58f4","pd":"9a7fb3a5d8b0a1e3"},{"f":0,"l":1205,"m":"L","rd":"dc32696c09eebb05","pd":"cf1dcc1d9ac19649"},{"f":0,"l":1225,"m":"L","rd":"4fc42cd956d4fd30","pd":"f56b351d648231e6"},{"f":0,"l":1235,"m":"L","rd":"b28740b21c2cc95b","pd":"b58a63e32ec1e127"},{"f":0,"l":1246,"m":"S","rd":"8a917aa355888e3d","pd":"0f68b59ef6c3d17d","s":[{"a":22,"i":[37413,63],"t":[8212],"x":[8212,32],"k":"GLUE","m":"M1","c":"ATTESTED"},{"a":84,"i":[37413,27290],"t":[8217,115]}]},{"f":0,"l":1261,"m":"S","rd":"aec39f31cf81455f","pd":"2981f2d0e2325df7","s":[{"a":104,"i":[37413,27290],"t":[8217,115]}]},{"f":0,"l":1264,"m":"L","rd":"bfe209a4b1ac9cf7","pd":"c1155a81c335d905"},{"f":0,"l":1298,"m":"L","rd":"78716f1101a46833","pd":"1d046a6a1e17b14d"},{"f":0,"l":1328,"m":"L","rd":"5a0b3bcc32db7d2f","pd":"a9e76835a8e4f625"},{"f":0,"l":1389,"m":"L","rd":"a63907e43708bd48","pd":"f9bf2b60238a0acd"},{"f":0,"l":1435,"m":"S","rd":"5760696d5b9f18d6","pd":"84fa4db4e7727ed4","s":[{"a":23,"i":[37413,63],"t":[8212],"x":[8212,32],"k":"GLUE","m":"M1","c":"ATTESTED"},{"a":76,"i":[37413,27290],"t":[8217,115]}]},{"f":0,"l":1455,"m":"S","rd":"b305f5a90abb8c39","pd":"33c47f2ea41ece7c","s":[{"a":98,"i":[37413,27290],"t":[8217,115]}]},{"f":0,"l":1466,"m":"L","rd":"c2487066c5879ab6","pd":"c425856b2dffe1bd"},{"f":0,"l":1485,"m":"S","rd":"e1e2d5534580d665","pd":"bc501173a9fa450a","s":[{"a":66,"i":[37413,27290],"t":[8217,115]}]},{"f":0,"l":1487,"m":"L","rd":"71b4ad129a51ebea","pd":"19b5871a32b11517"},{"f":0,"l":1558,"m":"L","rd":"3e049337d72c8715","pd":"6facb06ed5573c6a"},{"f":0,"l":1561,"m":"L","rd":"edd095c0d86699f3","pd":"ada285259975fcb0"},{"f":1,"l":6042,"m":"S","rd":"bd72d3312817eb2e","pd":"2b165addb2bc12e4","s":[{"a":50,"i":[65533,65533],"t":[8212]}]},{"f":1,"l":6044,"m":"S","rd":"04d727e8b90bad41","pd":"e0c0622f7bede68e","s":[{"a":43,"i":[13],"t":[114,101,45,109,101,97,115,117,114,101,100],"x":[114],"k":"CONTROL","m":"M4","c":"bytes"},{"a":152,"i":[65533,65533],"t":[8212]},{"a":387,"i":[7],"t":[97,110,115,119,101,114,115],"x":[97],"k":"CONTROL","m":"M4","c":"bytes"}]},{"f":1,"l":6046,"m":"S","rd":"7cd93fcb11213161","pd":"d43dbbbbb8ea5c7f","s":[{"a":65,"i":[65533,65533],"t":[8212]},{"a":243,"i":[7],"t":[97,110,115,119,101,114,115,46,46,46],"x":[97],"k":"CONTROL","m":"M4","c":"bytes"}]},{"f":1,"l":6078,"m":"S","rd":"66f379f09b25c9b4","pd":"bf409247ac4d35e2","s":[{"a":43,"i":[65533,65533],"t":[8212]}]},{"f":1,"l":6080,"m":"S","rd":"02c00f30460d251e","pd":"424d557c34e5466e","s":[{"a":27,"i":[65533,65533],"t":[8212]},{"a":53,"i":[9],"t":[116,105,109,101,111,117,116,45,97,120,105,115,45,112,114,111,111,102,46,109,106,115],"x":[116],"k":"CONTROL","m":"M4","c":"bytes"},{"a":76,"i":[65533,65533],"t":[8212]},{"a":162,"i":[65533,67],"t":[8211]}]},{"f":1,"l":6082,"m":"S","rd":"2a83dad090283f5f","pd":"8e98def67e658013","s":[{"a":11,"i":[65533,65533],"t":[167]},{"a":50,"i":[65533,65533],"t":[8594]}]},{"f":1,"l":6083,"m":"S","rd":"940e32c33d76d981","pd":"073b3b88ec99dcce","s":[{"a":15,"i":[65533,65533],"t":[167]},{"a":90,"i":[9],"t":[116,97,98,108,101,45,114,101,99,111,117,110,116,45,112,114,111,111,102,46,109,106,115],"x":[116],"k":"CONTROL","m":"M4","c":"bytes"}]},{"f":1,"l":6084,"m":"S","rd":"103d457dd6374e44","pd":"bacfe4c77808b3df","s":[{"a":89,"i":[7],"t":[97,110,115,119,101,114,115],"x":[97],"k":"CONTROL","m":"M4","c":"bytes"}]},{"f":1,"l":6087,"m":"S","rd":"d8e18cad2343e263","pd":"f1b3b3750213aac8","s":[{"a":41,"i":[65533,65533],"t":[183]},{"a":53,"i":[65533,65533],"t":[183]},{"a":65,"i":[65533,65533],"t":[183]},{"a":94,"i":[65533,65533],"t":[183]},{"a":107,"i":[65533,65533],"t":[183]},{"a":119,"i":[65533,65533],"t":[183]},{"a":198,"i":[0],"t":[48,49,100,98,52,49,99,102,102,101,97,98,48,99,53,49],"x":[48],"k":"CONTROL","m":"M4","c":"bytes"}]},{"f":1,"l":6095,"m":"S","rd":"8c075aec0b18e460","pd":"1d7610d9890da812","s":[{"a":71,"i":[65533,63],"t":[8594],"x":[8594,32],"k":"GLUE","m":"M3","c":"ATTESTED"}]},{"f":1,"l":6099,"m":"S","rd":"d64460f77d1fd647","pd":"dceef5ac20cd0855","s":[{"a":68,"i":[65533,63],"t":[8230],"x":[8230,32],"k":"GLUE","m":"M3","c":"ATTESTED"}]},{"f":1,"l":6110,"m":"S","rd":"749fdb380309749d","pd":"3fe38b49c743645e","s":[{"a":62,"i":[65533,63],"t":[8212],"x":[8212,32],"k":"GLUE","m":"M3","c":"ATTESTED"}]},{"f":1,"l":6114,"m":"S","rd":"649a78e79f2a5cbb","pd":"37e21388fa4727bc","s":[{"a":68,"i":[65533,63],"t":[8212],"x":[8212,32],"k":"GLUE","m":"M3","c":"ATTESTED"}]},{"f":2,"l":1908,"m":"S","rd":"b9aedf2eb2bccf56","pd":"ad80212fca8ee127","s":[{"a":8,"i":[37413,63],"t":[8212],"x":[8212,32],"k":"GLUE","m":"M1","c":"ATTESTED"}]},{"f":2,"l":1910,"m":"S","rd":"e784c58736ea65c2","pd":"e98c01843f025f67","s":[{"a":91,"i":[37413,63],"t":[8212],"x":[8212,32],"k":"GLUE","m":"M1","c":"ATTESTED"}]},{"f":2,"l":1918,"m":"S","rd":"ddcd5f54f2ea22b9","pd":"c085705035c36cfc","s":[{"a":28,"i":[37413,63],"t":[8212],"x":[8212,32],"k":"GLUE","m":"M1","c":"CENSUS-FILE"}]},{"f":2,"l":1919,"m":"S","rd":"84637f841ef011e1","pd":"37eb086e55beb3a1","s":[{"a":2,"i":[37413,63],"t":[8212],"x":[8212,32],"k":"GLUE","m":"M1","c":"ATTESTED"}]},{"f":2,"l":1931,"m":"S","rd":"4ece8e92177e02e9","pd":"fbe3ffcbf598199e","s":[{"a":65,"i":[37413,63],"t":[8212],"x":[8212,32],"k":"GLUE","m":"M1","c":"ATTESTED"}]},{"f":2,"l":1938,"m":"S","rd":"fda03dba7251cf72","pd":"19e9b486bb57db44","s":[{"a":100,"i":[37413,63],"t":[8212],"x":[8212,32],"k":"GLUE","m":"M1","c":"ATTESTED"}]},{"f":2,"l":1943,"m":"S","rd":"87025fcf7bb2a809","pd":"bd3e78fd08aebe1e","s":[{"a":208,"i":[36335],"t":[183]},{"a":249,"i":[36335],"t":[183]}]},{"f":2,"l":1944,"m":"S","rd":"63cd4f3eb194b2c9","pd":"33834021244b461f","s":[{"a":75,"i":[36335],"t":[183]},{"a":122,"i":[36335],"t":[183]},{"a":182,"i":[36335],"t":[183]}]},{"f":2,"l":1948,"m":"S","rd":"bec2898202971527","pd":"cb21da55d59137c9","s":[{"a":51,"i":[37413,63],"t":[8212],"x":[8212,32],"k":"GLUE","m":"M1","c":"ATTESTED"}]},{"f":2,"l":1950,"m":"S","rd":"b086f49d1971f3d5","pd":"9b960b4b6c37b86b","s":[{"a":23,"i":[37419,63],"t":[8594],"x":[8594,32],"k":"GLUE","m":"M1","c":"ATTESTED"},{"a":63,"i":[37419,63],"t":[8594],"x":[8594,32],"k":"GLUE","m":"M1","c":"ATTESTED"}]}];
const partition = (s) => {
  const out = []; let i = 0;
  while (i < s.length) {
    const nl = s.indexOf('\n', i);
    if (nl === -1) { out.push(s.slice(i)); break; }
    out.push(nl > i && s[nl - 1] === '\r' ? s.slice(i, nl - 1) : s.slice(i, nl));
    i = nl + 1;
  }
  return out;
};
const treeLines = {}, refLines = {};
for (const rel of FILES) treeLines[rel] = partition(readFileSync(join(root, rel), 'utf8'));
for (const rel of FILES) {
  const r = await sh('git', ['show', `${REF}:${rel}`]);
  refLines[rel] = r.code === 0 ? partition(r.out) : null;
}
// The ledger keys a line by its BYTES, because a growing record moves its line numbers -- but bytes REPEAT.
// Measured here: scene3dSurface.test.ts carries the same comment twice, it was damaged identically at the ref
// and repaired identically, so a digest is a MULTISET key rather than a unique one and an "exactly once" claim
// would be a bug in the gate, not in the tree. Rows are therefore paired with the tree's occurrences
// one-for-one, preferring the position the measurement recorded, and a row that cannot claim a copy goes red.
const occurrences = {};
for (const rel of FILES) {
  const m = new Map();
  treeLines[rel].forEach((l, i) => { const d = sha16(l); const a = m.get(d); if (a) a.push(i + 1); else m.set(d, [i + 1]); });
  occurrences[rel] = m;
}
const groups = new Map();
for (const row of LEDGER) { const k = `${FILES[row.f]}|${row.pd}`; const a = groups.get(k); if (a) a.push(row); else groups.set(k, [row]); }
let dupGroups = 0, maxDup = 1;
const claimed = new Set();
for (const [k, rows] of groups) {
  const rel = k.slice(0, k.lastIndexOf('|'));
  const pool = occurrences[rel].get(rows[0].pd) ?? [];
  assert.equal(pool.length, rows.length, `S4 the ${rows.length} ledger row(s) keyed by repaired digest ${rows[0].pd} in ${rel} must pair with exactly that many tree lines (${pool.length} found at ${pool.join(', ') || 'nothing'}) -- the ledger is a MULTISET over line bytes and a missing pair is a repaired line the record no longer holds`);
  if (rows.length > 1) { dupGroups++; maxDup = Math.max(maxDup, rows.length); }
  const free = [...pool];
  for (const row of rows) {
    let at = free.indexOf(row.l);
    if (at === -1) at = 0;
    row._now = free.splice(at, 1)[0];
    assert.ok(!claimed.has(`${rel}:${row._now}`), `S4 two ledger rows paired onto the single tree line ${rel}:${row._now}`);
    claimed.add(`${rel}:${row._now}`);
  }
}
const perFile = {};
let rowsFound = 0, rowsAtPosition = 0, siteTotal = 0, fixTotal = 0, glueTotal = 0, ctrlTotal = 0;
for (const row of LEDGER) {
  const rel = FILES[row.f];
  perFile[rel] = (perFile[rel] || 0) + 1;
  rowsFound++;
  if (row._now === row.l) rowsAtPosition++;
  assert.ok(!chargedLine(treeLines[rel][row._now - 1]), `S4 ${rel}:${row._now} still carries chargeable damage after the repair`);
  for (const s of row.s || []) {
    siteTotal++;
    if (s.x) {
      fixTotal++;
      if (s.k === 'GLUE') glueTotal++;
      else if (s.k === 'CONTROL') ctrlTotal++;
      else throw new Error(`S4 site kind ${s.k} is neither GLUE nor CONTROL -- the ledger carries an undeclared repair class`);
      assert.ok(s.c, `S4 the ${s.k} fix at ${rel}:${row.l} cp${s.a} names no deciding channel`);
    }
  }
}
assert.equal(LEDGER.length, 116, 'S4 the ledger is the 116 lines the flank rule charged at the pinned ref');
assert.equal(claimed.size, 116, `S4 and 116 rows must claim 116 DISTINCT tree lines (${claimed.size} claimed)`);
assert.deepEqual(perFile, { [FILES[0]]: 93, [FILES[1]]: 13, [FILES[2]]: 10 }, `S4 the per-file split of the ledger is 93 / 13 / 10, measured and pinned (${JSON.stringify(perFile)})`);
assert.equal(glueTotal, 17, `S4 17 fixes are GLUE sites -- the writer ate a follower the producer dropped (${glueTotal})`);
assert.equal(ctrlTotal, 7, `S4 7 fixes are CONTROL sites -- a whole token was written where M4 substituted one codepoint (${ctrlTotal})`);
assert.equal(glueTotal + ctrlTotal, 24, `S4 and together they are the 24 derived fixes (${fixTotal})`);
assert.equal(siteTotal, 58, `S4 the ledger carries 58 damage sites over its 35 SPAN rows (${siteTotal})`);
console.log(`[4a] tree side of the ledger: ${rowsFound}/116 rows paired one-for-one onto ${claimed.size} distinct tree lines (${dupGroups} digest(s) shared by more than one row, widest ${maxDup}), ${rowsAtPosition} still at the line number the measurement recorded, ${siteTotal} sites, 0 chargeable`);

if (onRef && refLines[FILES[0]]) {
  let refCharge = 0, walkOk = 0, producerFails = 0, glueEaten = 0, mechSeen = new Set();
  const lineFail = [];
  for (const row of LEDGER) {
    const rel = FILES[row.f];
    const D = refLines[rel][row.l - 1];
    assert.equal(sha16(D), row.rd, `S4b ${rel}:${row.l} is not the line the ledger pinned at ${REF} (${sha16(D)} vs ${row.rd})`);
    if (chargedLine(D)) refCharge++;
    if (row.m === 'L') {
      const NOW = treeLines[rel][row._now - 1];
      if (!(m1whole(NOW) === D || m2whole(NOW) === D)) lineFail.push(`${rel}:${row.l} (tree ${row._now}) LINE-mode whole-line model: ${JSON.stringify([m1whole(NOW).slice(0, 40), m2whole(NOW).slice(0, 40), D.slice(0, 40)])}`);
      else walkOk++;
      continue;
    }
    const N = cps(treeLines[rel][row._now - 1]);
    const Dc = cps(D);
    let cR = 0, cD = 0, bad = null, j;
    const sites = [...row.s].sort((a, b) => a.a - b.a);
    for (j = 0; j < sites.length; j++) {
      const s = sites[j];
      const fixed = s.x ? str(s.x) : str(s.t);
      const img = str(s.i);
      const rstart = cR + (s.a - cD);
      if (G(N.slice(rstart, rstart + cps(fixed).length)) !== fixed) { bad = `cp${s.a} ${'the repaired producer is not at the lockstep offset'}`; break; }
      const nextAt = j + 1 < sites.length ? sites[j + 1].a : Dc.length;
      const gapRef = G(Dc.slice(s.a + cps(img).length, nextAt));
      const tail = G(N.slice(rstart + cps(fixed).length));
      const w = fitsAt(fixed, tail, img, G(Dc.slice(s.a))).find((f) => G(N.slice(rstart + cps(fixed).length + f.cn, rstart + cps(fixed).length + f.cn + gapRef.length)) === gapRef);
      if (!w) { bad = `cp${s.a} no declared mechanism reproduces ${'the recorded image with the following text aligned'}`; break; }
      mechSeen.add(w.mech);
      if (s.x) {
        // What does the UNFIXED producer explain at the ref? Measured over the 24 fixed sites: 19 explain
        // nothing at all, and the remaining 5 -- all GLUE -- reproduce the image ONLY by consuming exactly the
        // character the fix supplies. None is free, which is the whole point: a repair never restates a
        // character the writer left in place.
        const glueCp = cps(str(s.x)).length - cps(str(s.t)).length;
        const aloneAll = fitsAt(str(s.t), tail, img, G(Dc.slice(s.a)));
        const alone = aloneAll.find((f) => G(N.slice(rstart + cps(str(s.t)).length + f.cn, rstart + cps(str(s.t)).length + f.cn + gapRef.length)) === gapRef);
        if (!alone) producerFails++;
        else if (glueCp > 0 && alone.cn === glueCp) glueEaten++;
        else { bad = `cp${s.a} the UNFIXED producer already explains the site with nothing supplied (${alone.mech} consumes ${alone.cn}, the fix adds ${glueCp}) -- the ledger claims a repair where none was needed`; break; }
      }
      cR = rstart + cps(fixed).length + w.cn;
      cD = s.a + cps(img).length;
    }
    if (!bad && G(N.slice(cR)) !== G(Dc.slice(cD))) bad = `${'the tail after the last site differs from the ref'}`;
    if (bad) { lineFail.push(`${rel}:${row.l} ${bad}`); continue; }
    walkOk++;
  }
  assert.equal(refCharge, 116, `S4b every one of the 116 ledger lines is CHARGEABLE at ${REF} -- the damage existed and the rule sees it (${refCharge})`);
  assert.deepEqual(lineFail, [], `S4b the walk over ${REF} -> tree must reproduce every site image-exactly (${lineFail.length} failure(s): ${lineFail.slice(0, 4).join(' | ')})`);
  assert.equal(walkOk, 116, `S4b 116 lines walked (${walkOk})`);
  assert.equal(producerFails + glueEaten, 24, `S4b and all 24 fixed sites are answered: the unfixed producer explains the ref NOWHERE (${producerFails}) or only by eating the character the fix supplies (${glueEaten}) -- a repair never restates what the writer left in place`);
  assert.equal(producerFails, 19, `S4b 19 producers are refuted outright, none of their four mechanism images matching the recorded span (${producerFails})`);
  assert.equal(glueEaten, 5, `S4b and 5 GLUE producers fit only with a consumption equal to the glue they lack (${glueEaten}) -- measured, not assumed: a repair that is free would be a row that did not need making`);
  console.log(`[4b] ref side: ${refCharge}/116 lines chargeable at ${REF}, ${walkOk}/116 sites reproduced image-exactly by ${[...mechSeen].sort().join('/')}, ${producerFails}/24 producers refuted outright + ${glueEaten}/24 refuted only after giving back their eaten follower`);
} else {
  console.log(`[4b] ref side: UNGRADED -- plane ${plane} cannot read ${REF}; the 116-line ledger was pinned there and the tree side above is the half this plane can answer`);
}

// -- S5 the shape the ledger door reads: a v-heading needs the dash and a space after it --------------
const readme = treeLines[FILES[2]];
const vHead = readme.filter((l) => /^## v\d+/.test(l));
const dashForm = vHead.filter((l) => /^## v\d+ \u2014 \S/.test(l));
const v227 = readme.filter((l) => /^## v227/.test(l));
assert.equal(v227.length, 1, `S5 the v227 heading is one line of the record (${v227.length})`);
assert.ok(/^## v227 \u2014 \S/.test(v227[0]), `S5 and it carries the dash-space separator the ledger's title reader requires -- measured: ${JSON.stringify(v227[0].slice(0, 24))}`);
if (onRef && refLines[FILES[2]]) {
  const refV227 = refLines[FILES[2]].filter((l) => /^## v227/.test(l));
  assert.equal(refV227.length, 1, `S5 ${REF} carries one v227 heading (${refV227.length})`);
  assert.ok(LEDGER.some((r) => r.f === 2 && r.rd === sha16(refV227[0])), `S5 and that heading is IN the ledger -- the record's shape claim is graded by the same 116-line pin, not by a separate hand-picked example (${sha16(refV227[0])})`);
  assert.ok(!/^## v\d+ \u2014 \S/.test(refV227[0]), `S5 at ${REF} the same heading had NO dash-space separator (the space was the eaten follower) -- the GLUE fix is what restored the shape the door reads: ${JSON.stringify(refV227[0].slice(0, 28))}`);
}
console.log(`[5] README headings: ${vHead.length} of shape ## vN, ${dashForm.length} of them with the ## vN - title separator the ledger door titles itself from`);

// -- S6 what this file claims about itself ----------------------------------------------------------
const selfBytes = readFileSync(join(root, SELF));
assert.ok(!/[^\x00-\x7f]/.test(selfBytes.toString('utf8')), 'S6 the gate is ASCII-only in its own bytes, so it can never add a chargeable line to the census it runs -- every non-ASCII character it names is written as an escape');
const selfLines = partition(selfBytes.toString('utf8'));
const selfCharged = selfLines.filter((l) => chargedLine(l));
assert.deepEqual(selfCharged, [], `S6 the gate scans clean LINE BY LINE (${selfCharged.length} chargeable of ${selfLines.length} lines: ${selfCharged.slice(0, 2).map((l) => JSON.stringify(l.slice(0, 60))).join(' | ')})`);
assert.ok(rowBudgetHere().budgetSource === 'declared', 'S6 the row declares its own budget rather than inheriting a default it will exceed');
function rowBudgetHere() {
  return sw.rowBudget(selfBytes.toString('utf8'));
}
console.log(`[6] self: ${selfBytes.length} bytes, ASCII, budget ${rowBudgetHere().budgetMs} ms declared from the row's own first-column comment`);
console.log(`OK record-encoding: writer model ${ALPHA.length} chars / ${RENDERS.length} render spellings, 0 chargeable lines over ${graded.length} graded files, ${rejected.length} flank-rejected look-alikes, ledger 116 lines (93/13/10) with ${glueTotal} GLUE + ${ctrlTotal} CONTROL derived fixes, plane ${plane}`);
