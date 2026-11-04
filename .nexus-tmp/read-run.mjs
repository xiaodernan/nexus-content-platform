// one reader, the same shape used for runs 41102039245 / 41107874805 / 41123935905
import { readFileSync } from 'node:fs';
const file = process.argv[2];
const raw = readFileSync(file, 'utf8').split(/\r?\n/);
const strip = (l) => l.replace(/^[^\t]*\t[^\t]*\t/, '').replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z ?/, '');
const body = raw.map(strip);
const ok = [];
const gut = [];
for (let i = 0; i < body.length; i++) {
  const m = /^\s*(verify:[a-z0-9-]+)\s+\S+.*\bOK\b\s+[\d.]+s/.exec(body[i]);
  if (m) ok.push({ name: m[1], line: i });
  if (/^ {6}\| /.test(body[i])) gut.push({ text: body[i].slice(8), at: i });
}
const pop = body.filter((l) => /green of a derived population of/.test(l));
const over = gut.map((g) => Buffer.byteLength(g.text, 'utf8')).filter((b) => b > 300).sort((a, b) => b - a);
const cleanup = gut.filter((g) => /\[cleanup\]/.test(g.text)).length;
console.log(`OK lines: ${ok.length} · gutter lines: ${gut.length}`);
console.log(`population: ${pop.join(' || ') || '(none)'}`);
console.log(`gutters over 300 bytes: ${over.length}${over.length ? ' → ' + over.join(', ') : ''}`);
console.log(`housekeeping ([cleanup]) gutters: ${cleanup}`);
const byName = (n) => ok.find((o) => o.name === n);
for (const n of ['verify:pipeline', 'verify:arms', 'verify:package-counts', 'verify:webhooks', 'verify:tree-guard', 'verify:arms-freshness', 'verify:evidence-census', 'verify:ci-wiring']) {
  const o = byName(n);
  if (!o) { console.log(`${n}: (not in this log)`); continue; }
  const after = body.slice(o.line + 1, o.line + 3).find((l) => /^ {6}\| /.test(l));
  console.log(`${n}: ${raw[o.line].replace(/^\S+\s+/, '').slice(0, 90)}${after ? `\n    gutter(${Buffer.byteLength(after.slice(8))}B): ${after.slice(8).slice(0, 190)}` : '\n    gutter: (none found within 2 lines)'}`);
}
const red = body.filter((l) => /\bRED\b/.test(l));
console.log(`RED lines: ${red.length}${red.length ? ' → ' + red.slice(0, 5).map((r) => r.slice(0, 90)).join(' || ') : ''}`);
