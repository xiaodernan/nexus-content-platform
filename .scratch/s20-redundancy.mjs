// §85 第二十片：冗余探针（与变异臂分开记，因为它要读的是"绿"）。
// 判读死臂时我会写"这条是形状带子，删掉行为等价"——上一片学过：
// "我构造不出反例"不等于"反例不存在"。所以这句话只能靠删一次来支撑：
// 删掉之后整套测试**全绿**，才说得上"在当前这批杠杆下它确实没有可观察的差别"。
// 全红则反过来：那条带子其实被钉着，只是覆盖率仪器看不到。
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const COMBAT = "packages/game-model/src/combat.ts";
const LEVEL = "packages/game-model/src/level.ts";
const COMBAT_TEST = "packages/game-model/test/combat.test.ts";
const LEVEL_TEST = "packages/game-model/test/level.test.ts";

const PROBES = [
  { id: "R1", arm: "combat.ts:198", file: COMBAT, test: COMBAT_TEST,
    old: "  if (to === from) return null;\n", neu: "" },
  { id: "R2", arm: "combat.ts:200", file: COMBAT, test: COMBAT_TEST,
    old: "  if (!entity) return null;\n", neu: "" },
  { id: "R3", arm: "level.ts:400", file: LEVEL, test: LEVEL_TEST,
    old: "  if (!entity) return null;\n", neu: "" },
  { id: "R4", arm: "combat.ts:514", file: COMBAT, test: COMBAT_TEST,
    old: "    if (!actor) continue;\n", neu: "" },
  { id: "R5", arm: "combat.ts:516", file: COMBAT, test: COMBAT_TEST,
    old: "    if (!was) continue;\n", neu: "" },
  { id: "R6", arm: "combat.ts:563", file: COMBAT, test: COMBAT_TEST,
    old: "          start.report.findings[0] ?? \"\"", neu: "          start.report.findings[0]" },
  { id: "R7", arm: "level.ts:574", file: LEVEL, test: LEVEL_TEST,
    old: "          start.report.findings[0] ?? \"\"", neu: "          start.report.findings[0]" },
  { id: "R8", arm: "level.ts:614", file: LEVEL, test: LEVEL_TEST,
    old: "?.label ?? id}", neu: "!.label}" },
  { id: "R9", arm: "combat.ts:238", file: COMBAT, test: COMBAT_TEST,
    old: "  const item = change(player, document, lever, \"health\", to);\n  return item ? [item] : [];",
    neu: "  const item = change(player, document, lever, \"health\", to);\n  return [item];" },
  { id: "R10", arm: "combat.ts:244", file: COMBAT, test: COMBAT_TEST,
    old: "  if (!playerEntity) return null;\n", neu: "" },
];

const only = (process.env.S20_ONLY ?? "").split(",").filter(Boolean);

const sha = (buf) => createHash("sha1").update(buf).digest("hex").slice(0, 12);
const outDir = mkdtempSync(join(tmpdir(), "s20-red-"));
const pristine = new Map([[COMBAT, readFileSync(COMBAT)], [LEVEL, readFileSync(LEVEL)]]);
const lines = [];
let aborted = null;

try {
  for (const probe of PROBES.filter((p) => !only.length || only.includes(p.id))) {
    const src = pristine.get(probe.file);
    const text = src.toString("utf8");
    const hits = text.split(probe.old).length - 1;
    if (process.env.S20_CHECK_ONLY) {
      console.log(`${probe.id} ${probe.arm} hits=${hits}`);
      if (hits !== 1) aborted = `${probe.id}: hits=${hits}`;
      continue;
    }
    if (hits !== 1) {
      aborted = `${probe.id}：old 在 ${probe.file} 里出现 ${hits} 次，探针没打上`;
      lines.push(`${probe.id} SKIP ${aborted}`);
      break;
    }
    writeFileSync(probe.file, text.replace(probe.old, probe.neu), "utf8");
    const jsonPath = join(outDir, `${probe.id}.json`);
    const run = spawnSync("npx", ["vitest", "run", probe.test, "--reporter=json", `--outputFile=${jsonPath}`], {
      encoding: "utf8",
      shell: true,
      timeout: 300000,
      maxBuffer: 64 * 1024 * 1024,
    });
    writeFileSync(probe.file, src);
    if (sha(readFileSync(probe.file)) !== sha(src)) {
      aborted = `${probe.id}：还原后字节对不上，剩下的探针不跑了`;
      lines.push(`${probe.id} ABORT ${aborted}`);
      break;
    }
    let failed = [];
    let total = -1;
    try {
      const report = JSON.parse(readFileSync(jsonPath, "utf8"));
      total = report.numTotalTests;
      for (const suite of report.testResults ?? []) {
        for (const a of suite.assertionResults ?? []) {
          if (a.status === "failed") failed.push(a.fullName ?? a.title);
        }
      }
    } catch {
      failed = ["<no json report>"];
      total = -1;
    }
    lines.push(
      `${probe.id} arm=${probe.arm} total=${total} failed=${failed.length} exit=${run.status} ` +
        (failed.length === 0 && total > 0 ? "GREEN(冗余成立)" : "RED(被钉着)：" + failed.map((f) => String(f).replace(/^.*?[\\/]/, "")).join(" | ")),
    );
    console.log(lines[lines.length - 1]);
  }
} finally {
  for (const [file, buf] of pristine) writeFileSync(file, buf);
  const logPath = ".scratch/s20-redundancy.txt";
  const prior = existsSync(logPath) ? readFileSync(logPath, "utf8").replace(/\n\naborted=.*$/, "") : "";
  writeFileSync(logPath, `${prior ? prior + "\n" : ""}${lines.join("\n")}\n\naborted=${aborted ?? "no"}\n`, "utf8");
  console.log(`\n还原校验：` + [...pristine].map(([f, b]) => `${f.split("/").pop()}=${sha(readFileSync(f)) === sha(b) ? "OK" : "DIFF"}`).join(" "));
}
