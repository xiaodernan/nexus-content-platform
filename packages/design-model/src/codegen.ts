/**
 * Design → Code（§17-19）：设计模型 → React + TypeScript + Tailwind。
 *
 * 这是投影，不是第二次设计：层级、尺寸语义、token 引用全部取自模型，
 * 生成器不得自行推断布局（否则画布与代码漂移，违反 §16）。
 * 本包禁止 import React / DOM / fs —— 只产出字符串。
 */

import { childrenOf } from "./nodes";
import { NODE_STATES, STATE_VARIANT } from "./states";
import { toHex, tokenRefKey } from "./tokens";
import type {
  BreakpointName,
  DesignDocument,
  DesignNode,
  Page,
  Paint,
  RGBA,
  Style,
  Token,
} from "./types";

export interface GeneratedFile {
  path: string;
  contents: string;
  /**
   * 这份文件是从模型的哪一处投影来的（§69）。文件名可以按页面生成，也可以被后续改动打乱，
   * 所以依赖它的索引不许从路径猜归属——由发射器亲自标注，猜的那一份迟早会说谎。
   */
  origin: CodeOrigin;
}

export type CodeOrigin =
  | { kind: "page"; pageId: string; pageName: string }
  | { kind: "tokens" }
  | { kind: "barrel" };

export interface CodegenOptions {
  /**
   * 生成代码里的 CSS 变量前缀。默认 nx 而不是 nexus：Studio 自身的 UI 已经占用了
   * --nexus-* 这套名字（含 --nexus-font-mono），同前缀会让导出的页面在应用内串色。
   */
  cssVarPrefix?: string;
  /** 指定主题 mode：非空时根元素带 data-theme，套用 tokens.css 里的 mode 块 */
  mode?: string | null;
}

const HEADER =
  "// 由 NEXUS 从设计模型生成。页面组件可以在 Studio 的代码视图里改，应用后写回模型；" +
  "解析不了的片段会在下一次生成时被模型覆盖（§19）\n";

const BREAKPOINT_CLASS: Record<BreakpointName, string> = {
  mobile: "",
  tablet: "md:",
  desktop: "lg:",
  wide: "xl:",
};

const WEIGHT_CLASS: Record<number, string> = {
  100: "font-thin",
  200: "font-extralight",
  300: "font-light",
  400: "font-normal",
  500: "font-medium",
  600: "font-semibold",
  700: "font-bold",
  800: "font-extrabold",
  900: "font-black",
};

const JUSTIFY_CLASS: Record<string, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  "space-between": "justify-between",
  "space-around": "justify-around",
  "space-evenly": "justify-evenly",
};

const ITEMS_CLASS: Record<string, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
};

