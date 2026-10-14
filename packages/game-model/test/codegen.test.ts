import { describe, expect, it } from "vitest";
import {
  CODEGEN_COLORS,
  CODEGEN_LIMITS,
  CONTACT_COOLDOWN,
  EVENT_CAP,
  MAX_FRAME_SECONDS,
  PLAY_KIND_SHAPES,
  PLAYER_ATTACK_COOLDOWN,
  SIM_NO_PLAYER_OUTCOME,
  SIM_RULE_NOTES,
  compileGame,
  generateGameCode,
  initialState,
  setStat,
  validateGame,
  type GameDocument,
  type GameEntityKind,
  type GeneratedGameFile,
} from "../src/index";

/**
 * §52 链最后一格（Code）的规则层测试：一份设计投出来的**产物字节**能撒的谎，
 * 与前三格不一样——前三格谎在"做了什么"，这一格谎在"拿到的东西是不是真的跑得起来的那一份"。
 * 所以断言全部围着五类谎：
 *
 * 1. **两份计划各写一遍**：`plan.json` 与 `plan.js` 必须是同一次 `compileGame` 的序列化结果。
 *    分开生成就会出现"下载的那份是旧的、浏览器里跑的是新的"，而两边都自称来自同一份设计。
 * 2. **数字是抄的还是插的**：引擎里那几个规则数（冷却、定步长上限、事件条数、没玩家那句拒绝）
 *    必须与 `sim.ts` 的导出**逐值相等**。这一类是**静态闸**，不是行为性红——它证明的是
 *    "数字由同一处供给"，不证明"两边算术相同"。算术相同由真浏览器那条见证量（`docs/TESTING.md`）。
 * 3. **页面引用了不存在的东西**：`index.html` 里每个 `src` / `href` 都必须在这七份文件里；
 *    少一个文件不是"少一份代码"，是作者解压出来打不开。
 * 4. **产物里不许有宿主入口**：`require(` / `eval(` / `child_process` / `fetch(` 之类一个都不许有，
 *    而且这条扫描自己要有反向控制——一段种进去的坏字节必须被它抓到，否则"没扫到"就是"没在扫"。
 * 5. **转写不许漏字段**：`sim.ts` 的初始态是自己点活（`active: true` / `readyAt: 0`）的，
 *    计划里并没有这两个字段。产物若从计划里抄，敌人开局就是死的——页面照样"进行中"，谁也看不出。
 *    这一类缺陷是浏览器那条见证第一次跑抓到的（`scripts/game-code-parity.mts`，读数见 `docs/TESTING.md`），
 *    下面那道读结构的闸就是它留下的疤。
 *
 * 底稿的每一串预期（七个文件、几个未投影的实体、几个模板实体）都是先把这份文档跑一遍量出来的，
 * 不是猜的；能由投影算出来的数都从投影算，不手写。
 */

const AT = "2026-01-01T00:00:00.000Z";

interface Spec {
  id: string;
  kind: GameEntityKind;
  name: string;
  stats?: Record<string, number>;
  refs?: { to: string; role: string }[];
}

function build(name: string, specs: Spec[], bare = false): GameDocument {
  const document: GameDocument = {
    id: `game_${name}`,
    projectId: null,
    name,
    summary: "为产物这一格搭的关卡",
    kind: "rpg-prototype",
    entities: specs.map((spec) => ({
      id: spec.id,
      kind: spec.kind,
      name: spec.name,
      // bare = 说明也留空：`template` 那个标记问的是"一个数值都没填、说明也是空的"，
      // 底稿里带着说明就永远走不到那条分支，见证就成了空的
      notes: bare ? "" : `说明：${spec.name}`,
      tags: ["codegen-test"],
      stats: bare ? {} : { ...spec.stats },
      refs: (spec.refs ?? []).map((ref, index) => ({ id: `${spec.id}-ref-${index}`, to: ref.to, role: ref.role })),
      updatedAt: AT,
    })),
    createdAt: AT,
    updatedAt: AT,
  };
  const issues = validateGame(document);
  if (issues.length) throw new Error(`测试底稿结构校验没过：${issues.map((issue) => issue.message).join("；")}`);
  return document;
}

