import {
  GAME_ENTITY_LABELS,
  GAME_KIND_LABELS,
  GAME_KIND_STATUS,
  type GameDocument,
  type GameEntityKind,
} from "./index";
import { PLAY_KIND_SHAPES, compileGame, type GamePlan, type PlayActor, type StatSource } from "./play";
import { compileForKind, compileStory, type GameProjection, type StoryPlan } from "./story";
import { compileRpg } from "./rpg";
import {
  CONTACT_COOLDOWN,
  EVENT_CAP,
  MAX_FRAME_SECONDS,
  PLAYER_ATTACK_COOLDOWN,
  SIM_RULE_NOTES,
  SIM_NO_PLAYER_OUTCOME,
} from "./sim";

/**
 * §52 那条链的最后一格：Level Design → **Code**。
 *
 * 前三格交出来的是「数值进了目标带、位置也写进文档」的一份设计；这一格把它**投影成能拿走的东西**：
 * 一个自包含的可玩产物（HTML + CSS + JS + 那份计划）。它是投影不是创作（§16）：
 * 设计文档改一个数，重新生成一次就是新的字节；产物里不许有设计里没有的东西。
 *
 * 三条纪律，每一条都有对应的见证（见 `test/codegen.test.ts`）：
 *
 * 1. **产物跑哪一条链，由 `compileForKind` 那一处分派点决定，不在这一格再判断一次类型**。
 *    §51 的类型表里 `2d / 2.5d / 3d / 探索 / 解谜` 五种读 `compileGame` 排的 2D 俯视计划，
 *    `rpg-prototype` 在**同一份计划**外面套一层成长循环（`compileRpg` / `rpgStep`），对话两型读 `compileStory`。
 *    产物里带了引擎的链记在 `ARTIFACT_CHAINS` 这一处（就是产物侧的分派表）：今天有 `topdown` 与 `rpg` 两条，
 *    所以 `engine.js` 永远是 `sim.ts` 的转写，而标了 RPG 原型的那一份再多一段 `rpg.ts` 的转写（`NexusRpg`），
 *    `plan.json` 里随之多出一次 `compileRpg` 算出来的 `growth`。对话管线**还没有引擎**，那一型必须由
 *    `codeKindReadings()` 把错位说出来（README、index.html、界面三处念同一句）；
 *    把"拿走的就是页面上跑的那一种"写回对不上的那一型就是 §159 级的谎，2026-10-17 那次实测
 *    （`.scratch/kind-probe*.ts`，读数记在 `docs/TESTING.md`）量到的就是它：
 *    RPG 草稿投影出来的产物没有成长循环，视觉小说投影出来是一个开不了场的空场子。
 *    前者已经在 `d8b8a3c` 之后由这一格补上（补的是引擎，不是文案：那句 `kindNote` 随分派表自己变空），
 *    后者还在。**为什么 `plan.json` 与 `plan.js` 必须是同一次 `JSON.stringify` 的结果**：
 *    两处各写一遍就是两份真值，一份旧一份新时浏览器跑的是后者，而作者看到的是前者。
 * 2. **规则的数字不许重打**。引擎是 `sim.ts` 的转写，冷却、定步长上限、事件条数上限、
 *    没有玩家那句拒绝，全部由生成时从 `sim.ts` 的导出插进产物；成长层更直接——升级曲线、每级加成与
 *    兜底经验是 `compileRpg` 算进那份 `growth` 数据的，源头是 `rpg.ts` 的导出，产物侧一个数都不新打。
 *    转写这件事本身是这一格的限度：`sim.ts` 或 `rpg.ts` 改了逻辑而产物没重新生成，两者就会分叉，
 *    所以界面上不许说"产物就是平台跑的那一套"，只能说"产物是它的转写，数字由同一处供给"。
 *    浏览器里的一致性见证记在 `docs/TESTING.md`（两条链各一段 scripted 输入，逐字节比 trace）。
 * 3. **不在主机执行（§81）**。这一格里没有 `eval`、没有子进程、不读写文件、不联网：
 *    生成 = 纯字符串投影，运行 = 浏览器沙箱。产物自己也带一道 CSP，`connect-src 'none'`
 *    把它按在本地：一份下载的关卡不该在玩家机器上打洞。
 *
 * 与 `packages/design-model/src/codegen.ts` 同一条形状纪律：每个文件都标 `origin`，
 * 因为文件名会被改动打乱，靠路径猜归属的那一份索引迟早说谎（§69）。
 */

/** 产物里的类别配色。这是**产物自己的默认**，不是 Studio 的板子（那边在 `game2d/palette.ts`） */
export const CODEGEN_COLORS: Record<string, string> = {
  player: "#7dd3fc",
  enemy: "#f59e0b",
  item: "#a3e635",
  npc: "#c4b5fd",
  trigger: "#94a3b8",
};

/**
 * 这一格说得出的限度。写成导出常量而不是散在模板里：界面上要把同一份限度念一遍，
 * 各写一遍就会一处比一处乐观（§159）。
 */
export const CODEGEN_LIMITS: readonly string[] = [
  "产物里的引擎是平台规则模块的转写：2D 那条链转写 sim.ts，标了 RPG 原型的那一份再多转一段 rpg.ts；数字由生成时从导出插进来，逻辑不在这里重打一遍。",
  "产物没有 Studio 的界面：没有数值来历面板、没有等轴测与 3D 画法、没有 Playtest 报告。",
  "产物不联网：CSP 里 connect-src 是 none，键盘只有方向键与 WASD，没有手柄。",
  "这一格不执行任何东西：生成只是拼字符串（§81），要跑就在浏览器沙箱里打开。",
];

/**
 * 产物侧的分派表：**哪几条链在这份产物里真的带了引擎**。
 *
 * 这一处就是唯一答案：`engine.js` 带不带那段转写、README 那条"按什么生成的"多不多一行、
 * `codeKindReadings()` 那句话说不说出来，三处都读这张表。加一条链 = 在这里加一项 + 写它的转写，
 * 文案自己跟着变——如果"有没有引擎"在代码里有第二个答案，它就会在某次改动后开始说谎。
 */
export const ARTIFACT_CHAINS = {
  topdown: {
    label: "2D 俯视那条链（engine.js 里 NexusSim 是 sim.ts 的转写）",
    /** 画布上跑的东西：这一句要能指回数据是从哪一次投影来的 */
    dataNote: "界面上的画布读的就是这一份",
  },
  rpg: {
    label: "RPG 那条链（NexusSim 之外再多一段 NexusRpg，转写的是 rpg.ts：经验、升级与等级门）",
    dataNote: "画布读的是同一份 2D 计划，等级/经验读的是同一次序列化里多出来的那一份 growth",
  },
  story: {
    label: "对话那条链（engine.js 里是 NexusStory，转写的是 story.ts：正文、选择与分支）",
    dataNote: "这一份读的是 dialogue 实体（正文=设计说明，选择=指向其它对话的引用），别的实体不读",
  },
} as const satisfies Record<NonNullable<GameProjection["pipeline"]>, { label: string; dataNote: string }>;

export type ArtifactChain = keyof typeof ARTIFACT_CHAINS;

