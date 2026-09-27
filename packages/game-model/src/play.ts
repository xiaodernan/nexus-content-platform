import {
  GAME_ENTITY_LABELS,
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
 * - **位置是投影排的**，不是作者摆的：§54 的模型里没有坐标，也没有地形/关卡布局。
 *   按类别排在同心环上只是为了"可走"，界面必须标出来它是规则摆的（与 §140 的 fallback 同一口径）。
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
  provenance: Record<"health" | "damage" | "speed" | "senseRadius", StatSource>;
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
  /** 秒：进入前要多久才生效 / 触发后多久能再次生效。没有就是 0 */
  delay: number;
  cooldown: number;
  /** 引用指向的那个东西（有就显示"触发后影响 X"） */
  affects: { id: string; name: string } | null;
}

export interface PlayQuestGoal {
  kind: "defeat" | "collect";
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
  const weapon = document.entities.find(
    (entity) => entity.kind === "weapon" && (entity.refs ?? []).some((ref) => ref.to === player.id),
  );
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

function toActor(entity: GameEntity, hostile: boolean, index: number, count: number, damageOverride?: { value: number; from: StatSource }): PlayActor {
  const ring = hostile ? 300 : entity.kind === "item" ? 180 : 360;
  const at = ringPosition(index, count, ring);
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
    template: Object.keys(entity.stats ?? {}).length === 0 && !entity.notes.trim(),
    provenance: { health: health.from, damage: damage.from, speed: speed.from, senseRadius: sense.from },
    stats: { ...(entity.stats ?? {}) },
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
  const notes: string[] = [
    "位置是投影按类别排在同心环上的，不是作者摆过的关卡布局——§54 的模型里没有坐标与地形。",
    "所有个体一样大：模型里没有尺寸或重要性字段。",
    "形状（方块/圆/三角）只用来区分类别，不代表美术资产；§34 的 3D 模型与 §43 的动画在这里都没有。",
  ];

  const players = ofKind(document, "player");
  const player = players[0] ?? null;
  if (players.length > 1) {
    notes.push(`文档里有 ${players.length} 个玩家实体，这一版只用第一个（${player?.name ?? ""}）：多玩家不是模型能表达的，是网络同步的事。`);
  }

  const blockers: string[] = [];
  if (!player) blockers.push("没有玩家实体：没有可操作的对象，这一版开不了场。");

  const enemies = ofKind(document, "enemy").map((entity, i, all) => toActor(entity, true, i, all.length));
  const items = ofKind(document, "item").map((entity, i, all) => toActor(entity, false, i, all.length));
  const npcs = ofKind(document, "npc").map((entity, i, all) => toActor(entity, false, i, all.length));

  let playerDamageNote: string | null = null;
  let playActor: PlayActor | null = null;
  if (player) {
    const offense = playerOffense(document, player);
    playerDamageNote = offense.note;
    // 玩家站在场地正中：他是参照物，环都绕着他排（toActor 给的环位对玩家没意义）
    playActor = {
      ...toActor(player, false, 0, 1),
      damage: offense.damage,
      reach: offense.reach,
      reachIsDesign: offense.reachIsDesign,
      x: ARENA.width / 2,
      y: ARENA.height / 2,
    };
    playActor.provenance = { ...playActor.provenance, damage: offense.from };
  }
  if (playerDamageNote) notes.push(playerDamageNote);

  const byId = new Map<string, GameEntity>(document.entities.map((entity) => [entity.id, entity]));
  const placedById = new Map<string, { x: number; y: number }>();
  for (const actor of [playActor, ...enemies, ...items, ...npcs]) {
    if (actor) placedById.set(actor.id, { x: actor.x, y: actor.y });
  }

  const triggers = ofKind(document, "trigger").map((entity, index, all) => {
    const radius = pick(entity, "radius", PLAY_DEFAULTS.triggerRadius);
    const refTarget = (entity.refs ?? []).map((ref) => byId.get(ref.to)).find((target): target is GameEntity => Boolean(target));
    const anchor = refTarget ? placedById.get(refTarget.id) : null;
    const at = anchor ?? ringPosition(index, all.length, 240);
    return {
      id: entity.id,
      name: entity.name,
      x: Math.min(Math.max(at.x, ACTOR_RADIUS), ARENA.width - ACTOR_RADIUS),
      y: Math.min(Math.max(at.y, ACTOR_RADIUS), ARENA.height - ACTOR_RADIUS),
      radius: Math.max(0, radius.value),
      radiusIsDesign: radius.from === "design",
      delay: Math.max(0, stat(entity, "delay") ?? 0),
      cooldown: Math.max(0, stat(entity, "cooldown") ?? 0),
      affects: refTarget ? { id: refTarget.id, name: refTarget.name } : null,
    };
  });

  const quests = ofKind(document, "quest").map((entity) => {
    const goals: PlayQuestGoal[] = [];
    for (const ref of entity.refs ?? []) {
      const target = byId.get(ref.to);
      if (!target) continue;
      if (target.kind === "enemy") goals.push({ kind: "defeat", actorId: target.id, label: `打倒 ${target.name}` });
      else if (target.kind === "item") goals.push({ kind: "collect", actorId: target.id, label: `拾取 ${target.name}` });
    }
    const timeLimit = stat(entity, "timeLimit");
    return {
      id: entity.id,
      name: entity.name,
      goals,
      judgeable: goals.length > 0,
      why: goals.length
        ? `引用了 ${goals.length} 个可判定的对象`
        : (entity.refs ?? []).length
          ? "引用的不是敌人也不是物品（可能是对话、触发器或已删除的实体）——投影判不出这条任务什么时候算完成。"
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

/** 图例：形状与类别的固定对应，界面上写"形状=类别"，别让人读成"红色=危险" */
export const PLAY_KIND_SHAPES: Partial<Record<GameEntityKind, "circle" | "square" | "triangle" | "diamond">> = {
  player: "circle",
  enemy: "square",
  item: "diamond",
  npc: "triangle",
};

export function playLegend(): { kind: GameEntityKind; label: string; shape: string }[] {
  return (Object.keys(PLAY_KIND_SHAPES) as GameEntityKind[]).map((kind) => ({
    kind,
    label: GAME_ENTITY_LABELS[kind],
    shape: PLAY_KIND_SHAPES[kind] ?? "circle",
  }));
}