/** §52 链第三格交回来的那份形状：位置写进文档了，五类个体 + 机关 + 任务 + 三种不进判定的实体 */
function levelDraft(): GameDocument {
  return build("摆好的战场", [
    { id: "p1", kind: "player", name: "主角", stats: { health: 20, speed: 210, x: 600, y: 380 } },
    { id: "w1", kind: "weapon", name: "短刃", stats: { damage: 3, range: 40 }, refs: [{ to: "p1", role: "装备于" }] },
    { id: "e1", kind: "enemy", name: "巡逻兵", stats: { health: 4, damage: 1, speed: 150, detectionRange: 140, x: 300, y: 200 } },
    { id: "i1", kind: "item", name: "药包", stats: { stackSize: 1, x: 800, y: 500 } },
    { id: "t1", kind: "trigger", name: "洞口", stats: { radius: 70 }, refs: [{ to: "i1", role: "贴着" }] },
    { id: "q1", kind: "quest", name: "踩洞口", stats: {}, refs: [{ to: "t1", role: "需要激活" }] },
    { id: "d1", kind: "dialogue", name: "旅人的话", stats: {} },
    { id: "a1", kind: "animation", name: "挥击", stats: {} },
    { id: "pa1", kind: "particle", name: "火花", stats: {} },
  ]);
}

/** 一个数值都没填、说明也空着的文档：`createGame` 那种脚手架，产物要照实说它没什么可跑 */
function templateOnly(): GameDocument {
  return build(
    "只有模板",
    [
      { id: "p1", kind: "player", name: "玩家" },
      { id: "e1", kind: "enemy", name: "敌人" },
      { id: "c1", kind: "camera", name: "镜头" },
    ],
    true,
  );
}

/**
 * 开局那三张名单必须自己把 `active` / `readyAt` 点活。
 * 返回缺陷清单；空数组 = 这一处是干净的。
 */
function startActorDefects(engine: string): string[] {
  const start = engine.indexOf("initialState: function (plan)");
  const end = engine.indexOf("step: function (plan, state", start);
  if (start < 0 || end < 0) throw new Error(`引擎里找不到 initialState 那一段（start=${start}、end=${end}）`);
  const region = engine.slice(start, end);
  const defects: string[] = [];
  for (const list of ["enemies", "items", "triggers"]) {
    const line = region.split("\n").find((row) => row.trim().startsWith(`${list}:`));
    if (!line) {
      defects.push(`${list}：初始态里没有这一行，转写漏了`);
      continue;
    }
    if (line.includes("cloneActors(plan.")) {
      defects.push(`${list}：用 cloneActors 起头，而计划里没有 active / readyAt 这两个字段，开局就是死的`);
    }
    if (!line.includes("startActors(plan.")) defects.push(`${list}：没走 startActors（点活开局的那一处）`);
  }
  const starter = /function startActors\(list, healthOf\) \{([\s\S]*?)\n\}/.exec(engine)?.[1] ?? "";
  if (!starter.includes("active: true") || !starter.includes("readyAt: 0")) {
    defects.push("startActors 没把 active / readyAt 写成 true / 0");
  }
  return defects;
}

function file(output: { files: GeneratedGameFile[] }, path: string): GeneratedGameFile {
  const found = output.files.find((f) => f.path === path);
  if (!found) throw new Error(`产物里没有 ${path}：只生成了 ${output.files.map((f) => f.path).join("、")}`);
  return found;
}

/** 从生成的引擎里把 RULES 那一块解析出来——不手数，也不从测试里再写一遍常量 */
function parsedRules(engine: string): Record<string, number> {
  const block = /var RULES = \{([\s\S]*?)\};/.exec(engine);
  const body = block?.[1];
  if (body === undefined) throw new Error("引擎里没有 RULES 那一块");
  const out: Record<string, number> = {};
  for (const line of body.split("\n")) {
    const pair = /^\s*(\w+):\s*(-?[\d.]+),?\s*$/.exec(line);
    if (pair) out[pair[1] as string] = Number(pair[2]);
  }
  return out;
}

/** 扫描器本身：absence 的那条断言要用它，反向控制也要用它，两处共用同一个实现 */
const HOST_ENTRY_SPELLINGS = ["require(", "import(", "child_process", "eval(", "new Function", "fetch(", "XMLHttpRequest", "process.env"];

function hostEntryHits(contents: string): string[] {
  return HOST_ENTRY_SPELLINGS.filter((spelling) => contents.includes(spelling));
}

