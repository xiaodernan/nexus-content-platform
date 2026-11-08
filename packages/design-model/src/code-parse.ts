/**
 * Code → Design（§17-19）：受限 JSX 子集 → 设计模型补丁。
 *
 * 这不是通用 JSX 编译器。只接受生成器自己产出的那一类元素：带 data-nexus-id、
 * className 是 Tailwind 白名单子集、children 是嵌套元素或字面量文本。
 * 越界的东西一律如实报告（unmapped / issues），不静默丢弃、不假装成功（§159）；
 * 无法映射的片段留在代码里，节点侧就是 code-only 区域（§19）。
 *
 * 本包禁止 import React / DOM / fs；也不 import typescript —— 解析器要打进 Studio 的包。
 */

import { childrenOf, clone, getByPath, sameValue, setOnObject } from "./nodes";
import {
  DISPLAY_CLASSES,
  generatePageComponent,
  ITEMS_CLASS as ITEMS_CLASS_BY_VALUE,
  JUSTIFY_CLASS as JUSTIFY_CLASS_BY_VALUE,
  PADDING_SIDES,
  REVERSE_CLASS,
} from "./codegen";
import { applyResponsive, applyResponsiveBelow, declaredLayoutKeys } from "./layout";
import { ALIGNABLE_MODES, RESPONSIVE_PATCH_GROUPS } from "./types";
import { STATE_VARIANT } from "./states";
import type { NodeState, NodeStates, NodeStateStyle } from "./states";
import type { PatchOp } from "./patch";
import type {
  BreakpointName,
  ColorValue,
  CornerRadius,
  DesignNode,
  Effect,
  Layout,
  LayoutMode,
  LengthValue,
  Page,
  Paint,
  SizeValue,
  TokenRef,
  Stroke,
  Style,
  Token,
  Typography,
} from "./types";

// ---------------------------------------------------------------------------
// 1. 受限 JSX 解析
// ---------------------------------------------------------------------------

export interface JsxElement {
  tag: string;
  /** 字符串字面量属性：className / type / src / data-nexus-id … */
  attrs: Record<string, string>;
  /** `attr={...}` 形式的表达式属性（原样保留，不解释含义） */
  exprAttrs: Record<string, string>;
  /** 展开属性 `{...props}`：出现即越界 */
  spreads: string[];
  /** 字量子元素（JSX 文本与 `{"..."}`），用于还原文案 */
  literals: string[];
  children: JsxElement[];
  /** 1 基行号；0 表示源码里没有对应元素 */
  line: number;
  selfClosing: boolean;
}

export interface ParseIssue {
  line: number;
  message: string;
}

export interface JsxParseResult {
  root: JsxElement | null;
  issues: ParseIssue[];
}

const TAG_NAME = /^[A-Za-z][A-Za-z0-9_.-]*/;
const ATTR_NAME = /^[A-Za-z_][A-Za-z0-9_:.-]*/;

class Scanner {
  private i = 0;
  private line = 1;

  constructor(readonly src: string) {}

  get lineNo(): number {
    return this.line;
  }

  get pos(): number {
    return this.i;
  }

  eof(): boolean {
    return this.i >= this.src.length;
  }

  peek(offset = 0): string {
    return this.src[this.i + offset] ?? "";
  }

  starts(text: string): boolean {
    return this.src.startsWith(text, this.i);
  }

  take(n: number): void {
    for (let k = 0; k < n && this.i < this.src.length; k += 1) {
      if (this.src[this.i] === "\n") this.line += 1;
      this.i += 1;
    }
  }

  skipWhitespace(): void {
    while (!this.eof() && /\s/.test(this.peek())) this.take(1);
  }

  match(re: RegExp): RegExpExecArray | null {
    const m = re.exec(this.src.slice(this.i));
    if (!m || m.index !== 0) return null;
    this.take(m[0].length);
    return m;
  }

  /** 读到下一个元素或表达式为止，返回原始文本（JSX 文本节点） */
  readText(): string {
    const start = this.i;
    while (!this.eof() && this.peek() !== "<" && this.peek() !== "{") this.take(1);
    return this.src.slice(start, this.i);
  }

  /**
   * 读取 `{}` 包裹的内容，返回去掉外层花括号后的原文。
   * 花括号按字符串字面量感知配对；未配对返回 null。
   */
  readBraced(): string | null {
    if (this.peek() !== "{") return null;
    const start = this.i;
    let depth = 0;
    let quote = "";
    while (!this.eof()) {
      const c = this.peek();
      if (quote) {
        if (c === "\\") this.take(2);
        else if (c === quote) {
          quote = "";
          this.take(1);
        } else this.take(1);
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        quote = c;
        this.take(1);
        continue;
      }
      if (c === "{" || c === "(" || c === "[") depth += 1;
      if (c === "}" || c === ")" || c === "]") {
        depth -= 1;
        if (depth === 0) {
          this.take(1);
          return this.src.slice(start + 1, this.i - 1);
        }
      }
      this.take(1);
    }
    return null;
  }
}

