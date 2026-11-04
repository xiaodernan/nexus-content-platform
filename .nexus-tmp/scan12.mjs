// scratch: run the planned §12 reader over the shipped tree and report the counts it would print.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { derivePopulation, splitSet } from '../tools/ci/proof-set.mjs';

const ROOT = process.cwd();
const HOUSEKEEPING = /^\[(cleanup|teardown|finally|housekeeping)\]/i;
const { running } = splitSet(derivePopulation(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts));

const offenders = [];
let literalLast = 0;
let expressionLast = 0;
let noCall = 0;
const tags = new Map();
for (const row of running) {
  const p = join(ROOT, row.file);
  if (!existsSync(p)) { console.log(`MISSING ${row.name} ${row.file}`); continue; }
  const lines = readFileSync(p, 'utf8').replace(/\r\n/g, '\n').split('\n');
  let last = null;
  for (let i = lines.length - 1; i >= 0 && !last; i--) {
    const at = lines[i].lastIndexOf('console.log(');
    if (at < 0) continue;
    if (/\/\*|^\s*(\*|\/\/)/.test(lines[i].slice(0, at))) continue;
    const m = /^console\.log\(\s*[`'"]([^`'"]{0,64})/.exec(lines[i].slice(at));
    if (!m) { last = { expr: true, line: lines[i].trim() }; continue; }
    last = { head: m[1].replace(/^(\s|\\[nrt])+/, ''), line: lines[i].trim() };
  }
  if (!last) { noCall++; continue; }
  if (last.expr) { expressionLast++; continue; }
  literalLast++;
  const tag = (last.head.match(/^\[[^\]]*\]/) || [last.head.slice(0, 14)])[0];
  tags.set(tag, (tags.get(tag) ?? 0) + 1);
  if (HOUSEKEEPING.test(last.head)) offenders.push(`${row.name} :: ${row.file} :: ${last.line.slice(0, 80)}`);
}
console.log(`running rows: ${running.length} · last call opens on a literal: ${literalLast} · expression: ${expressionLast} · no readable console.log: ${noCall}`);
console.log(`offenders: ${offenders.length}`);
for (const o of offenders) console.log('  ' + o);
console.log('tag histogram of the surviving last lines:');
for (const [t, n] of [...tags.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${t}`);
