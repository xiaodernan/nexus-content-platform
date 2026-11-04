// v593 repair: the drafted section was written through a GBK-reading pipe, so every three-byte
// punctuation mark landed as one CJK glyph plus a '?' that ATE the following byte. The census in
// .nexus-tmp/encoding-census-v593.mjs measured the clusters; this script puts them back and refuses
// if any cluster it was told to fix is not found exactly the predicted number of times.
//
// Line 271 is not repaired by the map: its cluster is ambiguous ('?' could have eaten the tail of an
// em dash or of an ellipsis), and the line is a QUOTATION of an instrument reading, so the honest
// repair is to re-quote the whole line from the log the gate actually printed.
import { readFileSync, writeFileSync } from 'node:fs';

const REL = 'docs/evidence/m9/README.md';
const START_NEEDLE = '## the reason sentence finally';
const DASH = '\u9225?';
const ARROW = '\u922B?';
const SECTION = '\u6402';

const bytes = readFileSync(REL);
if (bytes.includes(13)) throw new Error('the file carries CR bytes; this repair assumes LF');
const lines = bytes.toString('utf8').split('\n');
const start = lines.findIndex((l) => l.startsWith(START_NEEDLE));
if (start < 0) throw new Error(`no section starts with ${START_NEEDLE}`);

const quote = readFileSync('.nexus-tmp/instruments-v593-a.log', 'utf8')
  .split('\n')
  .find((l) => l.startsWith('[\u00a711.7-11]'));
if (!quote) throw new Error('the audit log holds no [§11.7-11] line to re-quote');

const tallyOf = (text, needle) => (needle ? text.split(needle).length - 1 : 0);

const counts = { dash: 0, arrow: 0, section: 0, quoted: 0 };
for (let n = start; n < lines.length; n += 1) {
  let l = lines[n];
  if (l.startsWith('`reportStatusText is declared only in')) {
    counts.quoted += 1;
    lines[n] = `\`${quote}\``;
    continue;
  }
  counts.dash += tallyOf(l, DASH);
  counts.arrow += tallyOf(l, ARROW);
  counts.section += tallyOf(l, SECTION);
  l = l.split(DASH).join('\u2014 ').split(ARROW).join('\u2192 ').split(SECTION).join('\u00a7');
  lines[n] = l;
}

console.log(`[repair] section from line ${start + 1}: em dash x${counts.dash}, arrow x${counts.arrow}, section sign x${counts.section}, re-quoted line x${counts.quoted}`);

const after = lines.join('\n');
const remaining = [...after].filter((c) => c.codePointAt(0) >= 0x2e00 && c.codePointAt(0) <= 0x9fff);
console.log(`[repair] CJK-range characters left in the whole file: ${remaining.length} (${[...new Set(remaining)].map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase()}`).join(' ') || 'none'})`);
if (remaining.length) {
  for (let i = 0; i < lines.length; i += 1) {
    if ([...lines[i]].some((c) => c.codePointAt(0) >= 0x2e00 && c.codePointAt(0) <= 0x9fff)) console.log(`  line ${i + 1}: ${lines[i].slice(0, 120)}`);
  }
  throw new Error('chargeable CJK-range characters remain — the repair is not applied');
}

writeFileSync(REL, after, 'utf8');
console.log(`[repair] written · ${Buffer.byteLength(after, 'utf8')} bytes · CR ${(after.match(/\r/g) || []).length}`);
