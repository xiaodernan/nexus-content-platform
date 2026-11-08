import {
  isGameEntityKind,
  type GameDocument,
  type GameEntity,
  type GameEntityKind,
} from "./index";

/**
 * §50-§54 的第一块可玩投影：把一份游戏设计文档（11 类实体 + 自由数值 + 引用）
 * 编译成一份"浏览器里真能跑起来"的关卡计划。
 *
 * 和渲染层分开是 §16 的纪律：这份投影是纯函数、无 React、无 DOM，
 * 所以"这个数从哪来""没有的东西怎么兜底""赢的条件判不判得出来"这些会说谎的地方
 * 能被单测钉住，而不是埋在组件里靠肉眼看。
 *
 * 四条刻意的克制（都在 `notes` 里对使用者讲明白，不只写在注释里）：
 * - **位置优先认文档里写的 `x` / `y`**（作者摆的，或 §52 链的 Level Design 那一格摆的）；
 *   两个键没同时写才退回"按类别排在同心环上"。§54 的模型刻意没有专门的坐标字段，
 *   位置因此走开放数值键（`stats`），投影只认这一对键名。越出场地的坐标钳进场地并在 notes 里说。
 *   界面必须按 `provenance.position` 标出哪个位置是谁给的（与 §140 的 authored/fallback 同一口径）。
 * - **大小一律相同**：模型里没有"重要性"或尺寸字段，按名字长短给大小就是编出来的等级。
 * - **数值只有作者写了才算作者设计的**：每个用到的旋钮都带 `provenance`（`design` / `default`），
 *   兜底值在 HUD 上明说。给一个看不见的默认伤害，等于让"玩家攻击 1"这种数字被当真（§159）。
 * - **判不出来的完成条件不假装能完成**：任务没引用任何敌人/物品，就是没有可判定的条件，
 *   列出来并说明原因，而不是悄悄把它算作"自动完成"或者干脆不显示。
 */

/** 场地尺寸：像素。投影里没有"世界大小"这个概念，所以固定一块能走的场子 */
export const ARENA = { width: 1200, height: 760 } as const;

/** 所有可动个体的半径：见上「大小一律相同」 */
export const ACTOR_RADIUS = 16;

/**
 * §52 链第三格（Level Design）写的就是这一对键。§54 的模型刻意不写死属性表
 * （`stats` 是开放的数值键，见 index.ts 文件头），所以位置**没有专门的字段**，投影只认这两个键名。
 * 两个都写成有限数才算摆过：只有 x 没有 y 是半套坐标，那种按"没摆过"处理、整体退回同心环——
 * 认半个作者值就会得到"这个位置是作者摆的"这句谎。
 */
export const POSITION_STAT_KEYS = { x: "x", y: "y" } as const;

/**
 * provenance 的槽位清单：界面按这张表显示"这个数是谁给的"，加一个槽就必须同时加进这里
 * （漏一个槽 = 那个兜底值不被披露，§159）。
 */
export const PLAY_PROVENANCE_SLOTS = ["health", "damage", "speed", "senseRadius", "position"] as const;
export type PlayProvenanceSlot = (typeof PLAY_PROVENANCE_SLOTS)[number];

/**
 * 每个槽位的中文名：界面照这张表写"哪个旋钮是投影兜底的"。
 * 类型是 `Record<PlayProvenanceSlot, string>`，漏一个槽就编译不过——
 * 加一个兜底旋钮而不披露它，等于让那个数被当成作者设计的数（§159）。
 */
export const PLAY_PROVENANCE_LABELS: Record<PlayProvenanceSlot, string> = {
  health: "生命",
  damage: "伤害",
  speed: "速度",
  senseRadius: "察觉/交互半径",
  position: "位置",
};

/** 摆回场地内：贴边的个体会有一半画在屏幕外，所以按半径钳，不是按 0 钳 */
export function clampToArena(value: number, span: number, radius: number): number {
  return Math.min(Math.max(value, radius), span - radius);
}

/** 兜底旋钮。每一个都必须在界面上被标成"投影兜底"而不是作者的数 */
export const PLAY_DEFAULTS = {
  health: 3,
  damage: 1,
  /** 像素/秒 */
  speed: 170,
  /** 敌人察觉 / NPC 交互的半径（像素） */
  senseRadius: 130,
  /** 触发器没写 radius 时的判定半径 */
  triggerRadius: 60,
} as const;

