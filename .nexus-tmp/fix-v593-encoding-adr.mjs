// v593 follow-up: the amendment 549 block landed (under another lane's commit) still wearing the
// double-encoded punctuation its draft was written through. Same map as the README repair, scoped to
// this block only, and it refuses unless every cluster it counted is the number the census measured.
import { readFileSync, writeFileSync } from 'node:fs';

const REL = 'docs/decisions/0016-agent-runtime-hermetic-demo-loop.md';
const START_NEEDLE = '### Amendment 549';
const DASH = '\u9225?';
const ARROW = '\u922B?';
const SECTION = '\u6402';
const EXPECT = { dash: 15, arrow: 2, section: 11 };

const bytes = readFileSync(REL);
if (bytes.includes(13)) throw new Error('the file carries CR bytes; this repair assumes LF');
const lines = bytes.toString('utf8').split('\n');
const start = lines.findIndex((l) => l.startsWith(START_NEEDLE));
if (start < 0) throw new Error(`no block starts with ${START_NEEDLE} in ${REL}`);

const tallyOf = (text, needle) => text.split(needle).length - 1;
const counts = { dash: 0, arrow: 0, section: 0 };
for (let n = start; n < lines.length; n += 1) {
  const l = lines[n];
  counts.dash += tallyOf(l, DASH);
  counts.arrow += tallyOf(l, ARROW);
  counts.section += tallyOf(l, SECTION);
  lines[n] = l.split(DASH).join('\u2014 ').split(ARROW).join('\u2192 ').split(SECTION).join('\u00a7');
}
console.log(`[repair] block from line ${start + 1}: em dash x${counts.dash} (expected ${EXPECT.dash}), arrow x${counts.arrow} (expected ${EXPECT.arrow}), section sign x${counts.section} (expected ${EXPECT.section})`);
for (const [k, v] of Object.entries(EXPECT)) if (counts[k] !== v) throw new Error(`the ${k} count is ${counts[k]}, not the ${v} the census measured — the repair is not applied`);

const left = lines.slice(start).reduce((acc, l) => acc + tallyOf(l, DASH) + tallyOf(l, ARROW) + tallyOf(l, SECTION), 0);
if (left) throw new Error(`${left} cluster(s) survived the map inside the block`);

const after = lines.join('\n');
writeFileSync(REL, after, 'utf8');
console.log(`[repair] written · ${Buffer.byteLength(after, 'utf8')} bytes · CR ${(after.match(/\r/g) || []).length} · block CJK-range characters left: ${lines.slice(start).join('\n').split('').filter((c) => c.codePointAt(0) >= 0x2e00 && c.codePointAt(0) <= 0x9fff).length}`);
