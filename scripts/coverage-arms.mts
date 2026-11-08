// §85 第十八片：把覆盖率读数里"从没执行过的那一段"点名到源码。
// `--coverage` 的 text 表只给百分比，答不了"清单漏列了哪一条"——那需要行号，还要那一段的字。
// v8 provider 的一条 branch = 一段从没被走过的块（不是 if/else 的两臂），所以打出来的是块本身的源码；
// 不打印源码就会判错（这一片就判错过两条：`sim.ts:215` 与 `rpg.ts:243`）。
// 用法：npm run coverage:models 之后 `npm run coverage:arms`，或 `npm run coverage:arms -- story.ts play.ts`。
import { existsSync, readFileSync } from "node:fs";

const FILE = "coverage/coverage-final.json";
if (!existsSync(FILE)) {
  console.error(`${FILE} 不存在——先跑一次 npm run coverage:models（同一时间只能跑一条覆盖率任务）。`);
  process.exit(1);
}

const filters = process.argv.slice(2);
type Entry = { type: string; line: number; locations: { start: { line: number; column: number }; end: { line: number; column: number } }[] };
const data = JSON.parse(readFileSync(FILE, "utf8")) as Record<
  string,
  { branchMap: Record<string, Entry>; b: Record<string, number[]> }
>;

let arms = 0;
let dead = 0;
const rows: string[] = [];
for (const [path, cov] of Object.entries(data)) {
  const short = path.split(/[\\/]/).pop() ?? path;
  if (filters.length && !filters.some((f) => short.includes(f))) continue;
  const src = readFileSync(path, "utf8").split(/\r?\n/);
  const hits: string[] = [];
  for (const [id, entry] of Object.entries(cov.branchMap)) {
    const counts = cov.b[Number(id)] ?? [];
    entry.locations.forEach((loc, i) => {
      arms += 1;
      if (counts[i] !== 0) return;
      dead += 1;
      const text = src[loc.start.line - 1]?.slice(loc.start.column, loc.end.column) ?? "(越界)";
      hits.push(`  :${loc.start.line}  ${JSON.stringify(text)}`);
    });
  }
  if (hits.length) rows.push(`${short}（${hits.length} 段没执行）\n${hits.join("\n")}`);
}
console.log(rows.join("\n\n") || "这个范围里没有没执行过的分支段");
console.log(`\n合计：${arms} 段、没执行过 ${dead} 段`);
