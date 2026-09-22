import { clone, createNode } from "./nodes";
import type {
  DesignDocument,
  DesignNode,
  Page,
  VisualDna,
} from "./types";

/**
 * §28 / §29 多方案。一条方案 = 一个结构方向 + 一套视觉语言，两个轴各自能单独搬走。
 *
 * 之所以必须先拆成这两个轴：用户说"取 A 的布局 + C 的视觉"时，模型里得真的存在
 * 两件可以各自搬走的东西，否则那句话没有指代。布局 = pages/nodes 的排布；
 * 视觉语言 = token 值 + visualDna。这也要求节点一律引用 token（§12）而不是写死颜色——
 * 换语言只需要换 token，不需要遍历节点。
 *
 * 这里只有确定性的排布与配色，没有任何"看起来像 AI 输出"的随机数：
 * 同一份输入永远得到同一组方案（§159）。真实 provider 接入后替换的是"往哪个方向改"，
 * 不是这套结构与 token 的表示方式。
 */

export interface ConceptLanguage {
  key: string;
  label: string;
  /**
   * 颜色：默认值 + light/dark 各写一遍。只写 value 的话，文档一旦停在某个 mode 上
   * 这套语言就不成立了，所以三个值一起给（token 没有对应 mode 时只落 value）。
   */
  colors: Record<string, { value: string; light?: string; dark?: string }>;
  fonts: Record<string, string>;
  descriptors: string[];
  motion: VisualDna["motion"];
}

export interface ConceptStructure {
  key: string;
  label: string;
  /** 一句话说明这个方向改了什么，卡片标题与快照 label 都用它 */
  note: string;
  /** 就地改 page（调用方给的是副本）；返回"没能生效"的说明，不静默丢弃 */
  apply(page: Page): string[];
}

export interface ConceptSpec {
  letter: string;
  name: string;
  /** 建议的分支名；服务端撞上重名时会自己加序号 */
  branchName: string;
  structureKey: string;
  structureLabel: string;
  languageKey: string;
  languageLabel: string;
  document: DesignDocument;
  notes: string[];
}

const SANS = 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
const SERIF = 'Georgia, "Songti SC", "Source Han Serif SC", serif';
const MONO = '"JetBrains Mono", Consolas, monospace';
const ROUNDED = 'ui-rounded, "Hiragino Maru Gothic ProN", Quicksand, Inter, sans-serif';

