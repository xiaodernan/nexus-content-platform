/**
 * §54 Game Design System 的文档模型。
 *
 * 与设计模型（§16）、世界模型（§44）同一条纪律：这份文档是唯一真值，
 * 面板、引用图、Game Agent（§52）、Playtest Agent（§53）、代码生成都只是它的投影。
 * 这里不放 React、不读文件、不碰数据库，所以 Node 与浏览器两端跑同一份校验。
 *
 * **刻意没有"生成"**：§52 的 Game Agent 要「Build a Souls-like boss fight prototype」
 * 那样从一句话长出整套设计，那要真 provider（§159 不许假生成）。这里给的
 * `createGame` 是一份**模板骨架**——11 类各一个空实体，名字写着类名，说明与数值都留空。
 * 它是脚手架，不是内容。同理，数值（`stats`）不预填任何"平衡数值"：
 * 编一套 health=100 / damage=12 出来就是替用户做设计，而且那套数字没有任何依据。
 *
 * **刻意不写死属性表**：§54 只列了 11 类实体，没有规定每类有哪些属性。
 * 所以 `stats` 是开放的 `Record<string, number>`（只校验"是有限数"），
 * 另有 `STAT_HINTS` 给出**建议键名**供界面做占位提示——建议不是约束，
 * 不写进校验里（写成校验就等于我替需求加了它没写的限制）。
 *
 * §51 的游戏类型选择、§52/§53 的 Agent 编排、§50 的构建管线都不在这里：
 * 那些是 Game Studio 的事，本包只回答"一个游戏的设计由哪些实体构成、它们怎么互相引用"。
 */

/** §54 的 11 类实体，顺序照原文 */
export const GAME_ENTITY_KINDS = [
  "player",
  "enemy",
  "weapon",
  "item",
  "quest",
  "dialogue",
  "trigger",
  "npc",
  "camera",
  "animation",
  "particle",
] as const;

export type GameEntityKind = (typeof GAME_ENTITY_KINDS)[number];

/** 11 类的中文名：面板分组标题、模板实体名与校验消息都用它，避免各处各写一套 */
export const GAME_ENTITY_LABELS: Record<GameEntityKind, string> = {
  player: "玩家",
  enemy: "敌人",
  weapon: "武器",
  item: "物品",
  quest: "任务",
  dialogue: "对话",
  trigger: "触发器",
  npc: "NPC",
  camera: "镜头",
  animation: "动画",
  particle: "粒子",
};

/**
 * 建议的数值键名，**仅供界面做占位提示**，不参与校验。
 * 这些是这类实体在多数游戏里都会有的旋钮，列出来是为了让用户知道"这里可以放什么"，
 * 而不是规定只能放这些。想要 `stamina` / `poise` / `iFrame` 直接加，不会被拒。
 */
export const STAT_HINTS: Record<GameEntityKind, readonly string[]> = {
  player: ["health", "speed", "jumpHeight", "attackPower"],
  enemy: ["health", "damage", "speed", "detectionRange", "aggression"],
  weapon: ["damage", "fireRate", "range", "ammo", "reloadTime"],
  item: ["stackSize", "value", "weight"],
  quest: ["xpReward", "requiredLevel", "timeLimit"],
  dialogue: ["priority", "cooldown"],
  trigger: ["radius", "delay", "cooldown"],
  npc: ["health", "speed", "interactRange"],
  camera: ["fov", "distance", "height", "smoothing"],
  animation: ["duration", "fps", "frames"],
  particle: ["count", "lifetime", "size", "speed"],
};

/**
 * 实体之间的一条引用。有向：`剑 → 装备于 → 玩家` 与反向不是同一件事。
 * `role` 说明这是哪种关系（「装备」「掉落」「对话对象」「触发后播放」…），
 * 可以留空（图上不写字），但 `to` 必须指向本文档里真实存在的实体。
 */
export interface GameRef {
  id: string;
  to: string;
  role: string;
}

export interface GameEntity {
  id: string;
  kind: GameEntityKind;
  name: string;
  /** 设计说明：这块东西是什么、为什么这样设计。留空是合法的 */
  notes: string;
  /** 自由标签，用于分组与检索；不做枚举约束 */
  tags: string[];
  /**
   * 数值旋钮。开放键、值必须是**有限数**（`NaN` / `Infinity` 会被校验挡下）。
   * 不预填任何默认值：没有依据的数字比没有数字更容易被当真。
   */
  stats: Record<string, number>;
  /** 本实体发出的引用 */
  refs: GameRef[];
  updatedAt: string;
}

