// Reads a hosted proofs log: OK rows, gutters, the byte length of each gutter, which are cut at the bound.
import { readFileSync } from 'node:fs';

const lines = readFileSync(process.argv[2], 'utf8')
  .replace(/\r\n/g, '\n')
  .split('\n')
  .map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').replace(/^[^\t]*\t[^\t]*\t/, '').replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z ?/, ''));

const ROW = /^ {2}(verify:\S+)\s+\S+ .*\.\.\. (OK|RED) \S+$/;
const GUT = /^ {6}\| (.*)$/;

const named = [];
const gutters = [];
const reds = [];
for (const body of lines) {
  const m = ROW.exec(body);
  if (m) {
    named.push({ name: m[1], verdict: m[2] });
    if (m[2] === 'RED') reds.push(body);
  }
  const g = GUT.exec(body);
  if (g) gutters.push({ after: named.length ? named[named.length - 1].name : '?', text: g[1] });
}

console.log(`rows ${named.length} · OK ${named.filter((r) => r.verdict === 'OK').length} · RED ${named.filter((r) => r.verdict === 'RED').length} · gutters ${gutters.length}`);
const cut = gutters.filter((g) => Buffer.byteLength(g.text) === 300);
const over = gutters.filter((g) => Buffer.byteLength(g.text) > 300);
const house = gutters.filter((g) => /^\[(cleanup|teardown|finally|housekeeping)\]/i.test(g.text));
const silence = gutters.filter((g) => g.text === '(the row printed nothing)');
const brace = gutters.filter((g) => /^[{}]\s*$/.test(g.text));
console.log(`cut at exactly 300 bytes: ${cut.length} · over 300: ${over.length} · housekeeping: ${house.length} · named silence: ${silence.length} · lone brace: ${brace.length}`);
console.log(`longest gutter: ${Math.max(...gutters.map((g) => Buffer.byteLength(g.text)))} bytes · shortest: ${Math.min(...gutters.map((g) => Buffer.byteLength(g.text)))}`);
console.log('--- the cut gutters (row :: last 40 bytes of what the log carries) ---');
for (const g of cut) console.log(`${g.after} :: …${g.text.slice(-40)}`);
console.log('--- the over-bound gutters, if any ---');
for (const g of over) console.log(`${g.after} :: ${Buffer.byteLength(g.text)}B :: ${g.text.slice(0, 60)}`);
console.log('--- housekeeping gutters, if any ---');
for (const g of house) console.log(`${g.after} :: ${g.text.slice(0, 80)}`);
for (const r of reds) console.log(`RED row: ${r}`);
const pop = lines.find((l) => /green of a derived population/.test(l));
console.log(`population line: ${pop ? pop.trim() : 'NOT FOUND'}`);
const s12 = lines.filter((l) => /\[§12\]|§12/.test(l));
console.log(`§12 lines: ${s12.length}${s12.length ? ` :: ${s12[0].trim().slice(0, 160)}` : ''}`);
const rc = gutters.find((g) => /arm/.test(g.text));
console.log(`receipt gutter: ${rc ? rc.text.slice(0, 120) : 'none'}`);
