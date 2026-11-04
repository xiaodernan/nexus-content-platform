import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const FILES = {
  adr: 'docs/decisions/0016-agent-runtime-hermetic-demo-loop.md',
  readme: 'docs/evidence/m9/README.md',
  roadmap: 'docs/ROADMAP.md',
  plan: 'docs/LONG_TERM_PLAN.md',
};

const fail = (m) => { console.error(`[reaim] FAIL ${m}`); process.exit(1); };
const count = (s, needle) => s.split(needle).length - 1;

// The pre-landing package-counts run printed 68812ms; the run against the LANDED bytes printed 66381ms.
// Every record that cites the recount must cite the reading taken at the bytes it ships.
const stale = '68812';
const fresh = '66381';

for (const [key, rel] of Object.entries(FILES)) {
  const text = readFileSync(rel, 'utf8');
  if (text.includes('\r')) fail(`${rel} carries a CR before the re-aim`);
  const hits = count(text, stale);
  if (hits !== 1) fail(`${rel} mentions ${stale} ${hits} times, expected exactly 1`);
  if (count(text, fresh) !== 0) fail(`${rel} already mentions ${fresh}`);
  const next = text.split(stale).join(fresh);
  if (count(next, fresh) !== 1 || count(next, stale) !== 0) fail(`${rel} did not swap cleanly`);
  if (next.length !== text.length) fail(`${rel} changed length: a digit swap must not`);
  writeFileSync(rel, next);
  const back = readFileSync(rel, 'utf8');
  if (back !== next) fail(`${rel} re-read differs from the graded bytes`);
  console.log(`[reaim] ${rel} ${stale} -> ${fresh} · sha ${createHash('sha256').update(back).digest('hex').slice(0, 12)}`);
}
console.log(`[reaim] 4 files re-aimed · length unchanged · CR 0`);
