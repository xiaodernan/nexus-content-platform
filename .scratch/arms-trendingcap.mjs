// §SEC 第四十四片的变异电池：方法句里那个候选集上限，SQL 那一端必须继续按名字读同一个常数。
// 跑法：node .scratch/arms-trendingcap.mjs      （只跑一条：ARM_ONLY=X1）
// 每条臂先写预测红/绿名单再跑；跑完按 sha1 校验两个文件回到臂前字节。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const SOCIAL = "apps/web/src/server/domain/social.ts";
const TRENDING = "apps/web/src/server/domain/trending.ts";
const FILES = [SOCIAL, TRENDING];
const TESTS = ["apps/web/test/trending-cap-reader.test.ts", "apps/web/test/trending.test.ts"];
const OUT = process.env.ARM_OUT ?? ".scratch/arms-trendingcap.txt";

const LIMIT_LINE = ".limit(input.sort === 'trending' ? TRENDING_CANDIDATE_CAP : limit);";
const IMPORT_LINE = "  TRENDING_CANDIDATE_CAP,\n";

const ARMS = [
  {
    id: "X1",
    what: "候选集上限手抄成 200（今天恰好相等，常数改了它不跟着改）",
    edits: [{ file: SOCIAL, old: LIMIT_LINE, new: ".limit(input.sort === 'trending' ? 200 : limit);" }],
    pred: ["trending 那一支的 limit 参数按名字读 TRENDING_CANDIDATE_CAP"],
    not: ["social.ts 里能找到 discover 的函数体", "discover 里只有一处 .limit(", "方法句里那个数与 SQL 读的是同一个常数", "SQL 那一端读的就是句子这一端的同一个 binding", "页面上复述的方法句里"],
  },
  {
    id: "X2",
    what: "候选集跟着页长走（.limit(limit)）——句子还说 200",
    edits: [{ file: SOCIAL, old: LIMIT_LINE, new: ".limit(limit);" }],
    pred: ["trending 那一支的 limit 参数按名字读 TRENDING_CANDIDATE_CAP"],
    not: ["social.ts 里能找到 discover 的函数体", "方法句里那个数与 SQL 读的是同一个常数", "SQL 那一端读的就是句子这一端的同一个 binding"],
  },
  {
    id: "X3",
    what: "social.ts 自己另声明一份 TRENDING_CANDIDATE_CAP = 500（两份真值，SQL 读的是自己那份）",
    edits: [
      { file: SOCIAL, old: IMPORT_LINE, new: "" },
      {
        file: SOCIAL,
        old: "const DISCOVER_UNAVAILABLE =",
        new: "const TRENDING_CANDIDATE_CAP = 500;\n\nconst DISCOVER_UNAVAILABLE =",
      },
    ],
    pred: ["SQL 那一端读的就是句子这一端的同一个 binding"],
    not: ["trending 那一支的 limit 参数按名字读 TRENDING_CANDIDATE_CAP", "方法句里那个数与 SQL 读的是同一个常数", "social.ts 里能找到 discover 的函数体"],
  },
  {
    id: "X4",
    what: "反向对照：把常数本身从 200 改成 50（两端都派生，应当全绿——门不许惩罚正当改动）",
    edits: [{ file: TRENDING, old: "export const TRENDING_CANDIDATE_CAP = 200;", new: "export const TRENDING_CANDIDATE_CAP = 50;" }],
    pred: [],
    not: ["trending 那一支的 limit 参数按名字读 TRENDING_CANDIDATE_CAP", "方法句里那个数与 SQL 读的是同一个常数", "SQL 那一端读的就是句子这一端的同一个 binding", "social.ts 里能找到 discover 的函数体", "discover 里只有一处 .limit(", "页面上复述的方法句里"],
  },
];

function loadLf(file) {
  const raw = readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  if (crlf && raw.replace(/\r\n/g, "\n").includes("\r")) throw new Error(`${file} 混合 EOL，拒绝splice`);
  if (crlf && raw.includes("\n") && raw.split("\r\n").length - 1 !== (raw.match(/\n/g) ?? []).length)
    throw new Error(`${file} 混合 EOL，拒绝splice`);
  return { file, text: raw.replace(/\r\n/g, "\n"), crlf };
}
function save(a, text) {
  writeFileSync(a.file, a.crlf ? text.replace(/\n/g, "\r\n") : text);
}
function sha(file) {
  return createHash("sha1").update(readFileSync(file)).digest("hex");
}

