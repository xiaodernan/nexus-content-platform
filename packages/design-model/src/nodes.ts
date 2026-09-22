import type {
  ComponentDefinition,
  CornerRadius,
  DesignDocument,
  DesignNode,
  Layout,
  NodeType,
  Page,
  Style,
  Token,
} from "./types";

/** 属性路径 → 读写；用于 bindingsMap、补丁应用、AI Diff 摘要 */
export function getByPath(source: unknown, path: string): unknown {
  if (!path) return source;
  let current: unknown = source;
  for (const raw of path.split(".")) {
    if (current === null || current === undefined) return undefined;
    const m = /^(.+)\[(\d+)\]$/.exec(raw);
    if (m) {
      const owner = current as Record<string, unknown>;
      const arr = owner[m[1]!] as unknown[] | undefined;
      current = Array.isArray(arr) ? arr[Number(m[2])] : undefined;
      continue;
    }
    current = (current as Record<string, unknown>)[raw];
  }
  return current;
}

export function setOnObject<T extends Record<string, unknown>>(
  target: T,
  path: string,
  value: unknown,
): T {
  const parts = path.split(".");
  let current: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]!;
    const next = current[key];
    if (typeof next !== "object" || next === null) current[key] = {};
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
  return target;
}

/**
 * 深拷贝。设计文档是纯 JSON（它要过 JSONB 与 JSON.stringify），所以自己走一遍
 * 比 structuredClone 快一个量级——每次编辑都要整份克隆，10k 节点的文档上这曾是主要开销。
 * 非纯数据的对象（Date / Map / 类实例）仍交给 structuredClone，不假装能处理。
 */
function fastClone<T>(value: T): T {
  if (Array.isArray(value)) {
    const out: unknown[] = new Array(value.length);
    for (let i = 0; i < value.length; i += 1) out[i] = fastClone(value[i]);
    return out as T;
  }
  if (value && typeof value === "object") {
    const proto = Object.getPrototypeOf(value) as unknown;
    if (proto !== Object.prototype && proto !== null) return structuredClone(value);
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source)) out[key] = fastClone(source[key]);
    return out as T;
  }
  return value;
}

export function clone<T>(value: T): T {
  return fastClone(value);
}