/** 平台侧三条管线各自那句话里要用的名字：从 `compileForKind` 的读数派生，不另起一套叫法 */
const PIPELINE_NAMES: Record<NonNullable<GameProjection["pipeline"]>, string> = {
  topdown: "2D 俯视（compileGame + sim.step）",
  story: "对话管线（compileStory：正文与选择，没有场地与判定）",
  rpg: "RPG 成长循环（compileRpg + rpgStep）",
};

/** 平台上这一型走哪条管线，在产物里有没有对应的引擎——答案只有这一处（`ARTIFACT_CHAINS` 的键）。 */
export function hasArtifactEngine(pipeline: GameProjection["pipeline"]): pipeline is ArtifactChain {
  return pipeline !== null && pipeline in ARTIFACT_CHAINS;
}

/**
 * 这一份设计在产物里跑哪条链。分派读的是 `compileForKind`（平台上那一处），不是这一格自己的判断：
 * 带了引擎的链按类型走，还没接进产物的管线（对话）落到 `topdown`——
 * 那一型拿到的就是一份开不了场的 2D 投影，而 `codeKindReadings()` 会把这件事说出来。
 */
export function artifactChainOf(document: GameDocument): ArtifactChain {
  const pipeline = compileForKind(document).pipeline;
  return hasArtifactEngine(pipeline) ? pipeline : "topdown";
}

/**
 * "这一份产物跑的是哪条链"那一句只有一个写法：产物页面（`index.html`）与界面上那一格都调这里，
 * 而不是各拼一遍 `${label}。`——拼第二遍的那一处会先过时。
 */
export function artifactChainSentence(chain: ArtifactChain): string {
  return `这条产物跑的是${ARTIFACT_CHAINS[chain].label}。`;
}

/** 成长层带进产物的那些数：全部来自 `compileRpg`，一个都不是这一格新打的 */
export interface ArtifactGrowth {
  enemyXp: { id: string; name: string; xp: number; from: StatSource }[];
  quests: { id: string; name: string; xpReward: number; hasXpReward: boolean; requiredLevel: number }[];
  xpBase: number;
  xpStep: number;
  levelBonus: { maxHealth: number; damage: number };
}

/**
 * 产物吃的那份计划：**按链分形状**的判别联合（`chain` 是那个 tag）。
 *
 * 为什么不是从前那种 `GamePlan & { growth? }`：对话那条链的载荷**没有** `arena / player / enemies /
 * triggers / quests`（它有的是 `startId / beats / playable / blockers`），
 * 硬塞进 `GamePlan` 就要造一堆假字段（§159）。于是三条链各是一种形状，用 `chain` 区分。
 *
 * 那个 tag 顺带解决两件事：产物自己知道跑哪条链（`main.js` 的分派不再靠"有没有 `growth` 字段"猜），
 * 而凡是读 2D 字段的地方（`documentNotes` / `htmlSource` / `mainSource`）**必须按链分支**——
 * 漏掉一处就是 TypeScript 报错，不是运行时白屏。
 */
export type ArtifactPlan =
  | ({ chain: "topdown" } & GamePlan)
  | ({ chain: "rpg" } & GamePlan & { growth: ArtifactGrowth })
  | ({ chain: "story" } & StoryPlan);

/**
 * 那一次序列化的**产物侧计划**：`plan.json` 与 `plan.js` 都写它，`main.js` 与见证脚本也读它。
 *
 * 单独导出是为了"供给点只有一处"：测试与浏览器见证要比的就是这一份字节，
 * 让它们各自再拼一次 `{...compileGame(doc), growth}`，拼错的那一份照样能自证一致。
 *
 * 成长那一层的限度清单走的是 `notes`（`compileRpg` 在底层清单后面追加的那几条）：
 * 平台 RPG 页面上列的就是这一份，产物里再抄一份 `RPG_RULE_NOTES` 就是第二个供给点。
 */
export function artifactPayload(document: GameDocument): ArtifactPlan {
  const chain = artifactChainOf(document);
  if (chain === "story") return { ...compileStory(document), chain: "story" };
  if (chain === "rpg") {
    const plan = compileRpg(document);
    return {
      ...plan.base,
      chain: "rpg",
      notes: plan.notes,
      growth: {
        enemyXp: plan.enemyXp.map((enemy) => ({ id: enemy.id, name: enemy.name, xp: enemy.xp, from: enemy.from })),
        quests: plan.quests.map((quest) => ({
          id: quest.id,
          name: quest.name,
          xpReward: quest.xpReward,
          hasXpReward: quest.hasXpReward,
          requiredLevel: quest.requiredLevel,
        })),
        xpBase: plan.xpBase,
        xpStep: plan.xpStep,
        levelBonus: { ...plan.levelBonus },
      },
    };
  }
  return { ...compileGame(document), chain: "topdown" };
}

export type GameCodeOrigin =
  | { kind: "plan"; from: "compileGame" | "compileRpg" | "compileStory" }
  | { kind: "engine"; from: "sim.step" | "sim.step+rpg.step" | "story.step" }
  | { kind: "shell"; from: "codegen" }
  | { kind: "readme"; from: "codegen" };

export interface GeneratedGameFile {
  /** 包内相对路径：不带 `..`、不带前导斜杠，落进 zip 才是安全的 */
  path: string;
  contents: string;
  mime: string;
  /** 这份文件是从哪一处投影来的（与 §69 的 code-index 同一口径） */
  origin: GameCodeOrigin;
}

export interface GameCodeOutput {
  files: GeneratedGameFile[];
  /** 针对**这一份文档**的发现（模板实体、不可判定的任务、跑不起来的原因）：界面上要逐条念 */
  notes: string[];
  /** 全产物的字节数：编排那一格用它当读数，别让界面自己再数一遍 */
  bytes: number;
  /**
   * 这份设计标的那一型，在平台上由哪条管线跑（照 `compileForKind` 的读数，不是这一格自己判断的）。
   * 与 `artifactChain` 不是同一个数：前者是"这一型在平台上该跑什么"，后者是"这份产物真的跑什么"。
   */
  kindPipeline: "topdown" | "story" | "rpg" | null;
  /** 这一份产物跑的那条链（`ARTIFACT_CHAINS` 里的一个键），界面上那句"产物跑的是哪条链"读它 */
  artifactChain: ArtifactChain;
  /** 该跑的管线在产物里没有引擎时那句话说清"下载的不是页面上试玩的那一种"；对得上时为 null（没有就不许印一句空话） */
  kindNote: string | null;
}

const GENERATED_BANNER =
  "由 NEXUS 从游戏设计模型生成（§16：设计文档是唯一真值，这份产物只是它的一个投影；改设计要重新生成，不要手改这里）";

/**
 * 「下载拿走的那一份」与「平台上试玩的那一份」是不是同一条管线——这句话只能由 `compileForKind`
 * 那一处分派点回答，不能在这一格里再写一遍 `if (kind === ...)`（§16：同一份模型的投影不许各说各话）。
 *
 * 有没有引擎读的是 `ARTIFACT_CHAINS` 那一张表，而那张表就是生成时的分派点本身：
 * `engine.js` 带不带 `NexusRpg`、README 多不多那一行、这里说不说话，是同一个答案的三个出口。
 * 所以"补一条链"这件事改的是引擎与投影，**不是这句文案**——RPG 那条链落地后，
 * 这一型自动没有话（`kindNote === null`），而对话两型仍然说出来，因为产物里确实没有它的引擎。
 */
