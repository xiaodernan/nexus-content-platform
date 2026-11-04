// scratch: slice the shipped row's model out of ITS OWN bytes and run it next to the tool's
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const ROW = 'docs/evidence/agents/record-encoding-proof.mjs';
const src = readFileSync(ROW, 'utf8');
const lines = src.split('\n');
const at = (re, from = 0) => { const i = lines.findIndex((l, k) => k >= from && re.test(l)); if (i < 0) throw new Error(`anchor ${re} not found from ${from}`); return i; };

// helpers the model needs, declared above S1
const depsStart = at(/^const FF = /);
const alphaStart = at(/^const ALPHA_CP = /);
const chargeEnd = at(/^const chargedLine = /);
console.log(`deps ${depsStart} alpha ${alphaStart} chargeEnd ${chargeEnd}`);

const keep = [];
for (let i = depsStart; i <= chargeEnd; i++) {
  const l = lines[i];
  if (/^assert\./.test(l) || /^console\.log\(/.test(l)) continue;
  keep.push(l);
}
const body = keep.join('\n');
const fn = new Function(`
${body}
return { ALPHA_CP, ALPHA, GBK_BYTES, m1, m2, m1whole, m2whole, RENDER, RENDERS, spans, cls, tightCls, chargeable, isCharged, chargedLine: (l) => chargeable(l).some(isCharged) };
`);
const row = fn();
console.log('row registry', row.RENDERS.length, 'gbk', row.GBK_BYTES.size, 'alpha', row.ALPHA_CP.length);

const tool = await import(new URL('../tools/ci/record-encoding-repair.mjs', import.meta.url).href);
console.log('tool registry', tool.REGISTRY_SIZE, 'gbk', tool.GBK_BYTES.size, 'alpha', tool.ALPHA_CP.length);
assert.deepEqual(row.ALPHA_CP, tool.ALPHA_CP, 'alphabet');

// compare chargeable() over every line of the two files the tool charges
const toolCps = (s) => [...s];
let diffs = 0, checked = 0;
for (const rel of ['docs/decisions/0016-agent-runtime-hermetic-demo-loop.md', 'docs/evidence/m9/README.md']) {
  const text = readFileSync(rel, 'utf8');
  for (const l of text.split(/\r?\n/)) {
    checked++;
    const a = row.chargeable(toolCps(l)).map((s) => `${s.at}:${s.len}:${s.kind}:${s.why}`);
    const b = tool.chargeable(l).map((s) => `${s.at}:${s.len}:${s.kind}:${s.why}`);
    if (a.join('|') !== b.join('|')) {
      diffs++;
      if (diffs <= 3) console.log(`DIFF ${rel} ${JSON.stringify(l.slice(0, 70))}\n  row ${a.join(' | ')}\n  tool ${b.join(' | ')}`);
    }
  }
}
console.log(`checked ${checked} lines, ${diffs} chargeable disagreements`);
console.log('row charged lines in ADR:', text0());
function text0() {
  const text = readFileSync('docs/decisions/0016-agent-runtime-hermetic-demo-loop.md', 'utf8');
  return text.split(/\r?\n/).filter((l) => row.chargeable(toolCps(l)).some(row.isCharged)).length;
}
