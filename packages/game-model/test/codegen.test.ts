import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ARTIFACT_CHAINS,
  CODEGEN_COLORS,
  CODEGEN_LIMITS,
  CONTACT_COOLDOWN,
  EVENT_CAP,
  GAME_KINDS,
  GAME_KIND_LABELS,
  GAME_KIND_STATUS,
  LEVEL_BONUS,
  MAX_FRAME_SECONDS,
  PLAY_KIND_SHAPES,
  PLAYER_ATTACK_COOLDOWN,
  RPG_RULE_NOTES,
  SIM_NO_PLAYER_OUTCOME,
  SIM_RULE_NOTES,
  XP_BASE,
  XP_STEP,
  artifactChainSentence,
  artifactPayload,
  codeKindReadings,
  compileGame,
  compileRpg,
  generateGameCode,
  hasArtifactEngine,
  initialState,
  setStat,
  validateGame,
  type GameDocument,
  type GameEntityKind,
  type GameKind,
  type GeneratedGameFile,
} from "../src/index";

/**
 * §52 链最后一格（Code）的规则层测试：一份设计投出来的**产物字节**能撒的谎，
 * 与前三格不一样——前三格谎在"做了什么"，这一格谎在"拿到的东西是不是真的跑得起来的那一份"。
 * 所以断言全部围着六类谎：
 *
 * 1. **两份计划各写一遍**：`plan.json` 与 `plan.js` 必须是同一次 `artifactPayload` 的序列化结果。
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
 * 6. **拿走的不是试玩的那一种**：产物里带了引擎的链记在 `ARTIFACT_CHAINS`（今天两条：`topdown` 与 `rpg`），
 *    而 §51 的类型表里还有读 `compileStory` 的两型没接进来。那句话由 `codeKindReadings()` 从分派点派生，
 *    README、index.html 与响应里必须是同一个字符串；链对上了它就得是 null，不许留一句空警告。
 *    最后一节钉这一类谎，倒数第二节钉的是**新增那条链真的带引擎**：`engine.js` 里多出的那段
 *    `NexusRpg` 必须与 `rpg.ts` 同形（初始态、等级门、经验、升级、HUD 那五处逐字段比），
 *    否则 README 那句"带成长层"又是一次抄写。
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
    expect(file(output, "engine.js").origin).toEqual({ kind: "engine", from: "sim.step+rpg.step" });
  });

  /**
   * 来历标注要**随那一条链**变：底稿标 rpg-prototype，所以指回 `compileRpg` 与两段转写；
   * 换成 2d 就必须退回 `compileGame` / `sim.step`。
   * 判别证据是这个对照，不是任何一边的字面值——两边都永远写死一份，另一条链落地时就没人报错。
   */
  it("来历标注跟着分派点走：rpg 指 compileRpg，2d 指 compileGame", () => {
    const asKind = (kind: GameKind): GameDocument => ({ ...levelDraft(), kind });
    const origins = (document: GameDocument) => {
      const output = generateGameCode(document);
      return {
        plan: file(output, "plan.json").origin,
        engine: file(output, "engine.js").origin,
        chain: output.artifactChain,
      };
    };
    expect(origins(asKind("rpg-prototype"))).toEqual({
      chain: "rpg",
      plan: { kind: "plan", from: "compileRpg" },
      engine: { kind: "engine", from: "sim.step+rpg.step" },
    });
    expect(origins(asKind("2d"))).toEqual({
      chain: "topdown",
      plan: { kind: "plan", from: "compileGame" },
      engine: { kind: "engine", from: "sim.step" },
    });
    // 没接进产物的那条管线（对话）落的仍是 topdown 那一份，而 `kindNote` 会说出这件事（下一节）
    expect(origins(asKind("visual-novel")).chain).toBe("topdown");
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
    // 比的是**产物侧那一份计划**（`artifactPayload`）：链上多出来的 growth 也在同一串字节里，
    // 拿 `compileGame` 比会让"产物少了成长层"这种缺陷正好通过
    const plan = artifactPayload(document);
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

/**
 * 「下载拿走的那一份」与「平台上试玩的那一份」是不是同一条管线。
 *
 * 产物里今天带了两条链的引擎（`ARTIFACT_CHAINS`：`topdown` 与 `rpg`），而 §51 的类型表里
 * 还有两型读 `compileStory`——那一型投出来仍是一个开不了场的空场子，实测读数记在
 * `docs/TESTING.md` 2026-10-17 那一条。上一版 README 那句"界面上的画布读的就是这一份"对这三型都是假的，
 * 其中 RPG 那一型已经在 §52 第二链落地时消掉。
 * 下面这几条钉的是**那句话现在由分派点派生**：链对上了它自己变 null，链没对上它照旧说出来，
 * 而不是有人在某一处手抄了一份乐观版本。
 */
describe("产物的管线与这份设计标的那一型：错位要说出来，不许各写一遍", () => {
  /** 把底稿换成某一型：只改 `kind`，其余字节不动，这样两型之间的差别只可能是那句话 */
  const asKind = (document: GameDocument, kind: GameKind): GameDocument => ({ ...document, kind });

  it("八型全过一遍：kindNote 为空当且仅当这一型在产物里真的带了引擎", () => {
    const rows = GAME_KINDS.map((kind) => {
      const reading = codeKindReadings(asKind(levelDraft(), kind));
      return { kind, noteEmpty: reading.kindNote === null, pipeline: reading.kindPipeline, chain: reading.artifactChain };
    });
    // 与状态表逐型对齐：这一格不许自己再判断一次"这个类型走哪条管线"
    for (const row of rows) {
      expect(row.pipeline, `${row.kind} 的管线读数与状态表不一致`).toBe(GAME_KIND_STATUS[row.kind].pipeline);
    }
    const carried = GAME_KINDS.filter((kind) => hasArtifactEngine(GAME_KIND_STATUS[kind].pipeline));
    expect(rows.filter((row) => row.noteEmpty).map((row) => row.kind).sort()).toEqual([...carried].sort());
    // 两条链都必须在 carried 里出现过：只有一条链时这条比对与上一版等价，那就什么也没新增
    expect([...new Set(carried.map((kind) => GAME_KIND_STATUS[kind].pipeline))].sort()).toEqual(["rpg", "topdown"]);
    // 没接进产物的管线只能是对话那一类（今天两型）
    expect(GAME_KINDS.filter((kind) => !carried.includes(kind)).sort()).toEqual(["interactive-story", "visual-novel"].sort());
    // 落了链的类型，artifactChain 必须就是那条链；没落的落 topdown 且由 kindNote 说明
    for (const row of rows) {
      const expected = hasArtifactEngine(row.pipeline) ? row.pipeline : "topdown";
      expect(row.chain, `${row.kind} 落到了另一条链`).toBe(expected);
    }
    // 群体不许是空的：全为 null 或全非 null 都会让上面那条比对变成空转
    expect(carried.length).toBeGreaterThan(0);
    expect(rows.length - carried.length).toBeGreaterThan(0);
  });

  it("页面上那句链名只有一个写法：八型各生成一遍，那一格都出自 artifactChainSentence", () => {
    // "跑的是哪条链"这一句恒在（它是读数不是警告），而恒在的句子最容易被各处各拼一遍。
    // 这里数出现次数：拼第二遍的那一处（哪怕措辞只差一个"。"）会让 HTML 里出现两个写法，
    // 而下一版只改其中一处时，产物页面与界面上那句话就分家了。
    for (const kind of GAME_KINDS) {
      const output = generateGameCode(asKind(levelDraft(), kind));
      const sentence = artifactChainSentence(output.artifactChain);
      const html = file(output, "index.html").contents;
      expect(html.split(sentence).length - 1, `${kind}：页面里那句链名不止一处（有一处是别处拼的）`).toBe(1);
      expect(html).toContain(`<p id="chain-note">${sentence}</p>`);
      // README 那一行也带着同一个 label：页面、README、界面三个出口读的是同一张表
      expect(file(output, "README.txt").contents).toContain(ARTIFACT_CHAINS[output.artifactChain].label);
    }
  });

  it("那一句话说清「错位」，而且三处念的是同一份字节", () => {
    const document = asKind(levelDraft(), "visual-novel");
    const output = generateGameCode(document);
    expect(output.kindPipeline, "这一型在平台上读的不是产物带的两条链").toBe("story");
    const note = output.kindNote!;
    // 话内容由状态表那一行供给：改了表格这句话要跟着变，不能是一段抄死的文案
    expect(note).toContain(GAME_KIND_STATUS["visual-novel"].note);
    expect(note).toContain(GAME_KIND_LABELS["visual-novel"]);
    // 还要说清产物里到底带了哪几条链的引擎：那句话从表来，不在这里重打
    for (const chain of Object.values(ARTIFACT_CHAINS)) expect(note).toContain(chain.label);
    // README 与 index.html 不许再抄一份：两处都必须是 output.kindNote 这一个字符串
    expect(file(output, "README.txt").contents).toContain(note);
    expect(file(output, "index.html").contents).toContain(note);

    // 正向对照一：换成 2d，那句话整句消失，README 回到"画布读的就是这一份"
    const flat = generateGameCode(asKind(levelDraft(), "2d"));
    expect(flat.kindNote).toBeNull();
    expect(flat.kindPipeline).toBe("topdown");
    expect(flat.artifactChain).toBe("topdown");
    expect(file(flat, "README.txt").contents).toContain(ARTIFACT_CHAINS.topdown.dataNote);
    expect(file(flat, "index.html").contents).not.toContain("kind-note");
    expect(file(output, "README.txt").contents, "没带引擎的那一型不许再宣称画布读的是这一份").not.toContain(
      ARTIFACT_CHAINS.topdown.dataNote,
    );

    // 正向对照二：这一片要钉的那件事——同一份底稿标 rpg 现在有引擎了，那句错位话随之消失，
    // 而 README 那句 dataNote 换成长那一条（不是"某处把 rpg 硬编码成对上了"）
    const rpgOut = generateGameCode(asKind(levelDraft(), "rpg-prototype"));
    expect(rpgOut.kindNote, "rpg 那条链已接进产物，还说话就是谎").toBeNull();
    expect(rpgOut.artifactChain).toBe("rpg");
    expect(file(rpgOut, "README.txt").contents).toContain(ARTIFACT_CHAINS.rpg.dataNote);
    expect(file(rpgOut, "README.txt").contents).not.toContain(ARTIFACT_CHAINS.topdown.dataNote);
  });

  it("对话那一型也不骗：既说出错位，也照实说出这个场子开不了", () => {
    const story = asKind(
      build("只有对话", [{ id: "d1", kind: "dialogue", name: "开场", stats: {} }]),
      "visual-novel",
    );
    const output = generateGameCode(story);
    expect(output.kindPipeline).toBe("story");
    expect(output.kindNote).toContain(GAME_KIND_LABELS["visual-novel"]);
    const readme = file(output, "README.txt").contents;
    expect(readme).toContain(output.kindNote!);
    // 这条链跑不起来那句仍要在（blockers 来自投影自己，不是这一格编的）
    const blockers = compileGame(story).blockers;
    expect(blockers.length).toBeGreaterThan(0);
    for (const blocker of blockers) expect(readme, `这条拒绝没进 README：${blocker}`).toContain(blocker);
  });

  it("换个类型就换一句话，而产物的文件清单还是那七份", () => {
    // 判别证据取自表格自己的两个字段：把某一型的读数换成另一型的，README/页面必须跟着变
    const vn = generateGameCode(asKind(levelDraft(), "visual-novel"));
    const story = generateGameCode(asKind(levelDraft(), "interactive-story"));
    expect(vn.kindNote).not.toBe(story.kindNote);
    expect(story.kindNote).toContain(GAME_KIND_STATUS["interactive-story"].note);
    expect(story.kindNote).not.toContain(GAME_KIND_STATUS["visual-novel"].note);
    // 第三条链对上了：话没了，但字节仍只有那七份——补引擎改的是内容，不改清单
    const rpg = generateGameCode(asKind(levelDraft(), "rpg-prototype"));
    expect(rpg.kindNote).toBeNull();
    expect(rpg.files.map((f) => f.path)).toEqual(vn.files.map((f) => f.path));
    expect(rpg.files.map((f) => f.contents), "rpg 那份多了 NexusRpg：产物字节确实随链变").not.toEqual(
      vn.files.map((f) => f.contents),
    );
  });
});

/**
 * 第二条链（RPG 成长循环）的静态闸：读产物里的**结构**，不执行它（§81）。
 *
 * 它证明的是两件事：那段转写把 `rpg.ts` 的五个语义点都带到了（漏一个就是"产物带成长层"这句谎），
 * 以及那些数只从 `plan.growth` 读、不在代码里定义（定义了就有第二个供给点，改了 rpg.ts 不会跟着变）。
 * 算术是否相同不在这里量——那一条在真浏览器里比 trace（`scripts/game-code-parity.mts`）。
 *
 * 每条缺陷都带自己的段名：反向控制要把某一处改坏，然后要求闸**只点名那一处**。
 */
function rpgChainDefects(engine: string, main: string): string[] {
  const defects: string[] = [];
  const start = engine.indexOf("function xpToNext(plan, level)");
  if (start < 0 || !engine.includes("var NexusRpg = {")) {
    return ["NexusRpg：engine.js 里没有那段转写，README 那句「带成长层」就是空的"];
  }
  // 从公式那一句起：xpToNext 与 NexusRpg 是同一段转写的两半，只取后半会把公式漏在闸外面
  const block = engine.slice(start);
  const sites: [string, string[]][] = [
    ["初始态", ["{ base: NexusSim.initialState(plan), level: 1, xp: 0, levelUps: 0 }"]],
    ["等级门", ["quest.requiredLevel <= next.level", "delete next.base.questDone[quest.id]", 'next.base.status = "playing"', "next.base.outcome = null"]],
    ["击杀经验", ["gained += enemy.xp", 'enemy.from === "default"']],
    ["任务经验", ["gained += quest.xpReward", "quest.hasXpReward"]],
    ["升级", ["while (next.xp >= xpToNext(plan, next.level))", "next.base.health += growth.levelBonus.maxHealth"]],
    ["当级伤害", ["growth.levelBonus.damage * state.levelUps"]],
    ["曲线读数据", ["plan.growth.xpBase + (Math.max(1, level) - 1) * plan.growth.xpStep", "var growth = plan.growth;", "growth.enemyXp", "growth.quests"]],
  ];
  for (const [site, needles] of sites) {
    for (const needle of needles) {
      if (!block.includes(needle)) defects.push(`${site}：产物里读不到 ${needle}`);
    }
  }
  // 数不许在代码这一侧定义：定义了就有第二个供给点，rpg.ts 改了产物不会跟着改
  for (const definition of [/xpBase:/, /xpStep:/, /levelBonus:\s*\{/]) {
    if (definition.test(block)) defects.push(`曲线读数据：产物代码里定义了 ${definition.source}，那才是第二个供给点`);
  }
  // summary 的 arity 必须一致，否则 main.js 那一处分支就得变成两处
  const summaries = engine.match(/summary: function \(plan, state\)/g) ?? [];
  if (summaries.length !== 2) defects.push(`arity：两条链的 summary 各收 (plan, state)，实际数到 ${summaries.length} 处`);
  for (const needle of [
    "var engine = plan.growth ? NexusRpg : NexusSim;",
    "engine.summary(plan, state)",
    "function view(st) { return st.base ? st.base : st; }",
  ]) {
    if (!main.includes(needle)) defects.push(`main.js：读不到 ${needle}`);
  }
  if (main.includes("rpg-prototype")) defects.push("main.js：那里按类型分支了，链应该由数据（plan.growth）决定");
  return defects;
}

describe("第二条链：标了 RPG 原型的那份产物真的带成长循环", () => {
  const rpgDoc = (): GameDocument => ({ ...levelDraft(), kind: "rpg-prototype" });
  const flatDoc = (): GameDocument => ({ ...levelDraft(), kind: "2d" });

  it("那段转写五个语义点一个都不许漏，而 2d 那份不带它", () => {
    const output = generateGameCode(rpgDoc());
    const engine = file(output, "engine.js").contents;
    const main = file(output, "main.js").contents;
    expect(rpgChainDefects(engine, main)).toEqual([]);

    const flat = generateGameCode(flatDoc());
    expect(file(flat, "engine.js").contents, "没标 rpg 的那份不许带第二段引擎").not.toContain("NexusRpg");
    expect(JSON.parse(file(flat, "plan.json").contents).growth).toBeUndefined();
    expect(file(flat, "engine.js").contents.match(/summary: function \(plan, state\)/g) ?? []).toHaveLength(1);

    // 反向控制一：把升级回复改成写死的 10，闸必须只点名「升级」这一处
    const hardcoded = engine.replace("next.base.health += growth.levelBonus.maxHealth;", "next.base.health += 10;");
    expect(hardcoded, "替换没命中，这条反向控制测的是空气").not.toBe(engine);
    expect([...new Set(rpgChainDefects(hardcoded, main).map((hit) => hit.split("：")[0]))]).toEqual(["升级"]);
    expect(rpgChainDefects(hardcoded, main).every((hit) => hit.includes("levelBonus.maxHealth")), "点名的必须是那一处").toBe(true);

    // 反向控制二：删掉等级门那句 delete，闸只点名「等级门」
    const ungated = engine.replace("delete next.base.questDone[quest.id];", "");
    expect(ungated).not.toBe(engine);
    expect([...new Set(rpgChainDefects(ungated, main).map((hit) => hit.split("：")[0]))]).toEqual(["等级门"]);

    // 反向控制三：main.js 改成按类型分支（把链的决定从数据搬回类型），闸必须抓到
    const typedMain = main.replace("var engine = plan.growth ? NexusRpg : NexusSim;", "var engine = rpg ? NexusRpg : NexusSim; /* rpg-prototype */");
    expect(typedMain).not.toBe(main);
    expect(rpgChainDefects(engine, typedMain).some((hit) => hit.startsWith("main.js：那里按类型分支"))).toBe(true);
  });

  it("成长那些数只在 plan.json 里定义一次，值从 rpg.ts 的导出来", () => {
    const document = rpgDoc();
    const output = generateGameCode(document);
    const plan = JSON.parse(file(output, "plan.json").contents) as ReturnType<typeof artifactPayload>;
    const rpg = compileRpg(document);
    // 与投影自己算的那一份逐字段相同（不是与手抄的数相同）
    expect(plan.growth?.enemyXp).toEqual(rpg.enemyXp);
    expect(plan.growth?.quests).toEqual(rpg.quests);
    expect(plan.growth?.xpBase).toBe(XP_BASE);
    expect(plan.growth?.xpStep).toBe(XP_STEP);
    expect(plan.growth?.levelBonus).toEqual({ ...LEVEL_BONUS });
    expect(file(output, "engine.js").contents).not.toMatch(/xpBase:/);
  });

  it("成长那几条限度走的是 plan.notes，不在产物代码里再抄一份", () => {
    const output = generateGameCode(rpgDoc());
    const plan = JSON.parse(file(output, "plan.json").contents) as ReturnType<typeof artifactPayload>;
    for (const rule of RPG_RULE_NOTES) expect(plan.notes, `这条限度没进那份数据：${rule}`).toContain(rule);
    const readme = file(output, "README.txt").contents;
    for (const rule of RPG_RULE_NOTES) expect(readme, `这条限度没进 README：${rule}`).toContain(rule);
    expect(file(output, "main.js").contents, "抄一份常量就是第二个供给点：限度应从 plan.notes 来").not.toContain("RPG_RULE_NOTES");
    const flat = generateGameCode(flatDoc());
    expect(
      JSON.parse(file(flat, "plan.json").contents).notes as string[],
      "没带引擎的那一条链里不该混进成长的句子",
    ).not.toContain(RPG_RULE_NOTES[0] as string);
  });

  it("两条链的事件上限是同一个数：产物读 RULES.eventCap，而 rpg.ts 那里写的是字面量", () => {
    // 这条只能从源码量：产物用 sim.ts 的导出封顶，rpg.ts 的私有 pushEvent 用的是一个写死的数
    const source = readFileSync(fileURLToPath(new URL("../src/rpg.ts", import.meta.url)), "utf8");
    const literal = /if \(events\.length > (\d+)\) events\.shift\(\);/.exec(source)?.[1];
    expect(literal, "rpg.ts 里那句上限的形状变了，这条闸要先跟着改").toBeTruthy();
    expect(Number(literal), "两个上限分叉了：产物的事件条数与平台上跑的不是同一个数").toBe(EVENT_CAP);
  });

  it("README 那条成长披露与页面上那句链名都在，且随 rpg.ts 的导出变（哨兵数）", () => {
    const original = LEVEL_BONUS.damage;
    const sentinel = 987;
    const read = () => {
      const output = generateGameCode(rpgDoc());
      return {
        readme: file(output, "README.txt").contents,
        plan: JSON.parse(file(output, "plan.json").contents) as ReturnType<typeof artifactPayload>,
        html: file(output, "index.html").contents,
      };
    };
    const before = read();
    expect(before.readme).toContain(ARTIFACT_CHAINS.rpg.label);
    expect(before.readme).toContain("NexusRpg");
    expect(before.html).toContain(ARTIFACT_CHAINS.rpg.label);
    // 只比那一条 bullet：RPG_RULE_NOTES 是 rpg.ts 在模块加载时用模板拼好的，
    // 哨兵改的是之后的 compileRpg 读数，不该指望那句已生成的句子跟着变
    const growthBullet = (text: string): string => /- 成长：NexusRpg[^\n]*/.exec(text)?.[0] ?? "";
    expect(growthBullet(before.readme)).toContain(`伤害 +${original}`);
    try {
      (LEVEL_BONUS as { maxHealth: number; damage: number }).damage = sentinel;
      const after = read();
      expect(after.plan.growth?.levelBonus.damage, "plan.json 里那份 growth 没跟着导出走").toBe(sentinel);
      expect(growthBullet(after.readme), "README 那句成长是抄死的数").toContain(`伤害 +${sentinel}`);
      expect(growthBullet(after.readme)).not.toContain(`伤害 +${original}`);
    } finally {
      (LEVEL_BONUS as { maxHealth: number; damage: number }).damage = original;
    }
    const restored = read();
    expect(restored.plan.growth?.levelBonus.damage).toBe(original);
    expect(growthBullet(restored.readme)).toContain(`伤害 +${original}`);
    expect(growthBullet(restored.readme)).not.toContain(`伤害 +${sentinel}`);
  });
});

describe("那句话是从状态表算出来的，不是抄下来的", () => {
  /**
   * 判别证据：改表格里的一个字，这句话必须跟着变。
   * 只断言"这句话里含表格里那句话"挡不住手抄——抄的那一份今天也相等。
   * 所以这里在跑之前把 visual-novel 的 note 换成哨兵串，跑完立刻还原（还原失败也要报出来）。
   */
  it("状态表改了，产物的那句话跟着改（哨兵串）", () => {
    const original = GAME_KIND_STATUS["visual-novel"];
    const sentinel = "哨兵：这一型的说明被测试改过了";
    const asVn = (): GameDocument => ({ ...levelDraft(), kind: "visual-novel" }) as GameDocument;
    try {
      (GAME_KIND_STATUS as Record<GameKind, { pipeline: string | null; view?: string; note: string }>)["visual-novel"] = {
        ...original,
        note: sentinel,
      };
      const output = generateGameCode(asVn());
      expect(output.kindNote, "表格改了而这句话没跟着改 = 某处抄了一份").toContain(sentinel);
      expect(output.kindNote).not.toContain(original.note);
      expect(file(output, "README.txt").contents).toContain(sentinel);
    } finally {
      (GAME_KIND_STATUS as Record<GameKind, typeof original>)["visual-novel"] = original;
    }
    // 还原的证据同时是派生的第二遍证据：换回原句，这句话里就不许再留着哨兵
    expect(GAME_KIND_STATUS["visual-novel"].note).toBe(original.note);
    const after = codeKindReadings(asVn()).kindNote!;
    expect(after).toContain(original.note);
    expect(after, "哨兵没还原就写回表格：这条自己先红").not.toContain(sentinel);
  });
});