/**
 * 深度相等，且不受键顺序影响。文档一旦经过服务端 schema 校验或 jsonb 存取，
 * 对象的键顺序就和构造时的字面量顺序不同了；用 JSON.stringify 比较会把"没有改动"
 * 判成一次真实改动（假回写、假 diff、假快照都会从这里长出来）。
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => sameValue(item, (b as unknown[])[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every(
    (key) => Object.prototype.hasOwnProperty.call(right, key) && sameValue(left[key], right[key]),
  );
}

export function uid(prefix = "n"): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

export const DEFAULT_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };

export function defaultLayout(mode: Layout["mode"] = "none"): Layout {
  return {
    mode,
    gap: 0,
    padding: { ...DEFAULT_PADDING },
    justify: "start",
    items: mode === "horizontal" ? "start" : "start",
    clipContent: false,
    scroll: "none",
  };
}

export function defaultStyle(): Style {
  return {
    fills: [],
    strokes: [],
    cornerRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
    effects: [],
    opacity: 1,
    blendMode: "normal",
    rotation: 0,
    cursor: "default",
    overflowX: "visible",
    overflowY: "visible",
  };
}

export function radius(value: number): CornerRadius {
  return {
    topLeft: value,
    topRight: value,
    bottomRight: value,
    bottomLeft: value,
  };
}

interface NodeDefaults {
  name: string;
  width: DesignNode["size"]["width"];
  height: DesignNode["size"]["height"];
  layout?: Layout["mode"];
  text?: string;
  columns?: number;
}

const NODE_DEFAULTS: Record<NodeType, NodeDefaults> = {
  frame: { name: "Frame", width: 1440, height: 900, layout: "vertical" },
  section: {
    name: "Section",
    width: "fill",
    height: "hug",
    layout: "vertical",
  },
  container: {
    name: "Container",
    width: "fill",
    height: "hug",
    layout: "horizontal",
  },
  group: { name: "Group", width: "hug", height: "hug", layout: "none" },
  text: { name: "Text", width: "hug", height: "hug", text: "Text" },
  image: { name: "Image", width: 240, height: 160 },
  video: { name: "Video", width: 480, height: 270 },
  svg: { name: "SVG", width: 24, height: 24 },
  shape: { name: "Shape", width: 120, height: 120 },
  button: {
    name: "Button",
    width: "hug",
    height: "hug",
    layout: "horizontal",
    text: "Button",
  },
  input: {
    name: "Input",
    width: "fill",
    height: 44,
    layout: "horizontal",
    text: "Placeholder",
  },
  card: { name: "Card", width: "fill", height: "hug", layout: "vertical" },
  list: { name: "List", width: "fill", height: "hug", layout: "vertical" },
  grid: {
    name: "Grid",
    width: "fill",
    height: "hug",
    layout: "grid",
    columns: 3,
  },
  component: {
    name: "Component",
    width: "hug",
    height: "hug",
    layout: "vertical",
  },
  instance: {
    name: "Instance",
    width: "hug",
    height: "hug",
    layout: "vertical",
  },
  code: {
    name: "Code Region",
    width: "fill",
    height: "hug",
    layout: "vertical",
  },
  three: { name: "3D Scene", width: "fill", height: 480 },
  webgl: { name: "WebGL", width: "fill", height: 480 },
};

export interface CreateNodeInput {
  type: NodeType;
  name?: string;
  parentId?: NodeIdLike;
  text?: string;
  size?: Partial<DesignNode["size"]>;
  position?: Partial<DesignNode["position"]>;
  layout?: Partial<Layout>;
  style?: Partial<Style>;
  typography?: DesignNode["typography"];
  componentId?: string;
  variantProps?: Record<string, string>;
  meta?: Record<string, unknown>;
}

type NodeIdLike = string | null;

export function createNode(input: CreateNodeInput): DesignNode {
  const defaults = NODE_DEFAULTS[input.type] ?? NODE_DEFAULTS.container;
  const columns = defaults.columns;
  const node: DesignNode = {
    id: uid(input.type.slice(0, 3)),
    type: input.type,
    name: input.name ?? defaults.name,
    parentId: input.parentId ?? null,
    children: [],
    position: { x: input.position?.x ?? 0, y: input.position?.y ?? 0 },
    size: {
      width: input.size?.width ?? defaults.width,
      height: input.size?.height ?? defaults.height,
    },
    layout: { ...defaultLayout(defaults.layout), ...(input.layout ?? {}) },
    style: { ...defaultStyle(), ...(input.style ?? {}) },
    constraints: { horizontal: "start", vertical: "start" },
    visible: true,
    locked: false,
  };

  if (
    input.type === "text" ||
    input.type === "button" ||
    input.type === "input"
  ) {
    node.text = input.text ?? defaults.text ?? "";
    node.typography = input.typography ?? {
      fontFamily: "{font.body}",
      fontSize: input.type === "button" ? 14 : 16,
      fontWeight: input.type === "button" ? 600 : 400,
      lineHeight: 1.5,
      letterSpacing: 0,
      align: "left",
      verticalAlign: "top",
    };
    node.constraints = { horizontal: "start", vertical: "start" };
  } else if (input.typography) {
    node.typography = input.typography;
  }

  if (input.type === "shape") node.shapeKind = "rectangle";
  if (input.type === "grid")
    node.layout.columns = input.layout?.columns ?? columns ?? 3;
  if (input.componentId) {
    node.componentId = input.componentId;
    node.variantProps = input.variantProps ?? {};
  }
  if (input.meta) node.meta = input.meta;
  return node;
}

export function createPage(name: string, width = 1440, height = 900): Page {
  const root = createNode({
    type: "frame",
    name,
    size: { width, height },
    layout: { mode: "vertical", gap: 0 },
    style: { fills: [{ kind: "solid", color: "{color.background}" }] },
  });
  return {
    id: uid("p"),
    name,
    rootId: root.id,
    nodes: { [root.id]: root },
    width,
    height,
  };
}

/**
 * 新项目起手页。空画布没法验证任何链路，所以给一段最小可用的 hero；
 * 所有可见值都引用 token（§12），AI mock 也靠它的命名找到 hero。
 */
