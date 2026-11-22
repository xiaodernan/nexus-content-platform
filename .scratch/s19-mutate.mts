// §85 第十九片：每条新见证配一条变异臂——把源码改成"会说谎的那一份"，见证必须红。
// 上一版脚本用 execFileSync("npx") 起进程，Windows 下 npx 是 .cmd，spawn 直接 ENOENT：
// 九条臂全部"红"其实是九次没跑起来——仪器的盲区分母比任何一条臂都要紧（同第十八片的教训）。
// 这版先把"不变异也必须读到 0 失败"这条对照跑一遍，再逐条变异。
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = "D:/内容创作平台/";
const ARMS = [
  {
    id: "A1",
    note: "没有玩家时不原样交回，而是退回传进来的状态（t 不再推进＝时间冻住）",
    file: "packages/game-model/src/sim.ts",
    from: "  const player = plan.player;\n  if (!player) return next;",
    to: "  const player = plan.player;\n  if (!player) return state;",
    test: "packages/game-model/test/sim.test.ts",
  },
  {
    id: "A2",
    note: "目标不在状态里时当成\"已经完成\"（sim ? !sim.active : false → : true）",
    file: "packages/game-model/src/sim.ts",
    from: "      return sim ? !sim.active : false;",
    to: "      return sim ? !sim.active : true;",
    test: "packages/game-model/test/sim.test.ts",
  },
  {
    id: "A3",
    note: "undefined 实体被当成\"摆过位置\"（hasAuthoredPosition 的守卫反过来）",
    file: "packages/game-model/src/play.ts",
    from: "export function hasAuthoredPosition(entity: GameEntity | undefined): boolean {\n  if (!entity) return false;",
    to: "export function hasAuthoredPosition(entity: GameEntity | undefined): boolean {\n  if (!entity) return true;",
    test: "packages/game-model/test/play.test.ts",
  },
  {
    id: "A4",
    note: "引用指向不存在的实体时不跳过，而是硬凑一条收集目标",
    file: "packages/game-model/src/play.ts",
    from: "      const target = byId.get(ref.to);\n      if (!target) continue;",
    to: "      const target = byId.get(ref.to);\n      if (!target) {\n        goals.push({ kind: \"collect\", actorId: ref.to, label: `拾取 ${ref.to}` });\n        continue;\n      }",
    test: "packages/game-model/test/play.test.ts",
  },
  {
    id: "A5",
    note: "没有玩家时 HUD 的伤害那一格编一个 1 出来",
    file: "packages/game-model/src/rpg.ts",
    from: "plan.base.player ? plan.base.player.damage + plan.levelBonus.damage * state.levelUps : 0}",
    to: "plan.base.player ? plan.base.player.damage + plan.levelBonus.damage * state.levelUps : 1}",
    test: "packages/game-model/test/rpg.test.ts",
  },
  {
    id: "A6",
    note: "把「通关」与「失败」说反",
    file: "packages/game-model/src/rpg.ts",
    from: 'state.base.status === "won" ? "通关" : "失败",',
    to: 'state.base.status === "won" ? "失败" : "通关",',
    test: "packages/game-model/test/rpg.test.ts",
  },
  {
    id: "A7",
    note: "removeRef 不查存在性：摘不存在的引用也返回一份新文档",
    file: "packages/game-model/src/index.ts",
    from: "  if (!source || !source.refs.some((ref) => ref.id === refId)) return document;\n",
    to: "",
    test: "packages/game-model/test/game.test.ts",
  },
  {
    id: "A8",
    note: "空摘要时替作者编一句「暂无简介」",
    file: "packages/game-model/src/codegen.ts",
    from: '`<p>${escapeHtml(document.summary || "")}</p>`,',
    to: '`<p>${escapeHtml(document.summary || "暂无简介")}</p>`,',
    test: "packages/game-model/test/codegen.test.ts",
  },
  {
    id: "A9",
    note: "拒绝试玩的那句话不再带上状态表供给的理由",
    file: "packages/game-model/src/playtest-by-kind.ts",
    from: "`这一型（${kind}）今天还没有接上管线：${projection.reason}`",
    to: '"这一型今天还没有接上管线"',
    test: "packages/game-model/test/playtest.test.ts",
  },
  {
    id: "A10",
    note: "isGameKind 只认'是不是字符串'：把非类型的字符串也认成类型",
    file: "packages/game-model/src/index.ts",
    from: '  return typeof value === "string" && (GAME_KINDS as readonly string[]).includes(value);',
    to: '  return typeof value === "string";',
    test: "packages/game-model/test/game.test.ts",
  },
  {
    id: "A11",
    note: "pipelineOfKind 不再读表，恒答 topdown：与分派点分家",
    file: "packages/game-model/src/index.ts",
    from: "  return GAME_KIND_STATUS[kind].pipeline;",
    to: '  return "topdown";',
    test: "packages/game-model/test/game.test.ts",
  },
  {
    id: "A12",
    note: "topdown 那句兜底改成空串：跑不起来时冒号后面什么都不说",
    file: "packages/game-model/src/playtest.ts",
    from: '  if (!plan.playable) findings.push(`这份设计跑不起来：${plan.blockers.join("；") || "原因未列出"}`);',
    to: '  if (!plan.playable) findings.push(`这份设计跑不起来：${plan.blockers.join("；") || ""}`);',
    test: "packages/game-model/test/playtest.test.ts",
  },
  {
    id: "A13",
    note: "对话那句兜底同样改成空串",
    file: "packages/game-model/src/playtest.ts",
    from: '    findings.push(`这份设计跑不起来：${plan.blockers.join("；") || "原因未列出"}`);',
    to: '    findings.push(`这份设计跑不起来：${plan.blockers.join("；") || ""}`);',
    test: "packages/game-model/test/playtest.test.ts",
  },
  {
    id: "A14",
    note: "不再查「这一段还在不在」就把 id 记成可达（幽灵起点被数进去）",
    file: "packages/game-model/src/playtest.ts",
    from: "      const beat = byId.get(id);\n      if (!beat) continue;\n",
    to: "",
    test: "packages/game-model/test/playtest.test.ts",
  },
  {
    id: "A15",
    note: "把「这段已经数过」当成「整个遍历到此为止」（continue → break）",
    file: "packages/game-model/src/playtest.ts",
    from: "      if (seen.has(id)) continue;",
    to: "      if (seen.has(id)) break;",
    test: "packages/game-model/test/playtest.test.ts",
  },
  {
    id: "A16",
    note: "点名阈值的臂反过来（>3 → >2）：三段孤岛也带上「等 N 段」",
    file: "packages/game-model/src/playtest.ts",
    from: '      const more = unreachable.length > 3 ? ` 等 ${unreachable.length} 段` : "";',
    to: '      const more = unreachable.length > 2 ? ` 等 ${unreachable.length} 段` : "";',
    test: "packages/game-model/test/playtest.test.ts",
  },
  {
    id: "A17",
    note: "截断从三个改成两个：句子里点不满三个名字",
    file: "packages/game-model/src/playtest.ts",
    from: '      const names = unreachable.slice(0, 3).map((beat) => `「${beat.name}」`);',
    to: '      const names = unreachable.slice(0, 2).map((beat) => `「${beat.name}」`);',
    test: "packages/game-model/test/playtest.test.ts",
  },
];

