import { readFileSync } from "node:fs";
type Entry = { type: string; line: number; locations: { start: { line: number; column: number }; end: { line: number; column: number } }[] };
type Cov = Record<string, { branchMap: Record<string, Entry>; b: Record<string, number[]> }>;
const load = (f: string) => JSON.parse(readFileSync(f, "utf8")) as Cov;
const flat = (o: Cov) => {
  const m = new Map<string, string>();
  for (const [p, c] of Object.entries(o)) {
    const name = p.split(/[\\/]/).pop() as string;
    for (const [id, e] of Object.entries(c.branchMap)) {
      const key = `${name} ${e.type}:${e.line} ${(e.locations ?? []).map((l) => `${l.start.line}:${l.start.column}-${l.end.line}:${l.end.column}`).join(",")}`;
      m.set(key, (c.b[Number(id)] ?? []).join(","));
    }
  }
  return m;
};
const [fa, fb] = process.argv.slice(2);
const a = flat(load(fa as string));
const b = flat(load(fb as string));
let onlyA = 0;
let onlyB = 0;
let diffCounts = 0;
for (const [k, v] of a) {
  if (!b.has(k)) {
    onlyA++;
    console.log(`只在第一份：${k} counts=${v}`);
  } else if (b.get(k) !== v) {
    diffCounts++;
    console.log(`计数不同：  ${k}  ${v} → ${b.get(k)}`);
  }
}
for (const [k, v] of b) if (!a.has(k)) { onlyB++; console.log(`只在第二份：${k} counts=${v}`); }
console.log(`\n只在第一份 ${onlyA}、只在第二份 ${onlyB}、计数不同 ${diffCounts}`);
