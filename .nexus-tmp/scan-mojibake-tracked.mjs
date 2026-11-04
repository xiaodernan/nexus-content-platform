import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
const sig = [
  ['EMDASH_MOJIBAKE', '\u9225\u003f'],
  ['SECTION_MOJIBAKE', '\u697c'],
  ['FFFD', '\uFFFD'],
  ['QUOTE_MOJIBAKE', '\u00e2\u0080'],
  ['LDQUOTE_LEFT', '\u201c'],
];
const hits = [];
for (const f of tracked) {
  let t;
  try { t = fs.readFileSync(f, 'utf8'); } catch { continue; }
  t.split(/\r?\n/).forEach((l, i) => {
    for (const [n, s] of sig) if (l.includes(s)) hits.push(`${n} :: ${f} :: ${i + 1} :: ${l.slice(Math.max(0, l.indexOf(s) - 40), l.indexOf(s) + 40)}`);
  });
}
const byKind = {};
for (const h of hits) { const k = h.split(' :: ')[0]; byKind[k] = (byKind[k] || 0) + 1; }
console.log('tracked files:', tracked.length);
console.log(JSON.stringify(byKind));
fs.writeFileSync('.nexus-tmp/mojibake-hits.txt', hits.join('\n') + '\n', 'utf8');
console.log('written to .nexus-tmp/mojibake-hits.txt');