export function starterPage(name = "Home"): Page {
  const page = createPage(name);
  const root = page.nodes[page.rootId]!;

  const add = (input: CreateNodeInput, parent: DesignNode): DesignNode => {
    const node = createNode({ ...input, parentId: parent.id });
    page.nodes[node.id] = node;
    parent.children.push(node.id);
    return node;
  };

  const hero = add(
    {
      type: "section",
      name: "Hero",
      size: { width: "fill", height: "hug" },
      layout: {
        mode: "vertical",
        gap: "{space.6}",
        padding: {
          top: "{space.16}",
          right: "{space.8}",
          bottom: "{space.16}",
          left: "{space.8}",
        },
        items: "start",
      },
      style: { fills: [{ kind: "solid", color: "{color.surface}" }] },
    },
    root,
  );

  add(
    {
      type: "text",
      name: "Eyebrow",
      text: "NEXUS STUDIO",
      size: { width: "hug", height: "hug" },
      style: { fills: [{ kind: "solid", color: "{color.accent}" }] },
      typography: {
        fontFamily: "{font.mono}",
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1.5,
        letterSpacing: 2,
        align: "left",
        verticalAlign: "top",
      },
    },
    hero,
  );

  add(
    {
      type: "text",
      name: "Headline",
      text: "从一句话到一个可发布的产品",
      size: { width: "fill", height: "hug" },
      style: { fills: [{ kind: "solid", color: "{color.text}" }] },
      typography: {
        fontFamily: "{font.heading}",
        fontSize: 56,
        fontWeight: 700,
        lineHeight: 1.1,
        letterSpacing: -1.5,
        align: "left",
        verticalAlign: "top",
      },
    },
    hero,
  );

  add(
    {
      type: "text",
      name: "Subhead",
      text: "画布、代码与预览都是同一份设计模型的投影。改模型，三处一起更新。",
      size: { width: "fill", height: "hug" },
      style: { fills: [{ kind: "solid", color: "{color.text-muted}" }] },
      typography: {
        fontFamily: "{font.body}",
        fontSize: 18,
        fontWeight: 400,
        lineHeight: 1.6,
        letterSpacing: 0,
        align: "left",
        verticalAlign: "top",
      },
    },
    hero,
  );

  const actions = add(
    {
      type: "container",
      name: "Actions",
      size: { width: "hug", height: "hug" },
      layout: { mode: "horizontal", gap: "{space.3}", items: "center" },
    },
    hero,
  );

  add(
    {
      type: "button",
      name: "Primary CTA",
      text: "开始设计",
      size: { width: "hug", height: "hug" },
      layout: {
        padding: {
          top: "{space.3}",
          right: "{space.6}",
          bottom: "{space.3}",
          left: "{space.6}",
        },
      },
      style: {
        fills: [{ kind: "solid", color: "{color.primary}" }],
        cornerRadius: {
          topLeft: "{radius.md}",
          topRight: "{radius.md}",
          bottomRight: "{radius.md}",
          bottomLeft: "{radius.md}",
        },
      },
      typography: {
        fontFamily: "{font.body}",
        fontSize: 15,
        fontWeight: 600,
        lineHeight: 1.5,
        letterSpacing: 0,
        align: "center",
        verticalAlign: "top",
        color: "{color.on-primary}",
      },
    },
    actions,
  );

  add(
    {
      type: "button",
      name: "Secondary CTA",
      text: "查看文档",
      size: { width: "hug", height: "hug" },
      layout: {
        padding: {
          top: "{space.3}",
          right: "{space.6}",
          bottom: "{space.3}",
          left: "{space.6}",
        },
      },
      style: {
        strokes: [{ paints: [{ kind: "solid", color: "{color.border}" }], width: 1, position: "inside" }],
        cornerRadius: {
          topLeft: "{radius.md}",
          topRight: "{radius.md}",
          bottomRight: "{radius.md}",
          bottomLeft: "{radius.md}",
        },
      },
      typography: {
        fontFamily: "{font.body}",
        fontSize: 15,
        fontWeight: 500,
        lineHeight: 1.5,
        letterSpacing: 0,
        align: "center",
        verticalAlign: "top",
        color: "{color.text}",
      },
    },
    actions,
  );

  return page;
}

