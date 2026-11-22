// §SEC 第四十三片的变异电池：额度页那一列的解释「说的是哪道门、拦在哪条边界」，
// 门改口径时句子会不会跟着改口——只有把门改错才看得出来。
// 每臂：打补丁（needle 必须命中恰好 1 次）→ 只跑三个 credits 单元文件 → 记红掉的用例 → 逐字节还原并校验 sha1。
// pred = 必须红的用例名片段；not = 必须保持绿的用例名片段（少了这一列，"全红"也算对上预测）。
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CREDITS = "apps/web/src/server/domain/credits.ts";
const LEDGER = "apps/web/src/server/domain/credit-ledger.ts";
const TESTS = [
  "apps/web/test/credits-why-guards.test.ts",
  "apps/web/test/credits-enforced-copy.test.ts",
  "apps/web/test/credits.test.ts",
];

const ARMS = [
  {
    id: "W1",
    what: "generation 的 module 从 credit-ledger 改成 credits（地址写错模块）",
    edits: [
      { file: CREDITS, old: "    module: 'credit-ledger',\n    guard: 'refusalForRun',", new: "    module: 'credits',\n    guard: 'refusalForRun'," },
    ],
    pred: ["每个 module + guard 都能真的解析出一个函数", "generation 点名的那道门，身体里就是按 GENERATION_COST"],
    not: ["名册与已生效那一列一格不多一格不少", "storage「放不下」"],
  },
  {
    id: "W2",
    what: "storage 的 guard 改成一个不存在的名字（门改名/删导出，句子还说它拦着）",
    edits: [{ file: CREDITS, old: "guard: 'refusalForStorage',", new: "guard: 'refusalForStorageBytes'," }],
    pred: [
      "每个 module + guard 都能真的解析出一个函数",
      "被点名的门都真有调用点",
      "storage「放不下」",
    ],
    not: ["aiUsage「余额不够这一次要用的点数」", "publishing「达到档位上限」"],
  },
  {
    id: "W3",
    what: "refusalFor 的边界从 balance >= cost 收紧成 balance > cost（刚好够也不再放行）",
    edits: [{ file: CREDITS, old: "if (check.balance >= check.cost) return null;", new: "if (check.balance > check.cost) return null;" }],
    pred: ["aiUsage「余额不够这一次要用的点数」", "generation 那一格的点数与 aiUsage 同源"],
    not: ["storage「放不下」", "teamCollaboration「达到档位上限」"],
  },
  {
    id: "W4",
    what: "aiUsage 那句点数改回手抄，同时把 GENERATION_COST.image 从 2 改成 3（成本变了、句子不改口）",
    edits: [
      {
        file: CREDITS,
        old: "why: `余额不够这一次要用的点数时新的 AI 任务被挡下（ai 类一次 ${GENERATION_COST.ai} 点，image ${GENERATION_COST.image} 点、video ${GENERATION_COST.video} 点）`",
        new: "why: '余额不够这一次要用的点数时新的 AI 任务被挡下（ai 类一次 1 点，image 2 点、video 5 点）'",
      },
      { file: CREDITS, old: "  image: 2,", new: "  image: 3," },
    ],
    pred: ["aiUsage 那句里的三个点数逐字等于 GENERATION_COST"],
    not: ["aiUsage「余额不够这一次要用的点数」", "generation 那一格的点数与 aiUsage 同源"],
  },
  {
    id: "W5",
    what: "teamCollaboration 那句改回旧口径「pending 邀请也占名额」（#213 之后不成立）",
    edits: [
      {
        file: CREDITS,
        old: "why: '协作者数达到档位上限时新的邀请会被挡下（成员与没过期也没兑现的邀请占名额，过期、撤回或移除都释放名额）'",
        new: "why: '协作者数达到档位上限时新的邀请会被挡下（成员与 pending 邀请也占名额，撤回或移除即释放）'",
      },
    ],
    pred: [
      "页面端出去那句话里没有任一条旧措辞",
      "credits.ts 的散文里也没有",
      "teamCollaboration 那句改口成「过期不占名额」",
    ],
    not: ["aiUsage「余额不够这一次要用的点数」", "publishing「达到档位上限」"],
  },
  {
    id: "W6",
    what: "删掉 teamSlotRefusalFor 里那道 expiresAt 过滤（判据改了，句子的「过期不占」又成空话）",
    edits: [{ file: LEDGER, old: "        gt(projectInvites.expiresAt, new Date()),\n", new: "" }],
    pred: ["teamCollaboration 那句改口成「过期不占名额」"],
    not: ["页面端出去那句话里没有任一条旧措辞", "teamCollaboration「达到档位上限」"],
  },
  {
    id: "W7",
    what: "publishing 与 teamCollaboration 的 guard 名字对调（两道门都在、都有调用点，只是句子说错了对象）",
    edits: [
      { file: CREDITS, old: "guard: 'refusalForPublishSlot',", new: "guard: '__SWAP__'," },
      { file: CREDITS, old: "guard: 'refusalForTeamSlot',", new: "guard: 'refusalForPublishSlot'," },
      { file: CREDITS, old: "guard: '__SWAP__',", new: "guard: 'refusalForTeamSlot'," },
    ],
    pred: ["publishing「达到档位上限」", "teamCollaboration「达到档位上限」"],
    not: ["每个 module + guard 都能真的解析出一个函数", "被点名的门都真有调用点"],
  },
];

