// v597 record landing: every needle must match EXACTLY ONCE before a single byte is written, and every
// claim the records make about their own bytes is re-read off the file after it lands.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(SRC, '.nexus-tmp/land-v597.json'), 'utf8'));
const FILES = { adr: cfg.adr, readme: cfg.readme, roadmap: cfg.roadmap, plan: cfg.plan };
const BASE = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: SRC, encoding: 'utf8' }).trim();
console.log(`[basis] HEAD ${BASE}`);

const adrPayload = '\n' + readFileSync(join(SRC, '.nexus-tmp/rec-amendment-550.md'), 'utf8').replace(/\n+$/, '\n');
const readmePayload = '\n' + readFileSync(join(SRC, '.nexus-tmp/rec-m9-section.md'), 'utf8').replace(/\n+$/, '\n');
const planLine = readFileSync(join(SRC, '.nexus-tmp/rec-plan-188.txt'), 'utf8').replace(/\n+$/, '');

const originals = {};
for (const [key, rel] of Object.entries(FILES)) originals[key] = readFileSync(join(SRC, rel), 'utf8');

const count = (text, needle) => text.split(needle).length - 1;
const fail = (m) => {
  throw new Error(m);
};

// Pre-conditions: the labels this batch mints must still be free, and each file must end the way the
// append below assumes it ends.
if (originals.adr.includes('### Amendment 550')) fail('amendment 550 already exists in the ledger - the grant was taken');
if (originals.adr.includes('11.9b')) fail('the ledger already mentions 11.9b before this landing');
if (originals.roadmap.includes('v597 (ADR 0016 amendment 550)')) fail('ROADMAP already carries the v597 sentence');
if (originals.plan.includes('188. ~~**v597')) fail('LONG_TERM_PLAN already carries item 188');
if (originals.readme.includes('## the reason census finally keys on POSITION')) fail('m9 README already carries the v597 section');
for (const [key, rel] of Object.entries(FILES)) {
  if (!originals[key].endsWith('\n')) fail(`${rel} does not end with a newline`);
  if (originals[key].includes('\r')) fail(`${rel} carries a CR before the landing`);
}
const sectionsBefore = count(originals.readme, '\n## ');
const headingsBefore = count(originals.adr, '\n### Amendment');

// Every needle exactly once, or nothing is written.
const edits = [];
for (const s of cfg.splices) {
  const hits = count(originals[s.file], s.needle);
  if (hits !== 1) fail(`the needle in ${FILES[s.file]} matched ${hits} times, not once: ${JSON.stringify(s.needle.slice(0, 60))}`);
  let replacement = s.replacement;
  if (replacement.includes('@@PLAN188@@')) {
    if (!planLine.startsWith('188. ~~**v597')) fail('the plan payload is not item 188');
    replacement = replacement.replace('@@PLAN188@@', planLine);
  }
  edits.push({ ...s, replacement });
  console.log(`[check] ${FILES[s.file]} - needle unique - delta ${replacement.length - s.needle.length} chars`);
}

// Build the landed bytes in memory, grade every self-claim against THOSE, and only then write a single
// file — a claim that fails must not be able to leave the tree half-landed.
const next = { ...originals };
for (const e of edits) next[e.file] = next[e.file].replace(e.needle, e.replacement);
const landed = {
  adr: next.adr + adrPayload,
  readme: next.readme + readmePayload,
  roadmap: next.roadmap,
  plan: next.plan,
};

const claims = [];
claims.push(
  [count(landed.adr, '### Amendment 550 (v597, m9)') === 1, 'the amendment 550 header lands exactly once'],
  [count(landed.adr, '\n### Amendment') === headingsBefore + 1, `ledger heading count moved from ${headingsBefore} to ${count(landed.adr, '\n### Amendment')}`],
  [landed.adr.endsWith('\n'), 'the ledger still ends on a newline'],
  [count(landed.adr, 'CLOSED by amendment 550 / version v597') === 1, "amendment 549's inline-uses disclosure is marked closed in place"],
  [count(landed.adr, 'GRANTS** amendment 551 / version v598') === 1, 'amendment 550 grants 551 / v598 once'],
  [count(landed.readme, '## the reason census finally keys on POSITION') === 1, 'the v597 README section lands exactly once'],
  [count(landed.readme, '\n## ') === sectionsBefore + 1, `README section count moved from ${sectionsBefore} to ${count(landed.readme, '\n## ')}`],
  [count(landed.readme, 'CLOSED by amendment 550 / version v597') === 1, "v593's Bounds disclosure is marked closed where it was written"],
  [count(landed.readme, 'M9 v597') === 1, 'the v597 label appears once in the README'],
  [count(landed.roadmap, '**v597 (ADR 0016 amendment 550)**') === 1, 'the ROADMAP M9 cell carries exactly one v597 sentence'],
  [count(landed.plan, '\n188. ~~**v597') === 1, 'plan item 188 lands once'],
  [count(landed.plan, '\n187. ~~**v593') === 1, 'plan item 187 is still there above it'],
  [landed.plan.includes('\n31. ~~**v411'), 'the older descending block is intact below item 188'],
  [count(landed.plan, '\n188.') === 1, 'there is no second item 188 in the plan'],
);
for (const c of claims) if (!c[0]) fail(c[1]);
for (const [key, rel] of Object.entries(FILES)) {
  if (landed[key].includes('\r')) fail(`${rel} carries a CR before it is written`);
  writeFileSync(join(SRC, rel), landed[key]);
}
// Re-read what is now on disk and confirm the bytes that were graded are the bytes that landed.
for (const [key, rel] of Object.entries(FILES)) {
  const onDisk = readFileSync(join(SRC, rel), 'utf8');
  if (onDisk !== landed[key]) fail(`${rel} does not match the bytes that were graded before writing`);
  if (onDisk.includes('\r')) fail(`${rel} carries a CR after the landing`);
  const before = Buffer.byteLength(originals[key]);
  const after = Buffer.byteLength(onDisk);
  const sha = createHash('sha256').update(onDisk).digest('hex').slice(0, 12);
  console.log(`[landed] ${rel} ${before} -> ${after} bytes (+${after - before}) - lines ${count(originals[key], '\n')} -> ${count(onDisk, '\n')} - sha ${sha}`);
}
console.log(`[landed] ${claims.length} self-claims hold - CR 0 in all four files`);