export function createDocument(
  name: string,
  projectType: DesignDocument["metadata"]["projectType"] = "website",
): DesignDocument {
  const now = new Date().toISOString();
  const page = starterPage("Home");
  return {
    id: uid("doc"),
    schemaVersion: 1,
    name,
    pages: [page],
    activePageId: page.id,
    components: [],
    tokens: DEFAULT_TOKENS.map((t) => ({ ...t })),
    activeMode: null,
    assets: [],
    variables: [],
    metadata: {
      createdAt: now,
      updatedAt: now,
      modes: ["light", "dark"],
      projectType,
    },
  };
}

/**
 * 整棵子树做字符串替换而不是只改已知字段——引用一个 id 的地方会随功能增加
 * （交互目标、变量作用域、填充里的 assetId……），点名式重写迟早漏一处。
 * 只有"整串等于某个旧 id"才会被换掉，所以名字里恰好含这些字符的文本不受影响。
 */
function deepReplaceIds(value: unknown, maps: Map<string, string>[]): unknown {
  const remap = (item: unknown): unknown => {
    if (typeof item === "string") {
      for (const map of maps) {
        const next = map.get(item);
        if (next) return next;
      }
      return item;
    }
    if (Array.isArray(item)) return item.map(remap);
    if (item !== null && typeof item === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(item as Record<string, unknown>)) {
        out[key] = remap(child);
      }
      return out;
    }
    return item;
  };
  return remap(value);
}

/**
 * §27 Duplicate：复制成一份可独立存在的新文档。
 * 页面 id 和组件 id 在存储层是全局主键，副本必须换号；节点 id 只在页面内唯一，
 * 跟着页面走，所以保持不变。
 */
export function duplicateDocument(
  source: DesignDocument,
  name?: string,
): DesignDocument {
  const copy = clone(source);
  const pages = new Map<string, string>();
  for (const page of copy.pages) {
    const next = uid("p");
    pages.set(page.id, next);
    page.id = next;
  }
  const componentIds = new Map<string, string>();
  for (const component of copy.components) {
    const next = uid("cmp");
    componentIds.set(component.id, next);
    component.id = next;
  }
  const rekeyed = deepReplaceIds(copy, [pages, componentIds]) as DesignDocument;
  if (name) rekeyed.name = name;
  return rekeyed;
}

/**
 * 资产换号（§27 Duplicate 的另一半）。
 *
 * 资产 id 在存储层也是全局主键，副本必须指向**自己**的那份字节：
 * 共享一份记录会让"删除项目"的级联删掉别人的素材，也会让所有权判定失效
 * （鉴权路由按 projectId 认人，§80）。这里只改模型里的引用，
 * 字节与行的复制在 web 层做，映射表由那边生成。
 */
