// Repair the CHARGEABLE damage sites the record-encoding row names, using that row's own writer model.
// Every producer is DERIVED, never typed: a site whose image has one registered producer is exact; a site with
// several gets the file's own glyph census; a site whose follower was CONSUMED gets the follower its own undamaged
// habit says (space, in these records) and only when that census agrees above the floor. Anything the channels
// disagree on is REFUSED and reported -- putting back the wrong glyph is a second defect a plain diff cannot see.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ALPHA_CP = [0x2014, 0x2013, 0x2026, 0x00a7, 0x00b6, 0x00b7, 0x00d7, 0x00f7, 0x00b1, 0x00b0, 0x00ab,
  0x00bb, 0x2018, 0x2019, 0x201c, 0x201d, 0x2192, 0x2190, 0x2264, 0x2265, 0x2248];
const str = (a) => String.fromCodePoint(...a);
const cps = (s) => [...s];
const code = (c) => (c === undefined ? -1 : c.codePointAt(0));
const ALPHA = ALPHA_CP.map((c) => str([c]));
const FF = String.fromCharCode(0xfffd);
const gbk = new TextDecoder('gbk');
const g1 = (b) => { const d = gbk.decode(Buffer.from(b)); return d.length === 1 && !d.includes(FF) ? d : null; }
const GBK_BYTES = new Map();
for (let hi = 0x81; hi <= 0xfe; hi++) for (let lo = 0x40; lo <= 0xfe; lo++) {
  const d = g1(Buffer.from([hi, lo]));
  if (d && !GBK_BYTES.has(d)) GBK_BYTES.set(d, [hi, lo]);
}
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
const HEADS = new Map();
for (const r of RENDERS) {
  const cs = cps(r);
  if (!HEADS.has(cs[0])) HEADS.set(cs[0], []);
  HEADS.get(cs[0]).push({ img: r, cs, len: cs.length });
}
for (const v of HEADS.values()) v.sort((a, b) => b.len - a.len);
function spans(chars) {
  const out = [];
  let i = 0;
  while (i < chars.length) {
    if (chars[i] === FF || (code(chars[i]) < 0x20 && chars[i] !== '\n')) {
      out.push({ at: i, len: 1, img: chars[i], kind: code(chars[i]) < 0x20 ? 'control' : 'fffd' });
      i += 1; continue;
    }
    const bucket = HEADS.get(chars[i]);
    let hit = null;
    if (bucket) for (const r of bucket) {
      let ok = true;
      for (let k = 1; k < r.len; k++) if (chars[i + k] !== r.cs[k]) { ok = false; break; }
      if (ok) { hit = r; break; }
    }
    if (hit) { out.push({ at: i, len: hit.len, img: hit.img, kind: 'render' }); i += hit.len; }
    else i += 1;
  }
  return out;
}
const cls = (c) => (c === undefined || c === '' ? 'edge' : /\s/.test(c) ? 'space' : /[A-Za-z]/.test(c) ? 'alpha'
  : code(c) >= 0x4e00 && code(c) <= 0x9fff ? 'cjk' : 'other');
const tightCls = (t, i, step) => {
  let j = i;
  if (j >= 0 && j < t.length && t[j] === ' ') j += step;
  return cls(t[j]);
};
function chargeable(line) {
  const chars = cps(line);
  const out = [];
  for (const s of spans(chars)) {
    if (s.kind !== 'render') { out.push({ ...s, why: 'unconditional', producers: [] }); continue; }
    const l = tightCls(chars, s.at - 1, -1);
    const r = tightCls(chars, s.at + s.len, +1);
    out.push({ ...s, why: l === 'cjk' || r === 'cjk' ? `REJECTED ${l}|${r}` : `charged ${l}|${r}`, producers: RENDER.get(s.img) ?? [] });
  }
  return out;
}

const ESC = (s) => s.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
const countIn = (text, needle) => (text.match(new RegExp(ESC(needle), 'g')) || []).length;
/** how this file's OWN glyphs are followed: the channel that decides a consumed follower.
 *  Every occurrence of the glyph in the CURRENT text is intact by construction -- damage renders as different
 *  codepoints -- so no occurrence is excluded, and the distribution is the record's own habit. */
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
/** the followers this glyph would CONSUME at a site, spelled into exactly this image */
function consumedFollowers(glyph, img) {
  const out = [];
  for (let c = 0x20; c <= 0x7f; c++) {
    if (c === 0x3f) continue;
    const f = String.fromCharCode(c);
    const r = m1(glyph, f);
    if (r.extra > 0 && r.img === img) out.push(f);
  }
  return out;
}
const AGREEMENT_FLOOR = 0.8;
const root = process.cwd();
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const skipExt = /\.(png|jpg|jpeg|gif|ico|webp|woff2?|pdf|zip|jar|class|exe|node)$/i;