export const CONCEPT_LANGUAGES: ConceptLanguage[] = [
  {
    key: "editorial",
    label: "编辑部 · 纸面",
    colors: {
      "color.background": { value: "#f7f5f0", light: "#f7f5f0", dark: "#141311" },
      "color.surface": { value: "#ffffff", light: "#ffffff", dark: "#1e1c19" },
      "color.surface-2": { value: "#efece3", light: "#efece3", dark: "#272420" },
      "color.text": { value: "#17150f", light: "#17150f", dark: "#f4f0e6" },
      "color.text-muted": { value: "#6b6558", light: "#6b6558", dark: "#a8a094" },
      "color.primary": { value: "#1f4d3a", light: "#1f4d3a", dark: "#79c2a0" },
      "color.on-primary": { value: "#ffffff", light: "#ffffff", dark: "#0f1f18" },
      "color.accent": { value: "#9c4525", light: "#9c4525", dark: "#e08a5f" },
      "color.border": { value: "#ddd7c9", light: "#ddd7c9", dark: "#332f29" },
    },
    fonts: { "font.heading": SERIF, "font.body": SANS },
    descriptors: ["纸面", "衬线标题", "深绿主色", "克制"],
    motion: { character: "slow-cinematic", notes: ["淡入", "不做弹跳"] },
  },
  {
    key: "cinematic",
    label: "影院 · 暗色",
    colors: {
      "color.background": { value: "#05060a", light: "#0b0c12", dark: "#05060a" },
      "color.surface": { value: "#0d1018", light: "#141824", dark: "#0d1018" },
      "color.surface-2": { value: "#171d2b", light: "#1d2434", dark: "#171d2b" },
      "color.text": { value: "#f5f7ff", light: "#eef1f8", dark: "#f5f7ff" },
      "color.text-muted": { value: "#98a2bd", light: "#93a0ba", dark: "#98a2bd" },
      "color.primary": { value: "#f5b451", light: "#c9821b", dark: "#f5b451" },
      "color.on-primary": { value: "#1b1205", light: "#1b1205", dark: "#1b1205" },
      "color.accent": { value: "#7dd3fc", light: "#7dd3fc", dark: "#7dd3fc" },
      "color.border": { value: "#1f2735", light: "#c9cfdb", dark: "#1f2735" },
    },
    fonts: { "font.heading": SANS, "font.body": SANS },
    descriptors: ["近黑底", "琥珀主色", "大字号", "电影感"],
    motion: { character: "slow-cinematic", notes: ["缓慢推近", "长淡入"] },
  },
  {
    key: "cyber",
    label: "赛博 · 霓虹",
    colors: {
      // light 模式三件套要成套：背景给浅底，否则浅底 surface + 深墨字压在深底上直接不可读
      "color.background": { value: "#04070d", light: "#f5f8fb", dark: "#04070d" },
      "color.surface": { value: "#0a1220", light: "#e6edf5", dark: "#0a1220" },
      "color.surface-2": { value: "#101c2e", light: "#d5dfeb", dark: "#101c2e" },
      "color.text": { value: "#e6f7ff", light: "#0b1a24", dark: "#e6f7ff" },
      "color.text-muted": { value: "#7f9bb3", light: "#4c6274", dark: "#7f9bb3" },
      "color.primary": { value: "#22d3ee", light: "#0b6a84", dark: "#22d3ee" },
      "color.on-primary": { value: "#04252b", light: "#ffffff", dark: "#04252b" },
      "color.accent": { value: "#a3ff12", light: "#2d5f0a", dark: "#a3ff12" },
      "color.border": { value: "#17293c", light: "#b9c6d4", dark: "#17293c" },
    },
    fonts: { "font.heading": MONO, "font.body": MONO },
    descriptors: ["等宽字体", "青色霓虹", "直角", "终端感"],
    motion: { character: "snappy", notes: ["瞬时切换", "扫描线"] },
  },
  {
    key: "warm",
    label: "暖阳 · 圆润",
    colors: {
      "color.background": { value: "#fff8f0", light: "#fff8f0", dark: "#1a120c" },
      "color.surface": { value: "#fffdf9", light: "#fffdf9", dark: "#241a12" },
      "color.surface-2": { value: "#ffeede", light: "#ffeede", dark: "#2f2216" },
      "color.text": { value: "#2a1a12", light: "#2a1a12", dark: "#ffeee0" },
      "color.text-muted": { value: "#8a6a58", light: "#8a6a58", dark: "#c0a08c" },
      "color.primary": { value: "#ea580c", light: "#ea580c", dark: "#fb923c" },
      // 亮橙按钮上白字只有 3.35:1，过不了 AA：这套语言的按钮字改深棕
      "color.on-primary": { value: "#2b1204", light: "#2b1204", dark: "#2b1102" },
      "color.accent": { value: "#0f766e", light: "#0f766e", dark: "#5eead4" },
      "color.border": { value: "#f0dcc8", light: "#f0dcc8", dark: "#3d2c1f" },
    },
    fonts: { "font.heading": ROUNDED, "font.body": ROUNDED },
    descriptors: ["奶油底", "橙色主色", "圆角", "亲和"],
    motion: { character: "playful", notes: ["轻微弹性", "错峰入场"] },
  },
];

function heroOf(page: Page): DesignNode | null {
  const root = page.nodes[page.rootId];
  if (!root) return null;
  for (const id of root.children) {
    const node = page.nodes[id];
    if (node && node.type === "section" && node.visible) return node;
  }
  return null;
}