export interface GameDocument {
  id: string;
  /** 游戏属于哪个项目；独立文档（还没挂到项目上）时为 null */
  projectId: string | null;
  name: string;
  summary: string;
  entities: GameEntity[];
  createdAt: string;
  updatedAt: string;
}

export type GameIssueCode =
  | "bad-kind"
  | "empty-name"
  | "duplicate-id"
  | "missing-name"
  | "bad-timestamp"
  | "bad-stat"
  | "self-ref"
  | "missing-ref-target"
  | "duplicate-ref";

export interface GameIssue {
  code: GameIssueCode;
  message: string;
  entityId?: string;
}

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  const now = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 1679616)
    .toString(36)
    .padStart(4, "0");
  return `${prefix}_${now}${counter.toString(36)}${rand}`;
}

const stamp = (): string => new Date().toISOString();

export function isGameEntityKind(value: unknown): value is GameEntityKind {
  return typeof value === "string" && (GAME_ENTITY_KINDS as readonly string[]).includes(value);
}

/** 数值是否可用：有限数才算。NaN / Infinity / 非数字类型一律不接受 */
export function isUsableStatValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * 模板骨架：11 类各一个空实体。
 *
 * 为什么不是"空文档"：§54 要的是那 11 类可见、可填，用户与 AI 才有落点。
 * 为什么不是"填好的内容"：说明与数值一律留空，填了就是替用户做设计（§159）。
 */
export function createGame(name: string, projectId: string | null = null): GameDocument {
  const at = stamp();
  return {
    id: uid("game"),
    projectId,
    name: name.trim() || "未命名游戏",
    summary: "",
    entities: GAME_ENTITY_KINDS.map((kind) => ({
      id: uid("ge"),
      kind,
      name: GAME_ENTITY_LABELS[kind],
      notes: "",
      tags: [],
      stats: {},
      refs: [],
      updatedAt: at,
    })),
    createdAt: at,
    updatedAt: at,
  };
}

export function findEntity(document: GameDocument, entityId: string): GameEntity | undefined {
  return document.entities.find((entity) => entity.id === entityId);
}

export function entitiesOfKind(document: GameDocument, kind: GameEntityKind): GameEntity[] {
  return document.entities.filter((entity) => entity.kind === kind);
}

/** 改一个实体并返回新文档；找不到目标就原样返回（不改、也不谎报改了） */
function patchEntity(
  document: GameDocument,
  entityId: string,
  change: (entity: GameEntity) => GameEntity,
): GameDocument {
  let touched = false;
  const at = stamp();
  const entities = document.entities.map((entity) => {
    if (entity.id !== entityId) return entity;
    touched = true;
    return { ...change(entity), updatedAt: at };
  });
  if (!touched) return document;
  return { ...document, entities, updatedAt: at };
}

export function addEntity(
  document: GameDocument,
  input: { kind: GameEntityKind; name?: string; notes?: string },
): GameDocument {
  const at = stamp();
  const entity: GameEntity = {
    id: uid("ge"),
    kind: input.kind,
    name: input.name?.trim() || GAME_ENTITY_LABELS[input.kind],
    notes: input.notes ?? "",
    tags: [],
    stats: {},
    refs: [],
    updatedAt: at,
  };
  return { ...document, entities: [...document.entities, entity], updatedAt: at };
}

export function updateEntity(
  document: GameDocument,
  entityId: string,
  patch: Partial<Pick<GameEntity, "name" | "notes" | "tags" | "kind">>,
): GameDocument {
  return patchEntity(document, entityId, (entity) => ({
    ...entity,
    ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.tags !== undefined ? { tags: [...patch.tags] } : {}),
  }));
}

/**
 * 写一个数值。**不合法就不写**，并把原因交回调用方（面板负责显示、AI 补丁负责放弃）。
 * 这里不抛异常：属性面板逐键输入时，抛异常会把一次按键变成一次崩溃。
 */
export function setStat(
  document: GameDocument,
  entityId: string,
  key: string,
  value: unknown,
): { document: GameDocument; reason: string | null } {
  const trimmed = key.trim();
  if (!trimmed) return { document, reason: "数值的键名不能是空的。" };
  if (!isUsableStatValue(value)) {
    return { document, reason: `${trimmed} 需要是一个有限数（收到 ${String(value)}）。` };
  }
  if (!findEntity(document, entityId)) {
    return { document, reason: "这个实体不在文档里，没有写入。" };
  }
  return {
    document: patchEntity(document, entityId, (entity) => ({
      ...entity,
      stats: { ...entity.stats, [trimmed]: value },
    })),
    reason: null,
  };
}

