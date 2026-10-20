import type {
  BreakpointName,
  DesignNode,
  Page,
  ResponsiveRule,
  Typography,
} from "./types";
import { BREAKPOINT_WIDTH } from "./types";
import type { TokenStore } from "./tokens";
import { childrenOf, clone, requireNode } from "./nodes";

export interface MeasureResult {
  width: number;
  height: number;
  lines?: number;
}

export type MeasureTextFn = (
  text: string,
  typography: ResolvedTypography,
  availableWidth: number | null,
) => MeasureResult;

export interface ResolvedTypography extends Omit<
  Typography,
  "fontSize" | "fontFamily"
> {
  fontSize: number;
  fontFamily: string;
  nowrap: boolean;
}

export interface ResolvedNode {
  id: string;
  node: DesignNode;
  /** 画布绝对坐标 */
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  parentId: string | null;
  children: string[];
}

export interface ResolvedLayout {
  rootId: string;
  width: number;
  height: number;
  nodes: Record<string, ResolvedNode>;
  /** 绘制顺序：靠后在上，命中测试反向遍历 */
  paintOrder: string[];
}

export interface LayoutOptions {
  tokens?: TokenStore;
  mode?: string | null;
  breakpoint?: BreakpointName;
  measureText?: MeasureTextFn;
  defaultFontSize?: number;
  maxDepth?: number;
  /**
   * 测量缓存：节点 id → 约束键 → 尺寸。
   *
   * 带一个**签名**：缓存是在什么参数下算出来的（measureText / tokens / mode / breakpoint /
   * defaultFontSize）。参数一变，旧的结果就不再可信（同一个 measureText 换成另一个，
   * 量出来的文字宽度会不同）——所以签名对不上就整份作废，而不是"碰巧也没用上"。
   * 签名是库自己算、自己比，调用方不用管。
   *
   * **token 也在签名里**（2026-10-21 补上）：测量用的字号、间距、字体名都来自 token 解析，
   * token 一变而键没变，就会拿回旧尺寸。指纹覆盖整张 token 表（保守，见 tokensSignature）。
   */
  measureCache?: MeasureCache;
}

/** 测量缓存：条目 + 生成它时的参数签名 */
export interface MeasureCache {
  entries: Map<string, Map<string, Box>>;
  signature: string;
}

/**
 * 给测量函数发一个**身份号**（同一个函数永远同一个号，不同的函数不同号）。
 *
 * 为什么不能比源码：两个内容相同但不是同一个函数的 measureText（比如测试里现造的两个计数器）
 * 源码一模一样，但它们量出来的东西未必一样——按源码比就分不出来，缓存会拿着旧结果继续用。
 */
const measureFnIds = new WeakMap<object, number>();
let measureFnSeq = 0;
function measureFnId(fn: unknown): string {
  if (typeof fn !== 'function') return 'none';
  const key = fn as object;
  let id = measureFnIds.get(key);
  if (id === undefined) {
    measureFnSeq += 1;
    id = measureFnSeq;
    measureFnIds.set(key, id);
  }
  return `fn${id}`;
}

/**
 * token 表的指纹。
 *
 * 为什么它必须在签名里：测量结果取决于 **token 解析出来的值**（字号、间距、字体名），
 * 而缓存的键只看「节点 id + 约束」——token 变了而键没变，就会拿回旧尺寸
 * （"改了字号，高度却还是老的"）。这与"改了节点内容却沿用旧测量"是同一个坑，
 * 只是内容不在节点上、在 token 表里。
 *
 * 保守的地方（明写出来，别当成 bug）：指纹覆盖**整张** token 表，
 * 包括只影响颜色、并不影响测量的那些——改一次品牌色也会让缓存整份作废（下一帧重量一遍）。
 * 宁可多量一次，也不拿一个说不清的复用去赌尺寸是对的（§159）。
 * 要更细的话得先知道"哪个 token 被哪个样式字段引用"，那是另一件事。
 */
let tokenSigSeq = 0;
function tokensSignature(tokens: TokenStore | undefined): string {
  if (!tokens) return '-';
  const list = tokens.list();
  if (!list.length) return '-';
  try {
    // 按 key 排序：token 表的**顺序**不该影响"内容变了没有"
    const rows: Array<[string, unknown, unknown]> = list.map((token) => [
      token.key,
      token.value ?? null,
      token.modes ?? null,
    ]);
    rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return JSON.stringify(rows);
  } catch {
    // 量不出指纹（值里有循环引用之类）就当每一帧都不一样 → 整份作废（慢一次总比算错一次强）
    tokenSigSeq += 1;
    return `unstable:${tokenSigSeq}`;
  }
}

interface Box {
  width: number;
  height: number;
}

const BREAKPOINT_ORDER: BreakpointName[] = [
  "mobile",
  "tablet",
  "desktop",
  "wide",
];

