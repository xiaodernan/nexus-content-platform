// v593: census the non-ASCII suspects inside the drafted section, with the code points of the
// characters that follow each one, so the repair map is written from measured bytes rather than
// from a guess about which glyph the mis-decode produced.
import { readFileSync } from 'node:fs';

const REL = process.argv[2] || 'docs/evidence/m9/README.md';
const START_NEEDLE = process.argv[3] || '## the reason sentence finally';

const lines = readFileSync(REL, 'utf8').split('\n');
const start = lines.findIndex((l) => l.startsWith(START_NEEDLE));
if (start < 0) throw new Error(`no section starts with ${START_NEEDLE} in ${REL}`);

const hex = (s) => [...s].map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase()}`).join(' ');

const tally = new Map();
for (let n = start; n < lines.length; n += 1) {
  const l = lines[n];
  for (let i = 0; i < l.length; i += 1) {
    const cp = l.codePointAt(i);
    if (cp < 0x2e00 || cp > 0x9fff) continue;
    const tail = l.slice(i, i + 2);
    const key = `${hex(tail)}`;
    if (!tally.has(key)) tally.set(key, []);
    tally.get(key).push(n + 1);
  }
}
console.log(`[census] ${REL} · section starts at line ${start + 1} · ${lines.length - start} lines read`);
for (const [key, rows] of tally) {
  console.log(`  ${key}  x${rows.length}  lines ${[...new Set(rows)].join(',')}`);
}