export function codeKindReadings(document: GameDocument): {
  kindPipeline: GameProjection["pipeline"];
  artifactChain: ArtifactChain;
  kindNote: string | null;
} {
  const kindPipeline = compileForKind(document).pipeline;
  const artifactChain = artifactChainOf(document);
  const label = GAME_KIND_LABELS[document.kind];
  if (hasArtifactEngine(kindPipeline)) return { kindPipeline, artifactChain, kindNote: null };
  const missing = kindPipeline === null ? "这条链（状态表说这个类型今天没接）" : PIPELINE_NAMES[kindPipeline];
  const carried = Object.values(ARTIFACT_CHAINS)
    .map((chain) => chain.label)
    .join("；");
  return {
    kindPipeline,
    artifactChain,
    kindNote:
      `这份产物跑的是${ARTIFACT_CHAINS[artifactChain].label}，而 ${label} 在平台上该跑的是「${missing}」——那条链在这份产物里没有引擎。` +
      `产物里带了引擎的链是：${carried}。` +
      `状态表对「${label}」的那句是「${GAME_KIND_STATUS[document.kind].note}」——那句里的东西不在这份产物里：` +
      `下载解压后打开的是 ${label} 在平台上不走的那一条，不是这个类型在试玩页跑的那一种。`,
  };
}

/** 文件的稳定顺序：zip 里的清单、界面上的计数都按这一处排，别按 Map 的插入顺序赌运气 */
const FILE_ORDER: readonly string[] = ["README.txt", "index.html", "style.css", "plan.json", "plan.js", "engine.js", "main.js"];

function mimeFor(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
}

/** 文档名是用户输入，进 HTML 之前必须转义：标题里一个 `<` 就能把整页结构掀翻 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 注释行：生成的每个文件第一行都是这一句，指回生成器 */
function banner(prefix: string): string {
  return `${prefix} ${GENERATED_BANNER}`;
}

/** 把一份 JS 源码写成行数组的拼接：这样模板里不出现反引号，也就没有 `${` 与转义打架的事 */
function js(lines: readonly string[]): string {
  return `${lines.join("\n")}\n`;
}

/**
 * `plan.json` 与 `plan.js` 共用这一次序列化的结果。
 *
 * 为什么要共用：两份文件说的是同一件事（这份计划长什么样），各生成一次就给了它们分叉的机会，
 * 而分叉之后 `plan.json` 可以是旧的、`plan.js` 可以是新的，浏览器里跑的却是后者——
 * 那份"能下载的关卡"就和作者看到的对不上了。
 */
function planJson(plan: ArtifactPlan): string {
  return JSON.stringify(plan, null, 2);
}