/** §14 响应式规则：合并当前 breakpoint 的覆盖，不改动原节点 */
export function applyResponsive(
  node: DesignNode,
  breakpoint?: BreakpointName,
): DesignNode {
  if (!breakpoint || !node.responsive?.length) return node;
  const rules: ResponsiveRule[] = node.responsive
    .filter(
      (r) =>
        BREAKPOINT_ORDER.indexOf(r.breakpoint) <=
        BREAKPOINT_ORDER.indexOf(breakpoint),
    )
    .sort(
      (a, b) =>
        BREAKPOINT_ORDER.indexOf(a.breakpoint) -
        BREAKPOINT_ORDER.indexOf(b.breakpoint),
    );
  if (!rules.length) return node;
  const merged = clone(node);
  for (const rule of rules) {
    if (rule.patch.layout) Object.assign(merged.layout, rule.patch.layout);
    if (rule.patch.size) Object.assign(merged.size, rule.patch.size);
    if (rule.patch.position)
      Object.assign(merged.position, rule.patch.position);
    if (rule.patch.style) Object.assign(merged.style, rule.patch.style);
    if (rule.patch.typography && merged.typography)
      Object.assign(merged.typography, rule.patch.typography);
    if (rule.patch.visible !== undefined) merged.visible = rule.patch.visible;
  }
  return merged;
}

export function breakpointForWidth(width: number): BreakpointName {
  if (width < BREAKPOINT_WIDTH.tablet) return "mobile";
  if (width < BREAKPOINT_WIDTH.desktop) return "tablet";
  if (width < BREAKPOINT_WIDTH.wide) return "desktop";
  return "wide";
}

/**
 * 无 DOM 时的文本测量近似。渲染层可注入真实 DOM 测量覆盖（§97）。
 * CJK 全宽，拉丁按 0.55em，空格/换行 0.3em。
 */
