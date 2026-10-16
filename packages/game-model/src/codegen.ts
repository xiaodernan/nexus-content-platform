import {
  GAME_ENTITY_LABELS,
  GAME_KIND_LABELS,
  GAME_KIND_STATUS,
  type GameDocument,
  type GameEntityKind,
} from "./index";
import { PLAY_KIND_SHAPES, compileGame, type GamePlan, type PlayActor } from "./play";
import { compileForKind, type GameProjection } from "./story";
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
 * 1. **只有一条投影链**。产物吃的是 `compileGame(document)` 排出来的那份 `GamePlan`。
 *    这条链与 §51 的类型表有一个已知的错位：`GAME_KIND_STATUS` 里只有
 *    `2d / 2.5d / 3d / 探索 / 解谜` 五种读的是这份计划，RPG 原型与对话两型各有另一条管线
 *    （`compileRpg` / `compileStory`），而产物里没有它们的引擎。所以这一格不许说"产物就是页面上跑的那一份"，
 *    只许由 `codeKindReadings()` 把错位说出来（README、index.html、界面三处念同一句）；
 *    把那句话写回"同一个对象"就是 §159 级的谎，2026-10-17 那次实测（`.scratch/kind-probe*.ts`）量到的就是它：
 *    RPG 草稿投影出来的产物没有成长循环，视觉小说投影出来是一个开不了场的空场子。
 *    所以 `plan.json` 与 `plan.js` 里必须是**同一次 `JSON.stringify` 的结果**——两处各写一遍就是两份真值。
 * 2. **规则的数字不许重打**。引擎是 `sim.ts` 的转写，冷却、定步长上限、事件条数上限、
 *    没有玩家那句拒绝，全部由生成时从 `sim.ts` 的导出插进产物。转写这件事本身是这一格的限度：
 *    `sim.ts` 改了逻辑而产物没重新生成，两者就会分叉，所以界面上不许说"产物就是平台跑的那一套"，
 *    只能说"产物是它的转写，数字由同一处供给"。浏览器里的一致性见证记在 `docs/TESTING.md`。
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
  "产物里的引擎是 sim.ts 的转写：数字由生成时从 sim.ts 的导出插进来，逻辑不在这里重打一遍。",
  "产物没有 Studio 的界面：没有数值来历面板、没有等轴测与 3D 画法、没有 Playtest 报告。",
  "产物不联网：CSP 里 connect-src 是 none，键盘只有方向键与 WASD，没有手柄。",
  "这一格不执行任何东西：生成只是拼字符串（§81），要跑就在浏览器沙箱里打开。",
];

export type GameCodeOrigin =
  | { kind: "plan"; from: "compileGame" }
  | { kind: "engine"; from: "sim.step" }
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
   * 产物永远是 `"topdown"` 那一条，所以这个字段与它不同时，界面上必须把话说明。
   */
  kindPipeline: "topdown" | "story" | "rpg" | null;
  /** 两条管线不一致时那句话说清"下载的不是页面上试玩的那一种"；一致时为 null（没有就不许印一句空话） */
  kindNote: string | null;
}

const GENERATED_BANNER =
  "由 NEXUS 从游戏设计模型生成（§16：设计文档是唯一真值，这份产物只是它的一个投影；改设计要重新生成，不要手改这里）";

/**
 * 「下载拿走的那一份」与「平台上试玩的那一份」是不是同一条管线——这句话只能由 `compileForKind`
 * 那一处分派点回答，不能在这一格里再写一遍 `if (kind === ...)`（§16：同一份模型的投影不许各说各话）。
 *
 * 为什么产物侧只有一条链：`main.js` 是 `sim.step` 的转写，它只会跑 `GamePlan`；
 * 对话管线与 RPG 的成长循环在产物里**没有对应的引擎**。这一格今天能给的是那份 2D 俯视投影，
 * 所以非 `topdown` 的类型必须被说出来，而不是靠 README 里那句"界面上的画布读的就是这一份"蒙过去——
 * 那句话说的是 `2d / 2.5d / 3d / 探索 / 解谜` 这五种共用同一条计划的事实，
 * 对 RPG 原型（少了成长循环）与对话两型（打开就是一个跑不起来的场子）是假的。
 */
