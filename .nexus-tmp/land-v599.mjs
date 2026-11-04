// v599 landing — put §11.9b's two carriers back byte-for-byte from the ref that shipped them, retire the
// block that cannot be the first red, and give the census a clause that charges a duplicated label.
// Every needle must match EXACTLY ONCE, the output must stay LF, and the result must parse.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REL = 'docs/evidence/m9/audit-contract-proof.mjs';
const CARRIER_REF = '9a80fa6'; // v597 — the last ref whose §11 block carried both witnesses

const lf = (s) => s.replace(/\r\n/g, '\n');
const before = lf(execFileSync('git', ['show', `${CARRIER_REF}:${REL}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const work = lf(readFileSync(join(ROOT, REL), 'utf8'));
const cr = readFileSync(join(ROOT, REL));
if (cr.includes(0x0d)) throw new Error(`${REL} has CR bytes on disk — the landing would rewrite the whole file's line endings`);

const once = (haystack, needle, label) => {
  const n = haystack.split(needle).length - 1;
  if (n !== 1) throw new Error(`the ${label} needle matched ${n} times, not exactly once:\n${needle}`);
  return true;
};

// 1. the carriers, taken verbatim from the ref that shipped them rather than retyped.
const C_START = '    // Two carriers, because the census above is an absence claim.';
const C_END = '    const naiveReasonSites = shipped';
once(before, C_START, 'carrier start');
const b0 = before.indexOf(C_START);
const b1 = before.indexOf(C_END, b0);
const carriers = before.slice(b0, b1);
if (!carriers.includes('ownerReasonWords') || !carriers.includes('reasonFieldReads')) throw new Error('the extracted carriers are missing one of the two witnesses');

// 2. the block that replaced them: labelled 11.10 four lines above the real §11.10.
const F_START = '    // 11.10 — clause execution order:';
once(work, F_START, 'fake block start');
once(work, C_END, 'naive-reason anchor');
const w0 = work.indexOf(F_START);
const w1 = work.indexOf(C_END, w0);
const fake = work.slice(w0, w1);
const fakeCaseDecls = (fake.match(/11\.10 —/g) || []).length;

// 3. the new clause, and the import it needs.
const clause = lf(readFileSync(join(ROOT, '.nexus-tmp/v599-clause.txt'), 'utf8'));
if (!clause.endsWith('\n')) throw new Error('the clause file must end on a newline');
const PRINT = '    console.log(`[§11.7-11]';
once(work, PRINT, 'range-tag print');
const IMP_OLD = "import { pathToFileURL } from 'node:url';";
const IMP_NEW = "import { pathToFileURL, fileURLToPath } from 'node:url';";
once(work, IMP_OLD, 'node:url import');

let out = work.slice(0, w0) + carriers + work.slice(w1);
once(out, PRINT, 'range-tag print after the carrier swap');
out = out.replace(PRINT, `${clause}${PRINT}`);
out = out.replace(IMP_OLD, IMP_NEW);

// The population the census will read, measured on the bytes about to be written and on the bytes they
// replace — the record quotes both, so neither is a guess.
const labelRe = /^[ \t]*\/\/+[ \t]*(11\.[0-9]+[a-z]?)[ \t]+—[ \t]/gm;
const tally = (src) => {
  const m = new Map();
  for (const x of src.matchAll(labelRe)) m.set(x[1], (m.get(x[1]) ?? 0) + 1);
  return { n: m.size, total: [...m.values()].reduce((a, b) => a + b, 0), dup: [...m].filter(([, c]) => c > 1).map(([l, c]) => `${l}×${c}`), keys: [...m.keys()].sort() };
};
const tBefore = tally(work);
const tAfter = tally(out);

writeFileSync(join(ROOT, REL), out.replace(/\n/g, '\r\n').replace(/\r\n/g, '\n'));
const reRead = lf(readFileSync(join(ROOT, REL), 'utf8'));
if (reRead !== out) throw new Error('the bytes written do not match the bytes read back');
if (readFileSync(join(ROOT, REL)).includes(0x0d)) throw new Error('CR bytes entered the file');

console.log(`[carriers] restored ${carriers.split('\n').length - 1} lines from ${CARRIER_REF} · fake block removed: ${fake.split('\n').length - 1} lines, ${fakeCaseDecls} declaration(s) of 11.10 inside it`);
console.log(`[labels @ HEAD bytes] ${tBefore.total} declarations, ${tBefore.n} distinct · duplicated: ${tBefore.dup.join(', ') || 'none'}`);
console.log(`[labels @ draft bytes] ${tAfter.total} declarations, ${tAfter.n} distinct · duplicated: ${tAfter.dup.join(', ') || 'none'}`);
console.log(`[labels @ draft] ${tAfter.keys.join(', ')}`);
console.log(`[import] fileURLToPath added: ${out.includes(IMP_NEW)}`);
console.log(`[bytes] ${work.length} → ${out.length} · LF only · re-read identical`);