export const heuristicMeasure: MeasureTextFn = (
  text,
  typography,
  availableWidth,
) => {
  const fontSize = typography.fontSize;
  const weightFactor = typography.fontWeight >= 600 ? 1.04 : 1;
  const widthOf = (line: string) =>
    Array.from(line).reduce((sum, ch) => {
      const code = ch.codePointAt(0) ?? 0;
      const wide =
        (code >= 0x1100 && code <= 0x115f) ||
        (code >= 0x2e80 && code <= 0xa4cf) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xff00 && code <= 0xff60);
      const factor = wide
        ? 1
        : ch === " " || ch === "\n" || ch === "\u3000"
          ? 0.3
          : 0.55;
      return sum + factor * fontSize * weightFactor + typography.letterSpacing;
    }, 0);

  const paragraphs = text.split("\n");
  let lines = 0;
  let maxLineWidth = 0;
  const unlimited =
    availableWidth === null || availableWidth <= 0 || typography.nowrap;

  if (unlimited) {
    lines = paragraphs.length;
    maxLineWidth = paragraphs.reduce((m, p) => Math.max(m, widthOf(p)), 0);
  } else {
    for (const paragraph of paragraphs) {
      if (paragraph === "") {
        lines += 1;
        continue;
      }
      // 贪心换行：CJK 逐字断，拉丁按词断；不可断的超长词按字符断（渲染端配合 overflow-wrap: break-word）
      const tokens =
        paragraph.match(
          /[\u4e00-\u9fff\u3000]|\s+|[^\s\u4e00-\u9fff\u3000]+/g,
        ) ?? [];
      let line = "";
      const flushLine = () => {
        lines += 1;
        maxLineWidth = Math.max(maxLineWidth, widthOf(line));
        line = "";
      };
      for (const token of tokens) {
        if (widthOf(token) > availableWidth) {
          if (line.trimEnd() !== "") flushLine();
          let chunk = "";
      for (const ch of token) {
            if (chunk !== "" && widthOf(chunk + ch) > availableWidth) {
              lines += 1;
              maxLineWidth = Math.max(maxLineWidth, widthOf(chunk));
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          line = chunk;
          continue;
        }
        const candidate = line + token;
        if (line !== "" && widthOf(candidate.trimEnd()) > availableWidth) {
          flushLine();
          line = token;
        } else {
          line = candidate;
        }
      }
      flushLine();
    }
  }

  const ratio =
    typography.lineHeight === "auto"
      ? 1.2
      : Number(typography.lineHeight) || 1.2;
  const leading = ratio > 3 ? ratio : ratio * fontSize;
  return {
    width: Math.ceil(maxLineWidth),
    height: Math.ceil(lines * leading),
    lines,
  };
};

function toNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * 获取可见子节点（过滤不可见、应用响应式）。
 */
function visibleChildren(
  page: Page,
  node: DesignNode,
  breakpoint?: BreakpointName,
): DesignNode[] {
  return childrenOf(page, node)
    .filter((c) => c.visible)
    .map((c) => applyResponsive(c, breakpoint));
}

/**
 * Auto-layout 求解器：hug / fill / fixed × padding / gap / justify / items / grid / wrap / stack。
 * 画布、代码生成、预览共用同一份几何，避免三处漂移（§16）。
 * 三趟：measure（自底向上，带缓存） → place（自顶向下分配 + 定位）。
 */
/**
 * 布局求解的**唯一一份实现**（§147 / ROADMAP #133）。
 *
 * 此前这里有两份：`resolveLayout` 与 `resolveLayoutIncremental` —— 后者把前者的
 * `measure` / `place` **整个复制了一遍**（约 400 行）。两份实现必然漂移，于是：
 * ① 增量解的 `paintOrder` 与全量解不同（渲染次序会变，肉眼可见）；
 * ② 没碰到的分支没有被复用（对象身份都不一样，"省下计算"根本没发生）。
 * 2026-10-13 接线因此撤回（`f61d0af`），只留下两条 `it.skip` 欠条。
 *
 * 现在**只有这一份**：全量路与增量路都调它，所以"增量与全量相等"这句话**由构造保证**，
 * 不再靠两份实现碰巧一致。`prev` 与 `changed` 是增量路要用的两份现场（上一帧的解、改动到的节点）；
 * 传 `null` 就是全量。
 */
function runLayout(
  page: Page,
  options: LayoutOptions,
  prev: ResolvedLayout | null,
  changed: Set<string> | null,
): ResolvedLayout {
  const { tokens, mode = null, breakpoint, maxDepth = 60 } = options;
  const defaultFontSize = options.defaultFontSize ?? 16;
  const measureText = options.measureText ?? heuristicMeasure;
  const root = requireNode(page, page.rootId);

  const resolveNum = (value: unknown, fallback: number): number => {
    if (value === undefined || value === null) return fallback;
    if (typeof value === "number") return toNumber(value, fallback);
    const raw = tokens?.resolveValue(value, mode) ?? value;
    if (typeof raw === "number") return raw;
    // 解析结果可能是对象（RGBA 当字号用之类的坏数据）：不猜，回落默认值
    if (typeof raw !== "string") return fallback;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const axisSize = (
    value: DesignNode["size"]["width"],
  ): number | "hug" | "fill" =>
    value === "hug" || value === "fill" ? value : resolveNum(value, 0);

  const resolvedTypography = (node: DesignNode): ResolvedTypography => {
    const t = node.typography;
    return {
      // 字体名只能是字符串：resolveValue 吃进去的是 `{font.body}`，
      // 出来的却可能是任何类型，拼成 "[object Object]" 会进 CSS
      fontFamily: (() => {
        const raw = tokens?.resolveValue(
          t?.fontFamily ?? "{font.body}",
          mode,
        );
        return typeof raw === "string" ? raw : "Inter, sans-serif";
      })(),
      fontSize: resolveNum(t?.fontSize ?? defaultFontSize, defaultFontSize),
      fontWeight: toNumber(t?.fontWeight, 400),
      lineHeight: t?.lineHeight ?? 1.5,
      letterSpacing: resolveNum(t?.letterSpacing, 0),
      align: t?.align ?? "left",
      verticalAlign: t?.verticalAlign ?? "top",
      decoration: t?.decoration ?? "none",
      textCase: t?.textCase ?? "original",
      runs: t?.runs,
      nowrap: node.style.textWrap === "nowrap",
    };
  };

  // padding 可能整个缺失（库里躺着的老行、或客户端绕过校验写进来的残缺节点）。
  // 排版引擎不能因为一个节点缺字段就把整页抛掉：读路径崩了用户看到的是白屏，不是"这个节点有问题"
  const paddingOf = (node: DesignNode) => ({
    top: resolveNum(node.layout?.padding?.top, 0),
    right: resolveNum(node.layout?.padding?.right, 0),
    bottom: resolveNum(node.layout?.padding?.bottom, 0),
    left: resolveNum(node.layout?.padding?.left, 0),
  });

  const RASTER_TYPES = new Set([
    "image",
    "video",
    "svg",
    "shape",
    "three",
    "webgl",
  ]);

  /** 自身承载文案、按内容测量的叶子节点（按钮与输入框的文字来自 text 字段） */
  const TEXT_LIKE_TYPES = new Set(["text", "button", "input"]);

  const intrinsicRaster = (node: DesignNode, avail: Box2): Box => {
    const fallback = node.type === "svg" ? 24 : 120;
    const w = axisSize(node.size.width);
    const h = axisSize(node.size.height);
    const baseW =
      w === "hug" ? fallback : w === "fill" ? (avail.width ?? fallback) : w;
    const baseH =
      h === "hug" ? fallback : h === "fill" ? (avail.height ?? fallback) : h;
    if (node.style.aspectRatio) {
      return { width: baseW, height: baseW / node.style.aspectRatio };
    }
    return { width: baseW, height: baseH };
  };

  interface Box2 {
    width: number | null;
    height: number | null;
  }

  const measureTextNode = (
    node: DesignNode,
    availWidth: number | null,
  ): Box => {
    const typography = resolvedTypography(node);
    const wrapMode = node.style.textWrap ?? "wrap";
    const constrained = wrapMode === "nowrap" ? null : availWidth;
    const result = measureText(node.text ?? "", typography, constrained);
    const lineHeight =
      typography.lineHeight === "auto"
        ? 1.2
        : Number(typography.lineHeight) || 1.2;
    const leading =
      lineHeight > 3 ? lineHeight : lineHeight * typography.fontSize;
    const maxLines =
      wrapMode === "truncate"
        ? 1
        : wrapMode === "truncate-2"
          ? 2
          : wrapMode === "truncate-3"
            ? 3
            : Infinity;
    const height = Math.min(
      result.height,
      leading * Math.min(result.lines ?? 1, maxLines),
    );
    const width =
      constrained !== null && wrapMode !== "wrap"
        ? Math.min(result.width, constrained)
        : result.width;
    return { width, height: Math.max(leading, height) };
  };

  // 测量缓存：节点 id → 约束键 → 尺寸。**可跨帧持有**（由调用方注入，见 LayoutOptions.measureCache）：
  // 增量重解要省下的正是"重新量文字"这一截，而它跟"位置变没变"无关。
  //
  // 签名对不上（换了一套测量参数）→ 整份作废：同一个 measureText 换成另一个，
  // 量出来的文字宽度会不同，旧结果留着就是错的。
  // **签名比的是函数的"身份"不是它的源码**——两个内容相同但不是同一个函数的 measureText
  // （比如测试里现造的两个计数器）量出来的结果未必一样，按源码比就分不出来。
  // **签名只在真有缓存时才算**：纯全量求解（没传缓存）不该为 token 指纹付钱。
  const cache = options.measureCache;
  if (cache) {
    const measureSignature = `${measureFnId(measureText)}|${mode ?? '-'}|${breakpoint ?? '-'}|${defaultFontSize}|${tokensSignature(tokens)}`;
    if (cache.signature !== measureSignature) {
      cache.entries.clear();
      cache.signature = measureSignature;
    }
  }
  // 没有缓存时用一份一次性的表：量完就丢，不跨帧留着
  const cacheEntries = cache?.entries ?? new Map<string, Map<string, Box>>();

  /**
   * 子节点的测量约束。measure 与 place 必须用同一个函数求几何，
   * 否则两趟会给出不同尺寸（画布与预览就会漂移，§16）。
   */
  const childAvail = (
    parent: DesignNode,
    child: DesignNode,
    innerW: number | null,
    innerH: number | null,
  ): Box2 => {
    const layoutMode = parent.layout.mode;
    if (layoutMode === "none" || layoutMode === "stack")
      return { width: null, height: null };
    const gap = resolveNum(parent.layout.gap, 0);
    if (layoutMode === "grid") {
      const columns = Math.max(1, parent.layout.columns ?? 1);
      return {
        width:
          innerW === null
            ? null
            : Math.max(0, (innerW - gap * (columns - 1)) / columns),
        height: null,
      };
    }
    if (layoutMode === "wrap") return { width: innerW, height: null };
    const horizontal = layoutMode === "horizontal";
    const mainSize = child.size[horizontal ? "width" : "height"];
    const crossSize = child.size[horizontal ? "height" : "width"];
    const crossAvail = horizontal ? innerH : innerW;
    const mainConstraint = typeof mainSize === "number" ? mainSize : null;
    const crossConstraint =
      typeof crossSize === "number" ? crossSize : crossAvail;
    // 主轴上 fill 不参与固有尺寸：给 null，实际拉伸留给放置阶段
    return horizontal
      ? { width: mainConstraint, height: crossConstraint }
      : { width: crossConstraint, height: mainConstraint };
  };

  /** 自底向上测量：avail 为父级给定的约束（null 表示无约束） */
  const measure = (rawNode: DesignNode, avail: Box2, depth = 0): Box => {
    const node = applyResponsive(rawNode, breakpoint);
    // 键分两层：节点 id 一层（作废时整组删），约束（可用宽高 + 深度）一层
    const constraint = `${avail.width ?? "-"}|${avail.height ?? "-"}|${depth}`;
    const byConstraint = cacheEntries.get(node.id);
    const cached = byConstraint?.get(constraint);
    if (cached) return cached;
    const box = measureUncached(node, avail, depth);
    if (byConstraint) byConstraint.set(constraint, box);
    else cacheEntries.set(node.id, new Map([[constraint, box]]));
    return box;
  };

  const measureUncached = (
    node: DesignNode,
    avail: Box2,
    depth: number,
  ): Box => {
    const width = axisSize(node.size.width);
    const height = axisSize(node.size.height);
    const pad = paddingOf(node);
    const gap = resolveNum(node.layout.gap, 0);
    const crossPadX = pad.left + pad.right;
    const crossPadY = pad.top + pad.bottom;

    if (TEXT_LIKE_TYPES.has(node.type)) {
      // 按钮 / 输入框的文案同样参与测量；hug 尺寸要把 padding 算进去，否则内边距会吃掉文字
      const wrapWidth =
        typeof width === "number"
          ? Math.max(0, width - crossPadX)
          : avail.width === null
            ? null
            : Math.max(0, avail.width - crossPadX);
      const measured = measureTextNode(node, wrapWidth);
      const w =
        width === "hug"
          ? measured.width + crossPadX
          : width === "fill"
            ? (avail.width ?? measured.width + crossPadX)
            : (width as number);
      const h =
        height === "hug"
          ? measured.height + crossPadY
          : height === "fill"
            ? (avail.height ?? measured.height + crossPadY)
            : (height as number);
      return { width: w, height: h };
    }

    if (RASTER_TYPES.has(node.type)) {
      const raster = intrinsicRaster(node, {
        width: avail.width,
        height: avail.height,
      });
      const w =
        width === "hug"
          ? raster.width
          : width === "fill"
            ? (avail.width ?? raster.width)
            : (width as number);
      const h = node.style.aspectRatio
        ? w / node.style.aspectRatio
        : height === "hug"
          ? raster.height
          : height === "fill"
            ? (avail.height ?? raster.height)
            : (height as number);
      return { width: w, height: h };
    }

    const children = visibleChildren(page, node, breakpoint);
    const contentW =
      width === "hug"
        ? null
        : width === "fill"
          ? avail.width
          : (width as number);
    const contentH =
      height === "hug"
        ? null
        : height === "fill"
          ? avail.height
          : (height as number);
    const innerW = contentW === null ? null : Math.max(0, contentW - crossPadX);
    const innerH = contentH === null ? null : Math.max(0, contentH - crossPadY);

    const layoutMode = node.layout.mode;

    if (layoutMode === "none" || layoutMode === "stack") {
      let maxX = 0;
      let maxY = 0;
      for (const child of children) {
        const box = measure(
          child,
          childAvail(node, child, innerW, innerH),
          depth + 1,
        );
        maxX = Math.max(maxX, child.position.x + box.width);
        maxY = Math.max(maxY, child.position.y + box.height);
      }
      const w =
        width === "hug"
          ? maxX + crossPadX
          : width === "fill"
            ? (avail.width ?? maxX + crossPadX)
            : (width as number);
      const h =
        height === "hug"
          ? maxY + crossPadY
          : height === "fill"
            ? (avail.height ?? maxY + crossPadY)
            : (height as number);
      return { width: w, height: h };
    }

    if (layoutMode === "grid") {
      const columns = Math.max(1, node.layout.columns ?? 1);
      let totalH = 0;
      let rowH = 0;
      let col = 0;
      let widestChild = 0;
      let rowCount = 0;
      for (const child of children) {
        const box = measure(
          child,
          childAvail(node, child, innerW, innerH),
          depth + 1,
        );
        rowH = Math.max(rowH, box.height);
        widestChild = Math.max(widestChild, box.width);
        col += 1;
        if (col === columns) {
          rowCount += 1;
          totalH += rowH + gap;
          rowH = 0;
          col = 0;
        }
      }
      if (col !== 0) {
        totalH += rowH;
      } else if (rowCount > 1) {
        totalH -= gap;
      }
      const filledColumns = Math.min(columns, Math.max(1, children.length));
      const intrinsicW =
        widestChild * filledColumns + gap * (filledColumns - 1);
      const w =
        width === "hug"
          ? (innerW ?? intrinsicW) + crossPadX
          : width === "fill"
            ? (avail.width ?? intrinsicW + crossPadX)
            : (width as number);
      const h =
        height === "hug"
          ? totalH + crossPadY
          : height === "fill"
            ? (avail.height ?? totalH + crossPadY)
            : (height as number);
      return { width: w, height: h };
    }

    if (layoutMode === "wrap") {
      let lineH = 0;
      let x = 0;
      let totalH = 0;
      let maxLineW = 0;
      for (const child of children) {
        const box = measure(
          child,
          childAvail(node, child, innerW, innerH),
          depth + 1,
        );
        if (innerW !== null && x > 0 && x + box.width > innerW) {
          maxLineW = Math.max(maxLineW, x - gap);
          totalH += lineH + gap;
          lineH = 0;
          x = 0;
        }
        x += box.width + gap;
        lineH = Math.max(lineH, box.height);
      }
      maxLineW = Math.max(maxLineW, Math.max(0, x - gap));
      totalH += lineH;
      const w =
        width === "hug"
          ? maxLineW + crossPadX
          : width === "fill"
            ? (avail.width ?? maxLineW + crossPadX)
            : (width as number);
      const h =
        height === "hug"
          ? totalH + crossPadY
          : height === "fill"
            ? (avail.height ?? totalH + crossPadY)
            : (height as number);
      return { width: w, height: h };
    }

    // vertical / horizontal
    const horizontal = layoutMode === "horizontal";
    let intrinsicMain = 0;
    let maxCross = 0;
    children.forEach((child) => {
      const childMainSize = child.size[horizontal ? "width" : "height"];
      const box = measure(
        child,
        childAvail(node, child, innerW, innerH),
        depth + 1,
      );
      if (childMainSize !== "fill")
        intrinsicMain += horizontal ? box.width : box.height;
      maxCross = Math.max(maxCross, horizontal ? box.height : box.width);
    });
    intrinsicMain += gap * Math.max(0, children.length - 1);

    const mainIntrinsic = intrinsicMain + (horizontal ? crossPadX : crossPadY);
    const crossIntrinsic = maxCross + (horizontal ? crossPadY : crossPadX);
    const w = horizontal
      ? width === "hug"
        ? mainIntrinsic
        : width === "fill"
          ? (avail.width ?? mainIntrinsic)
          : (width as number)
      : width === "hug"
        ? crossIntrinsic
        : width === "fill"
          ? (avail.width ?? crossIntrinsic)
          : (width as number);
    const h = horizontal
      ? height === "hug"
        ? crossIntrinsic
        : height === "fill"
          ? (avail.height ?? crossIntrinsic)
          : (height as number)
      : height === "hug"
        ? mainIntrinsic
        : height === "fill"
          ? (avail.height ?? mainIntrinsic)
          : (height as number);
    return { width: w, height: h };
  };

  const resolved: Record<string, ResolvedNode> = {};
  const paintOrder: string[] = [];

  // ———— §147 增量路：能沿用的分支就不重算（ROADMAP #133 的第二片）————
  //
  // 「相等」由片 1 保证（两路共用同一份 measure/place）；这一片要的是**省下计算**：
  // 没被改到的分支，沿用上一帧那个**同一个对象**，而不是重算出一份相等的。
  //
  // 什么时候能沿用？三个条件缺一不可：
  // ① 上一帧有它；
  // ② 它的**绝对位置与尺寸**没变（变了就得重算——那是它被移动或被改了尺寸）；
  // ③ 它的子树里没有受影响的节点（子树里有改动，内部就要重算）。
  //
  // 三个条件都用**上一帧那份解**来判，所以这一片不引入第二个真值：
  // 复用与否的判据只有 prev.nodes 这一处。
  const affected = new Set<string>();
  if (prev && changed) {
    const collectAffected = (id: string): void => {
      if (affected.has(id)) return;
      affected.add(id);
      const node = page.nodes[id] ?? prev.nodes[id]?.node;
      if (!node) return;
      // 顺着**文档里**的子节点走（不是 prev.nodes[id].children —— 那套是按 parentId 建的，
      // 与文档的 children 数组不是一回事；文档里的孩子常常没有 parentId）
      for (const child of visibleChildren(page, node, breakpoint)) collectAffected(child.id);
    };
    for (const id of changed) collectAffected(id);
    // **被改到的那些，旧的测量结果作废**（就地删，调用方持有这份缓存）。
    // 为什么必须作废：测量结果取决于节点**内容**（文字、字号、样式），
    // 而缓存的键只看「节点 id + 约束」——内容变了而键没变的话，会拿回旧尺寸，
    // 于是「改完字却还是旧高度」。被改的节点与它的后代都在 affected 里 → 一起清掉。
    // 其余节点的测量结果继续有效：内容没变，约束没变（约束变了键会变 → 自动不命中）。
    if (options.measureCache) {
      for (const id of affected) options.measureCache.entries.delete(id);
    }
  }

  /** 这棵子树里有没有被改到的节点（有就不能沿用） */
  const subtreeHasChanged = (id: string): boolean => {
    if (!affected.size) return false;
    if (affected.has(id)) return true;
    const entry = prev?.nodes[id];
    if (!entry) return true;
    const node = page.nodes[id] ?? entry.node;
    for (const child of visibleChildren(page, node, breakpoint)) {
      if (subtreeHasChanged(child.id)) return true;
    }
    return false;
  };

  /** 能不能沿用上一帧那个对象？三个条件见上面的注释 */
  const canReuse = (id: string, x: number, y: number, w: number, h: number): boolean => {
    if (!prev) return false;
    const entry = prev.nodes[id];
    if (!entry) return false;
    if (entry.x !== x || entry.y !== y) return false;
    if (Math.abs(entry.width - w) > 1e-9 || Math.abs(entry.height - h) > 1e-9) return false;
    return !subtreeHasChanged(id);
  };

  /**
   * 沿用上一帧那棵子树：**同一个对象**（不是重算出一份相等的），
   * 绘制次序按上一帧的 children 顺序补回去——结构没变时它与全量的顺序逐项相同。
   * 注意这里**不**往 entry.children 里 push：那是上一帧的数组，推进去就污染了上一帧。
   */
  const reuseSubtree = (id: string): void => {
    const entry = prev!.nodes[id]!;
    resolved[id] = entry;
    paintOrder.push(id);
    const node = page.nodes[id] ?? entry.node;
    for (const child of visibleChildren(page, node, breakpoint)) reuseSubtree(child.id);
  };

  /**
   * place 的入口：能沿用就沿用（省掉 measure + place），否则照常算。
   *
   * 沿用时**不**往上一帧那个 entry.children 里 push（那是上一帧的数组）——
   * 新的父的 children 数组是这一轮新建的，由这里 push 进去。
   */
  function placeChild(
    child: DesignNode,
    x: number,
    y: number,
    box: Box,
    depth: number,
  ): void {
    if (canReuse(child.id, x, y, box.width, box.height)) {
      reuseSubtree(child.id);
      if (child.parentId && resolved[child.parentId]) {
        resolved[child.parentId]!.children.push(child.id);
      }
      return;
    }
    place(child, x, y, box, depth);
  }

  function place(
    rawNode: DesignNode,
    x: number,
    y: number,
    box: Box,
    depth: number,
  ): void {
    const node = applyResponsive(rawNode, breakpoint);
    const entry: ResolvedNode = {
      id: node.id,
      node,
      x,
      y,
      width: Math.max(0, box.width),
      height: Math.max(0, box.height),
      depth,
      parentId: node.parentId,
      children: [],
    };
    resolved[node.id] = entry;
    if (node.parentId && resolved[node.parentId])
      resolved[node.parentId]!.children.push(node.id);
    paintOrder.push(node.id);
    if (depth >= maxDepth) return;

    const pad = paddingOf(node);
    const gap = resolveNum(node.layout.gap, 0);
    const children = visibleChildren(page, node, breakpoint);
    // 子节点**增删**了 → 这一支的形状变了，上一帧那份不能沿用（否则会留下已经删掉的子节点）。
    // 所以把它标进 affected：它自己与它的子树都要重算。
    if (prev) {
      const prevEntry = prev.nodes[node.id];
      if (prevEntry) {
        const sameShape =
          prevEntry.children.length === children.length &&
          children.every((c) => prevEntry.children.includes(c.id));
        if (!sameShape) affected.add(node.id);
      }
    }
    if (!children.length) return;

    const innerW = Math.max(0, box.width - pad.left - pad.right);
    const innerH = Math.max(0, box.height - pad.top - pad.bottom);

    if (node.layout.mode === "none" || node.layout.mode === "stack") {
      for (const child of children) {
        const measured = measure(
          child,
          childAvail(node, child, innerW, innerH),
          depth + 1,
        );
        const w =
          axisSize(child.size.width) === "fill" ? innerW : measured.width;
        const h =
          axisSize(child.size.height) === "fill" ? innerH : measured.height;
        placeChild(
          child,
          x + pad.left + child.position.x,
          y + pad.top + child.position.y,
          { width: w, height: h },
          depth + 1,
        );
      }
      return;
    }

    if (node.layout.mode === "grid") {
      const columns = Math.max(1, node.layout.columns ?? 1);
      const cellW = Math.max(0, (innerW - gap * (columns - 1)) / columns);
      let cursorX = x + pad.left;
      let cursorY = y + pad.top;
      let rowH = 0;
      let col = 0;
      const placements: {
        child: DesignNode;
        x: number;
        y: number;
        w: number;
        h: number;
      }[] = [];
      for (const child of children) {
        const measured = measure(
          child,
          childAvail(node, child, innerW, innerH),
          depth + 1,
        );
        if (col === columns) {
          col = 0;
          cursorX = x + pad.left;
          cursorY += rowH + gap;
          rowH = 0;
        }
        placements.push({
          child,
          x: cursorX,
          y: cursorY,
          w: cellW,
          h: measured.height,
        });
        cursorX += cellW + gap;
        rowH = Math.max(rowH, measured.height);
        col += 1;
      }
      for (const p of placements)
        placeChild(p.child, p.x, p.y, { width: p.w, height: p.h }, depth + 1);
      return;
    }

    if (node.layout.mode === "wrap") {
      let cursorX = x + pad.left;
      let cursorY = y + pad.top;
      let lineH = 0;
      for (const child of children) {
        const measured = measure(
          child,
          childAvail(node, child, innerW, innerH),
          depth + 1,
        );
        if (
          cursorX - (x + pad.left) > 0 &&
          cursorX - (x + pad.left) + measured.width > innerW
        ) {
          cursorX = x + pad.left;
          cursorY += lineH + gap;
          lineH = 0;
        }
        placeChild(
          child,
          cursorX,
          cursorY,
          { width: measured.width, height: measured.height },
          depth + 1,
        );
        cursorX += measured.width + gap;
        lineH = Math.max(lineH, measured.height);
      }
      return;
    }

    const horizontal = node.layout.mode === "horizontal";
    const mainTotal = horizontal ? innerW : innerH;
    const crossTotal = horizontal ? innerH : innerW;

    const items = children.map((child) => {
      const mainSize = child.size[horizontal ? "width" : "height"];
      const crossSize = child.size[horizontal ? "height" : "width"];
      const measured = measure(
        child,
        childAvail(node, child, innerW, innerH),
        depth + 1,
      );
      return {
        child,
        measured,
        fillsMain: mainSize === "fill",
        stretchesCross:
          crossSize === "fill" ||
          (node.layout.items === "stretch" && crossSize === "hug"),
      };
    });

    const gapTotal = gap * Math.max(0, items.length - 1);
    const fixedMain = items
      .filter((i) => !i.fillsMain)
      .reduce(
        (sum, i) => sum + (horizontal ? i.measured.width : i.measured.height),
        0,
      );
    const fillCount = items.filter((i) => i.fillsMain).length;
    const fillMain =
      fillCount > 0
        ? Math.max(0, (mainTotal - fixedMain - gapTotal) / fillCount)
        : 0;
    const usedMain = fixedMain + fillMain * fillCount + gapTotal;
    const free = Math.max(0, mainTotal - usedMain);

    const justify = node.layout.justify;
    let cursor = justify === "center" ? free / 2 : justify === "end" ? free : 0;
    const extraBetween =
      items.length > 1 && justify === "space-between"
        ? free / (items.length - 1)
        : items.length > 0 && justify === "space-around"
          ? free / items.length
          : items.length > 0 && justify === "space-evenly"
            ? free / (items.length + 1)
            : 0;
    if (justify === "space-around" || justify === "space-evenly")
      cursor = extraBetween;

    const widestCross = items.reduce(
      (m, i) => Math.max(m, horizontal ? i.measured.height : i.measured.width),
      0,
    );

    for (const item of items) {
      const mainLen = item.fillsMain
        ? fillMain
        : horizontal
          ? item.measured.width
          : item.measured.height;
      const intrinsicCross = horizontal
        ? item.measured.height
        : item.measured.width;
      const crossLen = item.stretchesCross ? crossTotal : intrinsicCross;
      const crossOffset =
        node.layout.items === "center"
          ? Math.max(0, (crossTotal - intrinsicCross) / 2)
          : node.layout.items === "end"
            ? Math.max(0, crossTotal - intrinsicCross)
            : node.layout.items === "baseline"
              ? Math.max(0, widestCross - intrinsicCross)
              : 0;
      const childX = horizontal
        ? x + pad.left + cursor
        : x + pad.left + crossOffset;
      const childY = horizontal
        ? y + pad.top + crossOffset
        : y + pad.top + cursor;
      placeChild(
        item.child,
        childX,
        childY,
        horizontal
          ? { width: mainLen, height: crossLen }
          : { width: crossLen, height: mainLen },
        depth + 1,
      );
      cursor += mainLen + gap + extraBetween;
    }
  };

  const rootAvail: Box2 = breakpoint
    ? { width: BREAKPOINT_WIDTH[breakpoint], height: null }
    : { width: null, height: null };
  const rootBox = measure(root, rootAvail, 0);
  // viewport 预览（§14）：根画框跟随断点宽度重新求解，模型本身不被改写。
  // 高度只在没有显式裁剪时撑到内容高度，否则预览会切掉响应式换行后的内容。
  const viewportWidth = breakpoint ? BREAKPOINT_WIDTH[breakpoint] : null;
  const modelRoot: Box = {
    width:
      axisSize(root.size.width) === "hug"
        ? rootBox.width
        : (axisSize(root.size.width) as number) || rootBox.width || page.width,
    height:
      axisSize(root.size.height) === "hug"
        ? rootBox.height
        : (axisSize(root.size.height) as number) ||
          rootBox.height ||
          page.height,
  };
  const finalRoot: Box = {
    width: viewportWidth ?? modelRoot.width,
    height: root.layout.clipContent
      ? modelRoot.height
      : Math.max(modelRoot.height, rootBox.height),
  };
  place(root, 0, 0, finalRoot, 0);

  return {
    rootId: root.id,
    width: finalRoot.width,
    height: finalRoot.height,
    nodes: resolved,
    paintOrder: paintOrder.filter((id) => resolved[id]?.node.visible !== false),
  };
}

/**
 * 全量布局求解（公开入口）。
 *
 * 与增量路共用 `runLayout` 里的同一份 `measure` / `place`——两份实现各写一遍时，
 * 它们迟早在某次改动后分家（#133 记的就是这件事）。
 */
export function resolveLayout(
  page: Page,
  options: LayoutOptions = {},
): ResolvedLayout {
  return runLayout(page, options, null, null);
}

/** §147 增量布局的入参：上一帧的解 + 本次改动直接涉及的节点 */
export interface IncrementalLayoutOptions extends LayoutOptions {
  prevLayout?: ResolvedLayout | null;
  /** 本次改动直接涉及的节点（如拖拽改 size 的节点、改 padding 的容器等） */
  changedNodeIds?: Set<string>;
}

/**
 * §147 增量布局：与全量**同一份实现**（`runLayout`），所以结果逐项相等。
 *
 * 三条兜底仍然照旧：无上一帧 / 改动集合为空 / 动到了根 → 走全量
 * （前两种没有"上一帧"可复用，第三种整棵树都受影响，增量没有意义）。
 *
 * 复用（"没碰到的分支不重算"）是下一片的事：它要求在 `runLayout` 里按"父的盒没变"来决定
 * 能不能直接沿用上一帧那个对象——**那是性能，红线是数**（同一口径重跑，总延迟要掉下来）。
 * 这一片先只保证**相等**：两份实现合并成一份，"相等"就不再是一件要靠人盯着的事。
 */
export function resolveLayoutIncremental(
  page: Page,
  options: IncrementalLayoutOptions = {},
): ResolvedLayout {
  const { prevLayout, changedNodeIds, ...layoutOpts } = options;
  const changed = changedNodeIds ?? new Set<string>();
  if (!prevLayout || changed.size === 0 || changed.has(prevLayout.rootId)) {
    return runLayout(page, layoutOpts, null, null);
  }
  return runLayout(page, layoutOpts, prevLayout, changed);
}

export function hitTest(
  layout: ResolvedLayout,
  canvasX: number,
  canvasY: number,
  skip: Set<string> = new Set(),
): string | null {
  for (let i = layout.paintOrder.length - 1; i >= 0; i -= 1) {
    const id = layout.paintOrder[i]!;
    if (skip.has(id)) continue;
    const node = layout.nodes[id];
    if (!node || node.depth === 0) continue;
    if (node.node.locked || !node.node.visible) continue;
    if (
      canvasX >= node.x &&
      canvasX <= node.x + node.width &&
      canvasY >= node.y &&
      canvasY <= node.y + node.height
    )
      return id;
  }
  return layout.rootId;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function boundsOf(layout: ResolvedLayout, ids: readonly string[]): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of ids) {
    const n = layout.nodes[id];
    if (!n) continue;
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** 父级 resize 时按 constraints 跟随（§8 resize） */
export function applyConstraints(
  node: DesignNode,
  before: Box,
  after: Box,
): { position: DesignNode["position"]; size: DesignNode["size"] } {
  const dx = after.width - before.width;
  const dy = after.height - before.height;
  const { horizontal, vertical } = node.constraints;
  const position = { ...node.position };
  const size = { ...node.size };
  if (horizontal === "center") position.x += dx / 2;
  if (horizontal === "end") position.x += dx;
  if (horizontal === "stretch" && typeof size.width === "number")
    size.width = Math.max(0, size.width + dx);
  if (
    horizontal === "scale" &&
    typeof size.width === "number" &&
    before.width > 0
  )
    size.width = (size.width * after.width) / before.width;
  if (vertical === "center") position.y += dy / 2;
  if (vertical === "end") position.y += dy;
  if (vertical === "stretch" && typeof size.height === "number")
    size.height = Math.max(0, size.height + dy);
  if (
    vertical === "scale" &&
    typeof size.height === "number" &&
    before.height > 0
  )
    size.height = (size.height * after.height) / before.height;
  return { position, size };
}