function runTest(label) {
  const jsonPath = `.scratch/arms-trendingcap-${label}.json`;
  const run = spawnSync("npx", ["vitest", "run", ...TESTS, "--reporter=json", `--outputFile=${jsonPath}`], {
    encoding: "utf8",
    timeout: 420000,
    shell: true,
  });
  if (!existsSync(jsonPath)) return { note: `没有可读的 json 报告（vitest exit=${run.status}）`, total: 0, failed: [], exit: run.status };
  const report = JSON.parse(readFileSync(jsonPath, "utf8"));
  const failed = [];
  let total = 0;
  for (const suite of report.testResults ?? []) {
    for (const a of suite.assertionResults ?? []) {
      total += 1;
      if (a.status === "failed") failed.push([...(a.ancestorTitles ?? []), a.title].join(" "));
    }
  }
  return { total, failed, exit: run.status, note: "" };
}

function grade(arm, res) {
  const miss = arm.pred.filter((p) => !res.failed.some((f) => f.includes(p)));
  const leaked = arm.not.filter((n) => res.failed.some((f) => f.includes(n)));
  const extra = res.failed.filter((f) => !arm.pred.some((p) => f.includes(p)));
  return { miss, leaked, extra };
}

const lines = [];
const base = FILES.map((f) => ({ f, hash: sha(f) }));
const only = process.env.ARM_ONLY;

const control = runTest("control");
lines.push(`对照（源码未变异） total=${control.total} failed=${control.failed.length} exit=${control.exit}${control.note ? " " + control.note : ""}`);
if (control.failed.length) {
  lines.push("  对照就红，电池作废：");
  for (const f of control.failed) lines.push("    " + f);
  writeFileSync(OUT, lines.join("\n") + "\n");
  console.log(lines.join("\n"));
  process.exit(1);
}

let aborted = false;
for (const arm of ARMS) {
  if (only && arm.id !== only) continue;
  const saved = FILES.map(loadLf);
  const before = FILES.map((f) => sha(f));
  try {
    for (const e of arm.edits) {
      const a = saved.find((s) => s.file === e.file);
      const hits = a.text.split(e.old).length - 1;
      if (e.old === "" || hits !== 1) throw new Error(`${arm.id} 的 needle 在 ${e.file} 里命中 ${hits} 次（要求恰好 1）：${e.old.slice(0, 60)}`);
      a.text = a.text.replace(e.old, e.new);
    }
    for (const a of saved) save(a, a.text);
    const res = runTest(arm.id);
    const g = grade(arm, res);
    lines.push("");
    lines.push(`${arm.id} 变异=${arm.what}`);
    lines.push(`    预测红：${arm.pred.join(" / ") || "（无——这条臂应当全绿）"}`);
    lines.push(`    预测绿：${arm.not.join(" / ")}`);
    lines.push(`    实测 total=${res.total} failed=${res.failed.length} exit=${res.exit}${res.note ? " " + res.note : ""}`);
    if (res.failed.length) {
      lines.push("    红名单：");
      for (const f of res.failed) lines.push("      " + f);
    }
    lines.push(`    ${g.miss.length === 0 ? "pred 全中" : "PRED MISS: " + g.miss.join(" | ")} · ${g.leaked.length === 0 ? "not 全绿" : "NOT LEAKED: " + g.leaked.join(" | ")}`);
    if (g.extra.length) {
      lines.push(`    另红 ${g.extra.length} 条（不在预测里）：`);
      for (const f of g.extra) lines.push("      " + f);
    }
    if (g.miss.length || g.leaked.length) aborted = true;
  } catch (err) {
    lines.push("");
    lines.push(`${arm.id}  harness 错误：${err.message}`);
    aborted = true;
  }
  // 还原：把臂前字节写回去（saved 已被变异，故用 git 的那一份；按文件自己的 EOL 重新编码）
  for (const f of FILES) {
    const head = spawnSync("git", ["show", `HEAD:${f}`], { encoding: "utf8" });
    if (head.status === 0) {
      const a = saved.find((s) => s.file === f);
      save(a, head.stdout.replace(/\r\n/g, "\n"));
    }
  }
  const after = FILES.map((f) => sha(f));
  const ok = after.every((h, i) => h === before[i]);
  lines.push(`    还原校验：${ok ? "OK" : "MISMATCH " + FILES.filter((f, i) => after[i] !== before[i]).join(",")}`);
  if (!ok) { aborted = true; break; }
}

lines.push("");
lines.push(`aborted=${aborted ? "yes" : "no"}`);
const restoreOk = base.every((b) => sha(b.f) === b.hash);
lines.push(`收尾整树校验：${FILES.map((f, i) => `${f.split("/").pop()}=${sha(f) === base[i].hash ? "OK" : "DIRTY"}`).join(" ")}${restoreOk ? "" : " —— 电池结束时树不是臂前状态"}`);
writeFileSync(OUT, lines.join("\n") + "\n");
console.log(lines.join("\n"));
process.exit(aborted || !restoreOk ? 1 : 0);