const sha = (buf) => createHash("sha1").update(buf).digest("hex").slice(0, 12);
const only = (process.env.ARM_ONLY ?? "").split(",").filter(Boolean);
const outFile = process.env.ARM_OUT ?? ".scratch/arms-creditswhy.txt";
const outDir = mkdtempSync(join(tmpdir(), "arms-creditswhy-"));
const FILES = [CREDITS, LEDGER];
const pristine = new Map(FILES.map((f) => [f, readFileSync(f)]));
const lines = [];
let aborted = null;

/** needle 一律按 LF 写；文件若是 CRLF 就先把换行还原成它自己的形状（混合换行直接拒绝） */
function loadLf(file) {
  const raw = readFileSync(file).toString("utf8");
  const crlf = (raw.match(/\r\n/g) ?? []).length;
  if (crlf > 0 && crlf !== (raw.match(/\n/g) ?? []).length) throw new Error(`${file} 换行混合，臂不打了`);
  return { file, text: raw.replace(/\r\n/g, "\n"), crlf: crlf > 0 };
}
function save({ file, text, crlf }) {
  writeFileSync(file, crlf ? text.replace(/\n/g, "\r\n") : text, "utf8");
}

function runTest(label) {
  const jsonPath = join(outDir, `${label}.json`);
  const run = spawnSync("npx", ["vitest", "run", ...TESTS, "--reporter=json", `--outputFile=${jsonPath}`], {
    encoding: "utf8",
    shell: true,
    timeout: 420000,
    maxBuffer: 64 * 1024 * 1024,
  });
  let failed = [];
  let total = -1;
  let note = "";
  try {
    const report = JSON.parse(readFileSync(jsonPath, "utf8"));
    total = report.numTotalTests;
    for (const suite of report.testResults ?? []) {
      for (const a of suite.assertionResults ?? []) {
        if (a.status === "failed") failed.push(a.fullName ?? a.title);
      }
    }
  } catch {
    note = `没有可读的 json 报告（vitest exit=${run.status}）`;
    failed = (run.stdout ?? "").split(/\r?\n/).filter((l) => /FAIL|Error:/.test(l)).slice(0, 12);
  }
  return { total, failed, exit: run.status, note };
}

function grade(result, arm) {
  const miss = (arm.pred ?? []).filter((p) => !result.failed.some((f) => String(f).includes(p)));
  const leaked = (arm.not ?? []).filter((p) => result.failed.some((f) => String(f).includes(p)));
  return { miss, leaked };
}

try {
  const control = runTest("control");
  const cGrade = grade(control, { pred: [], not: [...(ARMS.flatMap((a) => [...(a.pred ?? [])]))] });
  lines.push(
    `对照（源码未变异） total=${control.total} failed=${control.failed.length} exit=${control.exit}` +
      (control.note ? ` [${control.note}]` : "") +
      (cGrade.leaked.length ? ` [对照就有预测要红的用例：${cGrade.leaked.join(" / ")}]` : ""),
  );
  console.log(lines[0]);

  for (const arm of ARMS.filter((a) => !only.length || only.includes(a.id))) {
    const applied = [];
    for (const edit of arm.edits) {
      const cur = applied.find((a) => a.file === edit.file) ?? loadLf(edit.file);
      const hits = cur.text.split(edit.old).length - 1;
      if (hits !== 1) {
        aborted = `${arm.id}：needle 在 ${edit.file} 里出现 ${hits} 次（要正好 1 次），这条臂没打上去`;
        break;
      }
      cur.text = cur.text.replace(edit.old, edit.new);
      applied.push(cur);
    }
    if (aborted) {
      lines.push(`${arm.id} SKIP ${aborted}`);
      break;
    }
    for (const a of applied) save(a);
    const result = runTest(arm.id);
    for (const [file, buf] of pristine) writeFileSync(file, buf);
    const dirty = FILES.filter((f) => sha(readFileSync(f)) !== sha(pristine.get(f)));
    if (dirty.length) {
      aborted = `${arm.id}：还原后字节对不上原文件（${dirty.join(", ")}），剩下的臂不跑了`;
      lines.push(`${arm.id} ABORT ${aborted}`);
      break;
    }
    const g = grade(result, arm);
    const others = result.failed.filter(
      (f) => !arm.pred.some((p) => String(f).includes(p)) && !arm.not.some((p) => String(f).includes(p)),
    );
    lines.push(
      `${arm.id} 变异=${arm.what}\n` +
        `    预测红：${arm.pred.join(" / ")}\n` +
        `    预测绿：${arm.not.join(" / ")}\n` +
        `    实测 total=${result.total} failed=${result.failed.length} exit=${result.exit}` +
        (result.note ? ` [${result.note}]` : "") +
        `\n    红名单：\n      ${result.failed.map((f) => String(f)).join("\n      ") || "（无）"}` +
        `\n    ${g.miss.length ? `MISMATCH 该红没红：${g.miss.join(" / ")}` : "pred 全中"} · ` +
        `${g.leaked.length ? `MISMATCH 该绿却红：${g.leaked.join(" / ")}` : "not 全绿"}` +
        (others.length ? `\n    另红 ${others.length} 条（不在预测里）：\n      ${others.map((f) => String(f)).join("\n      ")}` : ""),
    );
    console.log(lines[lines.length - 1]);
  }
} finally {
  for (const [file, buf] of pristine) writeFileSync(file, buf);
  writeFileSync(outFile, `${lines.join("\n\n")}\n\naborted=${aborted ?? "no"}\n`, "utf8");
  console.log(`\n还原校验：${FILES.map((f) => `${f.split("/").pop()}=${sha(readFileSync(f)) === sha(pristine.get(f)) ? "OK" : "DIFF"}`).join(" ")}`);
}