function engineSource(chain: ArtifactChain): string {
  const rules = [
    `  contactCooldown: ${CONTACT_COOLDOWN},`,
    `  playerAttackCooldown: ${PLAYER_ATTACK_COOLDOWN},`,
    `  maxFrameSeconds: ${MAX_FRAME_SECONDS},`,
    `  eventCap: ${EVENT_CAP},`,
  ].join("\n");
  const lines = [
    banner("//"),
    "// 规则的数字来自 sim.ts 的导出（下面 RULES / TEXT 两块），不是在这里重打一遍的。",
    ...(chain === "rpg"
      ? ["// 成长层的数不在这里：NexusRpg 读的是 plan.growth，那一份由 compileRpg 从 rpg.ts 的导出算进同一次序列化。"]
      : []),
    "// §81：这份产物不在主机执行，只在浏览器沙箱里打开。",
    '"use strict";',
    "var RULES = {",
    rules,
    "};",
    "var TEXT = { noPlayer: " + JSON.stringify(SIM_NO_PLAYER_OUTCOME) + " };",
    "function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }",
    "function clamp(value, lo, hi) { return Math.min(Math.max(value, lo), hi); }",
    "function copy(map) { var out = {}; for (var key in map) out[key] = map[key]; return out; }",
    "function indexById(list) { var out = {}; for (var i = 0; i < list.length; i += 1) out[list[i].id] = list[i]; return out; }",
    "function cloneActors(list) {",
    "  return list.map(function (a) { return { id: a.id, x: a.x, y: a.y, health: a.health, active: a.active, readyAt: a.readyAt }; });",
    "}",
    // 开局与逐步克隆不是一回事：计划里没有 active / readyAt 这两个字段，
    // 用 cloneActors 起头会让所有敌人开局就是"死的"（不追、不打、捡不起来）。与 sim.ts 的 actor() 同形。
    "function startActors(list, healthOf) {",
    "  return list.map(function (a) { return { id: a.id, x: a.x, y: a.y, health: healthOf(a), active: true, readyAt: 0 }; });",
    "}",
    "function push(events, t, text) {",
    "  events.push({ t: Math.round(t * 10) / 10, text: text });",
    "  while (events.length > RULES.eventCap) events.shift();",
    "}",
    "var NexusSim = {",
    "  initialState: function (plan) {",
    "    var player = plan.player;",
    "    return {",
    "      t: 0,",
    "      px: player ? player.x : plan.arena.width / 2,",
    "      py: player ? player.y : plan.arena.height / 2,",
    "      health: player ? player.health : 0,",
    "      readyAtPlayer: 0,",
    "      enemies: startActors(plan.enemies, function (a) { return a.health; }),",
    "      items: startActors(plan.items, function (a) { return a.health; }),",
    "      triggers: startActors(plan.triggers, function () { return 1; }),",
    "      questDone: {},",
    "      activated: {},",
    "      status: player ? \"playing\" : \"lost\",",
    "      outcome: player ? null : TEXT.noPlayer,",
    "      events: [],",
    "      counters: { damageTaken: 0, damageDealt: 0, pickups: 0, triggersFired: 0, attacks: 0 },",
    "    };",
    "  },",
    "  step: function (plan, state, input, dt) {",
    "    if (state.status !== \"playing\") return state;",
    "    var frame = clamp(dt, 0, RULES.maxFrameSeconds);",
    "    var next = {",
    "      t: state.t + frame,",
    "      px: state.px, py: state.py, health: state.health, readyAtPlayer: state.readyAtPlayer,",
    "      enemies: cloneActors(state.enemies),",
    "      items: cloneActors(state.items),",
    "      triggers: cloneActors(state.triggers),",
    "      questDone: copy(state.questDone),",
    "      activated: copy(state.activated),",
    "      status: state.status,",
    "      outcome: state.outcome,",
    "      events: state.events.slice(),",
    "      counters: copy(state.counters),",
    "    };",
    "    var player = plan.player;",
    "    if (!player) return next;",
    "    var enemyDesign = indexById(plan.enemies);",
    "    var itemDesign = indexById(plan.items);",
    "    var triggerDesign = indexById(plan.triggers);",
    "    var questDesign = indexById(plan.quests);",
    "    var i, sim, design, gap;",
    "    var norm = Math.hypot(input.dx, input.dy) || 1;",
    "    next.px = clamp(next.px + (input.dx / norm) * player.speed * frame, player.radius, plan.arena.width - player.radius);",
    "    next.py = clamp(next.py + (input.dy / norm) * player.speed * frame, player.radius, plan.arena.height - player.radius);",
    "    for (i = 0; i < next.enemies.length; i += 1) {",
    "      sim = next.enemies[i];",
    "      if (!sim.active) continue;",
    "      design = enemyDesign[sim.id];",
    "      gap = dist(next.px, next.py, sim.x, sim.y);",
    "      if (gap <= design.senseRadius) {",
    "        var toward = gap || 1;",
    "        sim.x += ((next.px - sim.x) / toward) * design.speed * frame;",
    "        sim.y += ((next.py - sim.y) / toward) * design.speed * frame;",
    "      }",
    "      if (gap <= design.radius + player.radius && next.t >= sim.readyAt) {",
    "        sim.readyAt = next.t + RULES.contactCooldown;",
    "        next.health -= design.damage;",
    "        next.counters.damageTaken += design.damage;",
    "        push(next.events, next.t, design.name + \" 打中你 -\" + design.damage);",
    "      }",
    "    }",
    "    if (input.attack && next.t >= next.readyAtPlayer) {",
    "      next.readyAtPlayer = next.t + RULES.playerAttackCooldown;",
    "      next.counters.attacks += 1;",
    "      var reach = player.radius + player.reach;",
    "      for (i = 0; i < next.enemies.length; i += 1) {",
    "        sim = next.enemies[i];",
    "        if (!sim.active) continue;",
    "        design = enemyDesign[sim.id];",
    "        if (dist(next.px, next.py, sim.x, sim.y) > reach + design.radius) continue;",
    "        sim.health -= player.damage;",
    "        next.counters.damageDealt += player.damage;",
    "        if (sim.health <= 0) {",
    "          sim.active = false;",
    "          push(next.events, next.t, \"打倒了 \" + design.name);",
    "        }",
    "      }",
    "    }",
    "    for (i = 0; i < next.items.length; i += 1) {",
    "      sim = next.items[i];",
    "      if (!sim.active) continue;",
    "      design = itemDesign[sim.id];",
    "      if (dist(next.px, next.py, sim.x, sim.y) <= design.radius + player.radius) {",
    "        sim.active = false;",
    "        next.counters.pickups += 1;",
    "        push(next.events, next.t, \"拾取 \" + design.name);",
    "      }",
    "    }",
    "    for (i = 0; i < next.triggers.length; i += 1) {",
    "      sim = next.triggers[i];",
    "      design = triggerDesign[sim.id];",
    "      if (dist(next.px, next.py, sim.x, sim.y) > design.radius) continue;",
    "      if (next.t < sim.readyAt) continue;",
    "      sim.readyAt = next.t + Math.max(design.cooldown, design.delay, 1);",
    "      next.counters.triggersFired += 1;",
    "      var first = next.activated[design.id] === undefined;",
    "      if (first) next.activated[design.id] = next.t;",
    "      push(",
    "        next.events,",
    "        next.t,",
    "        (first ? \"激活\" : \"再次踩到\") + \"触发器 \" + design.name +",
    "          (design.affects ? \"（它引用的是 \" + design.affects.name + \"；模型里没有\\\"之后发生什么\\\"）\" : \"\"),",
    "      );",
    "    }",
    "    for (i = 0; i < plan.quests.length; i += 1) {",
    "      var quest = plan.quests[i];",
    "      if (!quest.judgeable || next.questDone[quest.id] !== undefined) continue;",
    "      var allMet = quest.goals.every(function (goal) {",
    "        if (goal.kind === \"activate\") return next.activated[goal.actorId] !== undefined;",
    "        var found = goal.kind === \"defeat\"",
    "          ? next.enemies.filter(function (e) { return e.id === goal.actorId; })[0]",
    "          : next.items.filter(function (e) { return e.id === goal.actorId; })[0];",
    "        return found ? !found.active : false;",
    "      });",
    "      if (!allMet) continue;",
    "      next.questDone[quest.id] = next.t;",
    "      push(next.events, next.t, \"完成任务「\" + questDesign[quest.id].name + \"」\");",
    "    }",
    "    var judgeable = plan.quests.filter(function (q) { return q.judgeable; });",
    "    if (next.health <= 0) {",
    "      next.status = \"lost\";",
    "      next.outcome = \"生命值归零（\" + (Math.round(next.t * 10) / 10) + \" 秒，承受 \" + next.counters.damageTaken + \" 点伤害）。\";",
    "    } else if (judgeable.length && judgeable.every(function (q) { return next.questDone[q.id] !== undefined; })) {",
    "      next.status = \"won\";",
    "      next.outcome = judgeable.length + \" 条可判定的任务全部完成（\" + (Math.round(next.t * 10) / 10) + \" 秒）。\";",
    "    } else {",
    "      var expired = judgeable.filter(function (q) {",
    "        return q.timeLimit !== null && next.t > q.timeLimit && next.questDone[q.id] === undefined;",
    "      })[0];",
    "      if (expired) {",
    "        next.status = \"lost\";",
    "        next.outcome = \"任务「\" + expired.name + \"」超时（timeLimit=\" + expired.timeLimit + \"，按秒解释）。\";",
    "      }",
    "    }",
    "    return next;",
    "  },",
    // summary 多收一个 plan 参数（这一份用不到）：两条链要能被 main.js 用同一个调用形状驱动，
    // 分支留在数据那一边（plan.growth 有没有），不留在这里再判断一次类型。
    "  summary: function (plan, state) {",
    "    return [",
    "      \"跑了 \" + (Math.round(state.t * 10) / 10) + \" 秒\",",
    "      \"生命 \" + Math.max(0, state.health),",
    "      \"敌人剩 \" + state.enemies.filter(function (e) { return e.active; }).length + \"/\" + state.enemies.length,",
    "      \"物品拾取 \" + state.counters.pickups + \"/\" + state.items.length,",
    "      \"任务完成 \" + Object.keys(state.questDone).length,",
    "      \"机关激活 \" + Object.keys(state.activated).length + \"/\" + state.triggers.length,",
    "      state.status === \"playing\" ? \"进行中\" : state.status === \"won\" ? \"通关\" : \"失败\",",
    "    ].join(\" · \");",
    "  },",
    "};",
  ];

  // RPG 那条链：rpg.ts 的转写，包在 NexusSim 外面一层。成长层的数一个都不在这里重打——
  // 升级曲线与每级加成读的是 plan.growth，那一份数据由 compileRpg 从 rpg.ts 的导出算进同一次序列化里。
  if (chain === "rpg") {
    lines.push(
      "function find(list, id) {",
      "  for (var i = 0; i < list.length; i += 1) if (list[i].id === id) return list[i];",
      "  return undefined;",
      "}",
      "function xpToNext(plan, level) {",
      "  return plan.growth.xpBase + (Math.max(1, level) - 1) * plan.growth.xpStep;",
      "}",
      "var NexusRpg = {",
      "  initialState: function (plan) {",
      "    return { base: NexusSim.initialState(plan), level: 1, xp: 0, levelUps: 0 };",
      "  },",
      "  step: function (plan, state, input, dt) {",
      "    if (state.base.status !== \"playing\") return state;",
      "    var growth = plan.growth;",
      "    // 升过级之后伤害是派生出来的：计划本身是常量，所以喂给底层的是这一份当级的影子",
      "    var combatPlan = plan;",
      "    if (state.levelUps && plan.player) {",
      "      combatPlan = Object.assign({}, plan, {",
      "        player: Object.assign({}, plan.player, { damage: plan.player.damage + growth.levelBonus.damage * state.levelUps }),",
      "      });",
      "    }",
      "    var base = NexusSim.step(combatPlan, state.base, input, dt);",
      "    var next = { base: base, level: state.level, xp: state.xp, levelUps: state.levelUps };",
      "    var gained = 0;",
      "    var gatedThisFrame = false;",
      "    var i, quest, enemy, before, after;",
      "    for (i = 0; i < growth.quests.length; i += 1) {",
      "      quest = growth.quests[i];",
      "      if (quest.requiredLevel <= next.level) continue;",
      "      if (next.base.questDone[quest.id] === undefined) continue;",
      "      delete next.base.questDone[quest.id];",
      "      gatedThisFrame = true;",
      "      push(next.base.events, next.base.t,",
      "        \"任务「\" + quest.name + \"」条件满足了，但要 \" + quest.requiredLevel + \" 级才能交（现在 \" + next.level + \" 级）——完成先扣住\");",
      "    }",
      "    if (gatedThisFrame && next.base.status === \"won\") {",
      "      next.base.status = \"playing\";",
      "      next.base.outcome = null;",
      "    }",
      "    for (i = 0; i < growth.enemyXp.length; i += 1) {",
      "      enemy = growth.enemyXp[i];",
      "      before = find(state.base.enemies, enemy.id);",
      "      after = find(next.base.enemies, enemy.id);",
      "      if (before && before.active && after && !after.active) {",
      "        gained += enemy.xp;",
      "        push(next.base.events, next.base.t,",
      "          \"打倒 \" + enemy.name + \" +\" + enemy.xp + \" 经验\" + (enemy.from === \"default\" ? \"（兜底值）\" : \"\"));",
      "      }",
      "    }",
      "    for (i = 0; i < growth.quests.length; i += 1) {",
      "      quest = growth.quests[i];",
      "      if (state.base.questDone[quest.id] !== undefined) continue;",
      "      if (next.base.questDone[quest.id] === undefined) continue;",
      "      if (!quest.hasXpReward || quest.xpReward <= 0) continue;",
      "      gained += quest.xpReward;",
      "      push(next.base.events, next.base.t, \"完成任务「\" + quest.name + \"」 +\" + quest.xpReward + \" 经验\");",
      "    }",
      "    next.xp += gained;",
      "    while (next.xp >= xpToNext(plan, next.level)) {",
      "      next.xp -= xpToNext(plan, next.level);",
      "      next.level += 1;",
      "      next.levelUps += 1;",
      "      next.base.health += growth.levelBonus.maxHealth;",
      "      push(next.base.events, next.base.t,",
      "        \"升到 \" + next.level + \" 级：生命上限 +\" + growth.levelBonus.maxHealth + \"，伤害 +\" + growth.levelBonus.damage +",
      "          \"（曲线来自投影，不是设计）\");",
      "    }",
      "    return next;",
      "  },",
      "  summary: function (plan, state) {",
      "    var v = state.base;",
      "    return [",
      "      \"等级 \" + state.level,",
      "      \"经验 \" + state.xp + \"/\" + xpToNext(plan, state.level),",
      "      \"生命 \" + Math.max(0, v.health),",
      "      \"伤害 \" + (plan.player ? plan.player.damage + plan.growth.levelBonus.damage * state.levelUps : 0),",
      "      \"敌人剩 \" + v.enemies.filter(function (e) { return e.active; }).length + \"/\" + v.enemies.length,",
      "      \"任务完成 \" + Object.keys(v.questDone).length,",
      "      v.status === \"playing\" ? \"进行中\" : v.status === \"won\" ? \"通关\" : \"失败\",",
      "    ].join(\" · \");",
      "  },",
      "};",
    );
  }
  // 对话那条链：story.ts 的转写。**判定全在编译期**（起点、悬空引用、指向非对话的引用、
  // 空正文、终点、成环提示都已经在 compileStory 里判完并写进 plan.story），
  // 产物里只做"播放"：显示当前 beat 的正文、列出选项、选一个跳到目标、标出走过的段落。
  // 重做其中任何一条判定就是第二个供给点（ADR-0045 否掉的同一件事）。
  if (chain === "story") {
    lines.push(
      "function beatById(story, id) {",
      "  for (var i = 0; i < story.beats.length; i += 1) if (story.beats[i].id === id) return story.beats[i];",
      "  return null;",
      "}",
      "var NexusStory = {",
      "  initialState: function (plan) {",
      "    var story = plan.story;",
      "    return {",
      "      beatId: story.startId,",
      "      visited: {},",
      "      steps: 0,",
      "      loop: false,",
      "      status: story.playable ? \"playing\" : \"ended\",",
      "      outcome: story.playable ? null : \"这份设计里没有可读的对白，故事开不了场。\",",
      "      events: [],",
      "    };",
      "  },",
      "  // choiceId 打不中就状态不动——不给\"点下去没反应\"的假动作",
      "  step: function (plan, state, choiceId) {",
      "    var story = plan.story;",
      "    var next = {",
      "      beatId: state.beatId,",
      "      visited: copy(state.visited),",
      "      steps: state.steps,",
      "      loop: state.loop,",
      "      status: state.status,",
      "      outcome: state.outcome,",
      "      events: state.events.slice(),",
      "    };",
      "    if (state.status !== \"playing\") return next;",
      "    var beat = beatById(story, state.beatId);",
      "    if (!beat) return next;",
      "    var choice = null;",
      "    for (var i = 0; i < beat.choices.length; i += 1) {",
      "      if (beat.choices[i].id === choiceId) { choice = beat.choices[i]; break; }",
      "    }",
      "    if (!choice) return next;",
      "    var target = beatById(story, choice.to);",
      "    if (!target) return next;",
      "    next.beatId = target.id;",
      "    next.steps += 1;",
      "    // 模型里允许成环，播放器负责标出来（不是禁止）",
      "    if (next.visited[target.id]) {",
      "      next.loop = true;",
      "      push(next.events, next.steps, \"又回到「\" + target.name + \"」（这段对话成环了）\");",
      "    }",
      "    next.visited[target.id] = true;",
      "    return next;",
      "  },",
      "  summary: function (plan, state) {",
      "    var story = plan.story;",
      "    var beat = beatById(story, state.beatId);",
      "    var out = [",
      "      \"当前段落：\" + (beat ? beat.name : \"（没有）\"),",
      "      \"已走 \" + state.steps + \" 步\",",
      "    ];",
      "    if (state.loop) out.push(\"这段对话成环了：有一处你走过不止一遍（模型里允许成环，这里只标出来）\");",
      "    if (beat && beat.ending) out.push(\"这一段没有出边：走到这里就结束了\");",
      "    return out.join(\" · \");",
      "  },",
      "};",
    );
  }
  return js(lines);
}