const DRY = process.env.DRY === '1';
const report = [], refused = [], perFile = new Map();
for (const rel of tracked) {
  if (skipExt.test(rel)) continue;
  let text;
  try { text = readFileSync(join(root, rel), 'utf8'); } catch { continue; }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  let n = 0;
  for (let li = 0; li < lines.length; li++) {
    const sites = chargeable(lines[li]).filter((s) => !s.why.startsWith('REJECTED'));
    if (!sites.length) continue;
    const chars = cps(lines[li]);
    for (const s of [...sites].sort((a, b) => b.at - a.at)) {
      const tag = `${rel}:${li + 1} @${s.at} ${JSON.stringify(s.img)}`;
      if (s.kind !== 'render') { refused.push(`${tag} -- ${s.kind}: a control or U+FFFD needs an author's reading of the word, not a channel`); continue; }
      // 1. the glyph. Exact when the registry has one producer; otherwise the file's own SPACED habit decides,
      //    because the record's undamaged twins carry the same punctuation with the same spacing. The winner
      //    has to clear both a floor of attestations and an agreement share, or the site is refused.
      const glyphs = [...new Set(s.producers.map((p) => cps(p)[0]))];
      if (!glyphs.length) { refused.push(`${tag} -- unregistered image`); continue; }
      let glyph, glyphNote, spacedWin = null;
      if (glyphs.length === 1) { glyph = glyphs[0]; glyphNote = 'unique producer'; }
      else {
        const ranked = glyphs.map((g) => ({ g, n: countIn(text, ` ${g} `) })).sort((a, b) => b.n - a.n);
        const sum = ranked.reduce((t, r) => t + r.n, 0);
        const share = sum ? ranked[0].n / sum : 0;
        if (ranked[0].n < 20 || share < AGREEMENT_FLOOR) {
          refused.push(`${tag} -- spaced-glyph census disagrees: ${ranked.map((r) => `${JSON.stringify(r.g)}=${r.n}`).join(', ')} (top share ${(share * 100).toFixed(1)}%)`);
          continue;
        }
        glyph = ranked[0].g;
        spacedWin = ranked[0].n;
        glyphNote = `spaced census ' ${JSON.stringify(glyph)} '=${ranked[0].n} vs ' ${JSON.stringify(ranked[1].g)} '=${ranked[1].n} (${(share * 100).toFixed(1)}%)`;
      }
      // 2. the follower. Three shapes, and the forward model decides which one applies -- a repair that puts
      //    back the glyph and leaves the CONSUMED follower out is the defect the row's header names.
      const eaters = consumedFollowers(glyph, s.img);
      const exactPair = s.producers.find((p) => { const c = cps(p); return c.length > 1 && code(c.at(-1)) < 0x80 && c[0] === glyph; });
      let intact = glyph, followerNote = 'eats nothing, nothing restored';
      if (eaters.length === 0 && !exactPair) {
        intact = glyph;
      } else if (eaters.length && s.at + s.len === chars.length) {
        refused.push(`${tag} -- a bare image at end of line while the glyph can eat a follower: the record cannot say whether one was consumed here`);
        continue;
      } else if (exactPair) {
        intact = exactPair;
        followerNote = `follower ${JSON.stringify(cps(exactPair).at(-1))} carried by the registry (rendered, not eaten)`;
        if (m1(glyph, cps(exactPair).at(-1)).img !== s.img) { refused.push(`${tag} -- registry pair does not reproduce the image`); continue; }
      } else {
        // the follower was consumed and the image cannot say which one it was (M1 eats every ASCII follower):
        // the spaced attestation that picked the glyph already carries the follower, so when it is one the
        // glyph can consume, that is the channel; otherwise this file's own habit is asked directly
        let f = null, cen = null;
        if (spacedWin !== null && eaters.includes(' ')) {
          f = ' ';
          followerNote = `consumed follower restored from the same spaced attestation (${spacedWin} occurrences of ' ${glyph} ')`;
        } else {
          cen = followerCensus(text, glyph);
          if (!cen.mode || cen.share < AGREEMENT_FLOOR) {
            refused.push(`${tag} -- follower census for ${JSON.stringify(glyph)} disagrees (mode ${JSON.stringify(cen.mode)} share ${cen.share.toFixed(3)} of ${cen.total}; ${cen.sorted.slice(0, 4).map((d) => d.join('=')).join(', ')})`);
            continue;
          }
          f = cen.mode === 'SPACE' ? ' ' : cen.mode === 'DIGIT' ? '0' : cen.mode === 'LETTER' ? 'x' : cen.mode.startsWith('OTHER:') ? cen.mode.slice(6) : null;
          followerNote = `consumed follower restored from follower census ${cen.mode} (${(cen.share * 100).toFixed(1)}% of ${cen.total})`;
        }
        if (f === null || !eaters.includes(f)) {
          refused.push(`${tag} -- restored follower ${JSON.stringify(f)} is not among the ${eaters.length} this glyph consumes at this image (${JSON.stringify(eaters.slice(0, 6))})`);
          continue;
        }
        intact = glyph + f;
      }
      chars.splice(s.at, s.len, ...cps(intact));
      n++;
      report.push(`${tag} -> ${JSON.stringify(intact)} [${glyphNote}; ${followerNote}]`);
    }
    lines[li] = chars.join('');
  }
  if (n) {
    const next = lines.join(eol);
    perFile.set(rel, { sites: n, codepointDelta: next.length - text.length, byteDelta: Buffer.byteLength(next) - Buffer.byteLength(text), linesKept: lines.length === text.split(/\r?\n/).length, eol });
    if (!DRY) writeFileSync(join(root, rel), next, 'utf8');
  }
}

console.log(`sites repaired: ${report.length} · refused: ${refused.length}`);
for (const [rel, s] of perFile) console.log(`${rel} :: ${JSON.stringify(s)}`);
writeFileSync('.nexus-tmp/repair-report.txt', report.join('\n') + '\n\nREFUSED:\n' + refused.join('\n') + '\n', 'utf8');
console.log('report -> .nexus-tmp/repair-report.txt');