/**
 * 每个槽位的兜底读数，界面照这张表说"这个数没写时投影给了什么"。
 * `position` 的兜底不是一个数而是"按类别排在同心环上"，所以这里给的是字符串而不是数字。
 */
export const PLAY_PROVENANCE_FALLBACK_TEXT: Record<PlayProvenanceSlot, string> = {
  health: String(PLAY_DEFAULTS.health),
  damage: String(PLAY_DEFAULTS.damage),
  speed: `${PLAY_DEFAULTS.speed} 像素/秒`,
  senseRadius: `${PLAY_DEFAULTS.senseRadius} 像素`,
  position: '按类别排在同心环上',
};

export type StatSource = "design" | "default";

export interface PlayActor {
  id: string;
  name: string;
  kind: GameEntityKind;
  x: number;
  y: number;
  radius: number;
  health: number;
  damage: number;
  speed: number;
  senseRadius: number;
  /** 只有敌人会追击；NPC 与物品不主动移动 */
  hostile: boolean;
  /**
   * 攻击时**额外**的触及距离（像素）：0 就是必须贴身。
   * 只有玩家可能非 0——来自引用到玩家身上的武器的 `range`；模型里没有别的射程概念。
   */
  reach: number;
  reachIsDesign: boolean;
  /**
   * 这个实体一个数值都没填、说明也是空的：`createGame` 会预置 11 类模板实体，
   * 所以"场上有个敌人"不等于"作者设计过这个敌人"。界面按这个标记写"未设计的模板"。
   */
  template: boolean;
  provenance: Record<PlayProvenanceSlot, StatSource>;
  /** 作者写下的全部数值，原样带上：HUD 要能说出"这个数来自哪一行设计" */
  stats: Record<string, number>;
}

export interface PlayTrigger {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  radiusIsDesign: boolean;
  /** 位置来自文档写的 `x` / `y`（作者或 §52 链 Level Design 那一格摆的）还是锚点/同心环兜底 */
  positionIsDesign: boolean;
  /** 秒：进入前要多久才生效 / 触发后多久能再次生效。没有就是 0 */
  delay: number;
  cooldown: number;
  /** 引用指向的那个东西（有就显示"触发后影响 X"） */
  affects: { id: string; name: string } | null;
}

export interface PlayQuestGoal {
  /** activate = 引用到了触发器：踩进它的范围就算达成（§54 里触发器唯一可判定的语义） */
  kind: "defeat" | "collect" | "activate";
  actorId: string;
  label: string;
}

export interface PlayQuest {
  id: string;
  name: string;
  goals: PlayQuestGoal[];
  /** 一条可判定的引用都没有就是 false —— 这种任务不会推动"赢" */
  judgeable: boolean;
  why: string;
  /** 秒。模型没有单位约定，这里按秒解释，并在 notes 里写明这个解释 */
  timeLimit: number | null;
}

export interface GamePlan {
  name: string;
  summary: string;
  arena: { width: number; height: number };
  player: PlayActor | null;
  enemies: PlayActor[];
  items: PlayActor[];
  npcs: PlayActor[];
  triggers: PlayTrigger[];
  quests: PlayQuest[];
  /** 能开跑吗：没有玩家就动不了，这是唯一的硬条件 */
  playable: boolean;
  blockers: string[];
  notes: string[];
}