/**
 * 形状表与场地尺寸都是从模型 / 计划插值的，颜色才是产物自己的默认。
 *
 * `plan.js` 只给 canvas 的宽高从计划里读，不在 HTML 里另写一遍数字：
 * 场地改一次尺寸，界面上的画布就该跟着变，写两处就有一处会说谎。
 *
 * 跑哪条引擎读的是**数据**（`plan.growth` 有没有），不是这一格再判断一次类型：
 * 同一份 `plan.json` 换给别的引擎，读出来的就不是那一份数据了。
 * 两条链的三个调用形状（initialState / step / summary）刻意做成同一个 arity，
 * 于是这里只有一处分支，而不是每个调用点各分支一次。
 *
 * 界面上那几行限度读的也是数据（`plan.notes`）：成长那条链的几条由 `compileRpg` 追加进同一份清单，
 * 这里不为它单加一个常量——多一处供给就多一处理所当然的抄写。
 */
function mainSource(): string {
  const lines = [
    banner("//"),
    '"use strict";',
    "(function () {",
    "  var plan = window.NEXUS_PLAN;",
    "  var shapes = " + JSON.stringify(PLAY_KIND_SHAPES) + ";",
    "  var colors = " + JSON.stringify(CODEGEN_COLORS) + ";",
    "  var SIM_RULE_NOTES = " + JSON.stringify(SIM_RULE_NOTES) + ";",
    "  var hud = document.getElementById(\"hud\");",
    // 对话那条链**先分流**：它的页面里根本没有 <canvas id="arena">，
    // getElementById 拿到 null，null.getContext 会抛 TypeError——所以分流必须在碰画布之前。
    "  if (plan.chain === \"story\") { storyMain(plan, hud); return; }",
    "  function storyMain(plan, hud) {",
    "    var story = plan.story;",
    "    var root = document.getElementById(\"story\");",
    "    var engine = NexusStory;",
    "    var state = engine.initialState(plan);",
    "    function beatById(id) {",
    "      for (var i = 0; i < story.beats.length; i += 1) if (story.beats[i].id === id) return story.beats[i];",
    "      return null;",
    "    }",
    "    function render() {",
    "      root.textContent = \"\";",
    "      var beat = beatById(state.beatId);",
    "      if (!beat) {",
    "        var none = document.createElement(\"p\");",
    "        none.textContent = \"这段对话开不了场（起点不在计划里）。\";",
    "        root.appendChild(none);",
    "        return;",
    "      }",
    "      var title = document.createElement(\"h2\");",
    "      title.textContent = beat.name;",
    "      root.appendChild(title);",
    "      var body = document.createElement(\"p\");",
    "      // 正文是空的就说\"作者没写正文\"——留一片白会让人以为是加载中（与 story.ts 同一口径）",
    "      body.textContent = beat.textEmpty ? \"（作者没给这一段写正文）\" : beat.text;",
    "      root.appendChild(body);",
    "      var choices = document.createElement(\"div\");",
    "      choices.id = \"story-choices\";",
    "      for (var i = 0; i < beat.choices.length; i += 1) {",
    "        var choice = beat.choices[i];",
    "        var button = document.createElement(\"button\");",
    "        button.type = \"button\";",
    "        button.textContent = choice.label;",
    "        button.setAttribute(\"data-story-choice\", choice.id);",
    "        button.addEventListener(\"click\", (function (id) {",
    "          return function () { state = engine.step(plan, state, id); render(); };",
    "        })(choice.id));",
    "        choices.appendChild(button);",
    "      }",
    "      root.appendChild(choices);",
    "      if (!beat.choices.length) {",
    "        var end = document.createElement(\"p\");",
    "        end.textContent = \"这一段没有出边：走到这里就结束了。\";",
    "        root.appendChild(end);",
    "      }",
    "      var out = [engine.summary(plan, state)];",
    "      for (var k = 0; k < story.notes.length; k += 1) out.push(\"限度：\" + story.notes[k]);",
    "      hud.textContent = out.join(\"\\n\");",
    "    }",
    "    render();",
    "  }",
    "  var canvas = document.getElementById(\"arena\");",
    "  var ctx = canvas.getContext(\"2d\");",
    "  canvas.width = plan.arena.width;",
    "  canvas.height = plan.arena.height;",
    "  var engine = plan.chain === \"rpg\" ? NexusRpg : NexusSim;",
    // 成长态把 2D 态包在 base 里；画布只认 2D 那一层，所以取一次就行，不在绘制代码里到处分支
    "  function view(st) { return st.base ? st.base : st; }",
    "  var state = engine.initialState(plan);",
    "  var keys = {};",
    "  var last = 0;",
    "  function readInput() {",
    "    var dx = (keys[\"arrowright\"] || keys[\"d\"] ? 1 : 0) - (keys[\"arrowleft\"] || keys[\"a\"] ? 1 : 0);",
    "    var dy = (keys[\"arrowdown\"] || keys[\"s\"] ? 1 : 0) - (keys[\"arrowup\"] || keys[\"w\"] ? 1 : 0);",
    "    return { dx: dx, dy: dy, attack: !!keys[\" \"] };",
    "  }",
    "  function shape(kind, x, y, radius, color) {",
    "    ctx.beginPath();",
    "    ctx.fillStyle = color;",
    "    var s = shapes[kind] || \"circle\";",
    "    if (s === \"square\") ctx.rect(x - radius, y - radius, radius * 2, radius * 2);",
    "    else if (s === \"diamond\") {",
    "      ctx.moveTo(x, y - radius); ctx.lineTo(x + radius, y); ctx.lineTo(x, y + radius); ctx.lineTo(x - radius, y); ctx.closePath();",
    "    } else if (s === \"triangle\") {",
    "      ctx.moveTo(x, y - radius); ctx.lineTo(x + radius, y + radius); ctx.lineTo(x - radius, y + radius); ctx.closePath();",
    "    } else ctx.arc(x, y, radius, 0, Math.PI * 2);",
    "    ctx.fill();",
    "  }",
    "  function actor(a) { if (a) shape(a.kind, a.x, a.y, a.radius, colors[a.kind] || \"#ffffff\"); }",
    "  function draw() {",
    "    var v = view(state);",
    "    ctx.clearRect(0, 0, canvas.width, canvas.height);",
    "    ctx.fillStyle = \"#0b0d12\";",
    "    ctx.fillRect(0, 0, canvas.width, canvas.height);",
    "    var i;",
    "    for (i = 0; i < v.triggers.length; i += 1) {",
    "      var trigger = v.triggers[i];",
    "      var design = plan.triggers.filter(function (t) { return t.id === trigger.id; })[0];",
    "      ctx.strokeStyle = trigger.active ? colors.trigger : \"rgba(148,163,184,0.35)\";",
    "      ctx.lineWidth = 1;",
    "      ctx.beginPath();",
    "      ctx.arc(trigger.x, trigger.y, design ? design.radius : 0, 0, Math.PI * 2);",
    "      ctx.stroke();",
    "    }",
    "    for (i = 0; i < v.items.length; i += 1) {",
    "      if (v.items[i].active) actor(plan.items.filter(function (x) { return x.id === v.items[i].id; })[0]);",
    "    }",
    "    for (i = 0; i < v.enemies.length; i += 1) {",
    "      if (v.enemies[i].active) actor(plan.enemies.filter(function (x) { return x.id === v.enemies[i].id; })[0]);",
    "    }",
    "    actor(plan.player);",
    "    if (plan.player) shape(\"player\", v.px, v.py, plan.player.radius, colors.player);",
    "    hud.textContent = lines().join(\"\\n\");",
    "  }",
    "  function lines() {",
    "    var v = view(state);",
    "    var out = [engine.summary(plan, state)];",
    "    if (v.outcome) out.push(v.outcome);",
    "    for (var i = 0; i < plan.notes.length; i += 1) out.push(\"限度：\" + plan.notes[i]);",
    "    for (var j = 0; j < SIM_RULE_NOTES.length; j += 1) out.push(\"规则：\" + SIM_RULE_NOTES[j]);",
    "    out.push(\"操作：方向键或 WASD 移动，空格挥击，R 重开。\");",
    "    return out;",
    "  }",
    "  function frame(now) {",
    "    var dt = last ? (now - last) / 1000 : 0;",
    "    last = now;",
    "    state = engine.step(plan, state, readInput(), dt);",
    "    draw();",
    "    if (view(state).status === \"playing\") requestAnimationFrame(frame);",
    "    else requestAnimationFrame(function () { draw(); });",
    "  }",
    "  window.addEventListener(\"keydown\", function (e) {",
    "    var k = e.key.toLowerCase();",
    "    keys[k] = true;",
    "    if (k === \"r\") { state = engine.initialState(plan); last = 0; }",
    "    if (k === \" \" || k.indexOf(\"arrow\") === 0) e.preventDefault();",
    "  });",
    "  window.addEventListener(\"keyup\", function (e) { keys[e.key.toLowerCase()] = false; });",
    "  draw();",
    "  if (view(state).status === \"playing\") requestAnimationFrame(frame);",
    "})();",
  ];
  return js(lines);
}

