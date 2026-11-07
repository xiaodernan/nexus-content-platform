// 第二十六片：二十片 notMeasured #1 的那一格——":831 由哪条臂单独钉住"。
// 三条新臂都把"钳位"只摘在一条调用方上，用来判断每个见证能否被单独钉住。
// 打补丁 → 只跑 level.test.ts → 记红掉的用例 → 逐字节还原并校验 sha1。
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LEVEL = "packages/game-model/src/level.ts";
const LEVEL_TEST = "packages/game-model/test/level.test.ts";

const ARMS = [
  {
    id: "L10",
    witness: "level.test.ts:831（敌人那条：只有 set-the-approach 忘了钳）",
    old: "      const item = shift(document, lever, nearest, placeAlong(spawn, nearest, LEVEL_APPROACH_TARGET));",
    neu: [
      "      const reach = Math.hypot(nearest.x - spawn.x, nearest.y - spawn.y);",
      "      const ux = reach < 1e-9 ? 1 : (nearest.x - spawn.x) / reach;",
      "      const uy = reach < 1e-9 ? 0 : (nearest.y - spawn.y) / reach;",
      "      const item = shift(document, lever, nearest, {",
      "        x: spawn.x + ux * LEVEL_APPROACH_TARGET,",
      "        y: spawn.y + uy * LEVEL_APPROACH_TARGET,",
      "      });",
    ].join("\n"),
  },
  {
    id: "L11",
    witness: "level.test.ts:817（物品那一对：只有 separate-pairs 忘了钳）",
    old: "      const item = shift(document, lever, tightest.b, placeAlong(tightest.a, tightest.b, LEVEL_RULES.minGapPixels + LEVEL_RULES.slackPixels));",
    neu: [
      "      const reach = Math.hypot(tightest.b.x - tightest.a.x, tightest.b.y - tightest.a.y);",
      "      const ux = reach < 1e-9 ? 1 : (tightest.b.x - tightest.a.x) / reach;",
      "      const uy = reach < 1e-9 ? 0 : (tightest.b.y - tightest.a.y) / reach;",
      "      const step = LEVEL_RULES.minGapPixels + LEVEL_RULES.slackPixels;",
      "      const item = shift(document, lever, tightest.b, {",
      "        x: tightest.a.x + ux * step,",
      "        y: tightest.a.y + uy * step,",
      "      });",
    ].join("\n"),
  },
  {
    id: "L12",
    witness: "level.test.ts:817（两点重合时的兜底方向从 +x 翻成 -x）",
    old: "  const ux = current < 1e-9 ? 1 : dx / current;",
    neu: "  const ux = current < 1e-9 ? -1 : dx / current;",
  },
  {
    id: "L13",
    witness: "level.test.ts:817（只对分开那条不跳过「钳回原地」）",
    old: "  if (Math.abs(to.x - thing.x) < 1e-9 && Math.abs(to.y - thing.y) < 1e-9) return null;",
    neu: "  if (lever.id !== \"separate-pairs\" && Math.abs(to.x - thing.x) < 1e-9 && Math.abs(to.y - thing.y) < 1e-9) return null;",
  },
];

const sha = (buf) => createHash("sha1").update(buf).digest("hex").slice(0, 12);
const only = (process.env.S26_ONLY ?? "").split(",").filter(Boolean);
const outFile = process.env.S26_OUT ?? ".scratch/s26-isolate.txt";
const outDir = mkdtempSync(join(tmpdir(), "s26-isolate-"));
const pristine = readFileSync(LEVEL);
const lines = [];
let aborted = null;

function runTest(label) {
  const jsonPath = join(outDir, `${label}.json`);
  const run = spawnSync("npx", ["vitest", "run", LEVEL_TEST, "--reporter=json", `--outputFile=${jsonPath}`], {
    encoding: "utf8",
    shell: true,
    timeout: 300000,
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
    failed = [(run.stdout ?? "").split(/\r?\n/).filter((l) => /FAIL|Error:/.test(l)).slice(0, 12)];
  }
  return { total, failed, exit: run.status, note };
}

try {
  const control = runTest("control");
  lines.push(
    `对照（源码未变异） total=${control.total} failed=${control.failed.length} exit=${control.exit}` +
      (control.note ? ` [${control.note}]` : ""),
  );
  console.log(lines[0]);

  for (const arm of ARMS.filter((item) => !only.length || only.includes(item.id))) {
    const text = pristine.toString("utf8");
    const hits = text.split(arm.old).length - 1;
    if (hits !== 1) {
      aborted = `${arm.id}：old 在 ${LEVEL} 里出现 ${hits} 次（要正好 1 次），这条臂没打上去`;
      lines.push(`${arm.id} SKIP ${aborted}`);
      break;
    }
    writeFileSync(LEVEL, text.replace(arm.old, arm.neu), "utf8");
    const result = runTest(arm.id);
    writeFileSync(LEVEL, pristine);
    if (sha(readFileSync(LEVEL)) !== sha(pristine)) {
      aborted = `${arm.id}：还原后字节对不上原文件，剩下的臂不跑了`;
      lines.push(`${arm.id} ABORT ${aborted}`);
      break;
    }
    lines.push(
      `${arm.id} witness=${arm.witness} total=${result.total} failed=${result.failed.length} exit=${result.exit}` +
        (result.note ? ` [${result.note}]` : "") +
        `\n    ` + result.failed.map((f) => String(f)).join("\n    "),
    );
    console.log(lines[lines.length - 1]);
  }
} finally {
  writeFileSync(LEVEL, pristine);
  writeFileSync(outFile, `${lines.join("\n\n")}\n\naborted=${aborted ?? "no"}\n`, "utf8");
  console.log(`\n还原校验：level.ts=${sha(readFileSync(LEVEL)) === sha(pristine) ? "OK" : "DIFF"}`);
}