function stat(entity: GameEntity, key: string): number | null {
  const value = entity.stats?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** 取一个数值旋钮：作者写了就用作者的并标 design，没写就用兜底并标 default */
function pick(entity: GameEntity, key: string, fallback: number): { value: number; from: StatSource } {
  const found = stat(entity, key);
  return found === null ? { value: fallback, from: "default" } : { value: found, from: "design" };
}

/**
 * 玩家的进攻手段：伤害先看玩家自己的 attackPower，再看引用到玩家身上的武器 damage
 * （`role` 是自由文本，不强行枚举）；射程只看那把武器的 `range`。
 * 两处都没有就是真的没有：伤害留 0 并说明，而不是给 1 让人以为"能打，只是弱"。
 */
function playerOffense(
  document: GameDocument,
  player: GameEntity,
): { damage: number; from: StatSource; reach: number; reachIsDesign: boolean; note: string | null } {
  const weapon = document.entities.find((entity) => entity.kind === "weapon" && entity.refs.some((ref) => ref.to === player.id));
  const own = stat(player, "attackPower");
  const damage = own ?? (weapon ? stat(weapon, "damage") : null);
  const reach = weapon ? stat(weapon, "range") : null;
  if (damage === null) {
    return {
      damage: 0,
      from: "default",
      reach: reach ?? 0,
      reachIsDesign: reach !== null,
      note:
        "玩家没有任何伤害来源：文档里既没有 player.attackPower，也没有引用到玩家身上的武器 damage。" +
        "这一版只能躲、不能打——投影不替设计编一个攻击力。",
    };
  }
  return { damage, from: "design", reach: reach ?? 0, reachIsDesign: reach !== null, note: null };
}

/** 同心环布局：按文档顺序排，纯函数，所以同一份文档每次跑出来的位置都一样 */
function ringPosition(index: number, count: number, radius: number): { x: number; y: number } {
  const cx = ARENA.width / 2;
  const cy = ARENA.height / 2;
  // 从正右方起、顺时针均分；只有一个时也落在同一个位置（不是随机角度的副产品）
  const angle = (index / Math.max(count, 1)) * Math.PI * 2;
  const x = cx + Math.cos(angle) * radius;
  const y = cy + Math.sin(angle) * radius * 0.62; // 压扁一点：场地是横的，圆环会变成椭圆才不贴边
  return { x: Math.min(Math.max(x, ACTOR_RADIUS), ARENA.width - ACTOR_RADIUS), y: Math.min(Math.max(y, ACTOR_RADIUS), ARENA.height - ACTOR_RADIUS) };
}

/**
 * 这一对键在文档里算不算「作者摆过一个位置」：**两个都写成有限数**才算。
 * 只有 x 没有 y 是半套坐标——按「没摆过」处理：认半个作者值就会得到
 * 「这个位置是作者摆的」那句谎。
 *
 * 单独导出是给 §52 链第三格（`level.ts`）用的：那一格判断「这个个体摆过没有」必须和投影同一个判据，
 * 各写一遍就会出现「投影说没摆过、布局格说摆过」两种读数。
 */
export function hasAuthoredPosition(entity: GameEntity | undefined): boolean {
  if (!entity) return false;
  return [POSITION_STAT_KEYS.x, POSITION_STAT_KEYS.y].every((key) => {
    const value = entity.stats?.[key];
    return typeof value === "number" && Number.isFinite(value);
  });
}

/** 作者摆过的位置（钳进场内后的结果）；没摆过就是 null，调用方退回同心环 */
export function authoredPosition(entity: GameEntity): { x: number; y: number; clamped: boolean } | null {
  const rawX = stat(entity, POSITION_STAT_KEYS.x);
  const rawY = stat(entity, POSITION_STAT_KEYS.y);
  if (rawX === null || rawY === null) return null;
  const x = clampToArena(rawX, ARENA.width, ACTOR_RADIUS);
  const y = clampToArena(rawY, ARENA.height, ACTOR_RADIUS);
  return { x, y, clamped: x !== rawX || y !== rawY };
}

function toActor(entity: GameEntity, hostile: boolean, index: number, count: number, damageOverride?: { value: number; from: StatSource }): PlayActor {
  const ring = hostile ? 300 : entity.kind === "item" ? 180 : 360;
  const authored = authoredPosition(entity);
  const at = authored ?? ringPosition(index, count, ring);
  const health = pick(entity, "health", PLAY_DEFAULTS.health);
  const damage = damageOverride ?? pick(entity, "damage", PLAY_DEFAULTS.damage);
  const speed = pick(entity, "speed", PLAY_DEFAULTS.speed);
  const sense = pick(entity, hostile ? "detectionRange" : "interactRange", PLAY_DEFAULTS.senseRadius);
  return {
    id: entity.id,
    name: entity.name,
    kind: entity.kind,
    x: at.x,
    y: at.y,
    radius: ACTOR_RADIUS,
    health: Math.max(0, health.value),
    damage: Math.max(0, damage.value),
    speed: Math.max(0, speed.value),
    senseRadius: Math.max(0, sense.value),
    hostile,
    reach: 0,
    reachIsDesign: false,
    template: Object.keys(entity.stats).length === 0 && !entity.notes.trim(),
    provenance: {
      health: health.from,
      damage: damage.from,
      speed: speed.from,
      senseRadius: sense.from,
      position: authored ? "design" : "default",
    },
    stats: { ...entity.stats },
  };
}

function ofKind(document: GameDocument, kind: GameEntityKind): GameEntity[] {
  return document.entities.filter((entity) => isGameEntityKind(entity.kind) && entity.kind === kind);
}

/**
 * 编译一份游戏文档成关卡计划。纯函数：同一份文档两次调用结果逐字段相同（有测试钉这条），
 * 因为"刷新一下位置就变了"会让上面所有断言失去意义。
 */
export function compileGame(document: GameDocument): GamePlan {
  const playerEnts = ofKind(document, "player");
  const player = playerEnts[0] ?? null;
  const enemyEnts = ofKind(document, "enemy");
  const itemEnts = ofKind(document, "item");
  const npcEnts = ofKind(document, "npc");
  const triggerEnts = ofKind(document, "trigger");

  // 位置的来路要按文档里真的有谁来写：一句无条件的"位置是投影排的"在摆过坐标的文档里就是谎
  const placeables = [player, ...enemyEnts, ...itemEnts, ...npcEnts, ...triggerEnts].filter((entity): entity is GameEntity => Boolean(entity));
  const authoredPlacements = placeables.map((entity) => authoredPosition(entity));
  const authoredCount = authoredPlacements.filter((at) => at !== null).length;
  const clampedCount = authoredPlacements.filter((at) => at?.clamped).length;
  const fallbackCount = placeables.length - authoredCount;
  const placementNote = authoredCount
    ? `场上 ${placeables.length} 个位置里有 ${authoredCount} 个来自文档里写的 ${POSITION_STAT_KEYS.x} / ${POSITION_STAT_KEYS.y}（作者摆的，或 §52 链 Level Design 那一格摆的）` +
      (fallbackCount ? `，其余 ${fallbackCount} 个没写坐标、仍由投影按类别排在同心环上` : "，这一版没有一个位置是投影排的") +
      "。"
    : "位置是投影按类别排在同心环上的，不是作者摆过的关卡布局——§54 的模型里没有坐标与地形。";

  const notes: string[] = [
    placementNote,
    "所有个体一样大：模型里没有尺寸或重要性字段。",
    "形状（方块/圆/三角）只用来区分类别，不代表美术资产；§34 的 3D 模型与 §43 的动画在这里都没有。",
  ];
  if (clampedCount) {
    notes.push(
      `有 ${clampedCount} 个写好的坐标在场外，投影把它们钳回了场地内（离每条边至少留 ${ACTOR_RADIUS} 像素，个体才不会有一半画在屏幕外）：设计里想表达"站在场外"就得换个说法。`,
    );
  }

  // `player &&` 不是第二条行为分支：`length > 1` 时第一个必定在。加它是因为不写就得写成
  // `player?.name ?? ""`，而那一臂永远走不通——覆盖率读数里它会一直占一格（§85 第十八片）。
  if (player && playerEnts.length > 1) {
    notes.push(`文档里有 ${playerEnts.length} 个玩家实体，这一版只用第一个（${player.name}）：多玩家不是模型能表达的，是网络同步的事。`);
  }

  const blockers: string[] = [];
  if (!player) blockers.push("没有玩家实体：没有可操作的对象，这一版开不了场。");

  const enemies = enemyEnts.map((entity, i, all) => toActor(entity, true, i, all.length));
  const items = itemEnts.map((entity, i, all) => toActor(entity, false, i, all.length));
  const npcs = npcEnts.map((entity, i, all) => toActor(entity, false, i, all.length));

  let playerDamageNote: string | null = null;
  let playActor: PlayActor | null = null;
  if (player) {
    const offense = playerOffense(document, player);
    playerDamageNote = offense.note;
    const placed = toActor(player, false, 0, 1);
    // 玩家没摆过位置就站在场地正中：他是参照物，环都绕着他排（toActor 给的环位对玩家没意义）；
    // 摆过就用他摆的那个——Level Design 那一格把玩家挪出中心是关卡布局的一部分。
    playActor = {
      ...placed,
      damage: offense.damage,
      reach: offense.reach,
      reachIsDesign: offense.reachIsDesign,
      x: placed.provenance.position === "design" ? placed.x : ARENA.width / 2,
      y: placed.provenance.position === "design" ? placed.y : ARENA.height / 2,
    };
    playActor.provenance = { ...playActor.provenance, damage: offense.from };
  }
  if (playerDamageNote) notes.push(playerDamageNote);

  const byId = new Map<string, GameEntity>(document.entities.map((entity) => [entity.id, entity]));
  const placedById = new Map<string, { x: number; y: number }>();
  for (const actor of [playActor, ...enemies, ...items, ...npcs]) {
    if (actor) placedById.set(actor.id, { x: actor.x, y: actor.y });
  }

  const triggers = triggerEnts.map((entity, index, all) => {
    const radius = pick(entity, "radius", PLAY_DEFAULTS.triggerRadius);
    const refTarget = entity.refs.map((ref) => byId.get(ref.to)).find((target): target is GameEntity => Boolean(target));
    const anchor = refTarget ? placedById.get(refTarget.id) : null;
    // 作者摆过就听作者的，没摆才锚到引用对象、再没才排环
    const authored = authoredPosition(entity);
    const at = authored ?? anchor ?? ringPosition(index, all.length, 240);
    return {
      id: entity.id,
      name: entity.name,
      x: clampToArena(at.x, ARENA.width, ACTOR_RADIUS),
      y: clampToArena(at.y, ARENA.height, ACTOR_RADIUS),
      radius: Math.max(0, radius.value),
      radiusIsDesign: radius.from === "design",
      positionIsDesign: authored !== null,
      delay: Math.max(0, stat(entity, "delay") ?? 0),
      cooldown: Math.max(0, stat(entity, "cooldown") ?? 0),
      affects: refTarget ? { id: refTarget.id, name: refTarget.name } : null,
    };
  });

  const quests = ofKind(document, "quest").map((entity) => {
    const goals: PlayQuestGoal[] = [];
    for (const ref of entity.refs) {
      const target = byId.get(ref.to);
      if (!target) continue;
      if (target.kind === "enemy") goals.push({ kind: "defeat", actorId: target.id, label: `打倒 ${target.name}` });
      else if (target.kind === "item") goals.push({ kind: "collect", actorId: target.id, label: `拾取 ${target.name}` });
      else if (target.kind === "trigger") goals.push({ kind: "activate", actorId: target.id, label: `激活 ${target.name}` });
    }
    const timeLimit = stat(entity, "timeLimit");
    return {
      id: entity.id,
      name: entity.name,
      goals,
      judgeable: goals.length > 0,
      why: goals.length
        ? `引用了 ${goals.length} 个可判定的对象`
        : entity.refs.length
          ? "引用的不是敌人、物品或触发器（可能是对话、NPC 或已删除的实体）——投影判不出这条任务什么时候算完成。"
          : "这条任务没有引用任何对象，没有可判定的完成条件。",
      timeLimit: timeLimit === null ? null : Math.max(0, timeLimit),
    };
  });

  const judgeable = quests.filter((quest) => quest.judgeable);
  if (quests.length && !judgeable.length) {
    notes.push("没有任何可判定的完成条件，所以这一版没有\"赢\"——只有活着或倒下。");
  }
  if (!enemies.length && !items.length && !judgeable.length && !triggers.length) {
    notes.push("场上没有可交互的东西（没有敌人、物品、可判定的任务或触发器）：能走动，但没有任何事情会发生。");
  }
  if (quests.some((quest) => quest.timeLimit !== null)) {
    notes.push("有任务带 timeLimit：模型没有单位约定，投影按**秒**解释它。设计里想表达别的单位就在 notes 里写清。");
  }

  // createGame 会预置 11 类模板实体，所以"场上有东西"很可能只是"模板名字还在"
  const templateCount = [playActor, ...enemies, ...items, ...npcs].filter((actor) => actor?.template).length;
  if (templateCount) {
    notes.push(
      `场上有 ${templateCount} 个实体一个数值都没填（只是 §54 预置的模板名字）：它们跑起来用的是投影的兜底值，不是作者设计的数值。`,
    );
  }

  return {
    name: document.name,
    summary: document.summary,
    arena: { ...ARENA },
    player: playActor,
    enemies,
    items,
    npcs,
    triggers,
    quests,
    playable: Boolean(player),
    blockers,
    notes,
  };
}

/**
 * §51 的 2.5D：**同一份关卡计划换一种画法**，不是第二套游戏。
 *
 * 为什么投影放在这里而不是组件里：位置本来就是这一层排出来的（同心环），
 * 等轴测只是同一组 (x, y) 到屏幕的另一种映射——放进渲染层就会变成"浏览器里算一遍、
 * 单测算另一遍"，而这两处一旦不一致，就没人能说清玩家看到的坐标是不是设计里的那个。
 *
 * 2:1 等轴测（`sy = sx / 2`）：屏幕 x = (x - y)·sx + ox，屏幕 y = (x + y)·sy + oy。
 * 只做坐标的换算与远近排序，**不引入纵深、不引入碰撞体、不引入 3D 模型**——
 * 模型里没有这些东西，画出来的地面网格也不参与判定（判定仍然走 `step` 的平面坐标）。
 */
export const ISO_MARGIN = 24;

export interface IsoView {
  readonly sx: number;
  readonly sy: number;
  readonly ox: number;
  readonly oy: number;
  readonly arena: { width: number; height: number };
}

/** 按场地算一份等轴测变换：整体缩到边距里，2:1 比例固定 */
export function isoView(arena: { width: number; height: number } = ARENA): IsoView {
  const span = arena.width + arena.height;
  const availW = arena.width - ISO_MARGIN * 2;
  const availH = arena.height - ISO_MARGIN * 2;
  const sx = Math.min(availW / span, (availH * 2) / span);
  return { sx, sy: sx / 2, ox: ISO_MARGIN + arena.height * sx, oy: ISO_MARGIN, arena };
}

/** 世界坐标 → 屏幕坐标。单射：不同的世界点不会落到同一个屏幕点上（有测试钉这条） */
export function isoProject(view: IsoView, x: number, y: number): { x: number; y: number } {
  return { x: (x - y) * view.sx + view.ox, y: (x + y) * view.sy + view.oy };
}

/** 远近：等轴测里 `x + y` 小的离镜头远，先画；这条只影响绘制顺序，不影响规则 */
export function isoDepth(x: number, y: number): number {
  return x + y;
}

/** 一个世界圆投影成的地面椭圆半径（画标记用，不参与判定） */
export function isoGroundRadius(view: IsoView, radius: number): { rx: number; ry: number } {
  return { rx: Math.SQRT2 * view.sx * radius, ry: Math.SQRT2 * view.sy * radius };
}

/** 等轴测这条画法的限度，界面和 2D 的那些限度并排显示（只写在注释里等于没人知道） */
export const ISO_VIEW_NOTES = [
  "等轴测（2.5D）只是同一条关卡计划的画法：坐标换了个投影，规则与 2D 走同一个 step，逐字相同。",
  "地面网格是画出来的，不参与碰撞——判定仍然按俯视那套平面坐标算，模型里没有地形与纵深。",
  "标记形状不随远近缩放、没有转身：模型里没有尺寸与朝向，它们仍然是类别标记，不是 3D 模型。",
];

/**
 * 探索画法（§51 的 Exploration）：同一份计划，走近才看得见。
 * 半径是这一格的视图常量——模型里没有"视野"字段，按实体类别给不同半径就是编出来的差异。
 */
export const EXPLORATION_REVEAL_RADIUS = 150;

/** 探索这条画法的限度，与等轴测那三条并排显示 */
export const EXPLORATION_VIEW_NOTES = [
  "探索只是同一份关卡计划的又一种画法：走近才看得见，看见了就一直看得见；规则与 2D 走同一个 step，逐字相同。",
  "「发现」是这一局界面上的状态，不进文档也不进库：刷新就重摸一遍，因为模型里没有探索进度这个字段。",
  "可发现的只有摆上场的东西（敌人 / 物品 / NPC / 触发器）：谁在场上由 §54 文档决定，探索不发明新的东西。",
];

/** 这一局总共有哪些可发现的东西：revealedNow 扫的是同一份清单，HUD 的分母也从这里来 */
export function discoverableIds(plan: GamePlan): string[] {
  return [...plan.enemies, ...plan.items, ...plan.npcs, ...plan.triggers].map((entity) => entity.id);
}

/**
 * 解谜画法（§51 的 Puzzle）：同一份计划，把谜题的**结构**画出来。
 *
 * §54 没有"门 / 钥匙 / 按钮"这些实体，谜题结构就是文档里已有的引用图：
 * 机关 = 触发器（sim 里唯一可判定的交互是"踩进它的范围"），
 * 机关影响谁 = 它发出的引用（作者连了什么谜题就是什么），
 * 谜题目标 = 引用了触发器的任务按「激活」判定（`step` 里记首次踩到的时刻）。
 * 所以解谜不是第二套规则，是同一份计划的又一种画法 + 任务判定本来就欠的那一格。
 */
export const PUZZLE_VIEW_NOTES = [
  "解谜只是同一份关卡计划的又一种画法：把机关→影响的引用连线画出来，规则与 2D 走同一个 step，逐字相同。",
  "连线只画作者连了的引用：没连的机关就是孤立的开关，踩了没有任何东西响应——画法不替设计补谜题。",
  "「激活」= 玩家踩进机关的范围（首次记账）；模型里没有表达顺序的字段，不假装支持「按正确顺序踩」的谜题。",
];

/** 一条谜题连线：机关 → 它引用的目标（两端坐标都是投影摆的位置）。目标不在场上就没有这条线 */
export interface PuzzleLink {
  triggerId: string;
  triggerName: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  targetName: string;
  targetKind: GameEntityKind;
}

/** 谜题的结构数据：每个引用了场上目标的机关给出一条连线。纯函数，顺序按 plan.triggers 稳定给出 */
export function puzzleLinks(plan: GamePlan): PuzzleLink[] {
  const placed = new Map<string, { x: number; y: number; name: string; kind: GameEntityKind }>();
  for (const actor of [plan.player, ...plan.enemies, ...plan.items, ...plan.npcs]) {
    if (actor) placed.set(actor.id, { x: actor.x, y: actor.y, name: actor.name, kind: actor.kind });
  }
  for (const trigger of plan.triggers) {
    placed.set(trigger.id, { x: trigger.x, y: trigger.y, name: trigger.name, kind: "trigger" });
  }
  const links: PuzzleLink[] = [];
  for (const trigger of plan.triggers) {
    if (!trigger.affects) continue;
    const target = placed.get(trigger.affects.id);
    if (!target) continue;
    links.push({
      triggerId: trigger.id,
      triggerName: trigger.name,
      from: { x: trigger.x, y: trigger.y },
      to: { x: target.x, y: target.y },
      targetName: target.name,
      targetKind: target.kind,
    });
  }
  return links;
}

/**
 * 以玩家所在点为圆心、半径内的可发现物 id。纯函数，无状态：
 * "看见了就一直看得见"由视图层自己记（一个 Set），这一格只回答"现在照得见谁"。
 */
export function revealedNow(
  plan: GamePlan,
  at: { x: number; y: number },
  radius: number = EXPLORATION_REVEAL_RADIUS,
): string[] {
  const out: string[] = [];
  for (const entity of [...plan.enemies, ...plan.items, ...plan.npcs, ...plan.triggers]) {
    const dx = entity.x - at.x;
    const dy = entity.y - at.y;
    if (dx * dx + dy * dy <= radius * radius) out.push(entity.id);
  }
  return out;
}

/** 图例：形状与类别的固定对应，界面上写"形状=类别"，别让人读成"红色=危险" */
export const PLAY_KIND_SHAPES: Partial<Record<GameEntityKind, "circle" | "square" | "triangle" | "diamond">> = {
  player: "circle",
  enemy: "square",
  item: "diamond",
  npc: "triangle",
};