export function removeStat(document: GameDocument, entityId: string, key: string): GameDocument {
  const entity = findEntity(document, entityId);
  if (!entity || !(key in entity.stats)) return document;
  return patchEntity(document, entityId, (current) => {
    const { [key]: _dropped, ...stats } = current.stats;
    return { ...current, stats };
  });
}

/** 删实体前想知道会掉几条引用，用这个（面板的确认文案用） */
export function countRefsFor(document: GameDocument, entityId: string): number {
  return document.entities.reduce((total, entity) => {
    const outgoing = entity.id === entityId ? entity.refs.length : 0;
    const incoming = entity.refs.filter((ref) => ref.to === entityId).length;
    return total + outgoing + incoming;
  }, 0);
}

/**
 * 删掉一个实体。
 *
 * 与 world-model 的 `removeWorldNode` 有一处关键差别：世界的关系是**独立存**的
 * （`document.links`），所以删条目只要过滤那张表；这里引用挂在**实体自己身上**，
 * 因此必须两头都清——本实体发出的引用随它一起消失，**别人指向它的引用也要摘掉**，
 * 否则会留下一堆悬空引用，图上画不出来、校验也过不去。
 */
export function removeEntity(document: GameDocument, entityId: string): GameDocument {
  if (!findEntity(document, entityId)) return document;
  const at = stamp();
  return {
    ...document,
    entities: document.entities
      .filter((entity) => entity.id !== entityId)
      .map((entity) => {
        const refs = entity.refs.filter((ref) => ref.to !== entityId);
        // 摘掉入边就是在改这个实体的内容，所以它的 updatedAt 也要跟着动——
        // 否则面板会显示"这条刚被别人改过"却顶着旧时间戳（与 patchEntity 保持一致）
        return refs.length === entity.refs.length ? entity : { ...entity, refs, updatedAt: at };
      }),
    updatedAt: at,
  };
}

/**
 * 连一条有向引用。端点不存在、自己指自己、同一对再来一条同样的关系，都不写进去——
 * 但绝不静默：`reason` 带回那句原因。
 */
export function linkEntities(
  document: GameDocument,
  from: string,
  to: string,
  role = "",
): { document: GameDocument; reason: string | null } {
  if (from === to) return { document, reason: "一条引用需要两个不同的实体：不能自己指向自己。" };
  const source = findEntity(document, from);
  const target = findEntity(document, to);
  if (!source || !target) return { document, reason: "引用的端点不在这个文档里，没有连。" };
  const trimmed = role.trim();
  if (source.refs.some((ref) => ref.to === to && ref.role === trimmed)) {
    return { document, reason: `${source.name} 已经这样引用着 ${target.name} 了。` };
  }
  const ref: GameRef = { id: uid("gr"), to, role: trimmed };
  return {
    document: patchEntity(document, from, (entity) => ({ ...entity, refs: [...entity.refs, ref] })),
    reason: null,
  };
}

/** 摘掉一条引用：按引用自己的 id，而不是按"从哪到哪"——同一对之间可以有多条不同关系 */
export function removeRef(document: GameDocument, from: string, refId: string): GameDocument {
  const source = findEntity(document, from);
  if (!source || !source.refs.some((ref) => ref.id === refId)) return document;
  return patchEntity(document, from, (entity) => ({
    ...entity,
    refs: entity.refs.filter((ref) => ref.id !== refId),
  }));
}