function textKids(page: Page, node: DesignNode): DesignNode[] {
  return node.children
    .map((id) => page.nodes[id])
    .filter((n): n is DesignNode => !!n && n.type === "text");
}

/** 把 parent 的若干子节点整体搬到 child 里（保持顺序） */
function reparent(page: Page, parent: DesignNode, ids: string[], child: DesignNode): void {
  child.children = ids.filter((id) => parent.children.includes(id));
  parent.children = parent.children.filter((id) => !ids.includes(id));
  for (const id of child.children) {
    const node = page.nodes[id];
    if (node) node.parentId = child.id;
  }
}

function add(page: Page, parent: DesignNode, node: DesignNode): DesignNode {
  page.nodes[node.id] = node;
  node.parentId = parent.id;
  parent.children.push(node.id);
  return node;
}

/** 插到 parent 的第 index 个子节点之前（导航条要在首屏前面） */
function insertAt(page: Page, parent: DesignNode, node: DesignNode, index: number): DesignNode {
  add(page, parent, node);
  parent.children = parent.children.filter((id) => id !== node.id);
  parent.children.splice(Math.max(0, index), 0, node.id);
  return node;
}

export const CONCEPT_STRUCTURES: ConceptStructure[] = [
  {
    key: "centered",
    label: "居中开场",
    note: "首屏整体居中，标题收紧、留白加大",
    apply(page) {
      const hero = heroOf(page);
      if (!hero) return ["页面里没有可居中的 section，这个方向没有改动结构。"];
      hero.layout = {
        ...hero.layout,
        mode: "vertical",
        gap: 20,
        items: "center",
        justify: "center",
        padding: { top: 112, right: 48, bottom: 112, left: 48 },
      };
      for (const text of textKids(page, hero)) {
        if (text.typography) text.typography = { ...text.typography, align: "center" };
      }
      for (const id of hero.children) {
        const node = page.nodes[id];
        if (node && node.type === "container") node.layout = { ...node.layout, justify: "center" };
      }
      return [];
    },
  },
  {
    key: "split",
    label: "左右分栏",
    note: "文案收成左栏，右栏给视觉主体留位",
    apply(page) {
      const hero = heroOf(page);
      if (!hero) return ["页面里没有首屏 section，无法拆成两栏。"];
      const copyIds = hero.children.filter((id) => page.nodes[id] && page.nodes[id]!.type !== "section");
      if (!copyIds.length) return ["首屏里没有可收进左栏的内容。"];
      const copy = createNode({
        type: "container",
        name: "Copy",
        size: { width: "fill", height: "hug" },
        layout: { mode: "vertical", gap: 18, items: "start", padding: { top: 0, right: 0, bottom: 0, left: 0 } },
      });
      add(page, hero, copy);
      reparent(page, hero, copyIds, copy);
      const visual = createNode({
        type: "card",
        name: "Visual",
        size: { width: 560, height: 380 },
        layout: { mode: "vertical", gap: 8, items: "center", justify: "center", padding: { top: 24, right: 24, bottom: 24, left: 24 } },
        style: {
          fills: [{ kind: "solid", color: "{color.surface-2}" }],
          strokes: [{ paints: [{ kind: "solid", color: "{color.border}" }], width: 1, position: "inside" }],
        },
      });
      add(page, hero, visual);
      add(
        page,
        visual,
        createNode({
          type: "text",
          name: "Visual Note",
          text: "视觉主体位（资产服务接入前先占位）",
          size: { width: "hug", height: "hug" },
          style: { fills: [{ kind: "solid", color: "{color.text-muted}" }] },
          typography: {
            fontFamily: "{font.body}",
            fontSize: 14,
            fontWeight: 400,
            lineHeight: 1.5,
            letterSpacing: 0,
            align: "center",
            verticalAlign: "top",
          },
        }),
      );
      hero.layout = {
        ...hero.layout,
        mode: "horizontal",
        gap: 56,
        items: "center",
        justify: "space-between",
        padding: { top: 96, right: 64, bottom: 96, left: 64 },
      };
      // 顺序：先放文案再放视觉主体，reparent 之后 hero.children 只剩 visual
      hero.children = [copy.id, visual.id];
      return [];
    },
  },
  {
    key: "cards",
    label: "三卡并列",
    note: "首屏下方补一组三列亮点卡片",
    apply(page) {
      const root = page.nodes[page.rootId];
      const hero = heroOf(page);
      if (!root || !hero) return ["页面里没有首屏 section，卡片区块没有插入点。"];
      const section = createNode({
        type: "section",
        name: "Highlights",
        size: { width: "fill", height: "hug" },
        layout: {
          mode: "vertical",
          gap: 28,
          items: "stretch",
          padding: { top: 72, right: 64, bottom: 88, left: 64 },
        },
        style: { fills: [{ kind: "solid", color: "{color.background}" }] },
      });
      insertAt(page, root, section, root.children.indexOf(hero.id) + 1);
      add(
        page,
        section,
        createNode({
          type: "text",
          name: "Highlights Title",
          text: "为什么是 NEXUS",
          size: { width: "hug", height: "hug" },
          style: { fills: [{ kind: "solid", color: "{color.text}" }] },
          typography: {
            fontFamily: "{font.heading}",
            fontSize: 34,
            fontWeight: 700,
            lineHeight: 1.2,
            letterSpacing: -0.5,
            align: "left",
            verticalAlign: "top",
          },
        }),
      );
      const grid = createNode({
        type: "grid",
        name: "Highlights Grid",
        size: { width: "fill", height: "hug" },
        layout: { mode: "grid", columns: 3, gap: 24, items: "stretch" },
      });
      add(page, section, grid);
      const titles = ["设计模型即真值", "代码与画布同源", "发布前有质检"];
      const bodies = [
        "改一次模型，画布、代码与预览一起更新。",
        "生成的 React 可编译，改回去也认得。",
        "无障碍、性能与视觉回归不过关就拦住。",
      ];
      for (let i = 0; i < 3; i += 1) {
        const card = createNode({
          type: "card",
          name: `Highlight ${i + 1}`,
          size: { width: "fill", height: "hug" },
          layout: {
            mode: "vertical",
            gap: 12,
            items: "start",
            padding: { top: 28, right: 28, bottom: 28, left: 28 },
          },
          style: {
            fills: [{ kind: "solid", color: "{color.surface}" }],
            strokes: [{ paints: [{ kind: "solid", color: "{color.border}" }], width: 1, position: "inside" }],
          },
        });
        add(page, grid, card);
        add(
          page,
          card,
          createNode({
            type: "text",
            name: `Highlight Title ${i + 1}`,
            text: titles[i]!,
            size: { width: "fill", height: "hug" },
            style: { fills: [{ kind: "solid", color: "{color.text}" }] },
            typography: {
              fontFamily: "{font.heading}",
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 1.35,
              letterSpacing: 0,
              align: "left",
              verticalAlign: "top",
            },
          }),
        );
        add(
          page,
          card,
          createNode({
            type: "text",
            name: `Highlight Body ${i + 1}`,
            text: bodies[i]!,
            size: { width: "fill", height: "hug" },
            style: { fills: [{ kind: "solid", color: "{color.text-muted}" }] },
            typography: {
              fontFamily: "{font.body}",
              fontSize: 15,
              fontWeight: 400,
              lineHeight: 1.6,
              letterSpacing: 0,
              align: "left",
              verticalAlign: "top",
            },
          }),
        );
      }
      return [];
    },
  },
  {
    key: "nav-led",
    label: "导航开场",
    note: "首屏之前加一条顶部导航，开场更紧凑",
    apply(page) {
      const root = page.nodes[page.rootId];
      const hero = heroOf(page);
      if (!root || !hero) return ["页面里没有首屏 section，导航条没有插入点。"];
      const bar = createNode({
        type: "section",
        name: "Top Bar",
        size: { width: "fill", height: "hug" },
        layout: {
          mode: "horizontal",
          gap: 24,
          items: "center",
          justify: "space-between",
          padding: { top: 20, right: 48, bottom: 20, left: 48 },
        },
        style: {
          fills: [{ kind: "solid", color: "{color.surface}" }],
          strokes: [{ paints: [{ kind: "solid", color: "{color.border}" }], width: 1, position: "inside" }],
        },
      });
      insertAt(page, root, bar, 0);
      add(
        page,
        bar,
        createNode({
          type: "text",
          name: "Brand",
          text: "NEXUS",
          size: { width: "hug", height: "hug" },
          style: { fills: [{ kind: "solid", color: "{color.text}" }] },
          typography: {
            fontFamily: "{font.heading}",
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 1.3,
            letterSpacing: 1,
            align: "left",
            verticalAlign: "top",
          },
        }),
      );
      const links = createNode({
        type: "container",
        name: "Nav",
        size: { width: "hug", height: "hug" },
        layout: { mode: "horizontal", gap: 28, items: "center" },
      });
      add(page, bar, links);
      for (const label of ["产品", "模板", "定价"]) {
        add(
          page,
          links,
          createNode({
            type: "text",
            name: `Nav ${label}`,
            text: label,
            size: { width: "hug", height: "hug" },
            style: { fills: [{ kind: "solid", color: "{color.text-muted}" }] },
            typography: {
              fontFamily: "{font.body}",
              fontSize: 15,
              fontWeight: 500,
              lineHeight: 1.5,
              letterSpacing: 0,
              align: "left",
              verticalAlign: "top",
            },
          }),
        );
      }
      add(
        page,
        bar,
        createNode({
          type: "button",
          name: "Nav CTA",
          text: "开始使用",
          size: { width: "hug", height: 40 },
          layout: { padding: { top: 8, right: 20, bottom: 8, left: 20 } },
          style: { fills: [{ kind: "solid", color: "{color.primary}" }] },
          typography: {
            fontFamily: "{font.body}",
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.5,
            letterSpacing: 0,
            align: "center",
            verticalAlign: "top",
            color: "{color.on-primary}",
          },
        }),
      );
      hero.layout = {
        ...hero.layout,
        padding: { ...hero.layout.padding, top: 56 },
      };
      return [];
    },
  },
];