function htmlSource(document: GameDocument, plan: ArtifactPlan, chain: ArtifactChain, kindNote: string | null): string {
  const title = `${escapeHtml(document.name || "未命名游戏")} · NEXUS 导出的可玩产物`;
  return [
    "<!doctype html>",
    `<!-- ${GENERATED_BANNER} -->`,
    '<html lang="zh">',
    "<head>",
    '<meta charset="utf-8">',
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'\">",
    `<title>${title}</title>`,
    '<link rel="stylesheet" href="style.css">',
    "</head>",
    "<body>",
    `<h1>${escapeHtml(document.name || "未命名游戏")}</h1>`,
    `<p>${escapeHtml(document.summary || "")}</p>`,
    // 打开的就是这一页，不是 README：跑的是哪条链印在页面上，作者不必去翻包里的说明文件
    `<p id="chain-note">${escapeHtml(artifactChainSentence(chain))}</p>`,
    // 类型不对上的那句话也要印在页面上，不然作者看到的就是"我的 RPG 没有成长"
    ...(kindNote ? [`<p id="kind-note">${escapeHtml(kindNote)}</p>`] : []),
    // 对话那条链**没有场地**：画一块空画布只会让人以为产物坏了，所以那条链给的是正文容器
    ...(plan.chain === "story"
      ? ['<div id="story"></div>']
      : [`<canvas id="arena" width="${plan.arena.width}" height="${plan.arena.height}"></canvas>`]),
    '<pre id="hud"></pre>',
    "<noscript>这一份产物要有 JavaScript 才动得起来：规则在 engine.js 里，设计数据在 plan.js 里。</noscript>",
    '<script src="plan.js"></script>',
    '<script src="engine.js"></script>',
    '<script src="main.js"></script>',
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function cssSource(): string {
  return [
    banner("/*") + " */",
    "body { margin: 0; padding: 20px; background: #06080d; color: #e5e7eb; font: 14px/1.6 system-ui, sans-serif; }",
    "h1 { font-size: 18px; margin: 0 0 4px; }",
    "canvas { display: block; background: #0b0d12; border: 1px solid #1f2937; max-width: 100%; height: auto; }",
    "pre { white-space: pre-wrap; margin-top: 12px; }",
    "#kind-note { max-width: 70ch; color: #fbbf24; }",
    "#chain-note { max-width: 70ch; color: #94a3b8; }",
    "",
  ].join("\n");
}

/** 针对这一份文档的发现：投影已经说了的（plan.notes / blockers）不重写一遍，只补产物这一侧才看得见的 */
function documentNotes(document: GameDocument, plan: ArtifactPlan, _chain: ArtifactChain): string[] {
  const notes: string[] = [];
  // 对话那条链没有"可显示个体"与"任务"这些读数：它读的是 dialogue 实体，
  // 而这一型读不读别的实体、漏了多少个，compileStory 已经写进 plan.story.notes 了（不重写一遍）。
  if (plan.chain === "story") return notes;
  const inPlan = new Set<string>();
  const collect = (actor: PlayActor | null): void => {
    if (actor) inPlan.add(actor.id);
  };
  collect(plan.player);
  for (const actor of plan.enemies) inPlan.add(actor.id);
  for (const actor of plan.items) inPlan.add(actor.id);
  for (const actor of plan.npcs) inPlan.add(actor.id);
  for (const trigger of plan.triggers) inPlan.add(trigger.id);
  for (const quest of plan.quests) inPlan.add(quest.id);

  const leftovers = new Map<GameEntityKind, string[]>();
  for (const entity of document.entities) {
    if (inPlan.has(entity.id)) continue;
    const bucket = leftovers.get(entity.kind) ?? [];
    bucket.push(entity.name);
    leftovers.set(entity.kind, bucket);
  }
  if (leftovers.size) {
    const parts = [...leftovers.entries()].map(([kind, names]) => `${GAME_ENTITY_LABELS[kind]} ${names.length} 个（${names.join("、")}）`);
    notes.push(
      `这些实体在产物里没有自己的那一个身体：${parts.join("、")}。` +
        "投影要么把它们折成别的东西的数值（武器的 damage 与 range 进玩家），要么根本不消费" +
        "（对话、动画、粒子、镜头在这一版是设计说明），所以转写的引擎里没有它们可跑的行为。",
    );
  }

  const templates = [plan.player, ...plan.enemies, ...plan.items, ...plan.npcs].filter((actor) => actor?.template).length;
  if (templates) {
    notes.push(`场上有 ${templates} 个未设计的模板实体：它们一个数值都没填，产物会照原样跑成一个不会动的东西。`);
  }

  const unjudgeable = plan.quests.filter((quest) => !quest.judgeable).length;
  if (unjudgeable) {
    notes.push(`有 ${unjudgeable} 条任务不可判定：产物里它们永远不推动"赢"，通关条件只剩生命值与能判定的那几条。`);
  }

  // 成长层的读数只在 rpg 那条链上存在；数与曲线全部从 plan.growth 里读，不在这里重打
  if (plan.chain === "rpg") {
    const growth = plan.growth;
    const defaulted = growth.enemyXp.filter((enemy) => enemy.from === "default").length;
    const withXp = growth.quests.filter((quest) => quest.hasXpReward && quest.xpReward > 0).length;
    const gated = growth.quests.filter((quest) => quest.requiredLevel > 1).length;
    notes.push(
      `这一份带成长层（NexusRpg）：${growth.enemyXp.length} 个敌人发经验（${defaulted} 个用的是投影兜底）、` +
        `${withXp} 条任务完成发经验、${gated} 条任务带等级门；` +
        `升级曲线是下一级要 ${growth.xpBase} + (等级-1)×${growth.xpStep} 点，每级生命上限 +${growth.levelBonus.maxHealth}、` +
        `伤害 +${growth.levelBonus.damage}——这几个数写在 plan.json 的 growth 里，源头是 rpg.ts 的导出。`,
    );
  }

  if (!plan.playable) {
    notes.push(
      `这一份跑不起来（${plan.blockers.join("；")}）：文件还是全部生成，打开就是失败态——不为了看起来能玩而补一个玩家。`,
    );
  }
  return notes;
}

function readmeSource(
  document: GameDocument,
  plan: ArtifactPlan,
  notes: readonly string[],
  chain: ArtifactChain,
  kindNote: string | null,
): string {
  const growth = plan.chain === "rpg" ? plan.growth : undefined;
  const lines = [
    banner("#"),
    "",
    `这是什么：「${document.name || "未命名游戏"}」的一份可玩产物。`,
    ...(plan.chain === "story"
      ? [
          `设计文档里有 ${document.entities.length} 个实体；这一份读的是 dialogue 实体` +
            `（正文=设计说明，选择=指向其它对话的引用），别的实体一个都不读。`,
        ]
      : [
          `设计文档里有 ${document.entities.length} 个实体；投影排出来的场上有 ` +
            `${[plan.player, ...plan.enemies, ...plan.items, ...plan.npcs].filter(Boolean).length} 个可显示个体、` +
            `${plan.triggers.length} 个机关、${plan.quests.length} 条任务。`,
        ]),
    "",
    "怎么打开：在浏览器里打开 index.html（下载解压后双击即可，文件之间用相对路径引用，不联网）。",
    "不要在主机上执行它：这是从别人的设计里生成的一份东西（§81）。浏览器沙箱是唯一允许的执行路径，",
    "index.html 里的 CSP 也把 connect-src 设成 none，产物自己打不出去。",
    "",
    "按什么生成的（每一条都不是我编的）：",
    // 链名那一句**用同一个函数**（`artifactChainSentence`）：产物页面（index.html 的 #chain-note）、
    // README、界面上那一格三处念的是同一句话，各拼一遍迟早有一处先过时。
    `- ${artifactChainSentence(chain)}`,
    `- 数据：plan.json 与 plan.js 是同一次 ${
      plan.chain === "rpg" ? "compileRpg()" : plan.chain === "story" ? "compileStory()" : "compileGame()"
    } 序列化的结果，` +
      // 那句"画布读的就是这一份"讲的是**平台上这一型的界面**：链对不上时它就不成立，不许顺手宣称
      (kindNote === null ? ARTIFACT_CHAINS[chain].dataNote : "而这一型在平台上跑的不是这一条链，所以这句只到产物自己为止") +
      `。`,
    ...(plan.chain === "story"
      ? [
          "- 规则：engine.js 里是 packages/game-model/src/story.ts 的转写（正文、选择与分支；" +
            "起点、正文、悬空引用这些判定都在生成时算进 plan.json 的 story 段，产物里只负责播放）。",
        ]
      : [
          "- 规则：engine.js 是 packages/game-model/src/sim.ts 的转写，冷却与定步长这些数字由生成时从 sim.ts 的导出插进来。",
        ]),
    ...(growth
      ? [
          "- 成长：NexusRpg 那一段是 packages/game-model/src/rpg.ts 的转写（打倒与交任务发经验、攒够升级、没到级的任务扣住）；" +
            `升级曲线与每级加成的数写在 plan.json 的 growth 里（${growth.xpBase} + (等级-1)×${growth.xpStep}，` +
            `每级生命上限 +${growth.levelBonus.maxHealth}、伤害 +${growth.levelBonus.damage}），源头是 rpg.ts 的导出。`,
        ]
      : []),
    `- 规则限度：${SIM_RULE_NOTES.join(" ")}`,
    ...(kindNote ? [`- 这一型在平台上跑的不是这一条链：${kindNote}`] : []),
    "",
    "这一格的限度：",
    ...CODEGEN_LIMITS.map((line) => `- ${line}`),
    "",
    "针对这一份设计的发现：",
    ...(notes.length ? notes.map((line) => `- ${line}`) : ["- 无：这份设计的每个实体都进了投影。"]),
    ...(plan.notes.length ? plan.notes.map((line) => `- 投影说：${line}`) : []),
    ...(plan.blockers.length ? plan.blockers.map((line) => `- 跑不起来：${line}`) : []),
    "",
    "改设计请改文档再重新生成；手改产物里的字节会在下一次生成时被覆盖（§16）。",
    "",
  ];
  return lines.join("\n");
}

/**
 * 把一份游戏设计投影成一份可下载的自包含产物。
 *
 * 纯函数：不读时钟、不碰文件系统、不联网、不执行任何东西（§81）。
 * 同一份文档跑两遍得到逐字节相同的结果——这条有测试钉着，因为"能下载"如果附带一次随机数，
 * 作者拿到的那份就和界面上看到的那份对不上了。
 */
export function generateGameCode(document: GameDocument): GameCodeOutput {
  const chain = artifactChainOf(document);
  const plan = artifactPayload(document);
  const { kindPipeline, kindNote } = codeKindReadings(document);
  const json = planJson(plan);
  const notes = documentNotes(document, plan, chain);

  const bodies: Record<string, string> = {
    "README.txt": readmeSource(document, plan, notes, chain, kindNote),
    "index.html": htmlSource(document, plan, chain, kindNote),
    "style.css": cssSource(),
    "plan.json": json,
    "plan.js": `// ${GENERATED_BANNER}\n// 这一份与 plan.json 是同一次序列化的结果，不是各写一遍的两份计划。\nwindow.NEXUS_PLAN = ${json};\n`,
    "engine.js": engineSource(chain),
    "main.js": mainSource(),
  };

  const files: GeneratedGameFile[] = FILE_ORDER.map((path) => ({
    path,
    contents: bodies[path] as string,
    mime: mimeFor(path),
    origin:
      path === "plan.json" || path === "plan.js"
        ? {
            kind: "plan",
            from: chain === "rpg" ? "compileRpg" : chain === "story" ? "compileStory" : "compileGame",
          }
        : path === "engine.js" || path === "main.js"
          ? {
              kind: "engine",
              from: chain === "rpg" ? "sim.step+rpg.step" : chain === "story" ? "story.step" : "sim.step",
            }
          : { kind: path === "README.txt" ? "readme" : "shell", from: "codegen" },
  }));

  const bytes = files.reduce((sum, file) => sum + new TextEncoder().encode(file.contents).length, 0);
  return { files, notes, bytes, kindPipeline, artifactChain: chain, kindNote };
}
