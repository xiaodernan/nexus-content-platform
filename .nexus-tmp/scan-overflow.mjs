// scratch: for every running row, take the LAST console.log statement in source and measure the bytes it
// prints MINUS its interpolations (a lower bound on the printed length). Over the runner's 300-byte bound
// means the gutter is guaranteed to be cut.
import { readFileSync } from 'node:fs';
import { derivePopulation, splitSet } from '../tools/ci/proof-set.mjs';

const rows = splitSet(derivePopulation(JSON.parse(readFileSync('./package.json', 'utf8')).scripts)).running;
const BOUND = 300;

/** Drop balanced ${...} interpolations, leaving the literal text the row will print at minimum. */
function staticText(arg) {
  let out = '';
  let depth = 0;
  for (let i = 0; i < arg.length; i++) {
    if (arg[i] === '$' && arg[i + 1] === '{') { depth++; i++; continue; }
    if (depth > 0) { if (arg[i] === '{') depth++; else if (arg[i] === '}') depth--; continue; }
    out += arg[i];
  }
  return out.replace(/\\n/g, '\n').replace(/\\t/g, ' ').replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function lastPrint(file) {
  const lines = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const at = lines[i].lastIndexOf('console.log(');
    if (at < 0) continue;
    if (/\/\*|^\s*(\*|\/\/)/.test(lines[i].slice(0, at))) continue;
    // gather until the call's closing paren, across lines
    let text = lines[i].slice(at + 'console.log('.length);
    let j = i;
    let opens = (text.match(/\(/g) || []).length - (text.match(/\)/g) || []).length;
    while (opens > 0 && j + 1 < lines.length) { j++; text += '\n' + lines[j]; opens = (text.match(/\(/g) || []).length - (text.match(/\)/g) || []).length; }
    const q = /^\s*[`'"]/.exec(text);
    if (!q) return { name: null, bytes: -1 };
    const quote = text.trimStart()[0];
    const end = text.indexOf(quote, text.indexOf(quote) + 1);
    const body = end > 0 ? text.slice(text.indexOf(quote) + 1, end) : text.slice(text.indexOf(quote) + 1);
    const stat = staticText(body);
    return { name: null, bytes: Buffer.byteLength(stat, 'utf8'), full: stat, interpolations: (body.match(/\$\{/g) || []).length, head: body.slice(0, 40) };
  }
  return { bytes: 0, interpolations: 0 };
}

const over = [];
let multiLine = 0;
for (const r of rows) {
  let m;
  try { m = lastPrint(r.file); } catch { continue; }
  if (m.bytes < 0) continue;
  // The gutter holds the row's last LINE, so the quantity that matters is the last line of what the literal
  // prints — a template that ends `...\nthe tail` contributes only "the tail".
  const segments = (m.full || '').split(/\n/);
  if (segments.length > 1) multiLine++;
  const lastSegBytes = Buffer.byteLength(segments[segments.length - 1], 'utf8');
  if (lastSegBytes > BOUND) over.push({ name: r.name, bytes: lastSegBytes, whole: m.bytes, interp: m.interpolations, head: segments[segments.length - 1].slice(0, 44) });
}
over.sort((a, b) => b.bytes - a.bytes);
console.log(`rows printing more than one line at all: ${multiLine}`);
console.log(`rows whose LAST PRINTED LINE has static (interpolation-free) text over ${BOUND} bytes — its gutter is guaranteed to be cut: ${over.length} of ${rows.length}`);
for (const o of over) console.log(`  ${String(o.bytes).padStart(4)}B  ${o.name.padEnd(24)} · whole literal ${o.whole}B · ${o.interp} interpolation(s) · ${o.head}`);
