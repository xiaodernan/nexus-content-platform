import { readFileSync } from "node:fs";
const parse = (p) => {
  let file = "?";
  const out = [];
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^(\S+\.ts)（/);
    if (m) { file = m[1]; continue; }
    const a = line.match(/^\s+:(\d+)\s+(.*)$/);
    if (a) out.push({ file, line: Number(a[1]), text: a[2] });
  }
  return out;
};
const key = (a) => `${a.file}::${a.text}`;
const multiset = (arr) => { const m = new Map(); for (const a of arr) m.set(key(a), (m.get(key(a)) ?? 0) + 1); return m; };
const base = parse(".scratch/s20-arms-base.txt");
const final = parse(".scratch/s20-arms-final.txt");
const b = multiset(base), f = multiset(final);
console.log(`base=${base.length} final=${final.length}`);
const added = [];
for (const [k, n] of f) if ((b.get(k) ?? 0) < n) added.push(`${k} (final ${n} vs base ${b.get(k) ?? 0})`);
console.log("按 文件+臂文本 比对，final 里新增的死臂：\n" + (added.join("\n") || "（空）"));
const gone = [];
for (const [k, n] of b) if ((f.get(k) ?? 0) < n) gone.push(`${k} (base ${n} -> final ${f.get(k) ?? 0})`);
console.log(`\nbase 里有、final 没了的（${gone.length} 类）：\n` + gone.join("\n"));
