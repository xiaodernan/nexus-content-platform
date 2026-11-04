import { readFileSync, writeFileSync } from 'node:fs';

const FILES = [
  'color', 'commit-echo', 'door-kill', 'log-window', 'reaper-survivor', 'record-window', 'report-kill', 'report-window',
].map((n) => `docs/evidence/agents/${n}-proof.mjs`);

const SUMMARY = /^\s*console\.log\(`\\n\[summary\]/;
const CLEANUP_PRINT = /^\s*console\.log\([`'"]\[cleanup\]/;

for (const file of FILES) {
  const text = readFileSync(file, 'utf8');
  if (text.includes('\r')) throw new Error(`${file}: has CR`);
  const lines = text.split('\n');
  const hits = lines.map((l, i) => (SUMMARY.test(l) ? i : -1)).filter((i) => i >= 0);
  if (hits.length !== 1) throw new Error(`${file}: expected exactly one [summary] print, found ${hits.length}`);
  const [si] = hits;
  if (!lines[si].endsWith('`);')) throw new Error(`${file}: the summary statement is not one line: …${lines[si].slice(-40)}`);
  const after = lines.map((l, i) => (i > si && CLEANUP_PRINT.test(l) ? i : -1)).filter((i) => i >= 0);
  if (!after.length) throw new Error(`${file}: no [cleanup] print after the summary`);
  let at = after[after.length - 1];
  if ((lines[at + 1] ?? '').trim() === '}') at += 1; // the print is the last statement of a block: land after it
  const [summary] = lines.splice(si, 1);
  lines.splice(at + (at > si ? -1 : 0) + 1, 0, summary);
  const out = lines.join('\n');
  if (out.includes('\r') || out.includes('\uFFFD')) throw new Error(`${file}: CR or U+FFFD introduced`);
  writeFileSync(file, out, 'utf8');
  const nonBlank = lines.filter((l) => l.trim() !== '');
  console.log(`${file}: summary from line ${si + 1} → last statement · tail ${JSON.stringify(nonBlank.slice(-2).map((l) => l.slice(0, 44)))}`);
}