const LETTERS = "ABCDEFGH";

function languageOf(index: number): ConceptLanguage {
  return CONCEPT_LANGUAGES[index % CONCEPT_LANGUAGES.length]!;
}

function structureOf(index: number): ConceptStructure {
  return CONCEPT_STRUCTURES[index % CONCEPT_STRUCTURES.length]!;
}

/**
 * 把一套视觉语言落到文档上：只改 token 值与 visualDna，一个节点都不碰。
 * 文档里没有的 token 会如实记进 notes——不假装改好了。
 */
export function applyConceptLanguage(
  source: DesignDocument,
  language: ConceptLanguage,
): { document: DesignDocument; notes: string[] } {
  const document = clone(source);
  const notes: string[] = [];
  const wanted: [string, unknown][] = [
    ...Object.entries(language.colors).map(([key, spec]) => [key, spec.value] as [string, unknown]),
    ...Object.entries(language.fonts),
  ];
  const applied: string[] = [];
  for (const [key, value] of wanted) {
    const token = document.tokens.find((t) => t.key === key);
    if (!token) {
      notes.push(`文档里没有 ${key} 这个 token，这套视觉语言的这一项没有落上去。`);
      continue;
    }
    token.value = value;
    const spec = language.colors[key];
    if (token.modes && spec) {
      // 语言没给某个 mode 就退回它自己的基准值：留着上一个 mode 值等于让上一套配色
      // 从主题的缝里渗出来，那样"换视觉语言"就没换干净
      for (const mode of Object.keys(token.modes)) {
        const next =
          mode === "light" ? (spec.light ?? spec.value) : mode === "dark" ? (spec.dark ?? spec.value) : undefined;
        if (next) token.modes[mode] = next;
      }
    }
    applied.push(key);
  }
  const palette = Object.entries(language.colors).map(([role, spec]) => ({
    role: role.replace(/^color\./, ""),
    color: spec.value,
  }));
  const heading = language.fonts["font.heading"];
  const radiusToken = document.tokens.find((t) => t.key === "radius.lg")?.value;
  document.visualDna = {
    source: { method: "concept-language", extractedAt: new Date().toISOString() },
    palette,
    typography: [
      { role: "heading", fontFamily: heading ?? SANS, fontSize: 56, fontWeight: 700 },
      { role: "body", fontFamily: language.fonts["font.body"] ?? SANS, fontSize: 16, fontWeight: 400 },
    ],
    spacingScale: [4, 8, 12, 16, 24, 32, 48, 64, 96],
    // 圆角照抄文档自己的 token：语言不假装能换圆角——起手页的圆角是写死在节点上的
    radius: typeof radiusToken === "number" ? radiusToken : 16,
    shadow: "0 8px 24px rgba(0,0,0,.32)",
    motion: language.motion,
    hierarchy: ["导航", "标题", "副文案", "行动点"],
    descriptors: [...language.descriptors],
  };
  if (!applied.length) notes.push("这套语言一个 token 都没匹配上，方案之间只会有结构差异。");
  return { document, notes };
}

