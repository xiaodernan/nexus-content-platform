import fs from 'node:fs';

// Common double-encodings: UTF-8 bytes of a punctuation char decoded as CP1252/GBK and re-saved as UTF-8.
const MAP = {
  '\u9225\u003f': '\u2014',           // em dash, GBK-misread
  '\u697c': '\u00a7',                  // section sign, GBK-misread
  '\u00e2\u20ac\u201d': '\u201c',
  '\u00e2\u20ac\u201d': '\u201c',
  '\u00e2\u20ac\u201c': '\u2019',
  '\u00e2\u20ac\u009c': '\u201c',
  '\u00e2\u20ac\u009d': '\u201d',
  '\u00e2\u20ac\u00a6': '\u2026',
};

const targets = process.argv.slice(2);
const out = [];
for (const f of targets) {
  const t = fs.readFileSync(f, 'utf8');
  const lines = t.split(/\r?\n/);
  lines.forEach((l, i) => {
    const bad = Object.keys(MAP).filter((k) => l.includes(k));
    if (bad.length) out.push(`${f}:${i + 1} [${bad.map((b) => JSON.stringify(b)).join(',')}}\n    ${l}\n    => ${Object.entries(MAP).reduce((acc, [k, v]) => acc.split(k).join(v), l)}`);
  });
}
console.log(out.length);
fs.writeFileSync('.nexus-tmp/mojibake-lines.txt', out.join('\n') + '\n', 'utf8');