/** 只有字符串常量算作字面量；其它表达式返回 null */
function stringLiteral(expr: string): string | null {
  const trimmed = expr.trim();
  if (/^".*"$/.test(trimmed)) {
    try {
      const value: unknown = JSON.parse(trimmed);
      return typeof value === "string" ? value : null;
    } catch {
      return null;
    }
  }
  if (/^'.*'$/.test(trimmed)) return trimmed.slice(1, -1).replace(/\\'/g, "'");
  return null;
}

const decodeEntities = (value: string): string =>
  value.replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/** 属性值用引号定界，与 JSX 文本的空白折叠规则不同 */
function readQuoted(s: Scanner, quote: string): string {
  const start = s.pos;
  while (!s.eof() && s.peek() !== quote) s.take(1);
  const value = s.src.slice(start, s.pos);
  if (s.peek() === quote) s.take(1);
  return value;
}

function parseAttributes(el: JsxElement, s: Scanner): void {
  for (;;) {
    s.skipWhitespace();
    if (s.eof() || s.peek() === "/" || s.peek() === ">") return;
    if (s.peek() === "{") {
      const expr = s.readBraced();
      if (expr === null) return;
      const spread = /^\.\.\.\s*([A-Za-z_$][\w$]*)/.exec(expr.trim());
      if (spread) el.spreads.push(spread[1]!);
      else el.exprAttrs["{}"] = expr.trim();
      continue;
    }
    const name = s.match(ATTR_NAME);
    if (!name) {
      s.take(1);
      continue;
    }
    s.skipWhitespace();
    if (s.peek() !== "=") {
      el.attrs[name[0]] = "";
      continue;
    }
    s.take(1);
    s.skipWhitespace();
    const quote = s.peek();
    if (quote === '"' || quote === "'") {
      s.take(1);
      el.attrs[name[0]] = decodeEntities(readQuoted(s, quote));
      continue;
    }
    if (quote === "{") {
      const expr = s.readBraced();
      if (expr === null) return;
      el.exprAttrs[name[0]] = expr.trim();
      continue;
    }
    el.attrs[name[0]] = "";
  }
}

/**
 * 递归下钻的层数上限。生成器产出的单组件结构很浅（个位数层），128 层是极宽裕的上界；
 * 它的作用是挡住"病态深嵌套 JSX 让 parseElement↔parseChildren 递归栈溢出"——
 * 代码视图里粘贴一段几万层 `<div>` 就会触发 RangeError，而这里只该回一条 issue，不该崩。
 */
const MAX_JSX_DEPTH = 128;

function parseChildren(s: Scanner, issues: ParseIssue[], depth: number): {
  literals: string[];
  children: JsxElement[];
} {
  const literals: string[] = [];
  const children: JsxElement[] = [];
  let pending = "";
  const flush = (): void => {
    // JSX 规则：含换行的空白被折叠，行首尾空白去掉
    const text = pending
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ");
    if (text) literals.push(text);
    pending = "";
  };
  for (;;) {
    if (s.eof()) {
      flush();
      issues.push({ line: s.lineNo, message: "标签未闭合" });
      return { literals, children };
    }
    if (s.starts("</")) {
      flush();
      return { literals, children };
    }
    if (s.peek() === "<") {
      flush();
      const child = parseElement(s, issues, depth);
      if (child) children.push(child);
      continue;
    }
    if (s.peek() === "{") {
      const line = s.lineNo;
      const expr = s.readBraced();
      if (expr === null) {
        flush();
        issues.push({ line, message: "表达式花括号未配对" });
        return { literals, children };
      }
      const trimmed = expr.trim();
      if (/^\/\*[\s\S]*\*\/$/.test(trimmed)) continue; // 生成器的说明注释不是内容
      const literal = stringLiteral(trimmed);
      if (literal !== null) {
        pending += literal;
        continue;
      }
      flush();
      issues.push({
        line,
        message: `子节点表达式 {${trimmed.slice(0, 40)}} 不是字面量，超出受支持 JSX 子集`,
      });
      continue;
    }
    pending += s.readText();
  }
}

function parseElement(s: Scanner, issues: ParseIssue[], depth: number): JsxElement | null {
  if (s.peek() !== "<") return null;
  const line = s.lineNo;
  s.take(1);
  const tag = s.match(TAG_NAME);
  if (!tag) {
    issues.push({ line, message: "< 后面不是标签名，超出受支持 JSX 子集" });
    return null;
  }
  const el: JsxElement = {
    tag: tag[0],
    attrs: {},
    exprAttrs: {},
    spreads: [],
    literals: [],
    children: [],
    line,
    selfClosing: false,
  };
  parseAttributes(el, s);
  s.skipWhitespace();
  if (s.peek() === "/" && s.peek(1) === ">") {
    s.take(2);
    el.selfClosing = true;
    return el;
  }
  if (s.peek() !== ">") {
    issues.push({ line: s.lineNo, message: `<${el.tag}> 的属性区无法解析` });
    return el;
  }
  if (depth >= MAX_JSX_DEPTH) {
    issues.push({ line, message: `嵌套超过 ${MAX_JSX_DEPTH} 层：超出受支持 JSX 子集（防止递归过深）` });
    // 不再下钻：把这一层当叶子返回；消费掉 '>'，剩下的子节点由上层继续消费
    // （每个 '<' 只消费一次，所以不会死循环，递归栈也停在 MAX_JSX_DEPTH）。
    if (s.peek() === ">") s.take(1);
    return el;
  }
  s.take(1);
  const body = parseChildren(s, issues, depth + 1);
  el.literals = body.literals;
  el.children = body.children;
  if (s.starts("</")) {
    s.take(2);
    const close = s.match(TAG_NAME);
    if (close && close[0] !== el.tag) {
      issues.push({ line: s.lineNo, message: `</${close[0]}> 与 <${el.tag}> 不匹配` });
    }
    s.skipWhitespace();
    if (s.peek() === ">") s.take(1);
  }
  return el;
}

/** 解析组件源码里的那一棵受限 JSX 树：只认 `return (...)` 之后的内容 */
export function parseJsx(source: string): JsxParseResult {
  const issues: ParseIssue[] = [];
  const at = source.indexOf("return (");
  if (at < 0) {
    return {
      root: null,
      issues: [
        { line: 1, message: "找不到 return (：只能编辑生成器产出的单组件结构" },
      ],
    };
  }
  const s = new Scanner(source.slice(at + "return (".length));
  let root: JsxElement | null = null;
  for (;;) {
    s.skipWhitespace();
    if (s.eof() || s.peek() === ")" || s.starts("</")) break;
    if (s.peek() === "<") {
      const el = parseElement(s, issues, 0);
      if (!el) continue;
      if (root) {
        issues.push({ line: el.line, message: "组件里有第二个根元素" });
        continue;
      }
      root = el;
      continue;
    }
    s.take(1);
  }
  return { root, issues };
}

// ---------------------------------------------------------------------------
// 2. 类名 → 模型属性（codegen 的反向）
// ---------------------------------------------------------------------------

const DEFAULT_PREFIX = "nx";

const WEIGHT_CLASS: Record<string, number> = {
  "font-thin": 100,
  "font-extralight": 200,
  "font-light": 300,
  "font-normal": 400,
  "font-medium": 500,
  "font-semibold": 600,
  "font-bold": 700,
  "font-extrabold": 800,
  "font-black": 900,
};

/**
 * 类名 → 模型值：从 codegen 那两张表（值 → 类名）反推，不手抄第二份。
 * 手抄的逆表在发射侧改拼法时只会静默读不回来，而 `DISPLAY_CLASSES` 那边已经立过同一条规矩
 * （docs/adr/0069 第四片：拼法只有一份）。
 */
function invert<V extends string>(table: Record<V, string>): Record<string, V> {
  const out: Record<string, V> = {};
  for (const value of Object.keys(table) as V[]) out[table[value]] = value;
  return out;
}

const JUSTIFY_CLASS = invert(JUSTIFY_CLASS_BY_VALUE);
const ITEMS_CLASS = invert(ITEMS_CLASS_BY_VALUE);

const ALIGN_CLASS: Record<string, Typography["align"]> = {
  "text-left": "left",
  "text-center": "center",
  "text-right": "right",
  "text-justify": "justify",
};

const CASE_CLASS: Record<string, NonNullable<Typography["textCase"]>> = {
  uppercase: "upper",
  lowercase: "lower",
  capitalize: "title",
};

const VARIANTS: [string, BreakpointName][] = [
  ["md:", "tablet"],
  ["lg:", "desktop"],
  ["xl:", "wide"],
];

const VARIANT_PREFIX: Record<BreakpointName, string> = {
  mobile: "",
  tablet: "md:",
  desktop: "lg:",
  wide: "xl:",
};

/** 状态变体前缀 → 状态名：从 STATE_VARIANT 反推，不手抄第二份表（ADR-0062） */
const STATE_VARIANTS: [string, NodeState][] = (
  Object.entries(STATE_VARIANT) as [NodeState, string][]
).map(([state, prefix]) => [prefix, state]);

/** 随父容器语义变化的尺寸类：父级本次也被改时不核对，避免误判 */
const PARENT_SCOPED = new Set(["flex-1", "self-stretch", "w-fit", "h-fit", "w-full", "h-full"]);

const BLEND_MODES = new Set<Style["blendMode"]>([
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "soft-light",
  "hard-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
]);

const CURSORS = new Set<Style["cursor"]>([
  "default",
  "pointer",
  "text",
  "not-allowed",
  "grab",
  "grabbing",
]);

export interface CodeParseOptions {
  /** 必须与生成时的 codegen 前缀一致，否则 var(--nx-…) 认不出来 */
  cssVarPrefix?: string;
  /** token 表用于把 var 反解成 {token.key}：key 里也可能含短横线，不能靠猜 */
  tokens?: readonly Token[];
}

interface Ctx {
  prefix: string;
  byKey: Map<string, Token>;
  byDashed: Map<string, Token>;
}

function makeCtx(options: CodeParseOptions): Ctx {
  const byKey = new Map<string, Token>();
  const byDashed = new Map<string, Token>();
  for (const token of options.tokens ?? []) {
    byKey.set(token.key, token);
    byDashed.set(token.key.replace(/\./g, "-"), token);
  }
  return { prefix: options.cssVarPrefix ?? DEFAULT_PREFIX, byKey, byDashed };
}

const escapeRe = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `var(--nx-color-text-muted)` → `{color.text-muted}`；非本生成器产出的变量返回 null */
function tokenRefOf(raw: string, ctx: Ctx): TokenRef | null {
  const m = new RegExp(`^var\\(--${escapeRe(ctx.prefix)}-(.+)\\)$`, "i").exec(raw.trim());
  if (!m) return null;
  const dashed = m[1]!;
  const token = ctx.byDashed.get(dashed);
  return `{${token ? token.key : dashed}}`;
}

function numberOf(raw: string): number | null {
  const m = /^(-?\d+(?:\.\d+)?)(px)?$/.exec(raw.trim());
  return m ? Number(m[1]) : null;
}

/**
 * gap / padding / 圆角：px 数值，或本生成器写出的 dimension token 引用
 * （`var(--nx-space-6)` → `{space.6}`）。后者必须认：模型里的几何现在绑的就是 token（§12），
 * 只认 px 字面量会让 §19 的往返恒等在第一份起手页上就破；而认回引用（不是认成数字）
 * 才不会把已有的 token 绑定改写成常量。
 */
function lengthOrTokenOf(raw: string, ctx: Ctx): LengthValue | null {
  const ref = tokenRefOf(raw, ctx);
  if (ref) {
    const token = ctx.byKey.get(ref.slice(1, -1));
    return token && (token.type === "dimension" || token.type === "number") ? ref : null;
  }
  return numberOf(raw);
}

function colorOf(raw: string, ctx: Ctx): ColorValue | null {
  const ref = tokenRefOf(raw, ctx);
  if (ref) return ref;
  const value = raw.replace(/_/g, " ").trim();
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return value;
  if (/^(rgb|rgba|hsl|hsla)\(/i.test(value)) return value;
  return null;
}

/** `text-[…]` 的双关：字号还是字色，靠 token 类型判定而不是猜变量名 */
function classifyText(raw: string, ctx: Ctx):
  | { kind: "size"; value: number | string }
  | { kind: "color"; value: ColorValue }
  | { kind: "unknown" } {
  const px = numberOf(raw);
  if (px !== null) return { kind: "size", value: px };
  const ref = tokenRefOf(raw, ctx);
  if (ref) {
    const key = ref.slice(1, -1);
    const token = ctx.byKey.get(key);
    if (token) {
      if (token.type === "color") return { kind: "color", value: ref };
      if (token.type === "dimension" || token.type === "number") return { kind: "size", value: ref };
      return { kind: "unknown" };
    }
    return raw.replace(/^var\(--/i, "").includes("color")
      ? { kind: "color", value: ref }
      : { kind: "size", value: ref };
  }
  const color = colorOf(raw, ctx);
  if (color !== null) return { kind: "color", value: color };
  const unit = /^(-?\d+(?:\.\d+)?)(rem|em|%)$/.exec(raw.trim());
  if (unit) return { kind: "size", value: raw.trim() };
  return { kind: "unknown" };
}

interface Hit {
  literal: string;
  value: string;
}

interface UtilityHits {
  arbitrary: Hit[];
  bare: Hit[];
  all: Hit[];
}

/** 消费 `u-[value]` 与 `u-value` 两种形态，并保留原始类名用于核对 */
function takeUtility(list: string[], utility: string): UtilityHits {
  const arbitrary: Hit[] = [];
  const bare: Hit[] = [];
  const head = `${utility}-`;
  const bracket = `${utility}-[`;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const token = list[i]!;
    if (!token.startsWith(head)) continue;
    if (token.startsWith(bracket) && token.endsWith("]")) {
      list.splice(i, 1);
      arbitrary.unshift({ literal: token, value: token.slice(bracket.length, -1) });
      continue;
    }
    const rest = token.slice(head.length);
    if (rest.startsWith("[")) continue;
    list.splice(i, 1);
    bare.unshift({ literal: token, value: rest });
  }
  return { arbitrary, bare, all: [...arbitrary, ...bare] };
}

interface VariantDecode {
  patch: Record<string, unknown>;
  checked: string[];
  unmapped: { token: string; reason: string }[];
}

interface Decode {
  props: Map<string, unknown>;
  /** 已识别、且必须能在重投影里原样再现的类名 */
  checked: string[];
  unmapped: { token: string; reason: string }[];
  responsive: Map<BreakpointName, VariantDecode>;
  states: Map<NodeState, VariantDecode>;
}

/**
 * display 类 → 排布：从 codegen 的 `DISPLAY_CLASSES` 反推，只收**唯一属于一个排布**的那几个。
 * `flex` 竖/横/换行三档都发，认它等于猜，所以它不参与判定（下面照样消费掉，别掉进
 * "不在回写白名单里"那条披露）。两边共用一张表，拼法各抄一份迟早会说谎。
 */
const MODE_OF_DISPLAY_CLASS: Record<string, LayoutMode> = (() => {
  const tally = new Map<string, number>();
  for (const classes of Object.values(DISPLAY_CLASSES)) {
    for (const cls of classes) tally.set(cls, (tally.get(cls) ?? 0) + 1);
  }
  const out: Record<string, LayoutMode> = {};
  for (const [mode, classes] of Object.entries(DISPLAY_CLASSES)) {
    for (const cls of classes) if ((tally.get(cls) ?? 0) === 1) out[cls] = mode as LayoutMode;
  }
  return out;
})();

/** codegen 可能发出来的全部 display 类（含不表态的 `flex`） */
const DISPLAY_CLASS_SET: readonly string[] = [...new Set(Object.values(DISPLAY_CLASSES).flat())];

/**
 * 反向类 → 排布：从发射侧那张 `REVERSE_CLASS` 反推（与 `MODE_OF_DISPLAY_CLASS` 同一条理由，
 * 拼法不抄第二份）。一张表同时说了**方向**与**反向**两件事，所以读回来两个键都写：
 * 只写 `reverse` 会把"作者说这一档是竖排"那一半丢掉，重投影就发不出这条类，
 * 自检认不出 ⇒ 整个节点的回写作废（§19）。
 */
const MODE_OF_REVERSE_CLASS: Record<string, LayoutMode> = (() => {
  const out: Record<string, LayoutMode> = {};
  for (const [mode, cls] of Object.entries(REVERSE_CLASS)) {
    if (cls) out[cls] = mode as LayoutMode;
  }
  return out;
})();

/** `md:p-[…]` 一条管四边，`md:pt-[…]` 一条管一边——边的名字取自 codegen 那张表 */
const ALL_PADDING_SIDES = PADDING_SIDES.map(([side]) => side);

/**
 * 无前缀那组类的基线是「设计 + `mobile` 规则」那份投影（生成侧 `codegen.baselineOf`，§14 第五片）。
 * 回写因此按**声明方**分流：那条规则声明过的键，读出来的值写回那条规则；没声明的键才动设计值。
 * 不分流会怎样：把基线读出的值写进设计值，那条 mobile 规则照样盖在上面——重投影自检认不出
 * 这个类名，整个节点的回写被放弃（§19），作者那次编辑静默消失。
 */
function mobileBaselineOf(node: DesignNode): DesignNode {
  return applyResponsive(node, "mobile");
}

/** `mobile` 那条规则声明过的路径（`layout.padding` 连它下面的四条边一起算） */
function mobileOwnedPaths(responsive: DesignNode["responsive"]): string[] {
  const out: string[] = [];
  for (const rule of responsive ?? []) {
    if (rule.breakpoint !== "mobile") continue;
    for (const [group, value] of Object.entries(rule.patch)) {
      if (group === "visible") {
        out.push("visible");
        continue;
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      for (const key of Object.keys(value)) out.push(`${group}.${key}`);
    }
  }
  return out;
}

/** 响应式覆盖：codegen 只产出这些字段，回写也只接受这些字段 */
function decodeVariant(
  tokens: string[],
  node: DesignNode,
  ctx: Ctx,
  breakpoint: BreakpointName,
  tierParentMode?: string | null,
): VariantDecode {
  const list = [...tokens];
  const out: VariantDecode = { patch: {}, checked: [], unmapped: [] };
  const size: Record<string, unknown> = {};
  const layout: Record<string, unknown> = {};
  const style: Record<string, unknown> = {};
  const typography: Record<string, unknown> = {};
  const note = (token: string, reason: string): void => {
    out.unmapped.push({ token, reason });
  };

  const w = takeUtility(list, "w");
  const h = takeUtility(list, "h");
  for (const [dim, hits] of [
    ["width", w],
    ["height", h],
  ] as const) {
    for (const hit of hits.all) {
      if (hit.value === "full" || hit.value === "fit") {
        size[dim] = hit.value === "full" ? "fill" : "hug";
      } else {
        const parsed = classifyText(hit.value, ctx);
        if (parsed.kind !== "size") {
          note(hit.literal, "响应式尺寸需要 px 数值或 token");
          continue;
        }
        size[dim] = parsed.value;
      }
      out.checked.push(hit.literal);
    }
  }
  const gap = takeUtility(list, "gap");
  for (const hit of gap.all) {
    const n = lengthOrTokenOf(hit.value, ctx);
    if (n === null) note(hit.literal, "gap 需要 px 数值或 space.* token");
    else {
      layout.gap = n;
      out.checked.push(hit.literal);
    }
  }
  const cols = takeUtility(list, "grid-cols");
  for (const hit of cols.all) {
    const m = /^repeat\((\d+),minmax\(0,1fr\)\)$/.exec(hit.value.replace(/\s+/g, ""));
    if (m) {
      layout.columns = Number(m[1]);
      out.checked.push(hit.literal);
    } else note(hit.literal, "只有等分网格能映射回模型");
  }
  // padding：`p-[…]` 一条管四边，`pt/pr/pb/pl-[…]` 一条管一边——边的名字取自 codegen 那张表，
  // 所以一条规则里的 padding 是"这一档写了哪几条边"，未写的边沿用基线（applyResponsive 整键替换
  // 的是 `padding` 这一个键，键里有什么就是什么）。
  const pad: Record<string, LengthValue> = {};
  const padHits: { hit: Hit; sides: readonly ("top" | "right" | "bottom" | "left")[] }[] = [];
  for (const hit of takeUtility(list, "p").all) padHits.push({ hit, sides: ALL_PADDING_SIDES });
  for (const [side, utility] of PADDING_SIDES) {
    for (const hit of takeUtility(list, utility).all) padHits.push({ hit, sides: [side] });
  }
  for (const { hit, sides } of padHits) {
    const n = lengthOrTokenOf(hit.value, ctx);
    if (n === null) note(hit.literal, "padding 需要 px 数值或 space.* token");
    else {
      sides.forEach((side) => {
        pad[side] = n;
      });
      out.checked.push(hit.literal);
    }
  }
  if (Object.keys(pad).length) layout.padding = pad;
  // 圆角：先分格再折叠四边（`rounded` 的 head 是 `rounded-`，会顺带吃掉 `rounded-tl-[…]`，顺序反了就读不出边）。
  // 与基线同一组 rim（px 数值或 radius.* token）；少一格的 uniform 折不出来，如实 unmapped。
  const corners: Partial<CornerRadius> = {};
  for (const [utility, corner] of [
    ["rounded-tl", "topLeft"],
    ["rounded-tr", "topRight"],
    ["rounded-br", "bottomRight"],
    ["rounded-bl", "bottomLeft"],
  ] as const) {
    for (const hit of takeUtility(list, utility).all) {
      const n = lengthOrTokenOf(hit.value, ctx);
      if (n === null) note(hit.literal, "圆角需要 px 数值或 radius.* token");
      else {
        corners[corner] = n;
        out.checked.push(hit.literal);
      }
    }
  }
  if (Object.keys(corners).length) style.cornerRadius = corners;
  // 四格折叠：任一格已被分格认领就不折（少一格的 uniform 会丢边）
  if (!Object.keys(corners).length) {
    for (const hit of takeUtility(list, "rounded").all) {
      const n = lengthOrTokenOf(hit.value, ctx);
      if (n === null) note(hit.literal, "圆角需要 px 数值或 radius.* token");
      else {
        style.cornerRadius = { topLeft: n, topRight: n, bottomRight: n, bottomLeft: n };
        out.checked.push(hit.literal);
      }
    }
  }
  const text = takeUtility(list, "text");
  for (const hit of text.arbitrary) {
    const parsed = classifyText(hit.value, ctx);
    if (parsed.kind !== "size") note(hit.literal, "断点覆盖里只支持字号");
    else {
      typography.fontSize = parsed.value;
      out.checked.push(hit.literal);
    }
  }
  for (const hit of text.bare) {
    if (ALIGN_CLASS[hit.literal] && node.typography) {
      typography.align = ALIGN_CLASS[hit.literal];
      out.checked.push(hit.literal);
    } else note(hit.literal, "断点覆盖暂不支持该 text-* 写法");
  }
  // 字重 / 行高（§14）：与字号同组 `typography`，处方同基线（`WEIGHT_CLASS` · `leading-normal`）。
  for (const hit of takeUtility(list, "leading").all) {
    if (hit.value === "normal") {
      typography.lineHeight = "auto";
      out.checked.push(hit.literal);
      continue;
    }
    const n = numberOf(hit.value);
    if (n === null) note(hit.literal, "断点行高需要倍数数字（如 leading-[1.4]）");
    else {
      typography.lineHeight = n;
      out.checked.push(hit.literal);
    }
  }
  for (const hit of takeUtility(list, "font").all) {
    const byName = WEIGHT_CLASS[hit.literal];
    if (byName !== undefined) {
      typography.fontWeight = byName;
      out.checked.push(hit.literal);
      continue;
    }
    // 字族（§14）：与基线同一套认领（`WEIGHT_CLASS` 先行 → `tokenRefOf` → 裸族名 → unmapped 不猜）
    const familyName = /^family-name:(.+)$/.exec(hit.value);
    const raw = familyName ? familyName[1]! : hit.value;
    const ref = tokenRefOf(raw, ctx);
    if (ref) {
      typography.fontFamily = ref;
      out.checked.push(hit.literal);
      continue;
    }
    const n = numberOf(raw);
    if (n !== null && n >= 100 && n <= 900 && !familyName) {
      typography.fontWeight = n;
      out.checked.push(hit.literal);
      continue;
    }
    if (/^[A-Za-z][\w -]*$/.test(raw.replace(/_/g, " "))) {
      typography.fontFamily = raw.replace(/_/g, " ");
      out.checked.push(hit.literal);
    } else note(hit.literal, "断点字族超出模型表达");
  }
  for (const hit of takeUtility(list, "tracking").all) {
    const n = numberOf(hit.value);
    if (n === null) note(hit.literal, "断点字距需要 px 数值");
    else {
      typography.letterSpacing = n;
      out.checked.push(hit.literal);
    }
  }
  const textCaseTok = list.find((token) => CASE_CLASS[token] !== undefined);
  if (textCaseTok) {
    list.splice(list.indexOf(textCaseTok), 1);
    typography.textCase = CASE_CLASS[textCaseTok];
    out.checked.push(textCaseTok);
  }
  const decorationTok = ["underline", "line-through"].find((token) => list.includes(token));
  if (decorationTok) {
    list.splice(list.indexOf(decorationTok), 1);
    typography.decoration = decorationTok as NonNullable<Typography["decoration"]>;
    out.checked.push(decorationTok);
  }
  // 正向方向类（`md:flex-col`）在第八片之后可能说两件事：这一档的**排布**，以及「这一档不反向」。
  // 两件事各按自己的归属规矩收，判据与发射侧同一份（§14 第五/七/八片是同一条纪律的四次落地）：
  //  · `mode`：这一档自己声明过排布时收——发射侧就是按 `layout.mode !== undefined` 发这一组类的，
  //    读回来按同一判据收回去，冗余但确实存着的 `{mode:…}` 才不会被这次编辑抹掉；
  //    或者它说的排布与**更窄那档**解出来的不同，那确实是作者在这条类里改了排布。
  //  · `reverse:false`：只有更窄那档真是反向的，这条类才顶掉点什么（CSS 里没有"取消反向"这条类，
  //    靠的是重说一遍方向）。窄档没反向时它不改任何东西，凭空写一条 `{reverse:false}` 就成了
  //    模型里一条没有投影的键——发射侧同一条判据，那边不发，这边不收。
  // 两条都不收时这条类留在 list 里，由下面 `DISPLAY_CLASS_SET` 那一段静默消费、**不进 checked**：
  // 进了就要求重投影原样再现它，而这一档什么都没写时重投影发不出 ⇒ 整节点回写作废（§19，最贵的走法）。
  const narrower = applyResponsiveBelow(node, breakpoint);
  const narrowerReversed =
    ALIGNABLE_MODES.includes(narrower.layout.mode) && narrower.layout.reverse === true;
  const declaresMode = declaredLayoutKeys(node, breakpoint).includes("mode");
  for (const [cls, mode] of Object.entries(MODE_OF_DISPLAY_CLASS)) {
    const at = list.indexOf(cls);
    if (at < 0) continue;
    // 同一档还写着这个排布的反向类时，作者说的是"反向"，正向那条只是陪着写的（下面那一段收它）
    const assertsReverse = list.includes(REVERSE_CLASS[mode] ?? "");
    const saysMode = declaresMode || mode !== narrower.layout.mode;
    const saysForward = !assertsReverse && narrowerReversed && ALIGNABLE_MODES.includes(mode);
    if (!saysMode && !saysForward)
      // verticalAlign narrow mode path: md:flex / md:flex-col only carrier — mode entry silent
      continue;
    list.splice(at, 1);
    if (saysMode) layout.mode = mode;
    if (saysForward) layout.reverse = false;
    out.checked.push(cls);
  }
  // 反向那一格（§14 第七片）：`md:flex-col-reverse` 一条类同时说了**方向**与**反向**。
  // `reverse` 一定写；`mode` 只在"这一档本来解出来的排布"与它不一致时才写——
  // 一致时凭空多一个模型里没有的键（往返那条腿的标准是"一个补丁都不发"），
  // 不一致时不写就会让重投影发出 `md:flex-row-reverse`，自检认不出作者写的这一条
  // ⇒ 整个节点的回写作废（§19）。判据与发射侧同一份（`REVERSE_CLASS` 只列自动布局那两档）。
  for (const [cls, mode] of Object.entries(MODE_OF_REVERSE_CLASS)) {
    const at = list.indexOf(cls);
    if (at < 0) continue;
    list.splice(at, 1);
    layout.reverse = true;
    const modeOfTier =
      (layout.mode as LayoutMode | undefined) ?? applyResponsive(node, breakpoint).layout.mode;
    if (modeOfTier !== mode) layout.mode = mode;
    out.checked.push(cls);
  }
  // `flex` 三种排布都发，本身不表态：跟着消费掉，但不写进 checked——写进去就要求重投影能再现它，
  // 而单独一个 `md:flex`（有人手写的）什么排布都不说，重投影发不出方向类。
  for (const cls of DISPLAY_CLASS_SET) {
    const at = list.indexOf(cls);
    if (at >= 0) list.splice(at, 1);
  }
  // 垂直对齐（§14）：文字节点上宽排版的 `md:justify-*` 不是自动布局的主轴对齐，
  // 是 typography.verticalAlign 的 override——与发射侧同口径，按 narrower 档位的
  // verticalAlign 向窄档看变化，有变化才从 table 捞回来进 patch。
  // （此处 vAlignNarrowed 沿袭下游判断；这里不消费类，ED 带 `flex`/`flex-col`/`justify-*`
  // 由下方的通用路径当正常处理——`justify-*` 落到 `justify` 写入，VA 的 narrowing 落到 VA block 之下。）
  let vAlignNarrowed = false;
  {
    const narrower = applyResponsiveBelow(node, breakpoint);
    const narrowerVa = narrower.typography?.verticalAlign ?? "top";
    const tierVa = applyResponsive(node, breakpoint).typography?.verticalAlign ?? "top";
    if (node.type === "text" && node.typography && tierVa !== narrowerVa) {
      typography.verticalAlign = tierVa;
      vAlignNarrowed = true;
    }
  }
  // 对齐两键（§14 第六片）。发射侧只在**这一档解出来的排布真是自动布局**时发 `md:justify-*` /
  // `md:items-*`：grid / wrap 下求解器不看这两个键，画布不动，而它们在 CSS 上真会挪东西——
  // 那份模型不认的类读回来就是凭空多出一个模型里没有、画布也不认的键。
  // 收侧必须用同一个判据（`ALIGNABLE_MODES` 那份表）：两边判据不一致时这里接受了、重投影发不出来，
  // 自检认不出那个类名 ⇒ 整个节点的回写作废（§19），比拒绝这一条键严重得多。
  const tierMode = layout.mode as LayoutMode | undefined;
  const modeOfThisTier: LayoutMode = tierMode ?? applyResponsive(node, breakpoint).layout.mode;
  const collectTokens = (table: Record<string, string>): string[] => {
    const found: string[] = [];
    for (const token of [...list]) {
      if (table[token] === undefined) continue;
      list.splice(list.indexOf(token), 1);
      found.push(token);
    }
    return found;
  };
  for (const channel of [
    { key: "justify", table: JUSTIFY_CLASS },
    { key: "items", table: ITEMS_CLASS },
  ] as const) {
    const tokens = collectTokens(channel.table);
    if (!tokens.length) continue;
    if (channel.key === "justify" && vAlignNarrowed) {
      // VA dispatch already consumed, simply group-checked them here (they mirror narrower delta)
      out.checked.push(...tokens);
      continue;
    }
    if (!ALIGNABLE_MODES.includes(modeOfThisTier)) {
      tokens.forEach((token) =>
        note(
          token,
          `这一档解出来的排布是 ${modeOfThisTier}，画布不按 ${channel.key}-* 摆放：要把东西摆开，先把这一档排成横排或竖排`,
        ),
      );
      continue;
    }
    const first = tokens[0]!;
    layout[channel.key] = channel.table[first];
    out.checked.push(first);
    tokens.slice(1).forEach((token) => note(token, `同一档第二条 ${channel.key}-* 冲突，只取第一条`));
  }
  const bg = takeUtility(list, "bg");
  for (const hit of bg.all) {
    if (node.type === "text") note(hit.literal, "text 节点的字色在模型里由 fills 表达，断点覆盖暂不支持");
    else {
      const color = colorOf(hit.value, ctx);
      if (color === null) note(hit.literal, "背景值不是颜色或 token");
      else {
        style.fills = [{ kind: "solid", color }];
        out.checked.push(hit.literal);
      }
    }
  }
  if (list.includes("hidden")) {
    list.splice(list.indexOf("hidden"), 1);
    out.patch.visible = false;
    out.checked.push("hidden");
  }
  // 透明度：这一档声明了就必须发得出来、也读得回来（`style.opacity` 与 fills 同组，
  // 回写按组 Object.assign，所以只有这一条键进 patch 不会抹掉同组别的键）
  for (const hit of takeUtility(list, "opacity").all) {
    const n = Number(hit.value);
    if (!Number.isFinite(n) || n < 0 || n > 1) note(hit.literal, "断点透明度需要 0..1 的数字");
    else {
      style.opacity = n;
      out.checked.push(hit.literal);
    }
  }
  // 混合模式：`md:mix-blend-*`——Tailwind v4 的 blend 名单与模型 `BlendMode` 一一对应（见 types.ts），
  // `mix-blend-normal` 是合法类：显式写回正常模式顶掉更窄那档的混合模式。未知名一律进 unmapped，不猜。
  for (const hit of takeUtility(list, "mix-blend").all) {
    if (!BLEND_MODES.has(hit.value as Style["blendMode"])) {
      note(hit.literal, "mix-blend 取值不在模型的混合模式名单里");
      continue;
    }
    style.blendMode = hit.value as Style["blendMode"];
    out.checked.push(hit.literal);
  }
  // 旋转：`md:rotate-[Ndeg]`——与基线同一判据（数字 + deg 后缀），其余格式一律进 unmapped，不猜。
  for (const hit of takeUtility(list, "rotate").all) {
    const m = /^-?\d+(?:\.\d+)?deg$/.exec(hit.value);
    if (!m) note(hit.literal, "rotate 需要角度数值（deg）");
    else {
      style.rotation = Number(hit.value.slice(0, -3));
      out.checked.push(hit.literal);
    }
  }
  // 指针：`md:cursor-*`——`cursor-default` 是合法类（顶掉更窄那档的指针样式）。未知名 unmapped，不猜。
  for (const hit of takeUtility(list, "cursor").all) {
    if (!CURSORS.has(hit.value as Style["cursor"])) {
      note(hit.literal, "cursor 取值不在模型的指针名单里");
      continue;
    }
    style.cursor = hit.value as Style["cursor"];
    out.checked.push(hit.literal);
  }
  // 裁剪 / 滚动（§14）：与基线同一组 overflow 类。`overflow-visible` 是响应式"取消"类，
  // 仅在更窄那档有 overflow 约束时才有意义（与 reverse-cancel 同一判据形状）。
  const consumeToken = (token: string): boolean => {
    const at = list.indexOf(token);
    if (at < 0) return false;
    list.splice(at, 1);
    return true;
  };
  if (consumeToken("overflow-hidden")) {
    layout.clipContent = true;
    out.checked.push("overflow-hidden");
  } else if (consumeToken("overflow-y-auto")) {
    layout.scroll = "vertical";
    out.checked.push("overflow-y-auto");
  } else if (consumeToken("overflow-x-auto")) {
    layout.scroll = "horizontal";
    out.checked.push("overflow-x-auto");
  } else if (consumeToken("overflow-auto")) {
    layout.scroll = "both";
    out.checked.push("overflow-auto");
  } else if (consumeToken("overflow-visible")) {
    const narrowerOverflow =
      narrower.layout.clipContent === true ||
      (narrower.layout.scroll && narrower.layout.scroll !== "none");
    if (narrowerOverflow) {
      // 取消更窄那档的 overflow 约束：显式写回“无遮罩/不滚动”的模型状态
      layout.clipContent = false;
      layout.scroll = "none";
      out.checked.push("overflow-visible");
    } else {
      // 更窄那档本来就没有 overflow 约束：这条类不改变投影，静默消费但不进 checked
      //（进 checked 会要求重投影原样再现它，而这一档未声明时不会发 overflow-visible）
    }
  }
  // 绝对定位（§14 第九片）：`md:left-*` / `md:top-*` / `md:absolute` 只在这一档投影后的父级
  // 是自由定位逃生口（none / stack）时才收——与基线 `positionClasses` 同一判据，只是父级模式
  // 按这一档投影读。父级不是时如实披露：这一档的 left/top 不会移动画布上的东西，只是在骗读者。
  const leftsV = takeUtility(list, "left");
  const topsV = takeUtility(list, "top");
  const absoluteV = consumeToken("absolute");
  const tierAbsolutelyPlaced = tierParentMode === "none" || tierParentMode === "stack";
  // 这一档相对窄档由 absolute → 入流：`static` 顶掉窄档那条 absolute。这一档收到该 token 时，
  // 语义是"该档不再绝对"——不回写任何键（模型里只有 absolute/stack 哪两档，没有 position: static 这个键），
  // 以 checked 形式保留下来对自检透明（重投影会发同样类名）。
  const staticV = consumeToken("static");
  if (staticV) {
    if (!tierAbsolutelyPlaced) {
      out.checked.push("static");
    } else {
      // 父级依然 none/stack，消费 `static` 没有意义——md:static 会把子节点丢出流但父级不关流，
      // 留在排版上就是回归。如实说明而不静默忽略。
      note("static", `此档父级（${tierParentMode}）是自由定位逃生口：md:static 让子节点回到流，但父级不按流摆它`);
    }
  }
  if (tierAbsolutelyPlaced) {
    const position: { x?: number; y?: number } = {};
    const x = leftsV.all[0];
    const y = topsV.all[0];
    const below = applyResponsiveBelow(node, breakpoint);
    if (x) {
      const n = numberOf(x.value);
      if (n === null) {
        note(x.literal, "断点 left 需要 px 数值");
      } else if (below.position.x !== n) {
        position.x = n;
      } else {
        // 这一档的 left 与窄档合出来的值一致 ⇒ 位置类是父级 flip 出来的绝对化，
        // 不是子节点要盖的新值：保留 checked（类在这一档确实就长这样），但 patch 留空座。
        out.checked.push(x.literal);
      }
    }
    if (y) {
      const n = numberOf(y.value);
      if (n === null) {
        note(y.literal, "断点 top 需要 px 数值");
      } else if (below.position.y !== n) {
        position.y = n;
      } else {
        out.checked.push(y.literal);
      }
    }
    if (Object.keys(position).length) {
      out.patch.position = position;
    }
    if (absoluteV) out.checked.push("absolute");
  } else if (absoluteV || leftsV.all.length || topsV.all.length) {
    // 父级不是自由定位的容器：这些类在这一档不会改变画布上的位置（§16），如实披露
    note(
      absoluteV ? "absolute" : leftsV.all[0]?.literal ?? topsV.all[0]?.literal ?? "left/top",
      `这一档的父级（${tierParentMode ?? "未知/无父级"}）不是自由定位容器，不回写`,
    );
  }
  if (Object.keys(size).length) out.patch.size = size;
  if (Object.keys(layout).length) out.patch.layout = layout;
  if (Object.keys(style).length) out.patch.style = style;
  if (Object.keys(typography).length) out.patch.typography = typography;
  for (const token of list) note(token, "不在响应式回写白名单里（§19）");
  return out;
}

/**
 * 单个状态的补丁类 → NodeStateStyle（ADR-0062 part ②）。
 *
 * 状态补丁是整通道替换：这个桶就是该状态的完整真相——codegen 的 stateClasses
 * 只发 fills / strokes / effects / opacity 四通道，这里也只认这四通道；
 * 桶里缺席的通道即删除（调用方整块替换该状态），不逐项合并。
 */
function decodeState(
  tokens: string[],
  node: DesignNode,
  state: NodeState,
  ctx: Ctx,
): VariantDecode {
  const list = [...tokens];
  const out: VariantDecode = { patch: {}, checked: [], unmapped: [] };
  const current = node.states?.[state];
  const isText = node.type === "text";
  const note = (token: string, reason: string): void => {
    out.unmapped.push({ token, reason });
  };

  // ---- fills：bg-[…]；text 节点的状态字色是 text-[…]（与 stateClasses 同一契约）----
  const fillsHits: Hit[] = [];
  let fillsReset = false;
  if (isText) {
    const texts = takeUtility(list, "text");
    for (const hit of texts.bare) {
      if (hit.literal === "text-inherit") {
        fillsReset = true;
        out.checked.push(hit.literal);
      }
    }
    for (const hit of texts.arbitrary) {
      if (
        colorOf(hit.value, ctx) !== null ||
        /^(linear|radial|conic)-gradient\(/.test(hit.value)
      ) {
        fillsHits.push(hit);
      } else note(hit.literal, "状态补丁只支持 fills/strokes/effects/opacity 四通道（ADR-0062）");
    }
  } else {
    for (const hit of takeUtility(list, "bg").all) {
      // 显式重置（ADR-0062）：bg-none / bg-transparent → 整个 fills 通道清空
      if (hit.value === "none" || hit.value === "transparent") {
        fillsReset = true;
        out.checked.push(hit.literal);
      } else fillsHits.push(hit);
    }
  }
  const paints: Paint[] = [];
  const paintHits: Hit[] = [];
  for (const hit of fillsHits) {
    const gradient = parseGradient(hit.value, ctx);
    if (gradient) {
      paints.push(gradient);
      paintHits.push(hit);
    } else {
      const color = colorOf(hit.value, ctx);
      if (color === null) note(hit.literal, "状态 fills 需要颜色、渐变或 token 引用");
      else {
        paints.push({ kind: "solid", color });
        paintHits.push(hit);
      }
    }
  }
  if (fillsReset) {
    // 显式重置（ADR-0062）：整个 fills 通道清空；同桶里的取值类如实报冲突
    out.patch.fills = [];
    for (const hit of paintHits) note(hit.literal, "重置类与取值类同时出现：整通道替换下重置优先");
  } else {
    for (const hit of paintHits) out.checked.push(hit.literal);
    if (paints.length) out.patch.fills = paints;
  }

  // ---- strokes：border-[宽度px] + border-[颜色]；border-0 / border-[transparent] 是重置 ----
  const borders = takeUtility(list, "border");
  const borderResets = borders.all.filter(
    (hit) => hit.literal === "border-0" || hit.value === "transparent",
  );
  if (borderResets.length) {
    // 显式重置（ADR-0062）：整个描边通道清空；同桶里的取值类如实报冲突
    out.patch.strokes = [];
    for (const hit of borders.all) {
      if (borderResets.includes(hit)) out.checked.push(hit.literal);
      else note(hit.literal, "重置类与取值类同时出现：整通道替换下重置优先");
    }
  } else if (borders.all.length) {
    const width = borders.all
      .map((hit) => numberOf(hit.value))
      .find((n): n is number => n !== null);
    const colorHit = borders.all.find((hit) => colorOf(hit.value, ctx) !== null);
    if (width === undefined || !colorHit) {
      borders.all.forEach((hit) =>
        note(hit.literal, "状态描边需要 border-[宽度px] 与 border-[颜色] 两个类"),
      );
    } else {
      out.patch.strokes = [
        {
          paints: [{ kind: "solid", color: colorOf(colorHit.value, ctx)! }],
          width,
          position: node.style.strokes[0]?.position ?? "inside",
        },
      ];
      out.checked.push(...borders.all.map((hit) => hit.literal));
    }
  }

  // ---- effects：shadow-[…] / blur-[…] / backdrop-blur-[…] ----
  const shadowHits = takeUtility(list, "shadow").all;
  const layerBlurHits = takeUtility(list, "blur").all;
  const backdropBlurHits = takeUtility(list, "backdrop-blur").all;
  const effectHits = [...shadowHits, ...layerBlurHits, ...backdropBlurHits];
  if (effectHits.some((hit) => hit.value === "none")) {
    // 显式重置（ADR-0062）：shadow-none / blur-none / backdrop-blur-none
    // → 整个 effects 通道清空；同桶里的取值类如实报冲突
    out.patch.effects = [];
    for (const hit of effectHits) {
      if (hit.value === "none") out.checked.push(hit.literal);
      else note(hit.literal, "重置类与取值类同时出现：整通道替换下重置优先");
    }
  } else if (effectHits.length) {
    let effects: Effect[] = [...(current?.effects ?? [])];
    for (const hit of shadowHits) {
      const effect = parseShadow(hit.value, ctx);
      if (!effect) note(hit.literal, "状态投影只有 shadow-[x_y_blur_spread_color] 这一种写法能映射回模型");
      else {
        effects = [
          effect,
          ...effects.filter((e) => e.kind !== "drop-shadow" && e.kind !== "inner-shadow"),
        ];
        out.checked.push(hit.literal);
      }
    }
    for (const [hits, kind] of [
      [layerBlurHits, "layer-blur"],
      [backdropBlurHits, "background-blur"],
    ] as const) {
      for (const hit of hits) {
        const n = numberOf(hit.value);
        if (n === null) note(hit.literal, "状态模糊需要 px 数值");
        else {
          effects = [...effects.filter((e) => e.kind !== kind), { kind, blur: n } as Effect];
          out.checked.push(hit.literal);
        }
      }
    }
    out.patch.effects = effects;
  }

  // ---- opacity ----
  const opacity = takeUtility(list, "opacity");
  if (opacity.all.length) {
    const n = Number(opacity.all[0]!.value);
    if (!Number.isFinite(n)) note(opacity.all[0]!.literal, "状态 opacity 需要 0..1 的数字");
    else {
      out.patch.opacity = n;
      out.checked.push(opacity.all[0]!.literal);
    }
  }

  for (const token of list) note(token, "状态补丁只支持 fills/strokes/effects/opacity 四通道（ADR-0062）");
  return out;
}

const tokenRefKeyOf = (value: unknown): string | null =>
  typeof value === "string" && /^\{([^{}]+)\}$/.test(value) ? value.slice(1, -1) : null;

/** 这个颜色值生成器能否产出类名？不能的话，类名缺席就不算“用户删掉了它” */
function colorEmits(value: unknown, ctx: Ctx): boolean {
  const key = tokenRefKeyOf(value);
  if (key) return ctx.byDashed.size === 0 || ctx.byDashed.has(key.replace(/\./g, "-"));
  if (typeof value === "string") return /^[#a-z(]/i.test(value);
  return Boolean(value && typeof value === "object" && "r" in value);
}

function paintEmits(paint: Paint, ctx: Ctx): boolean {
  if (paint.visible === false) return false;
  if (paint.kind === "solid") return colorEmits(paint.color, ctx);
  if (paint.kind === "gradient") {
    return paint.stops.every((stop) => colorEmits(stop.color, ctx));
  }
  return true; // 位图填充产出 bg-contain，已单独按 unmapped 处理
}

function strokeEmits(stroke: Stroke, ctx: Ctx): boolean {
  if (stroke.visible === false) return false;
  return Number.isFinite(stroke.width) && stroke.paints.some((p) => paintEmits(p, ctx));
}

/** 长度类：px 数值或 token 引用都能回到模型 */
function lengthOf(raw: string, ctx: Ctx): number | string | null {
  const ref = tokenRefOf(raw, ctx);
  if (ref) {
    const token = ctx.byKey.get(ref.slice(1, -1));
    if (token && token.type !== "dimension" && token.type !== "number" && token.type !== "fontFamily") {
      return null;
    }
    return ref;
  }
  const n = numberOf(raw);
  if (n !== null) return n;
  const unit = /^-?\d+(?:\.\d+)?(rem|em|%)$/.exec(raw.trim());
  return unit ? raw.trim() : null;
}

function decodeClasses(
  source: string[],
  node: DesignNode,
  parent: DesignNode | null,
  ctx: Ctx,
): Decode {
  const list = [...source];
  const d: Decode = { props: new Map(), checked: [], unmapped: [], responsive: new Map(), states: new Map() };

  const variants = new Map<BreakpointName, string[]>();
  for (const token of [...list]) {
    for (const [prefix, breakpoint] of VARIANTS) {
      if (!token.startsWith(prefix)) continue;
      list.splice(list.indexOf(token), 1);
      const bucket = variants.get(breakpoint) ?? [];
      bucket.push(token.slice(prefix.length));
      variants.set(breakpoint, bucket);
      break;
    }
  }

  // 状态变体（hover:/active:/data-[state=loading]: …）先进各自的桶，
  // 整桶交给 decodeState 做整通道替换（ADR-0062）
  const stateTokens = new Map<NodeState, string[]>();
  for (const token of [...list]) {
    for (const [prefix, state] of STATE_VARIANTS) {
      if (!token.startsWith(prefix)) continue;
      list.splice(list.indexOf(token), 1);
      const bucket = stateTokens.get(state) ?? [];
      bucket.push(token.slice(prefix.length));
      stateTokens.set(state, bucket);
      break;
    }
  }

  const note = (token: string, reason: string): void => {
    d.unmapped.push({ token, reason });
  };
  // 基线类的归属：`mobile` 那条规则声明过的键，值属于那条规则，不属于设计值（`mobileBaselineOf`）。
  const owned = mobileOwnedPaths(node.responsive);
  const ownedByMobile = (path: string): boolean =>
    owned.some((prefix) => path === prefix || path.startsWith(`${prefix}.`));
  const mobileBucket = (): VariantDecode => {
    const existing = d.responsive.get("mobile");
    if (existing) return existing;
    const created: VariantDecode = { patch: {}, checked: [], unmapped: [] };
    d.responsive.set("mobile", created);
    return created;
  };
  /** 把 `layout.padding.top` 这类路径落到那条规则的 patch 里，深度合并，别的键一个都不碰 */
  const writeMobile = (token: string | null, path: string, value: unknown): void => {
    const nested = mobileBucket();
    const segments = path.split(".");
    let cursor = nested.patch as Record<string, unknown>;
    for (const key of segments.slice(0, -1)) {
      const at = cursor[key];
      if (at === undefined) {
        cursor[key] = {};
      } else if (!at || typeof at !== "object" || Array.isArray(at)) {
        note(token ?? path, `${path} 在本次类名里有冲突值，保留先前的解释`);
        return;
      }
      cursor = cursor[key] as Record<string, unknown>;
    }
    const leaf = segments[segments.length - 1]!;
    const before = cursor[leaf];
    if (before !== undefined && JSON.stringify(before) !== JSON.stringify(value)) {
      note(token ?? path, `${path} 在本次类名里有冲突值，保留先前的解释`);
      return;
    }
    cursor[leaf] = value;
  };
  const write = (token: string | null, path: string, value: unknown): void => {
    if (value === undefined) return;
    if (ownedByMobile(path)) {
      writeMobile(token, path, value);
      return;
    }
    if (d.props.has(path)) {
      if (JSON.stringify(d.props.get(path)) !== JSON.stringify(value)) {
        note(token ?? path, `${path} 在本次类名里有冲突值，保留先前的解释`);
      }
      return;
    }
    d.props.set(path, value);
  };
  const consume = (token: string): boolean => {
    const at = list.indexOf(token);
    if (at < 0) return false;
    list.splice(at, 1);
    return true;
  };
  const consumeAll = (token: string): number => {
    let n = 0;
    for (;;) {
      const at = list.indexOf(token);
      if (at < 0) return n;
      list.splice(at, 1);
      n += 1;
    }
  };

  // ---- 尺寸（sizeClasses 的反向） ----
  const parentMode = parent?.layout.mode ?? null;
  const axis = parentMode === "horizontal" || parentMode === "vertical" ? parentMode : null;
  const main: "width" | "height" | null =
    axis === "horizontal" ? "width" : axis === "vertical" ? "height" : null;
  const cross: "width" | "height" | null =
    main === "width" ? "height" : main === "height" ? "width" : null;

  const grow = consume("flex-1");
  const stretch = consume("self-stretch");
  if (grow) {
    d.checked.push("flex-1");
    if (main) write("flex-1", `size.${main}`, "fill");
    else note("flex-1", "父容器不是自动布局，flex-1 没有对应的尺寸语义");
  }
  if (stretch) {
    if (!cross) note("self-stretch", "父容器不是自动布局");
    else if (parentMode && parent!.layout.items === "stretch" && node.size[cross] === "hug") {
      // fill 与 hug 在 items:stretch 的父级下产出同一个 self-stretch：无法区分，保持模型原值
    } else {
      write("self-stretch", `size.${cross}`, "fill");
      d.checked.push("self-stretch");
    }
  }
  for (const [dim, utility] of [
    ["width", "w"],
    ["height", "h"],
  ] as const) {
    const hits = takeUtility(list, utility);
    if (!hits.all.length) continue;
    if (hits.all.length > 1) {
      hits.all.slice(1).forEach((hit) => note(hit.literal, `${dim} 有多个尺寸类，只取第一个`));
    }
    const hit = hits.all[0]!;
    if (hit.value === "fit") write(hit.literal, `size.${dim}`, "hug");
    else if (hit.value === "full") write(hit.literal, `size.${dim}`, "fill");
    else {
      const parsed = lengthOf(hit.value, ctx);
      if (parsed === null) {
        note(hit.literal, "尺寸需要 px 数值、rem/em/% 或 token 引用");
        continue;
      }
      write(hit.literal, `size.${dim}`, parsed as SizeValue);
    }
    d.checked.push(hit.literal);
  }
  const bounds: ["min-w" | "max-w" | "min-h" | "max-h", "minWidth" | "maxWidth" | "minHeight" | "maxHeight"][] = [
    ["min-w", "minWidth"],
    ["max-w", "maxWidth"],
    ["min-h", "minHeight"],
    ["max-h", "maxHeight"],
  ];
  for (const [utility, key] of bounds) {
    for (const hit of takeUtility(list, utility).all) {
      const n = numberOf(hit.value);
      if (n === null) note(hit.literal, `${key} 只接受 px 数值（token 绑定请在画布上做）`);
      else {
        write(hit.literal, `style.${key}`, n);
        d.checked.push(hit.literal);
      }
    }
  }
  for (const hit of takeUtility(list, "aspect").all) {
    const n = numberOf(hit.value);
    if (n === null) note(hit.literal, "aspect 需要数值比例（模型不保存 16/9 这类表达式）");
    else {
      write(hit.literal, "style.aspectRatio", n);
      d.checked.push(hit.literal);
    }
  }

  // ---- 绝对定位（positionClasses） ----
  const lefts = takeUtility(list, "left");
  const tops = takeUtility(list, "top");
  const isAbsolute = consume("absolute");
  const absolutelyPlaced = parentMode === "none" || parentMode === "stack";
  if (absolutelyPlaced) {
    const x = lefts.all[0];
    const y = tops.all[0];
    if (!x || !y || !isAbsolute) {
      note(x?.literal ?? y?.literal ?? "absolute", `父容器是 ${parentMode} 布局，子节点必须保留 absolute left-*/top-*（§16）`);
    } else {
      const px = numberOf(x.value);
      const py = numberOf(y.value);
      if (px === null || py === null) note(x.literal, "left/top 需要 px 数值");
      else {
        write(x.literal, "position.x", px);
        write(y.literal, "position.y", py);
        d.checked.push(x.literal, y.literal);
      }
    }
  } else if (isAbsolute || lefts.all.length || tops.all.length) {
    note(isAbsolute ? "absolute" : lefts.all[0]?.literal ?? tops.all[0]?.literal ?? "left/top", "自由定位只在父容器为无自动布局时可用，请在画布改父容器");
  }

  // ---- 布局（layoutClasses） ----
  const flexCount = consumeAll("flex");
  consumeAll("relative");
  const colCount = consumeAll("flex-col");
  const rowCount = consumeAll("flex-row");
  const colReverse = consumeAll("flex-col-reverse");
  const rowReverse = consumeAll("flex-row-reverse");
  const wrapCount = consumeAll("flex-wrap");
  const gridCount = consumeAll("grid");
  const justifyTokens: string[] = [];
  for (const token of [...list]) {
    if (JUSTIFY_CLASS[token]) {
      list.splice(list.indexOf(token), 1);
      justifyTokens.push(token);
    }
  }
  const itemsTokens: string[] = [];
  for (const token of [...list]) {
    if (ITEMS_CLASS[token]) {
      list.splice(list.indexOf(token), 1);
      itemsTokens.push(token);
    }
  }
  const gapHits = takeUtility(list, "gap");
  const paddings = {
    uniform: takeUtility(list, "p"),
    top: takeUtility(list, "pt"),
    right: takeUtility(list, "pr"),
    bottom: takeUtility(list, "pb"),
    left: takeUtility(list, "pl"),
  };
  const gridCols = takeUtility(list, "grid-cols");

  // 生成器对自动布局一定显式写出 justify 与 items（§16），所以 items 是判据：
  // 只有 justify 没有 items 的 flex 组合，来自 typography.verticalAlign。
  const flexSignature = itemsTokens.length > 0;
  if (flexSignature) {
    const mode: Layout["mode"] =
      colCount > 0 || colReverse > 0 ? "vertical" : "horizontal";
    write("flex", "layout.mode", mode);
    d.checked.push("flex", colCount > 0 || colReverse > 0 ? "flex-col" : "flex-row");
    const reverse = colReverse > 0 || rowReverse > 0;
    if (reverse || node.layout.reverse) write(null, "layout.reverse", reverse);
    write(justifyTokens[0] ?? "justify-start", "layout.justify",
      justifyTokens[0] ? JUSTIFY_CLASS[justifyTokens[0]!] : "start");
    write(itemsTokens[0]!, "layout.items", ITEMS_CLASS[itemsTokens[0]!] ?? "start");
    if (itemsTokens.length > 1) note(itemsTokens[1]!, "多个 items-* 冲突，只取第一个");
    if (!justifyTokens.length) note("items", "自动布局缺少 justify-*：生成器总是显式写出");
  } else if (gridCount > 0) {
    write("grid", "layout.mode", "grid");
    d.checked.push("grid");
    if (justifyTokens.length) note(justifyTokens[0]!, "网格模式下的 justify-* 暂不回写");
  } else if (wrapCount > 0) {
    write("flex-wrap", "layout.mode", "wrap");
    if (justifyTokens.length) note(justifyTokens[0]!, "换行模式下的 justify-* 暂不回写");
  } else {
    if (node.layout.mode === "vertical" || node.layout.mode === "horizontal") {
      note(justifyTokens[0] ?? "flex", "缺少 items-*：改成非自动布局请在画布上做（§16）");
    }
    if (justifyTokens.length || colCount || rowCount || flexCount) {
      const vertical = justifyTokens[0] === "justify-center" ? "middle"
        : justifyTokens[0] === "justify-end" ? "bottom"
        : justifyTokens.length ? null : "top";
      if (vertical === null) note(justifyTokens[0]!, "非自动布局下只支持 justify-center / justify-end 表达垂直对齐");
      else if (node.typography) write(justifyTokens[0] ?? "none", "typography.verticalAlign", vertical);
      else if (justifyTokens.length) note(justifyTokens[0]!, "该节点没有文字属性，verticalAlign 不适用");
      if (justifyTokens[1]) note(justifyTokens[1], "第二个 justify-* 无法映射");
    } else if (node.typography && node.typography.verticalAlign !== "top") {
      write(null, "typography.verticalAlign", "top");
    }
  }
  if (colReverse > 0 || rowReverse > 0) {
    d.checked.push(colReverse > 0 ? "flex-col-reverse" : "flex-row-reverse");
  }
  if (gapHits.all.length) {
    const hit = gapHits.all[0]!;
    const n = lengthOrTokenOf(hit.value, ctx);
    if (n === null) note(hit.literal, "gap 需要 px 数值或 space.* token");
    else {
      write(hit.literal, "layout.gap", n);
      d.checked.push(hit.literal);
    }
  } else if (Number.isFinite(node.layout.gap) && node.layout.gap !== 0) {
    write(null, "layout.gap", 0);
  }
  const padHits = [
    paddings.uniform.all[0],
    paddings.top.all[0],
    paddings.right.all[0],
    paddings.bottom.all[0],
    paddings.left.all[0],
  ].filter((hit): hit is Hit => Boolean(hit));
  if (padHits.length) {
    const pad: Record<"top" | "right" | "bottom" | "left", number | string> = {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    };
    let ok = true;
    const read = (hit: Hit | undefined, side: keyof typeof pad): void => {
      if (!hit) return;
      const n = lengthOrTokenOf(hit.value, ctx);
      if (n === null) {
        ok = false;
        note(hit.literal, `padding ${side} 需要 px 数值或 space.* token`);
        return;
      }
      pad[side] = n;
    };
    if (paddings.uniform.all.length) {
      const n = lengthOrTokenOf(paddings.uniform.all[0]!.value, ctx);
      if (n === null) note(paddings.uniform.all[0]!.literal, "padding 需要 px 数值或 space.* token");
      else {
        pad.top = pad.right = pad.bottom = pad.left = n;
        d.checked.push(paddings.uniform.all[0]!.literal);
      }
      paddings.top.all.slice(0).forEach((hit) => {
        note(hit.literal, "统一 padding 与单边 padding 同时出现，只取统一值");
      });
    } else {
      read(paddings.top.all[0], "top");
      read(paddings.right.all[0], "right");
      read(paddings.bottom.all[0], "bottom");
      read(paddings.left.all[0], "left");
      paddings.top.all.forEach((hit) => d.checked.push(hit.literal));
      paddings.right.all.forEach((hit) => d.checked.push(hit.literal));
      paddings.bottom.all.forEach((hit) => d.checked.push(hit.literal));
      paddings.left.all.forEach((hit) => d.checked.push(hit.literal));
    }
    if (ok) {
      for (const side of ["top", "right", "bottom", "left"] as const) {
        write(padHits[0]?.literal ?? null, `layout.padding.${side}`, pad[side]);
      }
    }
  } else if (Object.values(node.layout.padding).some((v) => v !== 0)) {
    for (const side of ["top", "right", "bottom", "left"] as const) {
      write(null, `layout.padding.${side}`, 0);
    }
  }
  for (const hit of gridCols.all) {
    const m = /^repeat\((\d+),minmax\(0,1fr\)\)$/.exec(hit.value.replace(/\s+/g, ""));
    if (!m) {
      note(hit.literal, "只有等分网格 grid-cols-[repeat(n,minmax(0,1fr))] 能映射回模型");
      continue;
    }
    write(hit.literal, "layout.columns", Number(m[1]));
    d.checked.push(hit.literal);
  }
  if (consume("overflow-hidden")) {
    write("overflow-hidden", "layout.clipContent", true);
    d.checked.push("overflow-hidden");
  } else if (consume("overflow-y-auto")) {
    write("overflow-y-auto", "layout.scroll", "vertical");
    d.checked.push("overflow-y-auto");
  } else if (consume("overflow-x-auto")) {
    write("overflow-x-auto", "layout.scroll", "horizontal");
    d.checked.push("overflow-x-auto");
  } else if (consume("overflow-auto")) {
    write("overflow-auto", "layout.scroll", "both");
    d.checked.push("overflow-auto");
  } else if (consume("overflow-visible")) {
    write("overflow-visible", "layout.clipContent", false);
    if (node.layout.scroll && node.layout.scroll !== "none") {
      write("overflow-visible", "layout.scroll", "none");
    }
    d.checked.push("overflow-visible");
  } else if (node.layout.clipContent) {
    write(null, "layout.clipContent", false);
  }

  // ---- 圆角 / 描边 / 效果（styleClasses） ----
  const corners: Partial<CornerRadius> = {};
  for (const [utility, side] of [
    ["rounded-tl", "topLeft"],
    ["rounded-tr", "topRight"],
    ["rounded-br", "bottomRight"],
    ["rounded-bl", "bottomLeft"],
  ] as const) {
    for (const hit of takeUtility(list, utility).all) {
      const n = lengthOrTokenOf(hit.value, ctx);
      if (n === null) note(hit.literal, "圆角需要 px 数值或 radius.* token");
      else {
        corners[side] = n;
        d.checked.push(hit.literal);
      }
    }
  }
  const rounded = takeUtility(list, "rounded");
  if (rounded.all.length) {
    const hit = rounded.all[0]!;
    const n = lengthOrTokenOf(hit.value, ctx);
    if (n === null) note(hit.literal, "圆角需要 px 数值或 radius.* token");
    else {
      write(hit.literal, "style.cornerRadius", { topLeft: n, topRight: n, bottomRight: n, bottomLeft: n });
      d.checked.push(hit.literal);
    }
  } else if (Object.keys(corners).length) {
    write(null, "style.cornerRadius", {
      topLeft: corners.topLeft ?? 0,
      topRight: corners.topRight ?? 0,
      bottomRight: corners.bottomRight ?? 0,
      bottomLeft: corners.bottomLeft ?? 0,
    });
  } else if (Object.values(node.style.cornerRadius).some((v) => typeof v === "number" && v !== 0)) {
    write(null, "style.cornerRadius", { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 });
  }
  const borders = takeUtility(list, "border");
  if (borders.all.length) {
    const width = borders.all.map((hit) => numberOf(hit.value)).find((n): n is number => n !== null);
    const colorHit = borders.all.find((hit) => colorOf(hit.value, ctx) !== null);
    if (width === undefined || !colorHit) {
      borders.all.forEach((hit) => note(hit.literal, "边框需要 border-[宽度px] 与 border-[颜色] 两个类"));
    } else {
      const stroke: Stroke = {
        paints: [{ kind: "solid", color: colorOf(colorHit.value, ctx)! }],
        width,
        position: node.style.strokes[0]?.position ?? "inside",
      };
      write(colorHit.literal, "style.strokes", [stroke, ...node.style.strokes.filter((s) => s.visible === false)]);
      d.checked.push(...borders.all.map((hit) => hit.literal));
    }
  } else if (node.style.strokes.some((s) => s.visible !== false && strokeEmits(s, ctx)) &&
    node.style.strokes.every((s) => s.visible === false || strokeEmits(s, ctx))) {
    write(null, "style.strokes", node.style.strokes.filter((s) => s.visible === false));
  }
  let effects: Effect[] = [...node.style.effects];
  const shadows = takeUtility(list, "shadow");
  if (shadows.all.length) {
    const hit = shadows.all[0]!;
    const effect = parseShadow(hit.value, ctx);
    if (!effect) note(hit.literal, "投影只有 shadow-[x_y_blur_spread_color] 这一种写法能映射回模型");
    else {
      effects = [effect, ...effects.filter((e) => e.kind !== "drop-shadow" && e.kind !== "inner-shadow")];
      write(hit.literal, "style.effects", effects);
      d.checked.push(hit.literal);
    }
  }
  const layerBlur = takeUtility(list, "blur");
  const backdropBlur = takeUtility(list, "backdrop-blur");
  if (layerBlur.all.length || backdropBlur.all.length) {
    const hit = layerBlur.all[0] ?? backdropBlur.all[0];
    const n = hit ? numberOf(hit.value) : null;
    if (!hit || n === null) note(hit?.literal ?? "blur", "模糊需要 px 数值");
    else {
      const kind = layerBlur.all.length ? "layer-blur" : "background-blur";
      effects = [
        ...effects.filter((e) => e.kind !== kind),
        { kind, blur: n } as Effect,
      ];
      write(hit.literal, "style.effects", effects);
      d.checked.push(hit.literal);
    }
  }
  const opacity = takeUtility(list, "opacity");
  if (opacity.all.length) {
    const n = Number(opacity.all[0]!.value);
    if (!Number.isFinite(n)) note(opacity.all[0]!.literal, "opacity 需要 0..1 的数字");
    else {
      write(opacity.all[0]!.literal, "style.opacity", n);
      d.checked.push(opacity.all[0]!.literal);
    }
  } else if (node.style.opacity !== 1) {
    write(null, "style.opacity", 1);
  }
  const rotate = takeUtility(list, "rotate");
  if (rotate.all.length) {
    const n = numberOf(rotate.all[0]!.value.replace(/deg$/, ""));
    if (n === null) note(rotate.all[0]!.literal, "rotate 需要角度数值");
    else {
      write(rotate.all[0]!.literal, "style.rotation", n);
      d.checked.push(rotate.all[0]!.literal);
    }
  } else if (node.style.rotation) {
    write(null, "style.rotation", 0);
  }
  const blend = list.find((token) => token.startsWith("mix-blend-"));
  if (blend) {
    consume(blend);
    const mode = blend.slice("mix-blend-".length) as Style["blendMode"];
    if (BLEND_MODES.has(mode)) {
      write(blend, "style.blendMode", mode);
      d.checked.push(blend);
    } else note(blend, "混合模式不在模型支持的枚举里");
  } else if (node.style.blendMode !== "normal") {
    write(null, "style.blendMode", "normal");
  }
  const cursor = list.find((token) => token.startsWith("cursor-"));
  if (cursor) {
    consume(cursor);
    const name = cursor.slice("cursor-".length) as Style["cursor"];
    if (CURSORS.has(name)) {
      write(cursor, "style.cursor", name);
      d.checked.push(cursor);
    } else note(cursor, "指针样式不在模型支持的枚举里");
  } else if (node.style.cursor !== "default") {
    write(null, "style.cursor", "default");
  }

  // ---- 背景填充（backgroundClasses）----
  const isText = node.type === "text";
  const backgrounds = takeUtility(list, "bg");
  let fillsWritten = false;
  if (backgrounds.all.length) {
    if (isText) {
      backgrounds.all.forEach((hit) =>
        note(hit.literal, "text 节点的 fills 表达为字色：背景请加一层容器（§16）"),
      );
    } else {
      const paints: Paint[] = [];
      for (const hit of backgrounds.all) {
        const gradient = parseGradient(hit.value, ctx);
        if (gradient) paints.push(gradient);
        else if (/^(linear|radial|conic)-gradient\(/.test(hit.value)) {
          note(hit.literal, "渐变 stops 需要颜色 + 百分比，超出模型表达");
        } else {
          const color = colorOf(hit.value, ctx);
          if (color === null) note(hit.literal, "背景值既不是颜色也不是可识别的 token");
          else paints.push({ kind: "solid", color });
        }
      }
      if (paints.length) {
        write(backgrounds.all[0]!.literal, "style.fills", [
          ...paints,
          ...node.style.fills.filter((paint) => paint.kind === "image"),
        ]);
        fillsWritten = true;
        d.checked.push(...backgrounds.all.map((hit) => hit.literal));
      }
    }
  }
  if (consume("bg-contain")) {
    note("bg-contain", "位图填充需要 assetId，代码侧无法表达（资产服务在任务 #9）");
  }

  // ---- 文字（typographyClasses）----
  let textColorHit: Hit | null = null;
  if (node.typography) {
    const fonts = takeUtility(list, "font");
    for (const hit of fonts.all) {
      const weight = WEIGHT_CLASS[hit.literal];
      if (weight !== undefined) {
        write(hit.literal, "typography.fontWeight", weight);
        d.checked.push(hit.literal);
        continue;
      }
      const familyName = /^family-name:(.+)$/.exec(hit.value);
      const raw = familyName ? familyName[1]! : hit.value;
      const ref = tokenRefOf(raw, ctx);
      if (ref) {
        write(hit.literal, "typography.fontFamily", ref);
        d.checked.push(hit.literal);
        continue;
      }
      const numeric = numberOf(raw);
      if (numeric !== null && !familyName) {
        write(hit.literal, "typography.fontWeight", numeric);
        d.checked.push(hit.literal);
        continue;
      }
      if (/^[A-Za-z][\w -]*$/.test(raw.replace(/_/g, " "))) {
        write(hit.literal, "typography.fontFamily", raw.replace(/_/g, " "));
        d.checked.push(hit.literal);
      } else note(hit.literal, "字族写法超出模型表达");
    }
    const texts = takeUtility(list, "text");
    for (const hit of texts.bare) {
      const align = ALIGN_CLASS[hit.literal];
      if (align) {
        write(hit.literal, "typography.align", align);
        d.checked.push(hit.literal);
        continue;
      }
      note(hit.literal, "text-* 不在字色/对齐白名单里");
    }
    for (const hit of texts.arbitrary) {
      const parsed = classifyText(hit.value, ctx);
      if (parsed.kind === "size") {
        write(hit.literal, "typography.fontSize", parsed.value);
        d.checked.push(hit.literal);
        continue;
      }
      if (parsed.kind === "color") {
        if (textColorHit) note(hit.literal, "出现第二个字色类，只取第一个");
        else {
          textColorHit = hit;
          d.checked.push(hit.literal);
        }
        continue;
      }
      note(hit.literal, "text-[…] 既不是字号也不是可识别的颜色");
    }
    if (textColorHit) {
      const color = colorOf(textColorHit.value, ctx)!;
      if (isText) {
        write(textColorHit.literal, "style.fills", [
          { kind: "solid", color },
          ...node.style.fills.filter((paint) => paint.kind === "image"),
        ]);
        fillsWritten = true;
      } else {
        write(textColorHit.literal, "typography.color", color);
      }
    }
    const leading = takeUtility(list, "leading");
    if (leading.all.length) {
      const hit = leading.all[0]!;
      if (hit.value === "normal") write(hit.literal, "typography.lineHeight", "auto");
      else {
        const n = numberOf(hit.value);
        if (n === null) note(hit.literal, "行高需要倍数");
        else write(hit.literal, "typography.lineHeight", n);
      }
      d.checked.push(leading.all[0]!.literal);
    }
    const tracking = takeUtility(list, "tracking");
    if (tracking.all.length) {
      const hit = tracking.all[0]!;
      const n = numberOf(hit.value);
      if (n === null) note(hit.literal, "字距需要 px 数值");
      else write(hit.literal, "typography.letterSpacing", n);
      d.checked.push(hit.literal);
    } else if (node.typography.letterSpacing) {
      write(null, "typography.letterSpacing", 0);
    }
    const textCase = list.find((token) => CASE_CLASS[token]);
    if (textCase) {
      consume(textCase);
      write(textCase, "typography.textCase", CASE_CLASS[textCase]);
      d.checked.push(textCase);
    } else if (node.typography.textCase && node.typography.textCase !== "original") {
      write(null, "typography.textCase", "original");
    }
    const decoration = list.includes("underline") ? "underline" : list.includes("line-through") ? "line-through" : null;
    if (decoration) {
      consume(decoration);
      write(decoration, "typography.decoration", decoration === "underline" ? "underline" : "line-through");
      d.checked.push(decoration);
    } else if (node.typography.decoration && node.typography.decoration !== "none") {
      write(null, "typography.decoration", "none");
    }
    const wrap = takeUtility(list, "whitespace");
    for (const hit of [...wrap.all, ...takeUtility(list, "line-clamp").all]) {
      const map: Record<string, NonNullable<Style["textWrap"]>> = {
        "whitespace-nowrap": "nowrap",
        truncate: "truncate",
        "line-clamp-2": "truncate-2",
        "line-clamp-3": "truncate-3",
      };
      const value = map[hit.literal];
      if (value) {
        write(hit.literal, "style.textWrap", value);
        d.checked.push(hit.literal);
      }
      // whitespace-pre / whitespace-pre-wrap 由宽度语义派生（§16），不回写成显式值
      else if (hit.value !== "pre" && hit.value !== "pre-wrap") note(hit.literal, "换行模式暂不支持该写法");
    }
    if (takeUtility(list, "truncate").all.length) {
      write("truncate", "style.textWrap", "truncate");
      d.checked.push("truncate");
    }
  } else {
    const stray = list.filter((token) => /^(text-|font-|leading-|tracking-|whitespace-|underline|line-through|uppercase|lowercase|capitalize)/.test(token));
    if (stray.length) {
      note(stray[0]!, `${node.type} 节点没有文字属性，这些类不回写（在画布上换成文本节点）`);
      stray.forEach((token) => consume(token));
    }
  }

  // fills 缺席：只有当模型现值确实会产出类名时，才视为用户删掉了它
  if (!fillsWritten && !backgrounds.all.length && !textColorHit) {
    const emits = node.style.fills.some((paint) =>
      paint.kind !== "image" && paintEmits(paint, ctx) && (isText ? paint.kind === "solid" : true),
    );
    if (emits) write(null, "style.fills", node.style.fills.filter((paint) => paint.kind === "image"));
  }

  // `hidden` 现在可能来自 `mobile` 那条规则（基线是它的投影），所以走 `write` 让归属分流生效
  if (consume("hidden")) write("hidden", "visible", false);
  else if (!node.visible) write(null, "visible", true);

  for (const [breakpoint, tokens] of variants) {
    const nested = decodeVariant(tokens, node, ctx, breakpoint, parent ? applyResponsive(parent, breakpoint).layout.mode : null);
    nested.checked.forEach((token) => d.checked.push(`${VARIANT_PREFIX[breakpoint]}${token}`));
    nested.unmapped.forEach((entry) =>
      d.unmapped.push({ token: `${VARIANT_PREFIX[breakpoint]}${entry.token}`, reason: `断点 ${breakpoint}：${entry.reason}` }),
    );
    d.responsive.set(breakpoint, nested);
  }

  for (const [state, tokens] of stateTokens) {
    const nested = decodeState(tokens, node, state, ctx);
    const prefix = STATE_VARIANT[state];
    nested.checked.forEach((token) => d.checked.push(`${prefix}${token}`));
    nested.unmapped.forEach((entry) =>
      d.unmapped.push({ token: `${prefix}${entry.token}`, reason: `状态 ${state}：${entry.reason}` }),
    );
    d.states.set(state, nested);
  }

  for (const token of list) note(token, "不在 Design ↔ Code 类名白名单里（§19）");
  return d;
}

/** 生成器用 `_` 连接 stops（类名里不能有空格），所以这里按 stop 扫描而不是按逗号切 */
const GRADIENT_STOP = /(rgba?\([^)]*\)|var\([^)]*\)|[^_]+)_(\d+(?:\.\d+)?)%(?:_|$)/g;

function parseGradient(raw: string, ctx: Ctx): Paint | null {
  const m = /^(linear|radial|conic)-gradient\((.*)\)$/.exec(raw);
  if (!m) return null;
  let body = m[2]!;
  let angle: number | undefined;
  if (m[1] === "linear") {
    const head = /^(-?[\d.]+)deg,(.*)$/.exec(body);
    if (!head) return null;
    angle = Number(head[1]);
    body = head[2]!;
  }
  const stops: { at: number; color: ColorValue }[] = [];
  let cursor = 0;
  while (cursor < body.length) {
    GRADIENT_STOP.lastIndex = cursor;
    const hit = GRADIENT_STOP.exec(body);
    if (!hit || hit.index !== cursor) return null;
    const color = colorOf(hit[1]!, ctx);
    if (color === null) return null;
    stops.push({ at: Number(hit[2]) / 100, color });
    cursor = hit.index + hit[0].length;
  }
  if (!stops.length) return null;
  return {
    kind: "gradient",
    type: m[1] as "linear" | "radial" | "conic",
    stops,
    ...(angle === undefined ? {} : { angle }),
  };
}

const SHADOW = /^(-?[\d.]+)px_(-?[\d.]+)px_([\d.]+)px_([\d.]+)px_(.*)$/;

function parseShadow(raw: string, ctx: Ctx): Effect | null {
  const inset = raw.startsWith("inset_");
  const m = SHADOW.exec(inset ? raw.slice(6) : raw);
  if (!m) return null;
  const color = colorOf(m[5]!, ctx);
  return {
    kind: inset ? "inner-shadow" : "drop-shadow",
    offsetX: Number(m[1]),
    offsetY: Number(m[2]),
    blur: Number(m[3]),
    spread: Number(m[4]),
    ...(color === null ? {} : { color }),
  };
}

// ---------------------------------------------------------------------------
// 3. JSX 树 → 设计补丁（§19）
// ---------------------------------------------------------------------------

export interface CodeToDesignOptions extends CodeParseOptions {
  /** 与生成时一致的 mode：根元素 data-theme 变了要说出来，不能默默丢掉 */
  mode?: string | null;
}

export interface UnmappedEntry {
  /** 越界的类名 / 属性 / 标签；结构性问题用 '-' 占位 */
  token: string;
  reason: string;
}

export interface NodeMapping {
  nodeId: string;
  nodeName: string;
  /** 源码里的行号；0 表示源码中没有对应元素 */
  line: number;
  /** 已识别并写回模型的属性路径 */
  applied: string[];
  /** 如实列出的不可回写片段（§159：不静默丢弃） */
  unmapped: UnmappedEntry[];
}

export interface CodeToDesignResult {
  ops: PatchOp[];
  mappings: NodeMapping[];
  /** 解析层与结构层的问题：非空时对应片段不会回写 */
  issues: ParseIssue[];
}

function allowedTags(node: DesignNode): string[] {
  switch (node.type) {
    case "text":
      return ["p", "h1", "h2", "h3", "h4", "h5", "h6", "span"];
    case "button":
      return ["button"];
    case "input":
      return ["input"];
    case "image":
      return ["img"];
    case "video":
      return ["video"];
    case "code":
      return ["pre", "code"];
    case "section":
      return ["section", "div"];
    default:
      return ["div", "main", "span", "article", "aside", "nav", "header", "footer", "label", "figure"];
  }
}

/** 只为校验用：把 set 类补丁就地打到页面上 */
function applySetOps(page: Page, ops: readonly PatchOp[]): Page {
  const next = clone(page);
  for (const op of ops) {
    if (op.op !== "set") continue;
    const node = next.nodes[op.nodeId];
    if (!node) continue;
    setOnObject(node as unknown as Record<string, unknown>, op.path, op.value);
  }
  return next;
}

function classIndex(root: JsxElement): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const walk = (el: JsxElement): void => {
    const id = el.attrs["data-nexus-id"];
    if (id) out.set(id, (el.attrs["className"] ?? "").split(/\s+/).filter(Boolean));
    el.children.forEach(walk);
  };
  walk(root);
  return out;
}

/** 重投影自检：应用补丁后重新生成，逐个类名核对，识别错误不能变成静默的模型漂移 */
function reprojectedClasses(page: Page, ops: readonly PatchOp[], prefix: string): Map<string, string[]> | null {
  const patched = applySetOps(page, ops);
  const generated = generatePageComponent(patched, { cssVarPrefix: prefix }, "NexusCheck");
  const { root } = parseJsx(generated.contents);
  return root ? classIndex(root) : null;
}

function responsiveOps(
  decoded: Decode,
  node: DesignNode,
  ops: PatchOp[],
  applied: string[],
  unmapped: UnmappedEntry[],
): void {
  if (!decoded.responsive.size) return;
  const rules = clone(node.responsive ?? []);
  let changed = false;
  for (const [breakpoint, nested] of decoded.responsive) {
    const matches = rules.filter((rule) => rule.breakpoint === breakpoint);
    if (matches.length > 1) {
      unmapped.push({
        token: VARIANT_PREFIX[breakpoint] ?? breakpoint,
        reason: "同一断点有多条响应式规则，无法确定写回哪一条",
      });
      continue;
    }
    const overlay: Record<string, unknown> = {};
    for (const group of RESPONSIVE_PATCH_GROUPS) {
      const value = nested.patch[group];
      if (value) overlay[group] = value;
    }
    if (nested.patch.visible !== undefined) overlay.visible = nested.patch.visible;
    if (!Object.keys(overlay).length) continue;
    if (matches.length) {
      const at = rules.findIndex((rule) => rule.breakpoint === breakpoint);
      rules[at] = { breakpoint, patch: mergePatch(rules[at]!.patch as Record<string, unknown>, overlay) };
    } else {
      rules.push({ breakpoint, patch: overlay } as (typeof rules)[number]);
    }
    changed = true;
  }
  if (!changed) return;
  if (sameValue(rules, node.responsive ?? [])) return;
  ops.push({ op: "set", nodeId: node.id, path: "responsive", value: rules });
  applied.push("responsive");
}

/**
 * 状态补丁回写（ADR-0062 part ②）。整通道替换：解码出的四通道整体覆盖该状态，
 * 一个通道都不剩的状态整个删掉。与 responsiveOps 同构，但写的是 states 路径。
 */
function stateOps(
  decoded: Decode,
  node: DesignNode,
  ops: PatchOp[],
  applied: string[],
): void {
  if (!decoded.states.size) return;
  const states: NodeStates = clone(node.states ?? {});
  let changed = false;
  for (const [state, nested] of decoded.states) {
    const overlay = nested.patch as NodeStateStyle;
    if (!Object.keys(overlay).length) {
      if (states[state]) {
        delete states[state];
        changed = true;
      }
      continue;
    }
    if (sameValue(states[state], overlay)) continue;
    states[state] = overlay;
    changed = true;
  }
  if (!changed) return;
  if (sameValue(states, node.states ?? {})) return;
  ops.push({ op: "set", nodeId: node.id, path: "states", value: states });
  applied.push("states");
}

function mergePatch(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(next)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const before = out[key];
      out[key] = {
        ...(before && typeof before === "object" && !Array.isArray(before) ? (before as object) : {}),
        ...(value as object),
      };
    } else out[key] = value;
  }
  return out;
}

/**
 * Code → Design：把改过的组件源码映射回设计模型补丁。
 *
 * 只产出 `set`（属性与文案）。结构性变更（新增/删除/换父/重排）、锁定节点、越界语法
 * 都会落到 `issues` / `mappings[].unmapped`，对应片段保留在代码里（§19）。
 * 每个节点还会做一次重投影自检：识别出的类名必须能被生成器原样再现，否则放弃该节点。
 */
export function codeToPageOps(
  source: string,
  page: Page,
  options: CodeToDesignOptions = {},
): CodeToDesignResult {
  const ctx = makeCtx(options);
  const { root, issues } = parseJsx(source);
  const mappings: NodeMapping[] = [];
  const ops: PatchOp[] = [];
  if (!root) return { ops, mappings, issues };

  const rootId = root.attrs["data-nexus-id"];
  const rootNode = rootId ? page.nodes[rootId] : undefined;
  if (!rootNode || rootNode.id !== page.rootId) {
    return {
      ops: [],
      mappings: [],
      issues: [
        ...issues,
        {
          line: root.line,
          message: `根元素的 data-nexus-id 必须是当前页面的 ${page.rootId}`,
        },
      ],
    };
  }
  if (options.mode !== undefined && options.mode !== null && root.attrs["data-theme"] !== options.mode) {
    issues.push({
      line: root.line,
      message: "data-theme 是文档级主题 mode，请在 Design System 面板切换（§12）",
    });
  }

  const checkedByNode = new Map<string, string[]>();

  const visit = (el: JsxElement, node: DesignNode, parent: DesignNode | null): void => {
    const mapping: NodeMapping = {
      nodeId: node.id,
      nodeName: node.name,
      line: el.line,
      applied: [],
      unmapped: [],
    };
    mappings.push(mapping);
    if (node.locked) {
      mapping.unmapped.push({ token: "-", reason: "节点已锁定：请先在画布解锁" });
      return;
    }
    if (!allowedTags(node).includes(el.tag)) {
      mapping.unmapped.push({
        token: `<${el.tag}>`,
        reason: `标签与节点类型 ${node.type} 的投影不一致：元素类型由画布决定（§16）`,
      });
    }
    if (el.spreads.length) {
      mapping.unmapped.push({ token: `{...${el.spreads[0]}}`, reason: "展开属性无法映射回设计模型" });
    }
    const exprAttrs = Object.keys(el.exprAttrs);
    if (exprAttrs.length) {
      mapping.unmapped.push({ token: exprAttrs[0]!, reason: "表达式属性无法映射回设计模型" });
    }

    const decoded = decodeClasses(
      (el.attrs["className"] ?? "").split(/\s+/).filter(Boolean),
      // 解码比的是**基线那一寸**：`mobile` 档的覆盖已经并进无前缀那组类（生成侧 `baselineOf`），
      // 拿原始设计值去读会把"手机档改过的值"当成作者这次新写的值。值落到哪一边由归属分流决定。
      mobileBaselineOf(node),
      parent ? mobileBaselineOf(parent) : null,
      ctx,
    );
    decoded.unmapped.forEach((entry) => mapping.unmapped.push(entry));
    checkedByNode.set(node.id, decoded.checked);

    for (const [path, value] of decoded.props) {
      if (sameValue(getByPath(node, path), value)) continue;
      ops.push({ op: "set", nodeId: node.id, path, value });
      mapping.applied.push(path);
    }
    responsiveOps(decoded, node, ops, mapping.applied, mapping.unmapped);
    stateOps(decoded, node, ops, mapping.applied);

    if (node.code) {
      const content = el.literals.join(" ");
      if (content && content !== node.code.content) {
        ops.push({ op: "set", nodeId: node.id, path: "code.content", value: content });
        mapping.applied.push("code.content");
      }
    } else if (node.type === "input") {
      const placeholder = el.attrs["placeholder"];
      if (placeholder !== undefined && placeholder !== (node.text ?? "")) {
        ops.push({ op: "set", nodeId: node.id, path: "text", value: placeholder });
        mapping.applied.push("text");
      }
    } else if (node.text !== undefined && !el.children.length) {
      const text = el.literals.length ? el.literals.join(" ") : "";
      if (text !== node.text) {
        ops.push({ op: "set", nodeId: node.id, path: "text", value: text });
        mapping.applied.push("text");
      }
    }
    if (node.type === "image" || node.type === "video") {
      const alt = el.attrs["alt"];
      if (alt !== undefined && alt !== (node.alt ?? node.name)) {
        ops.push({ op: "set", nodeId: node.id, path: "alt", value: alt });
        mapping.applied.push("alt");
      }
      const src = el.attrs["src"];
      const derived = node.src ?? (node.assetId ? `/assets/${node.assetId}` : "");
      if (src !== undefined && src !== derived) {
        ops.push({ op: "set", nodeId: node.id, path: "src", value: src });
        mapping.applied.push("src");
      }
    }

    const expected = childrenOf(page, node);
    const seen = new Set<string>();
    let orderOk = true;
    expected.forEach((child, index) => {
      const id = el.children[index]?.attrs["data-nexus-id"];
      if (id && id !== child.id && expected.some((c) => c.id === id)) orderOk = false;
    });
    for (const child of el.children) {
      const id = child.attrs["data-nexus-id"];
      const childNode = id ? page.nodes[id] : undefined;
      if (!childNode) {
        issues.push({
          line: child.line,
          message: id
            ? `data-nexus-id="${id}" 不属于当前页面：这段代码保留为 code-only，不回写为设计节点（§19）`
            : "新增元素没有 data-nexus-id：保留为 code-only，不回写为设计节点（§19）",
        });
        continue;
      }
      if (!expected.some((c) => c.id === childNode.id)) {
        issues.push({
          line: child.line,
          message: `${childNode.name} 的父级与设计模型不一致：移动节点不在代码里回写（§19）`,
        });
        continue;
      }
      if (seen.has(childNode.id)) {
        issues.push({ line: child.line, message: `${childNode.name} 出现了两次：重复引用不回写` });
        continue;
      }
      seen.add(childNode.id);
      visit(child, childNode, node);
    }
    const missing = expected.filter((child) => !seen.has(child.id));
    if (missing.length) {
      issues.push({
        line: el.line,
        message: `${node.name}：源码里缺少 ${missing.map((c) => c.name).join("、")} 的元素，删除节点属于结构性变更，保留在模型里（§19）`,
      });
    } else if (!orderOk) {
      issues.push({
        line: el.line,
        message: `${node.name}：子节点顺序与设计模型不一致，重排请在画布或图层树完成（§19）`,
      });
    }
  };

  visit(root, rootNode, null);

  // 重投影自检：识别错的类名会让生成结果对不上，这时放弃该节点而不是留下半个模型
  const after = reprojectedClasses(page, ops, ctx.prefix);
  if (!after) {
    return {
      ops: [],
      mappings,
      issues: [...issues, { line: 0, message: "重投影自检失败：本次不回写" }],
    };
  }
  const changedNodes = new Set(mappings.filter((m) => m.applied.length).map((m) => m.nodeId));
  for (const mapping of mappings) {
    const checked = checkedByNode.get(mapping.nodeId) ?? [];
    if (!checked.length) continue;
    const node = page.nodes[mapping.nodeId];
    const parentChanged = Boolean(node?.parentId && changedNodes.has(node.parentId));
    const pool = [...(after.get(mapping.nodeId) ?? [])];
    const missing = checked.filter((token) => {
      if (parentChanged && PARENT_SCOPED.has(token)) return false;
      const at = pool.indexOf(token);
      if (at < 0) return true;
      pool.splice(at, 1);
      return false;
    });
    if (!missing.length) continue;
    ops.splice(
      0,
      ops.length,
      ...ops.filter((op) => !("nodeId" in op) || op.nodeId !== mapping.nodeId),
    );
    mapping.applied = [];
    mapping.unmapped.push({
      token: missing.join(" "),
      reason: "识别结果无法由设计模型重新生成，已放弃该节点的回写（§19）",
    });
  }

  return { ops, mappings, issues };
}

/** 两份源码之间的差异节点：UI 只对这些节点提示 unmapped，避免未改动节点产生噪音 */
export function changedNodeIds(original: string, edited: string): Set<string> | null {
  const a = parseJsx(original).root;
  const b = parseJsx(edited).root;
  if (!a || !b) return null;
  const before = classIndex(a);
  const after = classIndex(b);
  const out = new Set<string>();
  const textOf = (root: JsxElement): Map<string, string> => {
    const map = new Map<string, string>();
    const walk = (el: JsxElement): void => {
      const id = el.attrs["data-nexus-id"];
      if (id) map.set(id, el.literals.join(" "));
      el.children.forEach(walk);
    };
    walk(root);
    return map;
  };
  const textBefore = textOf(a);
  const textAfter = textOf(b);
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if (
      !sameValue(before.get(id) ?? null, after.get(id) ?? null) ||
      !sameValue(textBefore.get(id) ?? null, textAfter.get(id) ?? null)
    ) {
      out.add(id);
    }
  }
  return out;
}

export interface CodeEditSummary {
  changed: { nodeName: string; line: number; paths: string[] }[];
  unmapped: { nodeName: string; line: number; reasons: string[] }[];
}

/** 面向用户的回写清单（§26 的 Activity Feed 与 AI Diff 用同一份表达） */
export function summarizeCodeEdit(
  result: CodeToDesignResult,
  only?: Set<string> | null,
): CodeEditSummary {
  const changed: CodeEditSummary["changed"] = [];
  const unmapped: CodeEditSummary["unmapped"] = [];
  for (const mapping of result.mappings) {
    if (mapping.applied.length) {
      changed.push({
        nodeName: mapping.nodeName,
        line: mapping.line,
        paths: mapping.applied,
      });
    }
    if (!mapping.unmapped.length) continue;
    if (only && !only.has(mapping.nodeId)) continue;
    unmapped.push({
      nodeName: mapping.nodeName,
      line: mapping.line,
      reasons: mapping.unmapped.map((entry) => `${entry.token}：${entry.reason}`),
    });
  }
  return { changed, unmapped };
}



