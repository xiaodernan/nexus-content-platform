import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const sig = [
  ['EMDASH_MOJIBAKE', '\u9225\u003f'],
  ['FFFD', '\uFFFD'],
];
const perFile = new Map();
for (const f of tracked) {
  let buf;
  try { buf = fs.readFileSync(f); } catch { continue; }
  if (!buf.length) continue;
  // also count raw invalid-UTF8 sequences: decode with fatal to detect byte-level damage
  let decodesClean = true;
  try { new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { decodesClean = false; }
  const t = buf.toString('utf8');
  const counts = {};
  for (const [n, s] of sig) {
    let c = 0, i = -1;
    while ((i = t.indexOf(s, i + 1)) !== -1) c++;
    if (c) counts[n] = c;
  }
  if (Object.keys(counts).length || !decodesClean) perFile.set(f, { ...counts, invalidUtf8Bytes: !decodesClean });
}
const rows = [...perFile.entries()].sort((a, b) => (b[1].FFFD || 0) - (a[1].FFFD || 0));
console.log('files with hits:', rows.length);
for (const [f, c] of rows) console.log(`${JSON.stringify(c)}  ${f}`);