/** CSS 颜色对象 → hex；字面量里的空格换成 Tailwind 任意值要求的下划线 */
function colorLiteral(value: unknown): string | null {
  if (typeof value === "string") return /^[#a-z(]/i.test(value) ? value.replace(/\s+/g, "_") : null;
  if (value && typeof value === "object" && "r" in value) {
    return toHex(value as RGBA).replace(/\s+/g, "_");
  }
  return null;
}

const cssVar = (key: string, prefix: string): string =>
  `var(--${prefix}-${key.replace(/\./g, "-")})`;

/** 长度类属性（尺寸/间距/字号/圆角）：token 引用 → CSS 变量，数字 → px */
function lengthClass(
  value: unknown,
  prefix: string,
  utility: (inner: string) => string,
): string | null {
  const key = tokenRefKey(value);
  if (key) return utility(cssVar(key, prefix));
  if (typeof value === "number" && Number.isFinite(value)) {
    return utility(`${Math.round(value * 100) / 100}px`);
  }
  if (typeof value === "string" && /^\d+(\.\d+)?(px|rem|em|%)$/.test(value)) {
    return utility(value);
  }
  return null;
}

function colorClass(
  value: unknown,
  prefix: string,
  utility: (inner: string) => string,
): string | null {
  const key = tokenRefKey(value);
  if (key) return utility(cssVar(key, prefix));
  const literal = colorLiteral(value);
  return literal ? utility(literal) : null;
}

const firstSolid = (
  paints: readonly Paint[],
): { color: unknown; opacity?: number } | null => {
  for (const paint of paints) {
    if (paint.visible === false) continue;
    if (paint.kind === "solid") return { color: paint.color, opacity: paint.opacity };
  }
  return null;
};

function gradientClass(paint: Paint, prefix: string): string | null {
  if (paint.kind !== "gradient") return null;
  const stops = paint.stops
    .map((stop) => {
      const key = tokenRefKey(stop.color);
      const value = key ? cssVar(key, prefix) : colorLiteral(stop.color) ?? "transparent";
      return `${value}_${Math.round(stop.at * 100)}%`;
    })
    .join("_");
  if (paint.type === "radial") return `bg-[radial-gradient(${stops})]`;
  if (paint.type === "conic") return `bg-[conic-gradient(${stops})]`;
  return `bg-[linear-gradient(${paint.angle ?? 180}deg,${stops})]`;
}

/** 与渲染层同一份契约（§16）：text 的 fills[0] 是字色，其它类型的 fills 是背景 */
function isTextLabel(node: DesignNode): boolean {
  return node.type === "text";
}

function backgroundClasses(node: DesignNode, prefix: string): string[] {
  if (isTextLabel(node)) return [];
  const out: string[] = [];
  const gradient = node.style.fills.find(
    (paint) => paint.visible !== false && paint.kind === "gradient",
  );
  if (gradient) {
    const cls = gradientClass(gradient, prefix);
    if (cls) out.push(cls);
  } else {
    const solid = firstSolid(node.style.fills);
    if (solid) {
      const cls = colorClass(solid.color, prefix, (inner) => `bg-[${inner}]`);
      if (cls) out.push(cls);
    }
  }
  for (const paint of node.style.fills) {
    // 位图填充需要资产服务（任务 #9）；在此之前显式留注释，不生成破图
    if (paint.kind === "image" && paint.visible !== false) {
      out.push("bg-contain");
      break;
    }
  }
  return out;
}

type FlexAxis = "horizontal" | "vertical" | null;

function flexAxisOf(parent: DesignNode | null): FlexAxis {
  if (!parent) return null;
  const mode = parent.layout.mode;
  return mode === "horizontal" || mode === "vertical" ? mode : null;
}

function isAbsoluteChild(node: DesignNode, parent: DesignNode | null): boolean {
  if (!parent) return false;
  const mode = parent.layout.mode;
  return mode === "none" || mode === "stack";
}

function sizeClasses(
  node: DesignNode,
  parent: DesignNode | null,
  prefix: string,
): string[] {
  const out: string[] = [];
  const axis = flexAxisOf(parent);
  const stretchCross = parent?.layout.items === "stretch";

  const emit = (dim: "width" | "height"): void => {
    const value = node.size[dim];
    const key = dim === "width" ? "w" : "h";
    const isMain = axis === (dim === "width" ? "horizontal" : "vertical");
    if (value === "fill") {
      if (axis && isMain) out.push("flex-1");
      else if (axis) out.push("self-stretch");
      else out.push(`${key}-full`);
      return;
    }
    if (value === "hug") {
      if (axis && !isMain && stretchCross) out.push("self-stretch");
      else if (!axis || !isMain) out.push(dim === "width" ? "w-fit" : "h-fit");
      return;
    }
    const cls = lengthClass(value, prefix, (inner) => `${key}-[${inner}]`);
    out.push(cls ?? (dim === "width" ? "w-fit" : "h-fit"));
  };

  emit("width");
  emit("height");

  const style = node.style;
  if (style.minWidth) out.push(`min-w-[${lengthClass(style.minWidth, prefix, (i) => i) ?? "0"}]`);
  if (style.maxWidth) out.push(`max-w-[${lengthClass(style.maxWidth, prefix, (i) => i) ?? "none"}]`);
  if (style.minHeight) out.push(`min-h-[${lengthClass(style.minHeight, prefix, (i) => i) ?? "0"}]`);
  if (style.maxHeight) out.push(`max-h-[${lengthClass(style.maxHeight, prefix, (i) => i) ?? "none"}]`);
  if (style.aspectRatio) out.push(`aspect-[${style.aspectRatio}]`);
  return out;
}

function layoutClasses(
  node: DesignNode,
  prefix: string,
  placement: { absolute: boolean; hasChildren: boolean },
): string[] {
  const layout = node.layout;
  const out: string[] = [];
  switch (layout.mode) {
    case "vertical":
      out.push("flex", "flex-col");
      break;
    case "horizontal":
      out.push("flex", "flex-row");
      break;
    case "wrap":
      out.push("flex", "flex-wrap");
      break;
    case "grid":
      out.push("grid", `grid-cols-[repeat(${Math.max(1, layout.columns ?? 1)},minmax(0,1fr))]`);
      break;
    case "stack":
    case "none":
      // 子节点用 absolute 摆放时父级需要定位参照；absolute 元素自身已经是参照，重复写会和
      // Tailwind 的 position 工具类互相覆盖
      if (!placement.absolute && placement.hasChildren) out.push("relative");
      break;
  }
  if (layout.reverse && (layout.mode === "vertical" || layout.mode === "horizontal")) {
    out.push(layout.mode === "vertical" ? "flex-col-reverse" : "flex-row-reverse");
  }
  if (layout.gap) {
    const cls = lengthClass(layout.gap, prefix, (inner) => `gap-[${inner}]`);
    if (cls) out.push(cls);
  }
  const pad = layout.padding;
  if (pad && (pad.top || pad.right || pad.bottom || pad.left)) {
    if (pad.top === pad.right && pad.top === pad.bottom && pad.top === pad.left) {
      const cls = lengthClass(pad.top, prefix, (inner) => `p-[${inner}]`);
      if (cls) out.push(cls);
    } else {
      const sides: ["top" | "right" | "bottom" | "left", string][] = [
        ["top", "pt"],
        ["right", "pr"],
        ["bottom", "pb"],
        ["left", "pl"],
      ];
      for (const [side, utility] of sides) {
        const cls = lengthClass(pad[side], prefix, (inner) => `${utility}-[${inner}]`);
        if (cls && pad[side]) out.push(cls);
      }
    }
  }
  if (layout.mode === "vertical" || layout.mode === "horizontal") {
    // justify/items 一律显式写出：浏览器默认 align-items:stretch，与设计模型的 start 不一致，
    // 省略就会让导出的代码和画布漂移（§16）。
    out.push(JUSTIFY_CLASS[layout.justify] ?? "justify-start");
    out.push(ITEMS_CLASS[layout.items] ?? "items-start");
  }
  if (layout.clipContent) out.push("overflow-hidden");
  else if (layout.scroll === "vertical") out.push("overflow-y-auto");
  else if (layout.scroll === "horizontal") out.push("overflow-x-auto");
  else if (layout.scroll === "both") out.push("overflow-auto");
  return out;
}

function styleClasses(node: DesignNode, prefix: string, variant = ""): string[] {
  const out: string[] = [];
  const push = (cls: string | null): void => {
    if (cls) out.push(`${variant}${cls}`);
  };
  const style = node.style;
  const r = style.cornerRadius;
  const corners = [r.topLeft, r.topRight, r.bottomRight, r.bottomLeft];
  if (corners.some((c) => c)) {
    if (corners.every((c) => c === corners[0])) {
      push(lengthClass(corners[0], prefix, (inner) => `rounded-[${inner}]`));
    } else {
      const perCorner = ["rounded-tl", "rounded-tr", "rounded-br", "rounded-bl"];
      for (let i = 0; i < 4; i += 1) {
        push(lengthClass(corners[i], prefix, (inner) => `${perCorner[i]}-[${inner}]`));
      }
    }
  }
  const stroke = style.strokes.find((s) => s.visible !== false);
  if (stroke) {
    out.push(`${variant}border-[${Math.round(stroke.width * 100) / 100}px]`);
    const color = firstSolid(stroke.paints);
    push(color ? colorClass(color.color, prefix, (inner) => `border-[${inner}]`) : null);
  }
  for (const effect of style.effects) {
    if (effect.visible === false) continue;
    if (effect.kind === "drop-shadow" || effect.kind === "inner-shadow") {
      const inset = effect.kind === "inner-shadow" ? "inset_" : "";
      const color =
        colorClass(effect.color, prefix, (inner) => inner) ?? "rgba(0,0,0,0.4)";
      const num = (v: unknown): string =>
        lengthClass(v, prefix, (inner) => inner) ?? "0px";
      out.push(
        `${variant}shadow-[${inset}${num(effect.offsetX)}_${num(effect.offsetY)}_${num(effect.blur)}_${num(effect.spread)}_${color}]`,
      );
    }
    if (effect.kind === "layer-blur" && effect.blur) {
      out.push(`${variant}blur-[${lengthClass(effect.blur, prefix, (i) => i) ?? "0px"}]`);
    }
    if (effect.kind === "background-blur" && effect.blur) {
      out.push(`${variant}backdrop-blur-[${lengthClass(effect.blur, prefix, (i) => i) ?? "0px"}]`);
    }
  }
  if (style.opacity !== 1) out.push(`${variant}opacity-[${style.opacity}]`);
  if (style.blendMode !== "normal") out.push(`${variant}mix-blend-${style.blendMode}`);
  if (style.rotation) out.push(`${variant}rotate-[${style.rotation}deg]`);
  if (style.cursor !== "default") out.push(`${variant}cursor-${style.cursor}`);
  return out;
}

/**
 * §124 状态补丁 → Tailwind 变体前缀类（ADR-0062 part ①）。
 *
 * 只发补丁里真正指定的四通道：fills → bg（text 节点是字色 text-）、
 * strokes → border、effects → shadow/blur、opacity。变体前缀取自
 * STATE_VARIANT（唯一来源，code-parse 读同一张表）。补丁没有的状态不发射——
 * 类名里不出现作者没写过的状态。
 */
function stateClasses(node: DesignNode, prefix: string): string[] {
  const states = node.states;
  if (!states) return [];
  const out: string[] = [];
  for (const state of NODE_STATES) {
    const patch = states[state];
    if (!patch) continue;
    const variant = STATE_VARIANT[state];
    if (patch.fills) {
      const solid = firstSolid(patch.fills);
      if (solid) {
        const cls = isTextLabel(node)
          ? colorClass(solid.color, prefix, (inner) => `${variant}text-[${inner}]`)
          : colorClass(solid.color, prefix, (inner) => `${variant}bg-[${inner}]`);
        if (cls) out.push(cls);
      }
    }
    // 其余三通道复用 styleClasses：合成一个只有补丁通道的 style，
    // variant 前缀让每个类都带上状态变体
    const style: Style = {
      fills: [],
      strokes: patch.strokes ?? [],
      cornerRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      effects: patch.effects ?? [],
      opacity: patch.opacity ?? 1,
      blendMode: "normal",
      rotation: 0,
      cursor: "default",
    };
    out.push(...styleClasses({ ...node, style }, prefix, variant));
  }
  return out;
}

function typographyClasses(node: DesignNode, prefix: string): string[] {
  const t = node.typography;
  if (!t) return [];
  const out: string[] = [];
  const familyKey = tokenRefKey(t.fontFamily);
  if (familyKey) out.push(`font-[family-name:${cssVar(familyKey, prefix)}]`);
  else if (typeof t.fontFamily === "string" && t.fontFamily) {
    out.push(`font-[${t.fontFamily.replace(/\s+/g, "_")}]`);
  }
  const size = lengthClass(t.fontSize, prefix, (inner) => `text-[${inner}]`);
  if (size) out.push(size);
  out.push(WEIGHT_CLASS[t.fontWeight] ?? `font-[${t.fontWeight}]`);
  out.push(t.lineHeight === "auto" ? "leading-normal" : `leading-[${t.lineHeight}]`);
  if (t.letterSpacing) {
    out.push(`tracking-[${lengthClass(t.letterSpacing, prefix, (i) => i) ?? "0px"}]`);
  }
  if (t.align !== "left") out.push(`text-${t.align}`);
  if (t.textCase === "upper") out.push("uppercase");
  else if (t.textCase === "lower") out.push("lowercase");
  else if (t.textCase === "title") out.push("capitalize");
  if (t.decoration === "underline") out.push("underline");
  else if (t.decoration === "line-through") out.push("line-through");

  if (node.style.textWrap === "nowrap") out.push("whitespace-nowrap");
  else if (node.style.textWrap === "truncate") out.push("truncate");
  else if (node.style.textWrap === "truncate-2") out.push("line-clamp-2");
  else if (node.style.textWrap === "truncate-3") out.push("line-clamp-3");
  else if (node.size.width === "hug") {
    // hug 宽度的文字：模型已经决定了换行位置，DOM 不能再按字体实际宽度二次换行（§16）
    out.push("whitespace-pre");
  } else out.push("whitespace-pre-wrap");

  if (t.verticalAlign === "middle") out.push("flex", "flex-col", "justify-center");
  else if (t.verticalAlign === "bottom") out.push("flex", "flex-col", "justify-end");

  // text 的字色来自 fills[0]；button / input 的 fills 是背景，字色只能来自 typography.color
  const colorValue = isTextLabel(node)
    ? firstSolid(node.style.fills)?.color
    : t.color;
  const color = colorClass(colorValue, prefix, (inner) => `text-[${inner}]`);
  if (color) out.push(color);
  return out;
}

/** 响应式覆盖 → Tailwind 断点前缀（§14） */
function responsiveClasses(node: DesignNode, prefix: string): string[] {
  if (!node.responsive?.length) return [];
  const out: string[] = [];
  for (const rule of node.responsive) {
    const variant = BREAKPOINT_CLASS[rule.breakpoint];
    if (!variant) continue;
    const { layout, size, typography, style, visible } = rule.patch;
    if (size?.width === "fill") out.push(`${variant}w-full`);
    else if (size?.width === "hug") out.push(`${variant}w-fit`);
    else if (size?.width !== undefined) {
      const cls = lengthClass(size?.width, prefix, (i) => `${variant}w-[${i}]`);
      if (cls) out.push(cls);
    }
    if (size?.height === "fill") out.push(`${variant}h-full`);
    else if (size?.height === "hug") out.push(`${variant}h-fit`);
    else if (size?.height !== undefined) {
      const cls = lengthClass(size?.height, prefix, (i) => `${variant}h-[${i}]`);
      if (cls) out.push(cls);
    }
    const fontSize = lengthClass(typography?.fontSize, prefix, (i) => `${variant}text-[${i}]`);
    if (fontSize) out.push(fontSize);
    const gap = lengthClass(layout?.gap, prefix, (i) => `${variant}gap-[${i}]`);
    if (gap) out.push(gap);
    if (layout?.mode === "vertical") out.push(`${variant}flex-col`);
    else if (layout?.mode === "horizontal") out.push(`${variant}flex-row`);
    if (layout?.columns) {
      out.push(`${variant}grid-cols-[repeat(${layout.columns},minmax(0,1fr))]`);
    }
    if (style?.fills && !isTextLabel(node)) {
      const solid = firstSolid(style.fills);
      const bg = solid
        ? colorClass(solid.color, prefix, (inner) => `${variant}bg-[${inner}]`)
        : null;
      if (bg) out.push(bg);
    }
    if (visible === false) out.push(`${variant}hidden`);
  }
  return out;
}

function positionClasses(node: DesignNode, parent: DesignNode | null): string[] {
  if (!isAbsoluteChild(node, parent)) return [];
  const round = (v: number): string => `${Math.round(v * 100) / 100}px`;
  return ["absolute", `left-[${round(node.position.x)}]`, `top-[${round(node.position.y)}]`];
}

function elementFor(
  node: DesignNode,
  isRoot: boolean,
): { tag: string; leaf: boolean; runtimeOnly?: string } {
  switch (node.type) {
    case "text": {
      const size = typeof node.typography?.fontSize === "number" ? node.typography.fontSize : 16;
      const weight = node.typography?.fontWeight ?? 400;
      return { tag: size >= 32 && weight >= 600 ? "h1" : "p", leaf: false };
    }
    case "button":
      return { tag: "button", leaf: false };
    case "input":
      return { tag: "input", leaf: true };
    case "image":
      return { tag: "img", leaf: true };
    case "video":
      return { tag: "video", leaf: true };
    case "code":
      return { tag: "pre", leaf: false };
    case "section":
      return { tag: "section", leaf: false };
    case "frame":
      return { tag: isRoot ? "main" : "div", leaf: false };
    case "three":
    case "webgl":
      return { tag: "div", leaf: false, runtimeOnly: node.type };
    default:
      return { tag: "div", leaf: false };
  }
}

/** JSX 文本：安全字符直接写，其它用字符串字面量，避免 < > { } 破坏结构 */
const SAFE_JSX_TEXT =
  /^[\p{L}\p{N}\s.,!?:;'"()\-–—…、。，！“”‘’《》【】「」&+%*/]+$/u;

function jsxText(text: string): string {
  return SAFE_JSX_TEXT.test(text) ? text : `{${JSON.stringify(text)}}`;
}

const attr = (value: string): string => value.replace(/"/g, "&quot;");

interface RenderCtx {
  page: Page;
  prefix: string;
  mode: string | null;
}

function classOf(node: DesignNode, parent: DesignNode | null, ctx: RenderCtx): string {
  const absolute = isAbsoluteChild(node, parent);
  return [
    ...sizeClasses(node, parent, ctx.prefix),
    ...positionClasses(node, parent),
    ...layoutClasses(node, ctx.prefix, {
      absolute,
      hasChildren: childrenOf(ctx.page, node).length > 0,
    }),
    ...backgroundClasses(node, ctx.prefix),
    ...styleClasses(node, ctx.prefix),
    ...stateClasses(node, ctx.prefix),
    ...typographyClasses(node, ctx.prefix),
    ...responsiveClasses(node, ctx.prefix),
  ].join(" ");
}

function renderTree(node: DesignNode, parent: DesignNode | null, ctx: RenderCtx, depth: number, seen: Set<string> = new Set()): string {
  if (seen.has(node.id)) return ""; // 防环：畸形 children 链不再无限递归（ADR-0050）
  seen.add(node.id);
  const pad = "  ".repeat(depth + 2);
  const isRoot = !parent;
  const { tag, leaf, runtimeOnly } = elementFor(node, isRoot);
  const classes: string[] = [classOf(node, parent, ctx)];
  if (!node.visible) classes.push("hidden");

  const attrs: string[] = [`className="${classes.filter(Boolean).join(" ")}"`];
  if (isRoot && ctx.mode) attrs.push(`data-theme="${attr(ctx.mode)}"`);
  if (node.type === "button") attrs.unshift('type="button"');
  if (node.type === "input") {
    attrs.push(`placeholder="${attr(node.text ?? "")}"`, "readOnly");
  }
  if (node.type === "image") {
    attrs.push(`src="${attr(node.src ?? (node.assetId ? `/assets/${node.assetId}` : ""))}"`);
    attrs.push(`alt="${attr(node.alt ?? node.name)}"`);
  }
  if (node.type === "video") {
    attrs.push(`src="${attr(node.src ?? (node.assetId ? `/assets/${node.assetId}` : ""))}"`, "controls");
  }
  attrs.push(`data-nexus-id="${node.id}"`);

  const open = `${pad}<${tag} ${attrs.join(" ")}`;
  const children = childrenOf(ctx.page, node);

  if (leaf || (!children.length && !node.text && !node.code && !runtimeOnly)) {
    return `${open} />`;
  }

  const body: string[] = [];
  if (runtimeOnly) {
    body.push(
      `${pad}  {/* ${runtimeOnly} 节点由 NEXUS Runtime 承载，静态导出只保留占位容器（§50） */}`,
    );
  }
  if (node.code) {
    body.push(`${pad}  {/* code-only 区域：无法映射回设计模型，按原样保留（§19） */}`);
    body.push(`${pad}  {${JSON.stringify(node.code.content)}}`);
  } else if (node.text) {
    body.push(`${pad}  ${jsxText(node.text)}`);
  }
  for (const child of children) body.push(renderTree(child, node, ctx, depth + 1, seen));
  if (!body.length) return `${open} />`;
  return `${open}>\n${body.join("\n")}\n${pad}</${tag}>`;
}

function pascalCase(input: string, fallback: string): string {
  // filter(Boolean) 不能省：全中文页面名过滤完只剩空串，split 会交出 [""]，
  // 不滤掉的话 `word[0]?.toUpperCase() + word.slice(1)` 就拼出字符串 "undefined"，
  // 生成的文件叫 components/nexus/undefined.tsx、导出叫 export function undefined()。
  // 这个洞是 §69 的代码目录建起来之后第一次被照出来的（中文页面名是常态，不是边角）。
  const base = input
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join("");
  const name = base || fallback;
  return /^\d/.test(name) ? `P${name}` : name;
}

/** 组件名去重：两个同名页面不能生成两个同名导出 */
function componentNames(pages: readonly Page[]): string[] {
  const used = new Set<string>();
  return pages.map((page, index) => {
    let name = pascalCase(page.name, `Page${index + 1}`);
    while (used.has(name)) name = `${name}X`;
    used.add(name);
    return name;
  });
}

/** tokens.css：设计系统 → CSS 变量，生成代码里的 var(--nexus-*) 全部来自这里（§12） */
export function generateTokenCss(tokens: readonly Token[], prefix = "nx"): string {
  const root: string[] = [];
  const modes = new Map<string, string[]>();
  for (const token of tokens) {
    const variable = `--${prefix}-${token.key.replace(/\./g, "-")}`;
    const base = tokenCssValue(token, token.value, prefix);
    if (base !== null) root.push(`  ${variable}: ${base};`);
    for (const [mode, value] of Object.entries(token.modes ?? {})) {
      const rendered = tokenCssValue(token, value, prefix);
      if (rendered === null) continue;
      const bucket = modes.get(mode) ?? [];
      bucket.push(`  ${variable}: ${rendered};`);
      modes.set(mode, bucket);
    }
  }
  const blocks = [`:root {\n${root.join("\n")}\n}`];
  for (const [mode, entries] of [...modes.entries()].sort()) {
    blocks.push(`[data-theme="${mode}"] {\n${entries.join("\n")}\n}`);
  }
  return `/* 由 NEXUS 设计系统生成（§12）。改 token 请回到 Studio。 */\n${blocks.join("\n")}\n`;
}

function tokenCssValue(token: Token, value: unknown, prefix: string): string | null {
  const key = tokenRefKey(value);
  if (key) return `var(--${prefix}-${key.replace(/\./g, "-")})`;
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    if (token.type === "dimension") return `${value}px`;
    if (token.type === "duration") return `${value}ms`;
    return String(value);
  }
  if (value && typeof value === "object" && "r" in value) return toHex(value as RGBA);
  if (
    value &&
    typeof value === "object" &&
    "offsetX" in (value as Record<string, unknown>)
  ) {
    const shadow = value as {
      offsetX?: number;
      offsetY?: number;
      blur?: number;
      spread?: number;
      color?: unknown;
    };
    const color = colorLiteral(shadow.color) ?? "rgba(0,0,0,0.3)";
    return `${shadow.offsetX ?? 0}px ${shadow.offsetY ?? 0}px ${shadow.blur ?? 0}px ${shadow.spread ?? 0}px ${color.replace(/_/g, " ")}`;
  }
  return null;
}

export function generatePageComponent(
  page: Page,
  options: CodegenOptions,
  name: string,
): GeneratedFile {
  const root = page.nodes[page.rootId];
  if (!root) throw new Error(`页面 ${page.id} 缺少根节点 ${page.rootId}`);
  const ctx: RenderCtx = {
    page,
    prefix: options.cssVarPrefix ?? "nx",
    mode: options.mode ?? null,
  };
  const body = renderTree(root, null, ctx, 0);
  const source = `${HEADER}export function ${name}() {\n  return (\n${body}\n  );\n}\n`;
  return {
    path: `components/nexus/${name}.tsx`,
    contents: source,
    origin: { kind: "page", pageId: page.id, pageName: page.name },
  };
}

export function generateProject(
  document: DesignDocument,
  options: CodegenOptions,
): GeneratedFile[] {
  const prefix = options.cssVarPrefix ?? "nx";
  const names = componentNames(document.pages);
  const files: GeneratedFile[] = [
    {
      path: "styles/tokens.css",
      contents: generateTokenCss(document.tokens, prefix),
      origin: { kind: "tokens" },
    },
  ];
  document.pages.forEach((page, index) => {
    files.push(generatePageComponent(page, { ...options, cssVarPrefix: prefix }, names[index]!));
  });
  const imports = names.map((name) => `import { ${name} } from "./${name}";`).join("\n");
  const routes = document.pages
    .map(
      (page, index) =>
        `  { name: ${JSON.stringify(page.name)}, route: ${JSON.stringify(page.meta?.route ?? `/${page.name.toLowerCase()}`)}, component: ${names[index]} },`,
    )
    .join("\n");
  files.push({
    path: "components/nexus/index.ts",
    contents: `${HEADER}${imports}\n\nexport const nexusPages = [\n${routes}\n];\n`,
    origin: { kind: "barrel" },
  });
  return files;
}
