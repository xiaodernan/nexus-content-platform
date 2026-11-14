#!/usr/bin/env node
// NEXUS M2 v596 (tools/ci) -- RECORD REPAIR, ADR 0016 amendment 549: the writer model that
// docs/evidence/agents/record-encoding-proof.mjs grades the tree with, pointed the other way. That row
// answers "is this record damaged"; this tool answers "what did the author type", and the difference is
// where the honesty has to live: a repair that puts back a plausible glyph is a SECOND defect a plain
// diff cannot see, because the channel that damaged the file also CONSUMED a character behind it.
//
// WHY THE MODEL IS COPIED AND NOT RE-INVENTED. Four mechanisms damage these records (M1 UTF-8 read as
// GBK, M2 GBK read as UTF-8, M3 the lossy fold of M1, M4 one control substituted in place) and the shipped
// row declares them, their alphabet and their charge rule. Every model block below is a BYTE COPY of that
// row's declaration -- same names, same bodies, same alphabet, same 0x7F skip in the GBK table -- and
// docs/evidence/agents/record-repair-proof.mjs S1 extracts the declarations from BOTH files, refuses the
// two texts differing, and then runs both charge rules over a corpus and refuses a disagreement in either
// direction. A repairer that charges a line the grader would spare edits prose nobody flagged; a repairer
// that spares a line the grader charges leaves the row red for a reason nobody can read off the diff.
//
// WHY A CHANNEL LADDER AND A REFUSAL. At most sites the image does NOT identify what produced it: the
// two-byte renders (a section sign, a middle dot) are exact, but a three-byte punctuation char renders
// the SAME two characters whether it was an em dash, an en dash, a horizontal ellipsis or one of four
// quotation marks, and it eats whichever ASCII byte followed it -- all 96 of them, measured, so the
// damage cannot say whether the follower was a space, a digit or a letter. Three channels decide, and
// the site is REFUSED when none agrees:
//   UNIQUE    the render registry carries one producer              -- exact, nothing to decide
//   SPACED    the file's own attested ' GLYPH ' habit              -- decides the glyph AND the space,
//             but only at a site whose own left neighbour IS that space. A census is a witness about the
//             sites that match the habit, and a digit-flanked range is not one of them (measured at v596:
//             docs/KNOWN_ISSUES.md's "Amendments 2<en dash>3" damaged its follower byte and the old SPACED
//             channel restored the file's dominant "em dash + space" there -- a plausible character that
//             no byte in the record supports, which is a second defect a plain diff cannot see)
//   FOLLOWER  the distribution of what this file follows the glyph with, when the spaced habit is thin
// Below the agreement floor (0.8) or below 20 attestations, the tool declines the site, reports why,
// and writes NOTHING for the whole file: a half-repaired record is the worst of the three outcomes.
//
// WHY THE LOOP RUNS TO A FIXED POINT. The charge rule spares a render sitting inside real Chinese (the
// flank rule: a registered render can BE a legitimate character and these records are bilingual), so a
// damaged dash in front of a damaged section sign looks sheltered by the sign and is not charged until
// the sign behind it is repaired. Measured at v596: 79 sites, then 1, then 0. One pass is therefore not a
// complete repair, and a tool that stopped after pass one would leave the row red by stealth.
//
// Run from the repository root:
//   node tools/ci/record-encoding-repair.mjs --check          # what the tree carries now
//   node tools/ci/record-encoding-repair.mjs --plan [paths]   # every decision, with its channel
//   node tools/ci/record-encoding-repair.mjs --write [paths]  # repair to a fixed point
// This is a TOOL, not a row: the row that grades these bytes is docs/evidence/agents/record-repair-proof.mjs
// and that row carries the sweep-budget-ms marker.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export const FF = String.fromCharCode(0xfffd);
const cps = (s) => [...s];
const str = (a) => String.fromCodePoint(...a);
const code = (c) => (c === undefined ? -1 : c.codePointAt(0));
const gbk = new TextDecoder('gbk');
const utf8dec = new TextDecoder('utf-8');
const g1 = (b) => { const d = gbk.decode(Buffer.from(b)); return d.length === 1 && !d.includes(FF) ? d : null; };

// The alphabet the shipped row declares, in the row's order; proof S1 pins both the list and the order.
export const ALPHA_CP = [0x2014, 0x2013, 0x2026, 0x00a7, 0x00b6, 0x00b7, 0x00d7, 0x00f7, 0x00b1, 0x00b0, 0x00ab,
  0x00bb, 0x00b9, 0x2192, 0x2190, 0x2122, 0x2022, 0x2018, 0x2019, 0x201c, 0x201d];