export function codeKindReadings(document: GameDocument): { kindPipeline: GameProjection["pipeline"]; kindNote: string | null } {
  const kindPipeline = compileForKind(document).pipeline;
  if (kindPipeline === "topdown") return { kindPipeline, kindNote: null };
  const status = GAME_KIND_STATUS[document.kind];
  return {
    kindPipeline,
    kindNote:
      `这一格只有一条投影链：产物跑的永远是 compileGame() 排出来的 2D 俯视计划（${GAME_KIND_LABELS[document.kind]} 在平台上不是这一条）。` +
      `状态表对「${GAME_KIND_LABELS[document.kind]}」的那句是「${status.note}」——那句里的东西不在这份产物里：` +
      `RPG 的成长循环与对话管线都没有对应的引擎，所以下载解压后打开的，不是这个类型在试玩页跑的那一种。`,
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
function planJson(plan: GamePlan): string {
  return JSON.stringify(plan, null, 2);
}

function engineSource(): string {
  const rules = [
    `  contactCooldown: ${CONTACT_COOLDOWN},`,
    `  playerAttackCooldown: ${PLAYER_ATTACK_COOLDOWN},`,
    `  maxFrameSeconds: ${MAX_FRAME_SECONDS},`,
    `  eventCap: ${EVENT_CAP},`,
  ].join("\n");
  return js([
    banner("//"),
    "// 规则的数字来自 sim.ts 的导出（下面 RULES / TEXT 两块），不是在这里重打一遍的。",
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
    "  summary: function (state) {",
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
  ]);
}

/**
 * 形状表与场地尺寸都是从模型 / 计划插值的，颜色才是产物自己的默认。
 *
 * `plan.js` 只给 canvas 的宽高从计划里读，不在 HTML 里另写一遍数字：
 * 场地改一次尺寸，界面上的画布就该跟着变，写两处就有一处会说谎。
 */
function mainSource(): string {
  return js([
    banner("//"),
    '"use strict";',
    "(function () {",
    "  var plan = window.NEXUS_PLAN;",
    "  var shapes = " + JSON.stringify(PLAY_KIND_SHAPES) + ";",
    "  var colors = " + JSON.stringify(CODEGEN_COLORS) + ";",
    "  var SIM_RULE_NOTES = " + JSON.stringify(SIM_RULE_NOTES) + ";",
    "  var canvas = document.getElementById(\"arena\");",
    "  var ctx = canvas.getContext(\"2d\");",
    "  var hud = document.getElementById(\"hud\");",
    "  canvas.width = plan.arena.width;",
    "  canvas.height = plan.arena.height;",
    "  var state = NexusSim.initialState(plan);",
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
    "    ctx.clearRect(0, 0, canvas.width, canvas.height);",
    "    ctx.fillStyle = \"#0b0d12\";",
    "    ctx.fillRect(0, 0, canvas.width, canvas.height);",
    "    var i;",
    "    for (i = 0; i < state.triggers.length; i += 1) {",
    "      var trigger = state.triggers[i];",
    "      var design = plan.triggers.filter(function (t) { return t.id === trigger.id; })[0];",
    "      ctx.strokeStyle = trigger.active ? colors.trigger : \"rgba(148,163,184,0.35)\";",
    "      ctx.lineWidth = 1;",
    "      ctx.beginPath();",
    "      ctx.arc(trigger.x, trigger.y, design ? design.radius : 0, 0, Math.PI * 2);",
    "      ctx.stroke();",
    "    }",
    "    for (i = 0; i < state.items.length; i += 1) {",
    "      if (state.items[i].active) actor(plan.items.filter(function (x) { return x.id === state.items[i].id; })[0]);",
    "    }",
    "    for (i = 0; i < state.enemies.length; i += 1) {",
    "      if (state.enemies[i].active) actor(plan.enemies.filter(function (x) { return x.id === state.enemies[i].id; })[0]);",
    "    }",
    "    actor(plan.player);",
    "    if (plan.player) shape(\"player\", state.px, state.py, plan.player.radius, colors.player);",
    "    hud.textContent = lines().join(\"\\n\");",
    "  }",
    "  function lines() {",
    "    var out = [NexusSim.summary(state)];",
    "    if (state.outcome) out.push(state.outcome);",
    "    for (var i = 0; i < plan.notes.length; i += 1) out.push(\"限度：\" + plan.notes[i]);",
    "    for (var j = 0; j < SIM_RULE_NOTES.length; j += 1) out.push(\"规则：\" + SIM_RULE_NOTES[j]);",
    "    out.push(\"操作：方向键或 WASD 移动，空格挥击，R 重开。\");",
    "    return out;",
    "  }",
    "  function frame(now) {",
    "    var dt = last ? (now - last) / 1000 : 0;",
    "    last = now;",
    "    state = NexusSim.step(plan, state, readInput(), dt);",
    "    draw();",
    "    if (state.status === \"playing\") requestAnimationFrame(frame);",
    "    else requestAnimationFrame(function () { draw(); });",
    "  }",
    "  window.addEventListener(\"keydown\", function (e) {",
    "    var k = e.key.toLowerCase();",
    "    keys[k] = true;",
    "    if (k === \"r\") { state = NexusSim.initialState(plan); last = 0; }",
    "    if (k === \" \" || k.indexOf(\"arrow\") === 0) e.preventDefault();",
    "  });",
    "  window.addEventListener(\"keyup\", function (e) { keys[e.key.toLowerCase()] = false; });",
    "  draw();",
    "  if (state.status === \"playing\") requestAnimationFrame(frame);",
    "})();",
  ]);
}

function htmlSource(document: GameDocument, plan: GamePlan, kindNote: string | null): string {
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
    // 打开的就是这一页，不是 README：类型不对上的那句话要印在页面上，不然作者看到的就是"我的 RPG 没有成长"
    ...(kindNote ? [`<p id="kind-note">${escapeHtml(kindNote)}</p>`] : []),
    `<canvas id="arena" width="${plan.arena.width}" height="${plan.arena.height}"></canvas>`,
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
    "",
  ].join("\n");
}

/** 针对这一份文档的发现：投影已经说了的（plan.notes / blockers）不重写一遍，只补产物这一侧才看得见的 */
function documentNotes(document: GameDocument, plan: GamePlan): string[] {
  const notes: string[] = [];
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

  if (!plan.playable) {
    notes.push(
      `这一份跑不起来（${plan.blockers.join("；")}）：文件还是全部生成，打开就是失败态——不为了看起来能玩而补一个玩家。`,
    );
  }
  return notes;
}

function readmeSource(document: GameDocument, plan: GamePlan, notes: readonly string[], kindNote: string | null): string {
  const lines = [
    banner("#"),
    "",
    `这是什么：「${document.name || "未命名游戏"}」的一份可玩产物。`,
    `设计文档里有 ${document.entities.length} 个实体；投影排出来的场上有 ` +
      `${[plan.player, ...plan.enemies, ...plan.items, ...plan.npcs].filter(Boolean).length} 个可显示个体、` +
      `${plan.triggers.length} 个机关、${plan.quests.length} 条任务。`,
    "",
    "怎么打开：在浏览器里打开 index.html（下载解压后双击即可，文件之间用相对路径引用，不联网）。",
    "不要在主机上执行它：这是从别人的设计里生成的一份东西（§81）。浏览器沙箱是唯一允许的执行路径，",
    "index.html 里的 CSP 也把 connect-src 设成 none，产物自己打不出去。",
    "",
    "按什么生成的（每一条都不是我编的）：",
    ...(kindNote
      ? [`- 数据：plan.json 与 plan.js 是同一次 compileGame() 序列化的结果。${kindNote}`]
      : ["- 数据：plan.json 与 plan.js 是同一次 compileGame() 序列化的结果，界面上的画布读的就是这一份。"]),
    "- 规则：engine.js 是 packages/game-model/src/sim.ts 的转写，冷却与定步长这些数字由生成时从 sim.ts 的导出插进来。",
    `- 规则限度：${SIM_RULE_NOTES.join(" ")}`,
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
  const plan = compileGame(document);
  const { kindPipeline, kindNote } = codeKindReadings(document);
  const json = planJson(plan);
  const notes = documentNotes(document, plan);

  const bodies: Record<string, string> = {
    "README.txt": readmeSource(document, plan, notes, kindNote),
    "index.html": htmlSource(document, plan, kindNote),
    "style.css": cssSource(),
    "plan.json": json,
    "plan.js": `// ${GENERATED_BANNER}\n// 这一份与 plan.json 是同一次序列化的结果，不是各写一遍的两份计划。\nwindow.NEXUS_PLAN = ${json};\n`,
    "engine.js": engineSource(),
    "main.js": mainSource(),
  };

  const files: GeneratedGameFile[] = FILE_ORDER.map((path) => ({
    path,
    contents: bodies[path] as string,
    mime: mimeFor(path),
    origin:
      path === "plan.json" || path === "plan.js"
        ? { kind: "plan", from: "compileGame" }
        : path === "engine.js" || path === "main.js"
          ? { kind: "engine", from: "sim.step" }
          : { kind: path === "README.txt" ? "readme" : "shell", from: "codegen" },
  }));

  const bytes = files.reduce((sum, file) => sum + new TextEncoder().encode(file.contents).length, 0);
  return { files, notes, bytes, kindPipeline, kindNote };
}
