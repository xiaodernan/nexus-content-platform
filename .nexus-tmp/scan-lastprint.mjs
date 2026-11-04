import { readFileSync } from 'node:fs';
import { derivePopulation } from '../tools/ci/proof-set.mjs';

const HOUSE = /^\[(cleanup|teardown|finally|housekeeping)\]/i;
const rows = derivePopulation(JSON.parse(readFileSync('./package.json', 'utf8')).scripts);
const hits = [];
const noPrint = [];
for (const r of rows) {
  let text;
  try {
    text = readFileSync(r.file, 'utf8');
  } catch {
    continue;
  }
  const idx = text.lastIndexOf('console.log(');
  if (idx < 0) {
    noPrint.push(`${r.name} (${r.file})`);
    continue;
  }
  const tail = text.slice(idx, idx + 120);
  const m = /^console\.log\(\s*[`'"]([^`'"]{0,60})/.exec(tail);
  const first = m ? m[1] : '(not a plain literal)';
  if (HOUSE.test(first)) hits.push(`${r.name} :: ${r.file} :: ${first}`);
}
console.log(`rows derived: ${rows.length}`);
console.log(`rows whose LAST source console.log opens on a housekeeping tag: ${hits.length}`);
for (const h of hits) console.log('  ' + h);
console.log(`rows with NO console.log at all: ${noPrint.length}`);
for (const n of noPrint) console.log('  ' + n);