export function remapAssetIds(source: DesignDocument, map: Map<string, string> | Record<string, string>): DesignDocument {
  const entries = map instanceof Map ? map : new Map(Object.entries(map));
  if (!entries.size) return clone(source);
  const copy = clone(source);
  copy.assets = copy.assets.map((asset) =>
    entries.has(asset.id) ? { ...asset, id: entries.get(asset.id)! } : asset,
  );
  return deepReplaceIds(copy, [entries]) as DesignDocument;
}

/** 内置默认 token 集（§12）；用户 Design System 覆盖同名 key */
export const DEFAULT_TOKENS: Token[] = [
  {
    key: "color.background",
    type: "color",
    value: "#0b0d12",
    modes: { light: "#f7f8fb", dark: "#0b0d12" },
  },
  {
    key: "color.surface",
    type: "color",
    value: "#12151d",
    modes: { light: "#ffffff", dark: "#12151d" },
  },
  {
    key: "color.surface-2",
    type: "color",
    value: "#1a1f2b",
    modes: { light: "#eef1f6", dark: "#1a1f2b" },
  },
  {
    key: "color.text",
    type: "color",
    value: "#eef2ff",
    modes: { light: "#111318", dark: "#eef2ff" },
  },
  {
    key: "color.text-muted",
    type: "color",
    value: "#9aa4b8",
    modes: { light: "#5a6478", dark: "#9aa4b8" },
  },
  {
    key: "color.primary",
    type: "color",
    value: "#6b4ff0",
    modes: { light: "#5b3df5", dark: "#6b4ff0" },
  },
  {
    key: "color.accent",
    type: "color",
    value: "#22d3ee",
    // accent 会被当小字号文本用（Eyebrow 那一类），浅底上必须自己暗下来
    modes: { light: "#0b6f78", dark: "#22d3ee" },
  },
  {
    key: "color.on-primary",
    type: "color",
    value: "#ffffff",
    modes: { light: "#ffffff", dark: "#ffffff" },
  },
  {
    key: "color.border",
    type: "color",
    value: "#262c3a",
    modes: { light: "#dfe3ec", dark: "#262c3a" },
  },
  { key: "color.danger", type: "color", value: "#f05252" },
  {
    key: "font.heading",
    type: "fontFamily",
    value: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  {
    key: "font.body",
    type: "fontFamily",
    value: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  {
    key: "font.mono",
    type: "fontFamily",
    value: '"JetBrains Mono", Consolas, monospace',
  },
  { key: "space.1", type: "dimension", value: 4 },
  { key: "space.2", type: "dimension", value: 8 },
  { key: "space.3", type: "dimension", value: 12 },
  { key: "space.4", type: "dimension", value: 16 },
  { key: "space.6", type: "dimension", value: 24 },
  { key: "space.8", type: "dimension", value: 32 },
  { key: "space.12", type: "dimension", value: 48 },
  { key: "space.16", type: "dimension", value: 64 },
  { key: "space.20", type: "dimension", value: 80 },
  { key: "space.24", type: "dimension", value: 96 },
  { key: "radius.sm", type: "dimension", value: 6 },
  { key: "radius.md", type: "dimension", value: 10 },
  { key: "radius.lg", type: "dimension", value: 16 },
  { key: "radius.full", type: "dimension", value: 999 },
  {
    key: "shadow.sm",
    type: "shadow",
    value: { offsetX: 0, offsetY: 1, blur: 2, color: "rgba(0,0,0,0.18)" },
  },
  {
    key: "shadow.md",
    type: "shadow",
    value: { offsetX: 0, offsetY: 8, blur: 24, color: "rgba(0,0,0,0.32)" },
  },
  {
    key: "shadow.lg",
    type: "shadow",
    value: { offsetX: 0, offsetY: 24, blur: 64, color: "rgba(0,0,0,0.45)" },
  },
  { key: "motion.fast", type: "duration", value: 120 },
  { key: "motion.base", type: "duration", value: 200 },
  { key: "motion.slow", type: "duration", value: 360 },
  {
    key: "motion.ease",
    type: "easing",
    value: "cubic-bezier(0.22, 1, 0.36, 1)",
  },
];

export function findPage(
  doc: DesignDocument,
  pageId?: string,
): Page | undefined {
  return doc.pages.find((p) => p.id === (pageId ?? doc.activePageId));
}

export function getNode(page: Page, id: string): DesignNode | undefined {
  return page.nodes[id];
}

export function requireNode(page: Page, id: string): DesignNode {
  const node = page.nodes[id];
  if (!node) throw new Error(`design node not found: ${id}`);
  return node;
}

export function childrenOf(page: Page, node: DesignNode): DesignNode[] {
  return node.children
    .map((id) => page.nodes[id])
    .filter((n): n is DesignNode => Boolean(n));
}

export function ancestors(page: Page, id: string): DesignNode[] {
  const chain: DesignNode[] = [];
  let current = page.nodes[id];
  while (current?.parentId) {
    const parent = page.nodes[current.parentId];
    if (!parent) break;
    chain.push(parent);
    current = parent;
  }
  return chain;
}

export function descendants(page: Page, id: string): DesignNode[] {
  const out: DesignNode[] = [];
  const walk = (nodeId: string) => {
    for (const child of childrenOf(page, requireNode(page, nodeId))) {
      out.push(child);
      walk(child.id);
    }
  };
  if (page.nodes[id]) walk(id);
  return out;
}

export function isDescendant(
  page: Page,
  maybeChild: string,
  ancestorId: string,
): boolean {
  let current = page.nodes[maybeChild];
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = page.nodes[current.parentId];
  }
  return false;
}

export function walk(
  page: Page,
  visit: (node: DesignNode, depth: number) => void,
): void {
  const walkFrom = (id: string, depth: number) => {
    const node = page.nodes[id];
    if (!node) return;
    visit(node, depth);
    for (const child of node.children) walkFrom(child, depth + 1);
  };
  walkFrom(page.rootId, 0);
}

export function walkDocument(
  doc: DesignDocument,
  visit: (node: DesignNode, page: Page, depth: number) => void,
): void {
  for (const page of doc.pages)
    walk(page, (node, depth) => visit(node, page, depth));
}

/** 组件实例化：复制主组件子树为 instance 的 children，记录 componentId（§13） */
export function instantiateComponent(
  doc: DesignDocument,
  component: ComponentDefinition,
  parentId: string,
  pageId?: string,
): { instance: DesignNode; copiedIds: string[] } {
  const page = findPage(doc, pageId) ?? doc.pages[0];
  if (!page) throw new Error("document has no page");
  const sourceRoot = page.nodes[component.rootId];
  if (!sourceRoot)
    throw new Error(`component root missing: ${component.rootId}`);

  const copied: DesignNode[] = [];
  const copyTree = (
    node: DesignNode,
    newParentId: string | null,
  ): DesignNode => {
    const next = clone(node);
    next.id = uid(node.type.slice(0, 3));
    next.parentId = newParentId;
    next.children = [];
    copied.push(next);
    for (const childId of node.children) {
      const child = page.nodes[childId];
      if (!child) continue;
      const copiedChild = copyTree(child, next.id);
      next.children.push(copiedChild.id);
    }
    return next;
  };

  const instance = createNode({
    type: "instance",
    name: component.name,
    parentId,
    componentId: component.id,
    variantProps: Object.fromEntries(
      component.props.map((p) => [p.name, String(p.default)]),
    ),
    size: { width: sourceRoot.size.width, height: sourceRoot.size.height },
  });
  const body = copyTree(
    { ...sourceRoot, id: "tmp", parentId: instance.id, type: "container" },
    instance.id,
  );
  instance.children = [body.id];
  const nodes: Record<string, DesignNode> = {
    [instance.id]: instance,
    [body.id]: body,
  };
  for (const c of copied) if (c.id !== body.id) nodes[c.id] = c;
  return { instance, copiedIds: Object.keys(nodes) };
}
