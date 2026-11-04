import fs from 'node:fs';

for (const f of process.argv.slice(2)) {
  const t = fs.readFileSync(f, 'utf8');
  const counts = new Map();
  for (const ch of t) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80 || cp >= 0x4e00 && cp <= 0x9fff && ch !== '\u9225') continue;
    counts.set(cp, (counts.get(cp) || 0) + 1);
  }
  const sus = [...counts.entries()]
    .filter(([cp]) => !(cp >= 0x4e00 && cp <= 0x9fff))
    .sort((a, b) => b[1] - a[1]);
  console.log(`${f} suspicious non-CJK non-ASCII codepoints:`);
  for (const [cp, n] of sus) console.log(`  U+${cp.toString(16).toUpperCase().padStart(4, '0')} ${JSON.stringify(String.fromCodePoint(cp))} x${n}`);
}
