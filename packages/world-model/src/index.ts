/**
 * §44 World Builder 的文档模型。
 *
 * 和设计模型同一条纪律（§16）：世界文档是唯一真值，面板、图视图（§45）、
 * 角色对话（§47）、RAG 语料（§49）都是它的投影。这里不放 React、不读文件、不碰数据库，
 * 所以它能在 Node 与浏览器两端跑同一份校验。
 *
 * 刻意没有"生成"：§44 的示例是「Create a dark fantasy world」→ AI 填出九类内容，
 * 那要真 provider 才能做（§159 不许假生成）。这里给的 `createWorld` 是一份**模板骨架**——
 * 九类各一个空条目，标题写着类名，正文是空串。它是脚手架，不是内容。
 */

export const WORLD_KINDS = [
  "lore",
  "history",
  "geography",
  "factions",
  "characters",
  "creatures",
  "items",
  "quests",
  "story",
] as const;

export type WorldKind = (typeof WORLD_KINDS)[number];

/** 九类的中文名：面板分组标题与模板条目都用它，避免各处各写一套 */
export const WORLD_KIND_LABELS: Record<WorldKind, string> = {
  lore: "传说",
  history: "历史",
  geography: "地理",
  factions: "势力",
  characters: "角色",
  creatures: "生物",
  items: "物品",
  quests: "任务",
  story: "故事",
};

export interface WorldNode {
  id: string;
  kind: WorldKind;
  title: string;
  body: string;
  /** 条目级时间戳：世界文档没有画布那套 revision，先按条目记录最后改动 */
  updatedAt: string;
}

export interface WorldDocument {
  id: string;
  /** 世界属于哪个项目；独立世界（还没挂到项目上）时为 null */
  projectId: string | null;
  name: string;
  summary: string;
  nodes: WorldNode[];
  createdAt: string;
  updatedAt: string;
}

export interface WorldIssue {
  code:
    | "bad-kind"
    | "empty-title"
    | "duplicate-id"
    | "missing-name"
    | "bad-timestamp";
  message: string;
  nodeId?: string;
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

export function isWorldKind(value: unknown): value is WorldKind {
  return typeof value === "string" && (WORLD_KINDS as readonly string[]).includes(value);
}

/**
 * 模板骨架：九类各一条空条目。
 *
 * 为什么不是"空文档"：§44 要的是那棵树，先让九类可见、可填，
 * 用户与 AI 都才有落点；为什么不是"生成的内容"：正文一律留空，
 * 填了字就是替用户编世界观，那是假生成（§159）。
 */
export function createWorld(name: string, projectId: string | null = null): WorldDocument {
  const at = stamp();
  return {
    id: uid("world"),
    projectId,
    name: name.trim() || "未命名世界",
    summary: "",
    nodes: WORLD_KINDS.map((kind) => ({
      id: uid("wn"),
      kind,
      title: WORLD_KIND_LABELS[kind],
      body: "",
      updatedAt: at,
    })),
    createdAt: at,
    updatedAt: at,
  };
}

export function findWorldNode(
  document: WorldDocument,
  nodeId: string,
): WorldNode | undefined {
  return document.nodes.find((node) => node.id === nodeId);
}

export function nodesOfKind(document: WorldDocument, kind: WorldKind): WorldNode[] {
  return document.nodes.filter((node) => node.kind === kind);
}

export function addWorldNode(
  document: WorldDocument,
  input: { kind: WorldKind; title: string; body?: string },
): WorldDocument {
  const at = stamp();
  const node: WorldNode = {
    id: uid("wn"),
    kind: input.kind,
    title: input.title.trim() || WORLD_KIND_LABELS[input.kind],
    body: input.body ?? "",
    updatedAt: at,
  };
  return { ...document, nodes: [...document.nodes, node], updatedAt: at };
}

export function updateWorldNode(
  document: WorldDocument,
  nodeId: string,
  patch: Partial<Pick<WorldNode, "title" | "body" | "kind">>,
): WorldDocument {
  const at = stamp();
  let touched = false;
  const nodes = document.nodes.map((node) => {
    if (node.id !== nodeId) return node;
    touched = true;
    return {
      ...node,
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      updatedAt: at,
    };
  });
  if (!touched) return document;
  return { ...document, nodes, updatedAt: at };
}

/**
 * 删掉一个条目。九类骨架允许被删空——用户不想要"生物"这一类是合法选择，
 * 面板上再靠 `createWorld` 之外的入口补回来（addWorldNode 什么类都能加）。
 */
export function removeWorldNode(document: WorldDocument, nodeId: string): WorldDocument {
  if (!findWorldNode(document, nodeId)) return document;
  const at = stamp();
  return {
    ...document,
    nodes: document.nodes.filter((node) => node.id !== nodeId),
    updatedAt: at,
  };
}

/** 结构校验：不合法的内容不该进库，也不该在面板上假装存在 */
export function validateWorld(document: WorldDocument): WorldIssue[] {
  const issues: WorldIssue[] = [];
  if (!document || typeof document !== "object") {
    return [{ code: "missing-name", message: "世界文档不是一个对象" }];
  }
  if (!document.name?.trim()) {
    issues.push({ code: "missing-name", message: "世界没有名字" });
  }
  const seen = new Set<string>();
  for (const node of document.nodes ?? []) {
    if (!isWorldKind(node.kind)) {
      issues.push({
        code: "bad-kind",
        message: `条目「${node.title || node.id}」的类型不在九类之内：${String(node.kind)}`,
        nodeId: node.id,
      });
    }
    if (!node.title?.trim()) {
      issues.push({
        code: "empty-title",
        message: "有条目没有标题（写进世界里的东西总得有个名字）",
        nodeId: node.id,
      });
    }
    if (seen.has(node.id)) {
      issues.push({
        code: "duplicate-id",
        message: `条目 id 重复：${node.id}`,
        nodeId: node.id,
      });
    }
    seen.add(node.id);
    if (typeof node.updatedAt !== "string" || Number.isNaN(Date.parse(node.updatedAt))) {
      issues.push({
        code: "bad-timestamp",
        message: `条目「${node.title || node.id}」的 updatedAt 不是合法时间`,
        nodeId: node.id,
      });
    }
  }
  return issues;
}

/** 每个类各有多少条：面板与后续 RAG 摄取都用它做粗算 */
export function worldCounts(document: WorldDocument): Record<WorldKind, number> {
  const counts = Object.fromEntries(WORLD_KINDS.map((k) => [k, 0])) as Record<WorldKind, number>;
  for (const node of document.nodes) {
    if (isWorldKind(node.kind)) counts[node.kind] += 1;
  }
  return counts;
}
