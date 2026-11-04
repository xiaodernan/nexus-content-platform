// Scratch: run the SHIPPED writer model (copied from docs/evidence/agents/record-encoding-proof.mjs) over the
// tree and list every CHARGEABLE site with the producers the registry says could have made it.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ALPHA_CP = [0x2014, 0x2013, 0x2026, 0x00a7, 0x00b6, 0x00b7, 0x00d7, 0x00f7, 0x00b1, 0x00b0, 0x00ab,
  0x00bb, 0x2018, 0x2019, 0x201c, 0x201d, 0x2192, 0x2190, 0x2264, 0x2265, 0x2248];
const str = (a) => String.fromCodePoint(...a);
const cps = (s) => [...s];
const code = (c) => (c === undefined ? -1 : c.codePointAt(0));
const ALPHA = ALPHA_CP.map((c) => str([c]));
const gbk = new TextDecoder('gbk');
const FF = String.fromCharCode(0xfffd);
const utf8dec = new TextDecoder('utf-8');
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
    out.push({ ...s, why: l === 'cjk' || r === 'cjk' ? `REJECTED flanks ${l}|${r}` : `charged flanks ${l}|${r}`, producers: RENDER.get(s.img) ?? [] });
  }
  return out;
}

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const skipExt = /\.(png|jpg|jpeg|gif|ico|webp|woff2?|pdf|zip|jar|class|exe|node)$/i;
const found = [];
for (const rel of tracked) {
  if (skipExt.test(rel)) continue;
  let text;
  try { text = readFileSync(rel, 'utf8'); } catch { continue; }
  text.split(/\r?\n/).forEach((l, i) => {
    for (const s of chargeable(l)) {
      if (s.why.startsWith('REJECTED')) continue;
      found.push({ rel, line: i + 1, at: s.at, img: s.img, cps: cps(s.img).map((c) => 'U+' + code(c).toString(16).toUpperCase().padStart(4, '0')).join(' '), producers: s.producers.map((p) => JSON.stringify(p)), text: l });
    }
  });
}
const lines = [`chargeable sites: ${found.length} in ${new Set(found.map((f) => f.rel)).size} file(s)`];
for (const f of found) lines.push(`${f.rel}:${f.line} @${f.at} [${f.cps}] img=${JSON.stringify(f.img)} producers=${f.producers.join(' | ')}\n    ${f.text}`);
if (!lines.at(-1)?.endsWith('\n')) lines.push('');
readdirSync('.'); // keep import used
console.log(lines.join('\n').slice(0, 200000));
