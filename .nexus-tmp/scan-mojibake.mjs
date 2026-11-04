import fs from 'node:fs';
import path from 'node:path';

const files = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules' || e.name === 'dist' || e.name === '.nexus-tmp') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(md|mjs|ts|tsx|java|json|yml)$/.test(e.name)) files.push(p);
  }
}
walk('.');

const sig = [
  ['EMDASH_MOJIBAKE', '\u9225\u003f'],
  ['SECTION_MOJIBAKE', '\u697c'],
  ['FFFD', '\uFFFD'],
  ['LEFTQUOTE_MOJIBAKE', '\u00e2\u0080'],
];
const hits = [];
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  if (!t) continue;
  t.split(/\r?\n/).forEach((l, i) => {
    for (const [n, s] of sig) if (l.includes(s)) hits.push(`${n} :: ${f} :: ${i + 1}`);
  });
}
const byKind = {};
for (const h of hits) { const k = h.split(' :: ')[0]; byKind[k] = (byKind[k] || 0) + 1; }
console.log('scanned files:', files.length);
console.log(JSON.stringify(byKind));
for (const h of hits.slice(0, 60)) console.log(h);