describe("§52 最后一格：把设计投影成一份拿得走的产物", () => {
  it("产物就是登记的那七份文件，每份都标了来历", () => {
    const output = generateGameCode(levelDraft());
    expect(output.files.map((f) => f.path)).toEqual([
      "README.txt",
      "index.html",
      "style.css",
      "plan.json",
      "plan.js",
      "engine.js",
      "main.js",
    ]);
    // 来历标注不许是装饰：数据文件指回投影，代码文件指回 sim.ts，说明文件才承认自己是这一格写的
    expect(output.files.map((f) => f.origin.kind)).toEqual(["readme", "shell", "shell", "plan", "plan", "engine", "engine"]);
    for (const f of output.files) {
      if (f.path === "plan.json") {
        // JSON 里塞不进注释：这一份就是纯数据，指回生成器那句话由 README 与 plan.js 两处说
        expect(() => JSON.parse(f.contents)).not.toThrow();
        expect(f.contents, "这句豁免是故意的：JSON 里不能有注释，混进去就不是纯数据").not.toContain("由 NEXUS");
        continue;
      }
      expect(f.contents, `${f.path} 第一行要指回生成器`).toContain("由 NEXUS 从游戏设计模型生成");
    }
    expect(file(output, "engine.js").origin).toEqual({ kind: "engine", from: "sim.step" });
  });

  it("同一份文档跑两遍逐字节相同——作者拿到的那份必须和界面上那份一样", () => {
    const document = levelDraft();
    const first = generateGameCode(document);
    const second = generateGameCode(document);
    expect(second.files.map((f) => [f.path, f.contents])).toEqual(first.files.map((f) => [f.path, f.contents]));
    expect(second.bytes).toBe(first.bytes);
  });

  it("生成不许动那份设计", () => {
    const document = levelDraft();
    const before = JSON.stringify(document);
    generateGameCode(document);
    expect(JSON.stringify(document), "投影把文档改了就是第二处写设计的地方（§16）").toBe(before);
  });

  it("plan.json 与 plan.js 是同一次序列化的结果，不是各写一遍的两份计划", () => {
    const document = levelDraft();
    const output = generateGameCode(document);
    const plan = compileGame(document);
    const json = file(output, "plan.json").contents;
    expect(json).toBe(JSON.stringify(plan, null, 2));
    expect(JSON.parse(json)).toEqual(plan);
    // 这一条才是"同一次"的意思：不是两份长得像，是同一串字节被两处用
    expect(file(output, "plan.js").contents).toContain(`window.NEXUS_PLAN = ${json};`);
  });

  it("引擎里的规则数字是从 sim.ts 的导出插进来的，不是在模板里重打的", () => {
    const rules = parsedRules(file(generateGameCode(levelDraft()), "engine.js").contents);
    expect(rules).toEqual({
      contactCooldown: CONTACT_COOLDOWN,
      playerAttackCooldown: PLAYER_ATTACK_COOLDOWN,
      maxFrameSeconds: MAX_FRAME_SECONDS,
      eventCap: EVENT_CAP,
    });
    const engine = file(generateGameCode(levelDraft()), "engine.js").contents;
    expect(engine, "没有玩家那句拒绝也得是插的").toContain(`var TEXT = { noPlayer: ${JSON.stringify(SIM_NO_PLAYER_OUTCOME)} };`);
  });

  it("转写不能漏掉状态里的任何一个键（键清单从真投影拿，不手数）", () => {
    const plan = compileGame(levelDraft());
    const state = initialState(plan);
    const engine = file(generateGameCode(levelDraft()), "engine.js").contents;
    const missing = Object.keys(state).filter((key) => !engine.includes(`${key}:`));
    expect(missing, "引擎的 initialState 少了这些状态键：产物跑的状态与平台跑的不是同一个形状").toEqual([]);
    const missingCounters = Object.keys(state.counters).filter((key) => !engine.includes(`${key}: 0`));
    expect(missingCounters).toEqual([]);
    // 静态闸就到此为止：它证明形状齐，不证明算术同（那一条在浏览器里量）
  });

  it("形状表从模型来；配色是产物自己的默认，并且承认这一点", () => {
    const output = generateGameCode(levelDraft());
    const main = file(output, "main.js").contents;
    expect(main).toContain(`var shapes = ${JSON.stringify(PLAY_KIND_SHAPES)};`);
    expect(main).toContain(`var colors = ${JSON.stringify(CODEGEN_COLORS)};`);
    const readme = file(output, "README.txt").contents;
    for (const limit of CODEGEN_LIMITS) expect(readme, `限度那条没进 README：${limit}`).toContain(limit);
  });

  it("文档名里的 HTML 特殊字符不许原样进页面，但纯文本里保留原样", () => {
    const document = build("<i>坏</i> & \"引号\"", levelDraft().entities.map((e) => ({ id: e.id, kind: e.kind, name: e.name, stats: e.stats, refs: e.refs.map((r) => ({ to: r.to, role: r.role })) })));
    const output = generateGameCode(document);
    const html = file(output, "index.html").contents;
    expect(html).toContain("&lt;i&gt;坏&lt;/i&gt; &amp; &quot;引号&quot;");
    expect(html, "标题里一个原样的 < 就能把整页结构掀翻").not.toContain("<i>坏</i>");
    // README 是 text/plain，那一层不需要转义；写清这点免得下一次把两种平面当成一种
    expect(file(output, "README.txt").contents).toContain("<i>坏</i>");
  });

  it("页面引用的每个文件都真的在产物里——少一个就是解压出来打不开", () => {
    const output = generateGameCode(levelDraft());
    const html = file(output, "index.html").contents;
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1] as string);
    expect(refs.length, "扫描器一个引用都没抓到，这不叫检查").toBeGreaterThanOrEqual(4);
    const paths = output.files.map((f) => f.path);
    for (const ref of refs) expect(paths, `index.html 引了 ${ref}，产物里却没有`).toContain(ref);
    expect(refs).toEqual(["style.css", "plan.js", "engine.js", "main.js"]);
  });

  it("产物里没有宿主执行入口，而这条扫描自己会被种进去的坏字节抓到", () => {
    const output = generateGameCode(levelDraft());
    expect(output.files.length).toBe(7);
    for (const f of output.files) {
      expect(hostEntryHits(f.contents), `${f.path} 里有宿主入口：${hostEntryHits(f.contents).join("、")}`).toEqual([]);
    }
    // 反向控制：扫描器对一段真的坏字节必须点名，否则"没扫到"与"没在扫"读起来一样
    expect(hostEntryHits('const x = require("fs"); eval(code); fetch("/y");')).toEqual(["require(", "eval(", "fetch("]);
  });

  it("CSP 把产物按在本地：不许联网、不许内联脚本", () => {
    const html = file(generateGameCode(levelDraft()), "index.html").contents;
    const policy = /content="([^"]*)"/.exec(html)?.[1] ?? "";
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("frame-src 'none'");
    expect(html, "内联 script 会把上面那条 CSP 变成装饰品").not.toMatch(/<script>(?!<\/script>)/);
  });

  it("跑不起来的那份也全量生成，拒绝写在文件里而不是被我吞掉", () => {
    const document = build("没有玩家", [
      { id: "e1", kind: "enemy", name: "巡逻兵", stats: { health: 4, damage: 1, speed: 120, detectionRange: 100 } },
      { id: "q1", kind: "quest", name: "讨伐", stats: {}, refs: [{ to: "e1", role: "需要打倒" }] },
    ]);
    const plan = compileGame(document);
    expect(plan.playable).toBe(false);
    const output = generateGameCode(document);
    expect(output.files.map((f) => f.path)).toEqual(generateGameCode(levelDraft()).files.map((f) => f.path));
    expect(output.notes.join("；"), "拒绝必须点名投影给出的那条原因").toContain(plan.blockers[0] as string);
    const readme = file(output, "README.txt").contents;
    for (const blocker of plan.blockers) expect(readme).toContain(blocker);
  });

  it("没进投影的实体按类别点名，条数从文档减投影算出来", () => {
    const document = levelDraft();
    const plan = compileGame(document);
    const projected = new Set<string>([
      ...(plan.player ? [plan.player.id] : []),
      ...plan.enemies.map((a) => a.id),
      ...plan.items.map((a) => a.id),
      ...plan.npcs.map((a) => a.id),
      ...plan.triggers.map((t) => t.id),
      ...plan.quests.map((q) => q.id),
    ]);
    const leftovers = document.entities.filter((e) => !projected.has(e.id));
    // 武器在名单里不是意外：它没有自己的身体，damage 与 range 被折进玩家——
    // 这条断言的意义是"披露不许漏掉任何一个没身体的实体"，也不是"产物少了三样东西"
    expect(leftovers.map((e) => e.kind).sort()).toEqual(["animation", "dialogue", "particle", "weapon"]);
    const note = generateGameCode(document).notes.find((line) => line.startsWith("这些实体在产物里没有自己的那一个身体"));
    expect(note, "这一格漏了'哪些设计没进产物'这句披露").toBeTruthy();
    for (const entity of leftovers) expect(note).toContain(entity.name);
  });

  it("模板实体与不可判定的任务各报自己那条，数字来自投影", () => {
    const output = generateGameCode(templateOnly());
    const plan = compileGame(templateOnly());
    const templates = [plan.player, ...plan.enemies, ...plan.items, ...plan.npcs].filter((a) => a?.template).length;
    expect(templates, "底稿得真的有模板实体，否则这条见证什么也没测").toBe(2);
    expect(output.notes.join("；")).toContain(`场上有 ${templates} 个未设计的模板实体`);

    const document = build("任务不可判定", [
      { id: "p1", kind: "player", name: "主角", stats: { health: 20, speed: 200 } },
      { id: "n1", kind: "npc", name: "旅人", stats: { health: 5 } },
      { id: "q1", kind: "quest", name: "聊一句", stats: {}, refs: [{ to: "n1", role: "需要交谈" }] },
    ]);
    const questPlan = compileGame(document);
    expect(questPlan.quests.filter((q) => !q.judgeable).length, "底稿得真的有一条不可判定的任务").toBe(1);
    expect(generateGameCode(document).notes.join("；")).toContain("有 1 条任务不可判定");
  });

  it("投影自己说过的限度原样进 README，不在这一格重讲一遍", () => {
    const document = levelDraft();
    const plan = compileGame(document);
    const readme = file(generateGameCode(document), "README.txt").contents;
    expect(plan.notes.length, "投影一句限度都没说，这条见证就是空的").toBeGreaterThan(0);
    for (const note of plan.notes) expect(readme, `这条限度没进 README：${note}`).toContain(note);
    for (const rule of SIM_RULE_NOTES) expect(readme).toContain(rule);
  });

  it("字节数是七份文件加起来的那个数", () => {
    const output = generateGameCode(levelDraft());
    const encoder = new TextEncoder();
    const sum = output.files.reduce((total, f) => total + encoder.encode(f.contents).length, 0);
    expect(output.bytes).toBe(sum);
    expect(output.bytes).toBeGreaterThan(1000);
  });

  it("改了设计，产物就跟着改：坐标与数值都读得到", () => {
    const before = generateGameCode(levelDraft());
    const movedX = setStat(levelDraft(), "e1", "x", 120);
    expect(movedX.reason, "写坐标这一步不该被拒").toBeNull();
    const movedY = setStat(movedX.document, "e1", "y", 640);
    expect(movedY.reason).toBeNull();
    const after = generateGameCode(movedY.document);
    const planBefore = JSON.parse(file(before, "plan.json").contents);
    const planAfter = JSON.parse(file(after, "plan.json").contents);
    expect(planAfter.enemies[0]?.x).toBe(120);
    expect(planAfter.enemies[0]?.y).toBe(640);
    expect(planBefore.enemies[0]?.x).not.toBe(120);
    // 字节数不是判别证据：300→120、200→640 都是三位数，两遍一样长（量出来的，不是我推的）。
    // 比的是那串数据本身变没变。
    expect(file(after, "plan.json").contents).not.toBe(file(before, "plan.json").contents);
  });

  /**
   * 这一条不是我想出来的形状：它是真浏览器那条见证（`scripts/game-code-parity.mts`）
   * **第一次跑就抓到**的缺陷。第一版的 `initialState` 用 `cloneActors(plan.enemies)` 起头，
   * 而 `compileGame` 排出来的计划里根本没有 `active` / `readyAt` 这两个字段，
   * 于是产物里所有敌人开局就是"死的"：不追、不打、物品也捡不起来，页面却照样显示"进行中"。
   * 上面那几条比对常量的静态闸全绿，缺陷照跑——所以补一道读结构的闸，并给它反向控制。
   */
  it("初始态不许从计划里抄它没有的字段（浏览器见证抓到的那一类缺陷）", () => {
    const engine = file(generateGameCode(levelDraft()), "engine.js").contents;
    expect(startActorDefects(engine)).toEqual([]);

    // 反向控制：把 enemies 那一行退回第一版的写法，闸必须只点名 enemies 这一处
    // （两处理由：既抄了不存在的字段，也没走点活那一条——同一行的两个说法，不是别处被牵连）
    const bad = engine.replace("enemies: startActors(plan.enemies", "enemies: cloneActors(plan.enemies");
    expect(bad, "替换没命中，反向控制测的是空气").not.toBe(engine);
    const hits = startActorDefects(bad);
    expect([...new Set(hits.map((hit) => hit.split("：")[0]))]).toEqual(["enemies"]);
    expect(hits.some((hit) => hit.includes("cloneActors"))).toBe(true);
  });
});
