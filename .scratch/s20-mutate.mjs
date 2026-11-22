// §85 第二十片：变异臂执行器。
// 每条臂打一个补丁 → 只跑对应那一份测试 → 记下红掉的用例名 → 逐字节还原。
// 所有 old/new 一律 ASCII（源码里那些整句中文如果进了匹配串，编辑链路可能把全角标点换掉，
// 那样"补丁没打上"会被读成"这条臂没牙"）。每步都断言 old 在文件里出现且只出现一次。
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const COMBAT = "packages/game-model/src/combat.ts";
const LEVEL = "packages/game-model/src/level.ts";
const COMBAT_TEST = "packages/game-model/test/combat.test.ts";
const LEVEL_TEST = "packages/game-model/test/level.test.ts";

const ARMS = [
  { id: "C1", witness: "combat.test.ts:709", file: COMBAT, test: COMBAT_TEST,
    old: "    const to = move(fieldOf(enemy, statKey));\n    if (to === null) continue;\n",
    neu: "    const to = move(fieldOf(enemy, statKey));\n    if (to === null) continue;\n    if (fieldOf(enemy, \"damage\") === 0) continue;\n" },
  { id: "C2", witness: "combat.test.ts:717", file: COMBAT, test: COMBAT_TEST,
    old: "      forPlayer(input, (current) =>\n        current >= COMBAT_RULES.playerHealthCap\n          ? null\n          : Math.min(COMBAT_RULES.playerHealthCap, current + COMBAT_RULES.playerHealthStep),\n      ),",
    neu: "      forPlayer(input, (current) => current + COMBAT_RULES.playerHealthStep)," },
  { id: "C3", witness: "combat.test.ts:726", file: COMBAT, test: COMBAT_TEST,
    old: "      perEnemy(input, \"detectionRange\", (current) =>\n        current >= COMBAT_RULES.detectionCap\n          ? null\n          : Math.min(COMBAT_RULES.detectionCap, current + COMBAT_RULES.detectionStep),\n      ),",
    neu: "      perEnemy(input, \"detectionRange\", (current) => current + COMBAT_RULES.detectionStep)," },
  { id: "C4", witness: "combat.test.ts:736", file: COMBAT, test: COMBAT_TEST,
    old: "      perEnemy(input, \"detectionRange\", (current) =>\n        current <= COMBAT_RULES.detectionFloor\n          ? null\n          : Math.max(COMBAT_RULES.detectionFloor, current - COMBAT_RULES.detectionStep),\n      ),",
    neu: "      perEnemy(input, \"detectionRange\", (current) => current - COMBAT_RULES.detectionStep)," },
  { id: "C5", witness: "combat.test.ts:743", file: COMBAT, test: COMBAT_TEST,
    old: "  if (statOf(playerEntity, \"attackPower\") !== null) return { entity: playerEntity, key: \"attackPower\" };\n",
    neu: "" },
  { id: "C6", witness: "combat.test.ts:753", file: COMBAT, test: COMBAT_TEST,
    old: "    if (round === COMBAT_RULES.maxRounds) stopReason = \"round-cap\";",
    neu: "    // arm C6: round-cap assignment removed" },
  { id: "C7", witness: "combat.test.ts:771", file: COMBAT, test: COMBAT_TEST,
    old: "    const kept = improved && broke.length === 0;",
    neu: "    const kept = improved;" },
  { id: "C8", witness: "combat.test.ts:804", file: COMBAT, test: COMBAT_TEST,
    old: "  const player = plan.player;\n  if (!player) return [];\n  const to = move(player.health);",
    neu: "  const player = plan.player;\n  const to = move(player.health);" },
  { id: "C9", witness: "combat.test.ts:804", file: COMBAT, test: COMBAT_TEST,
    old: "      const player = plan.player;\n      if (!player) return [];\n      const source = offenseSource(document, player);",
    neu: "      const player = plan.player;\n      const source = offenseSource(document, player);" },
  { id: "L1", witness: "level.test.ts:817", file: LEVEL, test: LEVEL_TEST,
    old: "    x: clampToArena(pivot.x + ux * distance, ARENA.width, ACTOR_RADIUS),\n    y: clampToArena(pivot.y + uy * distance, ARENA.height, ACTOR_RADIUS),",
    neu: "    x: pivot.x + ux * distance,\n    y: pivot.y + uy * distance," },
  { id: "L2", witness: "level.test.ts:831", file: LEVEL, test: LEVEL_TEST,
    old: "    x: clampToArena(pivot.x + ux * distance, ARENA.width, ACTOR_RADIUS),",
    neu: "    x: clampToArena(pivot.x + ux * distance, ARENA.width, 0)," },
  { id: "L3", witness: "level.test.ts:844", file: LEVEL, test: LEVEL_TEST,
    old: "      return before && before.affects && !before.positionIsDesign ? { name: item.entityName, anchor: before.affects.name } : null;",
    neu: "      return before && before.affects ? { name: item.entityName, anchor: before.affects.name } : null;" },
  { id: "L4", witness: "level.test.ts:856", file: LEVEL, test: LEVEL_TEST,
    old: "  if (achieved) stopReason = \"achieved\";",
    neu: "  // arm L4: post-loop achieved assignment removed" },
  { id: "L5", witness: "level.test.ts:869", file: LEVEL, test: LEVEL_TEST,
    old: "        (list.length\n          ? unauthored.length",
    neu: "        (list.length >= 0\n          ? unauthored.length" },
  { id: "L6", witness: "level.test.ts:878", file: LEVEL, test: LEVEL_TEST,
    old: "    const kept = improved && broke.length === 0;",
    neu: "    const kept = improved;" },
  { id: "L7", witness: "level.test.ts:898", file: LEVEL, test: LEVEL_TEST,
    old: "      const piles = piledPairs(plan);\n      if (!piles.length) return [];",
    neu: "      const piles = piledPairs(plan);" },
  { id: "L8", witness: "level.test.ts:898", file: LEVEL, test: LEVEL_TEST,
    old: "      if (!plan.player) return [];\n      const spawn = { x: plan.player.x, y: plan.player.y };",
    neu: "      const spawn = { x: plan.player.x, y: plan.player.y };" },
  { id: "L9", witness: "level.test.ts:898", file: LEVEL, test: LEVEL_TEST,
    old: "      if (!plan.player || !plan.enemies.length) return [];",
    neu: "      // arm L9: guard removed" },
];