export const ALPHA = ALPHA_CP.map((c) => str([c]));
export const GBK_BYTES = new Map();
for (let lead = 0x81; lead <= 0xfe; lead++) for (let trail = 0x40; trail <= 0xfe; trail++) {
  if (trail === 0x7f) continue;
  const d = gbk.decode(Buffer.from([lead, trail]));
  if (d.length === 1 && !d.includes(FF) && !GBK_BYTES.has(d)) GBK_BYTES.set(d, [lead, trail]);
}
export const GBK_PAIRS = GBK_BYTES.size;

/** M1: a producer's UTF-8 bytes decoded as GBK. `extra` is how many BYTES past the producer the decoder
 *  consumed -- the follower that no diff shows missing. */
export function m1(to, tail) {
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
/** M2: a producer's GBK bytes read as UTF-8, one replacement per unreadable byte, ASCII kept. */
export function m2(to) {
  let out = '';
  for (const c of cps(to)) {
    if (code(c) < 0x80) { out += c; continue; }
    const gb = GBK_BYTES.get(c);
    if (!gb) return null;
    for (const byte of gb) out += byte < 0x80 ? String.fromCharCode(byte) : FF;
  }
  return out;
}
/** M1 and M2 over a WHOLE LINE -- the forms the proof plants damage with, copied from the row */
export function m1whole(line) {
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
export function m2whole(line) {
  const bytes = [];
  for (const c of cps(line)) {
    if (code(c) < 0x80) bytes.push(code(c));
    else if (GBK_BYTES.has(c)) bytes.push(...GBK_BYTES.get(c));
    else bytes.push(0x3f);
  }
  return utf8dec.decode(Buffer.from(bytes));
}

// The render registry, derived from the model exactly as the row derives its own: an image is a DAMAGE
// SPELLING only if some mechanism produces it from an alphabet character, with or without one follower.
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
export const REGISTRY_SIZE = RENDER.size;
const RENDERS = [...RENDER.keys()].sort((a, b) => cps(b).length - cps(a).length);
const HEADS = new Map();
for (const r of RENDERS) {
  const cs = cps(r);
  if (!HEADS.has(cs[0])) HEADS.set(cs[0], []);
  HEADS.get(cs[0]).push({ img: r, cs, len: cs.length });
}
for (const v of HEADS.values()) v.sort((a, b) => b.len - a.len);

/** every damage span, left to right, longest registered render first, offsets counted in CODEPOINTS */
export function spans(chars) {
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
/** the shipped charge rule: sites, then the flank rule -- with the producers the ladder reads appended */
export function chargeable(line) {
  const chars = toChars(line);
  const out = [];
  for (const s of spans(chars)) {
    if (s.kind !== 'render') { out.push({ ...s, why: 'unconditional', producers: [] }); continue; }
    const l = tightCls(chars, s.at - 1, -1);
    const r = tightCls(chars, s.at + s.len, +1);
    out.push({ ...s, why: l === 'cjk' || r === 'cjk' ? `REJECTED flanks ${l}|${r}` : `charged flanks ${l}|${r}`, producers: RENDER.get(s.img) ?? [] });
  }
  return out;
}
export const isCharged = (s) => !s.why.startsWith('REJECTED');
export const chargedSites = (line) => chargeable(line).filter(isCharged);

const ESC = (s) => s.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
const countIn = (text, needle) => (text.match(new RegExp(ESC(needle), 'g')) || []).length;
/** which ASCII followers does this glyph CONSUME at this image -- the set the damage cannot choose from */
export function consumedFollowers(glyph, img) {
  const out = [];
  for (let c = 0x20; c <= 0x7f; c++) {
    if (c === 0x3f) continue;
    const f = String.fromCharCode(c);
    const r = m1(glyph, f);
    if (r.extra > 0 && r.img === img) out.push(f);
  }
  return out;
}
function followerCensus(text, glyph) {
  const dist = new Map();
  let from = 0;
  while ((from = text.indexOf(glyph, from)) !== -1) {
    const after = cps(text.slice(from))[1];
    from += glyph.length;
    if (after === undefined) continue;
    const key = after === ' ' ? 'SPACE' : /[0-9]/.test(after) ? 'DIGIT' : /[A-Za-z]/.test(after) ? 'LETTER'
      : after === '\n' ? 'EOL' : `OTHER:${after}`;
    dist.set(key, (dist.get(key) || 0) + 1);
  }
  const total = [...dist.values()].reduce((a, b) => a + b, 0);
  const sorted = [...dist.entries()].sort((a, b) => b[1] - a[1]);
  return { total, mode: sorted[0]?.[0] ?? null, share: sorted[0] ? sorted[0][1] / total : 0, sorted };
}

export const FLOOR = 0.8;
export const ATTESTATIONS = 20;

/** every decision one pass would make over one text: `edits` carry their channel, `refused` carry their reason */
export function planText(text, { floor = FLOOR, attestations = ATTESTATIONS } = {}) {
  const edits = [], refused = [];
  const lines = text.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const sites = chargedSites(lines[li]);
    if (!sites.length) continue;
    const chars = cps(lines[li]);
    for (const s of [...sites].sort((a, b) => b.at - a.at)) {
      const tag = `line ${li + 1} @${s.at} ${JSON.stringify(s.img)}`;
      if (s.kind !== 'render') { refused.push(`${tag} -- ${s.kind}: a control or a replacement character needs an author's reading of the word it stood in, not a channel`); continue; }
      const glyphs = [...new Set(s.producers.map((p) => cps(p)[0]))];
      if (!glyphs.length) { refused.push(`${tag} -- no registered producer: this image is a damage spelling only as a run, and a run length is not a character`); continue; }
      let glyph, channel, spacedAttestations = null;
      if (glyphs.length === 1) { glyph = glyphs[0]; channel = 'UNIQUE'; }
      else {
        const left = s.at > 0 ? chars[s.at - 1] : '';
        if (left !== ' ') {
          refused.push(`${tag} -- SPACED cannot witness this site: the attested habit is a space-flanked glyph, and the character the bytes put on its left is ${JSON.stringify(left)}, not a space -- the census is counting other sites than this one`);
          continue;
        }
        const ranked = glyphs.map((g) => ({ g, n: countIn(text, ` ${g} `) })).sort((a, b) => b.n - a.n);
        const sum = ranked.reduce((t, r) => t + r.n, 0);
        const share = sum ? ranked[0].n / sum : 0;
        if (ranked[0].n < attestations || share < floor) {
          refused.push(`${tag} -- SPACED census disagrees (${ranked.map((r) => `${JSON.stringify(r.g)}=${r.n}`).join(', ')}; top share ${(share * 100).toFixed(1)}%, floor ${attestations} attestations at ${(floor * 100).toFixed(0)}%)`);
          continue;
        }
        glyph = ranked[0].g; spacedAttestations = ranked[0].n; channel = 'SPACED';
      }
      const eaters = consumedFollowers(glyph, s.img);
      const pair = s.producers.find((p) => { const c = cps(p); return c.length > 1 && code(c.at(-1)) < 0x80 && c[0] === glyph; });
      let intact = glyph;
      if (eaters.length && s.at + s.len === chars.length) {
        refused.push(`${tag} -- the glyph consumes its follower and the image ends the line, so nothing in the record says whether a follower was eaten here`);
        continue;
      }
      if (pair) {
        if (m1(glyph, cps(pair).at(-1)).img !== s.img) { refused.push(`${tag} -- the registry pair does not reproduce the image under the forward model`); continue; }
        intact = pair;
        channel += '+PAIR';
      } else if (eaters.length) {
        let f = null, detail;
        if (spacedAttestations !== null && eaters.includes(' ')) { f = ' '; detail = `SPACED attestation ${spacedAttestations}`; }
        else {
          const cen = followerCensus(text, glyph);
          if (!cen.mode || cen.share < floor) {
            refused.push(`${tag} -- FOLLOWER census for ${JSON.stringify(glyph)} disagrees (mode ${JSON.stringify(cen.mode)} share ${cen.share.toFixed(3)} of ${cen.total}; ${cen.sorted.slice(0, 4).map((d) => d.join('=')).join(', ')})`);
            continue;
          }
          f = cen.mode === 'SPACE' ? ' ' : cen.mode === 'DIGIT' ? '0' : cen.mode === 'LETTER' ? 'x' : cen.mode.startsWith('OTHER:') ? cen.mode.slice(6) : null;
          detail = `FOLLOWER census ${cen.mode} ${(cen.share * 100).toFixed(1)}% of ${cen.total}`;
        }
        if (f === null || !eaters.includes(f)) { refused.push(`${tag} -- restored follower ${JSON.stringify(f)} is not among the ${eaters.length} this glyph consumes at this image`); continue; }
        intact = glyph + f;
        channel = `${channel}+EATEN(${detail})`;
      }
      chars.splice(s.at, s.len, ...cps(intact));
      edits.push({ line: li + 1, at: s.at, from: s.img, to: intact, channel });
    }
    lines[li] = chars.join('');
  }
  return { text: lines.join('\n'), edits, refused, lineCount: lines.length };
}

/** pass after pass until nothing is charged -- the flank rule makes damage hide behind damage, so a single
 *  pass is a partial repair; a pass that makes no edit while sites remain is a refusal, not a fixed point */
export function repairToFixedPoint(text, { maxPasses = 8, floor = FLOOR, attestations = ATTESTATIONS } = {}) {
  let cur = text, pass = 0;
  const edits = [], refused = [];
  while (pass < maxPasses) {
    const r = planText(cur, { floor, attestations });
    pass++;
    edits.push(...r.edits);
    refused.length = 0; refused.push(...r.refused);
    if (!r.edits.length) {
      if (r.refused.length) return { text: cur, passes: pass, edits, refused, settled: false };
      return { text: cur, passes: pass, edits, refused, settled: true };
    }
    cur = r.text;
  }
  return { text: cur, passes: pass, edits, refused, settled: chargedSitesOf(cur) === 0 };
}
export const chargedSitesOf = (text) => text.split(/\r?\n/).reduce((n, l) => n + chargedSites(l).length, 0);
export const chargedLinesOf = (text) => text.split(/\r?\n/).filter((l) => chargedSites(l).length).length;

// -- CLI --
const isBinary = (b) => (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
  || [...b.subarray(0, Math.min(b.length, 8192))].filter((x) => x === 0).length > 0;

function runCli() {
  const trackedText = () => {
    const r = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 26 });
    if (r.status !== 0) return null;
    return r.stdout.split('\0').filter(Boolean);
  };
  const argv = process.argv.slice(2);
  const mode = argv.find((a) => /^--(check|plan|write)$/.test(a));
  const paths = argv.filter((a) => !a.startsWith('--'));
  if (!mode) {
    console.error('usage: node tools/ci/record-encoding-repair.mjs --check | --plan | --write [paths...]');
    process.exit(2);
  }
  const files = paths.length ? paths : (trackedText() ?? []);
  if (!files.length) { console.error('no files named: pass paths, or run inside a git checkout for --check'); process.exit(2); }

  let charged = 0, changed = 0, refusedTotal = 0, skipped = 0, refusedFiles = 0;
  for (const rel of files) {
    let buf;
    try { buf = readFileSync(join(process.cwd(), rel)); } catch { skipped++; continue; }
    if (isBinary(buf)) { skipped++; continue; }
    const text = buf.toString('utf8');
    const sites = chargedSitesOf(text);
    if (!sites) continue;
    charged += sites;
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lf = text.replace(/\r\n/g, '\n');
    const out = repairToFixedPoint(lf);
    refusedTotal += out.refused.length;
    const line = `${rel}: ${sites} charged site(s) -> ${out.edits.length} repaired in ${out.passes} pass(es), ${out.refused.length} refused`;
    if (mode === '--check') { console.log(line); continue; }
    console.log(line);
    for (const e of out.edits) console.log(`  + ${e.channel}: ${JSON.stringify(e.from)} -> ${JSON.stringify(e.to)} at line ${e.line}`);
    for (const rr of out.refused) console.log(`  ! refused: ${rr}`);
    if (mode === '--write') {
      if (out.refused.length || !out.settled) { console.log(`  REFUSED to write ${rel}: the channels did not agree on every site`); refusedFiles++; continue; }
      writeFileSync(join(process.cwd(), rel), eol === '\r\n' ? out.text.replace(/\n/g, '\r\n') : out.text, 'utf8');
      changed++;
    }
  }
  if (mode === '--check') console.log(`[check] ${files.length} file(s) read, ${charged} charged site(s), ${refusedTotal} refused, ${skipped} skipped as binary or unreadable`);
  else console.log(`[done] ${charged} charged site(s) read, ${changed} file(s) written, ${refusedFiles} file(s) refused, ${refusedTotal} site(s) declined`);
  // A declined write is a verdict, not a success: --write that repaired nothing it was asked to repair exits 1,
  // so a caller cannot read "no traceback" as "the record is clean now".
  process.exit(mode === '--check' ? (charged > 0 ? 1 : 0) : (mode === '--write' && refusedFiles > 0 ? 1 : 0));
}

// Importing this file must not run the CLI: the row that grades these bytes imports the model and the ladder.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) runCli();
