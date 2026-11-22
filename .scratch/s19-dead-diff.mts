import { readFileSync } from "node:fs";

function load(p: string): string {
  return readFileSync(p, "utf8").replace(/\x1b\[[0-9;]*m/g, "").replace(/\0/g, "");
}

function entries(t: string): Set<string> {
  const res = new Set<string>();
  let cur: string | null = null;
  for (const line of t.split(/\r?\n/)) {
    if (/^\.tsx?$|^D:/.test(line.trim()) && line.trim().endsWith(".ts")) {
      cur = line.trim();
      continue;
    }
    const b = line.match(/branch@(\d+)/);
    if (b && cur) res.add(`${cur.split("game-model\\src\\")[1] ?? cur}:${b[1]}`);
  }
  return res;
}

const o = entries(load(".scratch/dead-rep2.txt"));
const n = entries(load(".scratch/s19-dead-r2.txt"));
const gone = [...o].filter((x) => !n.has(x)).sort();
const added = [...n].filter((x) => !o.has(x)).sort();
console.log(`old dead ${o.size} / new dead ${n.size}`);
console.log(`--- 消失 ${gone.length} ---`);
gone.forEach((x) => console.log(x));
console.log(`--- 新增 ${added.length} ---`);
added.forEach((x) => console.log(x));
