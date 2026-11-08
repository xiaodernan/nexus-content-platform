// §85 第十八片的变异臂：覆盖率仪器点出来的那一臂（story.ts:156 的 `unreachable.length > 5`）
// 补上的那一行清单、还有它带来的那条旁路（`inner`）是不是真有牙。
// 纪律与前两片同一条：改完必红、跑完必还原并比 md5；"没红"就是这一格是空的，照实写进文档。
// 投影侧的臂只改 story.ts：plan.json 由同一个 compileStory 生成，改它等于两侧同时改——
// 逐步对账必然绿，能红的只有清单与哨兵，这正是第十七片定下来的读法。
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const ESC = String.fromCharCode(27);
const md5 = (b) => createHash("md5").update(b).digest("hex");
const clean = (s) => s.replace(new RegExp(ESC + "\\[[0-9;]*m", "g"), "");

const TEST = "packages/game-model/test/story-parity.test.ts";
const STORY = "packages/game-model/src/story.ts";

const ARMS = [
  {
    id: "AC",
    claim: "产品侧改阈值：那句截断从 > 5 挪到 > 50（六个名字只列五个、又不再交代「等 6 条」——悄悄少说一条）",
    edits: [{ file: STORY, from: "unreachable.length > 5", to: "unreachable.length > 50" }],
  },
  {
    id: "AD",
    claim: "旁路变正门：把一句主话（悬空引用那句）标成 inner，想从 push 等式里少算一句",
    edits: [
      {
        file: TEST,
        from: '{ rule: "悬空引用那句「这些选项被跳过」", phrase: "指向的实体不在文档里", triggers: (r) => refShape(r.document).dangling > 0 },',
        to: '{ rule: "悬空引用那句「这些选项被跳过」", phrase: "指向的实体不在文档里", triggers: (r) => refShape(r.document).dangling > 0, inner: "多条互不相连的线时那句「从这里走不到的 N 条」" },',
      },
    ],
  },
  {
    id: "AE",
    claim: "臂挂错句：「等 N 条」嘴上说挂在收尾那句（它其实长在互不相连那句里）",
    edits: [{ file: TEST, from: 'inner: "多条互不相连的线时那句「从这里走不到的 N 条」",', to: 'inner: "收尾那句「对话之间可以互相指成环」",', }],
  },
  {
    id: "AF",
    claim: "臂与主话同进同出：那行的认字改成主话自己的字（它就不是臂了，是偷偷不进等式的第二句）",
    edits: [{ file: TEST, from: 'phrase: / 等 \\d+ 条/,', to: 'phrase: "条互不相连的对话线",', }],
  },
  {
    id: "AG",
    claim: "门自己变空：那一行的触发条件改成没有一份底稿落得到的形状",
    edits: [{ file: TEST, from: "triggers: (r) => rootCount(r.plan) - 1 > 5,", to: "triggers: (r) => rootCount(r.plan) - 1 > 500,", }],
  },
  {
    id: "AH",
    claim: "第十七片的臂 Z 重跑：清单从 joined 串改成逐条 note 认字之后，改阈值那一刀还咬得住吗",
    edits: [{ file: STORY, from: "  if (endings) {", to: "  if (endings > 1) {", }],
  },
];

const only = process.argv[2];
const queue = only ? ARMS.filter((a) => a.id === only) : ARMS;
if (!queue.length) throw new Error(`臂 ${only} 不存在：只有 ${ARMS.map((a) => a.id).join("/")}`);

function runVitest() {
  try {
    const out = execFileSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", TEST], {
      cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", CI: "1" },
    });
    return { failed: false, text: out };
  } catch (err) {
    if (!err.stdout && !err.stderr && err.code) throw new Error(`跑 vitest 这件事本身失败了（code=${err.code}），不是门红：${err.message}`);
    return { failed: true, text: `${err.stdout || ""}${err.stderr || ""}` };
  }
}

function readings(text) {
  const t = clean(text);
  const counts = (t.match(/^\s*Tests .*/m) || ["(读数里没找到 Tests 那一行)"])[0].trim();
  const fails = [...t.matchAll(/FAIL [^\n]*> ([^\n]+)/g)].map((m) => m[1].trim());
  const messages = [...t.matchAll(/→ ([^\n]+)/g)].map((m) => m[1].trim());
  const asserted = [...t.matchAll(/AssertionError: ([^\n]*)/g)].map((m) => m[1].trim());
  return { counts, fails, messages, asserted };
}

const report = [];
for (const arm of queue) {
  const originals = new Map();
  for (const edit of arm.edits) {
    if (!originals.has(edit.file)) originals.set(edit.file, Buffer.from(readFileSync(edit.file)));
    const body = originals.get(edit.file).toString();
    const hits = body.split(edit.from).length - 1;
    if (hits !== 1) throw new Error(`臂 ${arm.id}：${edit.file} 里那句出现 ${hits} 次（要的是恰好 1 次），停下\n  ${edit.from}`);
  }
  const backup = new Map([...originals].map(([file, buf]) => [file, Buffer.from(buf)]));
  try {
    for (const edit of arm.edits) {
      const current = originals.get(edit.file).toString();
      const mutated = current.replace(edit.from, edit.to);
      if (mutated === current) throw new Error(`臂 ${arm.id}：${edit.file} 替换后字节没变`);
      originals.set(edit.file, Buffer.from(mutated));
    }
    for (const [file, buf] of originals) writeFileSync(file, buf);
    const result = runVitest();
    writeFileSync(`.scratch/arm18-${arm.id}.txt`, clean(result.text));
    report.push({ id: arm.id, claim: arm.claim, failed: result.failed, ...readings(result.text) });
  } finally {
    for (const [file, buf] of backup) writeFileSync(file, buf);
    for (const [file, buf] of backup) {
      if (md5(readFileSync(file)) !== md5(buf)) throw new Error(`臂 ${arm.id}：${file} 还原后字节不一致——停下`);
    }
  }
}

for (const r of report) {
  console.log(`\n===== 臂 ${r.id}：${r.claim}`);
  console.log(`门红了吗：${r.failed ? "红了" : "没红（这一格的门是空的）"}`);
  console.log(`读数：${r.counts}`);
  const rules = r.fails.filter((f) => f.includes("清单") || f.includes("正反比一遍") || f.includes("对得上"));
  console.log(`清单那几条门红的条数：${rules.length}${rules.length ? `（${rules.join("、")}）` : ""}`);
  for (const f of r.fails.slice(0, 8)) console.log(`  红的线：${f}`);
  if (r.fails.length > 8) console.log(`  …另外 ${r.fails.length - 8} 条`);
  for (const m of r.messages.slice(0, 4)) console.log(`  → ${m}`);
  for (const a of r.asserted.slice(0, 4)) console.log(`  断言：${a}`);
}

const sanity = runVitest();
console.log(`\n===== 全部还原后复跑 story-parity：${sanity.failed ? "还是红的" : "绿"}`);
console.log(`读数：${readings(sanity.text).counts}`);
if (sanity.failed) console.log(clean(sanity.text).split("\n").slice(-30).join("\n"));