const sha = (buf) => createHash("sha1").update(buf).digest("hex").slice(0, 12);
const outDir = mkdtempSync(join(tmpdir(), "s20-arms-"));
const pristine = new Map([
  [COMBAT, readFileSync(COMBAT)],
  [LEVEL, readFileSync(LEVEL)],
]);
const lines = [];
let aborted = null;

try {
  for (const arm of ARMS) {
    const src = pristine.get(arm.file);
    const text = src.toString("utf8");
    const hits = text.split(arm.old).length - 1;
    if (process.env.S20_CHECK_ONLY) {
      console.log(`${arm.id} hits=${hits} ${arm.witness}`);
      if (hits !== 1) aborted = `${arm.id}: hits=${hits}`;
      continue;
    }
    if (hits !== 1) {
      aborted = `${arm.id}：old 在 ${arm.file} 里出现 ${hits} 次（要正好 1 次），这条臂没打上去`;
      lines.push(`${arm.id} SKIP ${aborted}`);
      break;
    }
    writeFileSync(arm.file, text.replace(arm.old, arm.neu), "utf8");
    const jsonPath = join(outDir, `${arm.id}.json`);
    const run = spawnSync("npx", ["vitest", "run", arm.test, "--reporter=json", `--outputFile=${jsonPath}`], {
      encoding: "utf8",
      shell: true,
      timeout: 300000,
      maxBuffer: 64 * 1024 * 1024,
    });
    const restored = pristine.get(arm.file);
    writeFileSync(arm.file, restored);
    if (sha(readFileSync(arm.file)) !== sha(restored)) {
      aborted = `${arm.id}：还原后字节对不上原文件，剩下的臂不跑了`;
      lines.push(`${arm.id} ABORT ${aborted}`);
      break;
    }
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
    lines.push(
      `${arm.id} witness=${arm.witness} total=${total} failed=${failed.length} exit=${run.status}` +
        (note ? ` [${note}]` : "") +
        `\n    ` + failed.map((f) => String(f).replace(/^.*?[\\/]/, "")).join("\n    "),
    );
    console.log(lines[lines.length - 1]);
  }
} finally {
  for (const [file, buf] of pristine) writeFileSync(file, buf);
  writeFileSync(".scratch/s20-arm-mutations.txt", `${lines.join("\n\n")}\n\naborted=${aborted ?? "no"}\n`, "utf8");
  console.log(`\n还原校验：` + [...pristine].map(([f, b]) => `${f.split("/").pop()}=${sha(readFileSync(f)) === sha(b) ? "OK" : "DIFF"}`).join(" "));
}
