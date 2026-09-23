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
 * Auto-layout 求解器：hug / fill / fixed × padding / gap / justify / items / grid / wrap / stack。
 * 画布、代码生成、预览共用同一份几何，避免三处漂移（§16）。
 * 三趟：measure（自底向上，带缓存）→ place（自顶向下分配 + 定位）。
 */
export function resolveLayout(
  page: Page,
  options: LayoutOptions = {},
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
    const parsed = Number.parseFloat(String(raw));
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const axisSize = (
    value: DesignNode["size"]["width"],
  ): number | "hug" | "fill" =>
    value === "hug" || value === "fill" ? value : resolveNum(value, 0);

  const resolvedTypography = (node: DesignNode): ResolvedTypography => {
    const t = node.typography;
    return {
      fontFamily: String(
        tokens?.resolveValue(t?.fontFamily ?? "{font.body}", mode) ??
          "Inter, sans-serif",
      ),
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

  const cache = new Map<string, Box>();

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
    const key = `${node.id}|${avail.width ?? "-"}|${avail.height ?? "-"}|${depth}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const box = measureUncached(node, avail, depth);
    cache.set(key, box);
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
        rowCount += 1;
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

  const place = (
    rawNode: DesignNode,
    x: number,
    y: number,
    box: Box,
    depth: number,
  ): void => {
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
        place(
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
        place(p.child, p.x, p.y, { width: p.w, height: p.h }, depth + 1);
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
        place(
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
      place(
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

function visibleChildren(
  page: Page,
  node: DesignNode,
  breakpoint?: BreakpointName,
): DesignNode[] {
  return childrenOf(page, node)
    .filter((c) => c.visible)
    .map((c) => applyResponsive(c, breakpoint));
}

/** 命中测试：画布坐标 → 最深可见非锁定节点（§8 selection） */
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