/** 结构校验：不合法的内容不该进库，也不该在面板上假装存在 */
export function validateGame(document: GameDocument): GameIssue[] {
  const issues: GameIssue[] = [];
  if (!document || typeof document !== "object") {
    return [{ code: "missing-name", message: "游戏文档不是一个对象" }];
  }
  if (!document.name?.trim()) {
    issues.push({ code: "missing-name", message: "游戏没有名字" });
  }
  const seen = new Set<string>();
  for (const entity of document.entities ?? []) {
    const label = entity.name?.trim() || entity.id;
    if (!isGameEntityKind(entity.kind)) {
      issues.push({
        code: "bad-kind",
        message: `实体「${label}」的类型不在 §54 的 11 类之内：${String(entity.kind)}`,
        entityId: entity.id,
      });
    }
    if (!entity.name?.trim()) {
      issues.push({
        code: "empty-name",
        message: "有个实体没有名字（设计系统里的东西总得有个称呼）",
        entityId: entity.id,
      });
    }
    if (seen.has(entity.id)) {
      issues.push({ code: "duplicate-id", message: `实体 id 重复：${entity.id}`, entityId: entity.id });
    }
    seen.add(entity.id);
    if (typeof entity.updatedAt !== "string" || Number.isNaN(Date.parse(entity.updatedAt))) {
      issues.push({
        code: "bad-timestamp",
        message: `实体「${label}」的 updatedAt 不是合法时间`,
        entityId: entity.id,
      });
    }
    for (const [key, value] of Object.entries(entity.stats ?? {})) {
      if (!isUsableStatValue(value)) {
        issues.push({
          code: "bad-stat",
          message: `实体「${label}」的 ${key} 不是有限数：${String(value)}`,
          entityId: entity.id,
        });
      }
    }
  }
  const seenPair = new Set<string>();
  for (const entity of document.entities ?? []) {
    const label = entity.name?.trim() || entity.id;
    for (const ref of entity.refs ?? []) {
      if (ref.to === entity.id) {
        issues.push({
          code: "self-ref",
          message: `有条引用把自己指到了自己身上（${label}）`,
          entityId: entity.id,
        });
      }
      if (!seen.has(ref.to)) {
        issues.push({
          code: "missing-ref-target",
          message: `有条引用指向了不存在的实体（${label} → ${ref.to}）`,
          entityId: entity.id,
        });
      }
      const pair = `${entity.id}→${ref.to}#${ref.role}`;
      if (seenPair.has(pair)) {
        issues.push({
          code: "duplicate-ref",
          message: `同一对实体之间重复写了同样的引用（${label} → ${ref.to}）`,
          entityId: entity.id,
        });
      }
      seenPair.add(pair);
    }
  }
  return issues;
}

/** 每类各有多少个：面板分组与后续 Game Agent 的粗算都用它 */
export function gameCounts(document: GameDocument): Record<GameEntityKind, number> {
  const counts = Object.fromEntries(GAME_ENTITY_KINDS.map((kind) => [kind, 0])) as Record<
    GameEntityKind,
    number
  >;
  for (const entity of document.entities) {
    if (isGameEntityKind(entity.kind)) counts[entity.kind] += 1;
  }
  return counts;
}

export interface GameGraphNode {
  id: string;
  name: string;
  kind: GameEntityKind;
  /** 已填的数值个数：图上据此区分"只是个名字"和"真的在配" */
  statCount: number;
}

export interface GameGraphEdge {
  id: string;
  role: string;
  from: GameGraphNode;
  to: GameGraphNode;
}

/**
 * 引用图的投影（§54 的实体关系，不含坐标——布局是视图的事，
 * 和 world-model 把 positions 单独存是同一个理由）。
 * 指向已删实体的引用在这里被自然丢掉，而 `validateGame` 会同时报 `missing-ref-target`：
 * 渲染层不该看到画不出来的东西，但校验必须知道它存在。两件事都要有。
 */
export function referenceGraph(document: GameDocument): {
  nodes: GameGraphNode[];
  edges: GameGraphEdge[];
} {
  const byId = new Map<string, GameGraphNode>();
  const nodes = document.entities.map((entity) => {
    const view: GameGraphNode = {
      id: entity.id,
      name: entity.name,
      kind: entity.kind,
      statCount: Object.keys(entity.stats ?? {}).length,
    };
    byId.set(entity.id, view);
    return view;
  });
  const edges: GameGraphEdge[] = [];
  for (const entity of document.entities) {
    for (const ref of entity.refs ?? []) {
      const from = byId.get(entity.id);
      const to = byId.get(ref.to);
      if (!from || !to) continue;
      edges.push({ id: ref.id, role: ref.role, from, to });
    }
  }
  return { nodes, edges };
}

/** 有多少个实体真的填了内容（说明或数值），而不是只剩模板里的名字 */
export function fleshedOutCount(document: GameDocument): number {
  return document.entities.filter(
    (entity) => entity.notes.trim().length > 0 || Object.keys(entity.stats ?? {}).length > 0,
  ).length;
}

export * from "./play";
export * from "./sim";