function runVitest(testFile) {
  try {
    const out = execSync(`npx vitest run ${testFile} 2>&1`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return parse(out, 0);
  } catch (runError) {
    return parse(String(runError.stdout ?? "") + String(runError.stderr ?? ""), 1);
  }
}

function parse(out, status) {
  // vitest 的输出带 ANSI 色码（`Tests  1 failed` 中间夹着转义序列），不剥掉就什么都匹配不到——
  // 上一版就是因为这个把九条真红全读成了"读不到失败数"
  const clean = out.replace(/\x00/g, "").replace(/\x1b\[[0-9;]*m/g, "");
  const failed = clean.match(/Tests\s+(\d+) failed/);
  const passed = clean.match(/Tests\s+\d+ passed/);
  const loadError = clean.match(/Errors?\s+\d+\s+(?:error|unhandled)/);
  return {
    failed: failed ? Number(failed[1]) : clean.includes(" passed") ? 0 : null,
    tail: (clean.match(/Tests\s+[^\n]+/g) ?? []).join(" / ") || (passed ? "只有 passed 行" : `退出码 ${status}，输出末尾：${clean.slice(-400)}`),
    loadError: loadError ? loadError[0] : null,
  };
}

const lines = [];
// 对照：一份没变异的源码，读数必须是"0 失败"——否则下面所有的"红"都无从解释
const control = runVitest(ARMS[0].test);
lines.push(`对照（源码未变异，${ARMS[0].test}）：失败数=${control.failed ?? "?"}｜${control.tail}`);

for (const arm of ARMS) {
  const path = ROOT + arm.file;
  const original = readFileSync(path, "utf8");
  const hits = original.split(arm.from).length - 1;
  if (hits !== 1) {
    lines.push(`${arm.id} 跳过：锚点在源码里出现 ${hits} 次（脚本写错了，不是门红了）`);
    continue;
  }
  let result;
  try {
    writeFileSync(path, original.replace(arm.from, arm.to), "utf8");
    result = runVitest(arm.test);
  } finally {
    writeFileSync(path, original, "utf8");
    if (readFileSync(path, "utf8") !== original) result = { ...result, tail: `${result.tail}【还原失败】` };
  }
  const verdict = result.failed && result.failed > 0 ? `红（${result.failed} 条失败）✓` : result.failed === 0 ? "绿——这条臂没牙 ✗" : "读不到失败数 ✗";
  lines.push(`${arm.id} ${verdict}｜${result.tail}${result.loadError ? `｜${result.loadError}` : ""}\n    变异：${arm.note}`);
}
console.log(lines.join("\n"));
