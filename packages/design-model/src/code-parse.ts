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
import { generatePageComponent } from "./codegen";
import type { PatchOp } from "./patch";
import type {
  BreakpointName,
  ColorValue,
  CornerRadius,
  DesignNode,
  Effect,
  Layout,
  Page,
  Paint,
  SizeValue,
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

function parseChildren(s: Scanner, issues: ParseIssue[]): {
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
      const child = parseElement(s, issues);
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

function parseElement(s: Scanner, issues: ParseIssue[]): JsxElement | null {
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
  s.take(1);
  const body = parseChildren(s, issues);
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
      const el = parseElement(s, issues);
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

const JUSTIFY_CLASS: Record<string, Layout["justify"]> = {
  "justify-start": "start",
  "justify-center": "center",
  "justify-end": "end",
  "justify-between": "space-between",
  "justify-around": "space-around",
  "justify-evenly": "space-evenly",
};

const ITEMS_CLASS: Record<string, Layout["items"]> = {
  "items-start": "start",
  "items-center": "center",
  "items-end": "end",
  "items-stretch": "stretch",
  "items-baseline": "baseline",
};

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

/** 派生类名：由别的字段决定，不参与重投影一致性核对 */
const DERIVED = new Set(["flex", "relative", "absolute", "whitespace-pre", "whitespace-pre-wrap"]);

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
function tokenRefOf(raw: string, ctx: Ctx): string | null {
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
}

/** 响应式覆盖：codegen 只产出这些字段，回写也只接受这些字段 */
function decodeVariant(
  tokens: string[],
  node: DesignNode,
  ctx: Ctx,
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
    const n = numberOf(hit.value);
    if (n === null) note(hit.literal, "gap 需要 px 数值");
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
  if (list.includes("flex-col")) {
    list.splice(list.indexOf("flex-col"), 1);
    layout.mode = "vertical";
    out.checked.push("flex-col");
  }
  if (list.includes("flex-row")) {
    list.splice(list.indexOf("flex-row"), 1);
    layout.mode = "horizontal";
    out.checked.push("flex-row");
  }
  if (list.includes("flex")) list.splice(list.indexOf("flex"), 1);
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
  if (Object.keys(size).length) out.patch.size = size;
  if (Object.keys(layout).length) out.patch.layout = layout;
  if (Object.keys(style).length) out.patch.style = style;
  if (Object.keys(typography).length) out.patch.typography = typography;
  for (const token of list) note(token, "不在响应式回写白名单里（§19）");
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
  const d: Decode = { props: new Map(), checked: [], unmapped: [], responsive: new Map() };

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

  const note = (token: string, reason: string): void => {
    d.unmapped.push({ token, reason });
  };
  const write = (token: string | null, path: string, value: unknown): void => {
    if (value === undefined) return;
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
    const n = numberOf(hit.value);
    if (n === null) note(hit.literal, "gap 需要 px 数值");
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
    const pad = { top: 0, right: 0, bottom: 0, left: 0 };
    let ok = true;
    const read = (hit: Hit | undefined, side: keyof typeof pad): void => {
      if (!hit) return;
      const n = numberOf(hit.value);
      if (n === null) {
        ok = false;
        note(hit.literal, `padding ${side} 需要 px 数值`);
        return;
      }
      pad[side] = n;
    };
    if (paddings.uniform.all.length) {
      const n = numberOf(paddings.uniform.all[0]!.value);
      if (n === null) note(paddings.uniform.all[0]!.literal, "padding 需要 px 数值");
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
      const n = numberOf(hit.value);
      if (n === null) note(hit.literal, "圆角需要 px 数值");
      else {
        corners[side] = n;
        d.checked.push(hit.literal);
      }
    }
  }
  const rounded = takeUtility(list, "rounded");
  if (rounded.all.length) {
    const hit = rounded.all[0]!;
    const n = numberOf(hit.value);
    if (n === null) note(hit.literal, "圆角需要 px 数值（token 绑定请在画布上做）");
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

  if (consume("hidden")) d.props.set("visible", false);
  else if (!node.visible) d.props.set("visible", true);

  for (const [breakpoint, tokens] of variants) {
    const nested = decodeVariant(tokens, node, ctx);
    nested.checked.forEach((token) => d.checked.push(`${VARIANT_PREFIX[breakpoint]}${token}`));
    nested.unmapped.forEach((entry) =>
      d.unmapped.push({ token: `${VARIANT_PREFIX[breakpoint]}${entry.token}`, reason: `断点 ${breakpoint}：${entry.reason}` }),
    );
    d.responsive.set(breakpoint, nested);
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
    for (const key of ["size", "layout", "style", "typography"] as const) {
      const value = nested.patch[key];
      if (value) overlay[key] = value;
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
      node,
      parent,
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