/** 把某个结构方向落到文档的活动页面上（§16：改的仍然是模型本身） */
export function applyConceptStructure(
  source: DesignDocument,
  structure: ConceptStructure,
): { document: DesignDocument; notes: string[] } {
  const document = clone(source);
  const page =
    document.pages.find((p) => p.id === document.activePageId) ?? document.pages[0];
  if (!page) return { document, notes: ["这份文档还没有页面，结构方向没有落上去。"] };
  return { document, notes: structure.apply(page) };
}

/** §29 "Combine A's layout with C's visual style"：结构取自 layout 那份，视觉取自 visual 那份 */
export function mergeConceptDocuments(
  layoutSource: DesignDocument,
  visualSource: DesignDocument,
  name?: string,
): { document: DesignDocument; notes: string[] } {
  const document = clone(layoutSource);
  const notes: string[] = [];
  document.tokens = clone(visualSource.tokens);
  if (visualSource.visualDna) document.visualDna = clone(visualSource.visualDna);
  else notes.push("视觉来源里没有 visualDna，只搬了 token 值。");
  if (visualSource.brandKit) document.brandKit = clone(visualSource.brandKit);
  if (name) document.name = name;
  return { document, notes };
}

/**
 * 生成 count 条方案：第 i 条 = 结构 i + 语言 i，两个轴同时换，所以并排看一定有差别。
 * 顺序固定（不随机），因此同一份文档每次生成的 A/B/C/D 是同一组方向。
 */
export function buildConcepts(source: DesignDocument, count = CONCEPT_STRUCTURES.length): ConceptSpec[] {
  const total = Math.max(1, Math.min(LETTERS.length, Math.round(count)));
  const specs: ConceptSpec[] = [];
  for (let i = 0; i < total; i += 1) {
    const structure = structureOf(i);
    const language = languageOf(i);
    const letter = LETTERS[i]!;
    const structured = applyConceptStructure(source, structure);
    const lang = applyConceptLanguage(structured.document, language);
    const document = lang.document;
    // 刻意不改 document.name：方案名是分支与快照的事，采纳一条方向不该顺手把项目改名
    specs.push({
      letter,
      name: `方案 ${letter}`,
      branchName: `concept-${letter.toLowerCase()}`,
      structureKey: structure.key,
      structureLabel: structure.label,
      languageKey: language.key,
      languageLabel: language.label,
      document,
      notes: [...structured.notes, ...lang.notes],
    });
  }
  return specs;
}
