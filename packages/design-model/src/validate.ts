import type { ColorValue, DesignDocument, DesignNode, NodeId, Page, RGBA } from "./types";
import { TokenStore, contrastRatio, parseHex, toHex, tokenRefKey } from "./tokens";
import { collectSubtree } from "./patch";
import { DEFAULT_TOKENS } from "./nodes";

export type IssueCode =
  | "orphan-node"
  | "missing-child"
  | "cycle"
  | "duplicate-id"
  | "empty-page"
  | "missing-token"
  | "unused-token"
  | "low-contrast"
  | "off-px-spacing"
  | "hardcoded-style"
  | "missing-alt"
  | "no-text-on-button"
  | "tap-target-small"
  | "unreachable-node"
  | "invalid-node-type"
  | "bad-binding"
  // 下面这些由健康层（health.ts）产出，不来自 lintDesign 的规则：
  // §178 的 Performance / Security / Visual QA 三行需要静态指标，
  // 放在一起是为了共用 Issue 形状，方便 UI 与 AI Critic 消费。
  | "node-count"
  | "tree-depth"
  | "asset-bytes"
  | "image-no-dims"
  | "animation-count"
  | "page-count"
  | "off-canvas"
  | "zero-size"
  | "credential-text"
  | "unsafe-code"
  | "insecure-url";

export interface Issue {
  code: IssueCode;
  severity: "error" | "warning" | "info";
  message: string;
  pageId?: string;
  nodeId?: NodeId;
  path?: string;
  /** 修复建议，供 Design Critic / AI 直接消费（§32） */
  suggestion?: string;
}

const KNOWN_TYPES = new Set([
  "frame",
  "section",
  "container",
  "group",
  "text",
  "image",
  "video",
  "svg",
  "shape",
  "button",
  "input",
  "card",
  "list",
  "grid",
  "component",
  "instance",
  "code",
  "three",
  "webgl",
]);

/** 结构完整性：错误级问题会让保存失败（不静默修数据，§159） */
export function validateDocument(document: DesignDocument): Issue[] {
  const issues: Issue[] = [];
  if (!document.pages.length)
    issues.push({
      code: "empty-page",
      severity: "error",
      message: "文档没有任何页面",
    });
  const seenPages = new Set<string>();
  for (const page of document.pages) {
    if (seenPages.has(page.id))
      issues.push({
        code: "duplicate-id",
        severity: "error",
        message: `页面 id 重复：${page.id}`,
        pageId: page.id,
      });
    seenPages.add(page.id);
    issues.push(...validatePage(page));
  }
  if (!document.pages.some((p) => p.id === document.activePageId)) {
    issues.push({
      code: "missing-child",
      severity: "error",
      message: `activePageId 指向不存在的页面：${document.activePageId}`,
    });
  }

  const tokenStore = new TokenStore(document.tokens);
  for (const page of document.pages) {
    for (const node of Object.values(page.nodes)) {
      for (const key of collectTokenRefs(node)) {
        if (tokenStore.resolve(key, document.activeMode) === undefined) {
          issues.push({
            code: "missing-token",
            severity: "warning",
            message: `引用了不存在的 token：{${key}}`,
            pageId: page.id,
            nodeId: node.id,
            suggestion: `创建 token ${key} 或改为已有 token`,
          });
        }
      }
    }
  }

  for (const component of document.components) {
    const page =
      document.pages.find((p) => p.id === component.pageId) ??
      document.pages[0];
    if (page && !page.nodes[component.rootId]) {
      issues.push({
        code: "missing-child",
        severity: "error",
        message: `组件 ${component.name} 的主节点不存在：${component.rootId}`,
        pageId: page?.id,
      });
    }
  }
  return issues;
}

export function validatePage(page: Page): Issue[] {
  const issues: Issue[] = [];
  if (!page.nodes[page.rootId]) {
    issues.push({
      code: "empty-page",
      severity: "error",
      message: `页面 ${page.name} 缺少根节点`,
      pageId: page.id,
    });
    return issues;
  }
  const reachable = new Set<string>(collectSubtree(page, page.rootId));
  for (const [id, node] of Object.entries(page.nodes)) {
    if (!reachable.has(id))
      issues.push({
        code: "orphan-node",
        severity: "warning",
        message: `节点无法从页面根到达：${node.name}`,
        pageId: page.id,
        nodeId: id,
      });
    if (!KNOWN_TYPES.has(node.type))
      issues.push({
        code: "invalid-node-type",
        severity: "error",
        message: `未知节点类型：${node.type}`,
        pageId: page.id,
        nodeId: id,
      });
    for (const childId of node.children) {
      if (!page.nodes[childId]) {
        issues.push({
          code: "missing-child",
          severity: "error",
          message: `${node.name} 引用了不存在的子节点：${childId}`,
          pageId: page.id,
          nodeId: id,
        });
        continue;
      }
      if (page.nodes[childId]!.parentId !== id) {
        issues.push({
          code: "cycle",
          severity: "error",
          message: `父子引用不一致：${id} → ${childId}`,
          pageId: page.id,
          nodeId: childId,
        });
      }
    }
    if (node.parentId && !page.nodes[node.parentId]) {
      issues.push({
        code: "orphan-node",
        severity: "error",
        message: `${node.name} 的父节点不存在：${node.parentId}`,
        pageId: page.id,
        nodeId: id,
      });
    }
  }
  const visited = new Set<string>();
  const stack = new Set<string>();
  const detectCycle = (id: string) => {
    if (stack.has(id)) {
      issues.push({
        code: "cycle",
        severity: "error",
        message: `节点树存在环：${id}`,
        pageId: page.id,
        nodeId: id,
      });
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    stack.add(id);
    for (const child of page.nodes[id]?.children ?? []) detectCycle(child);
    stack.delete(id);
  };
  detectCycle(page.rootId);
  return issues;
}

/** 设计体检（§32 Design Critic / §121 Design Lint 的规则层，可被 Agent 复用） */
export function lintDesign(
  document: DesignDocument,
  resolvedNodes?: Record<string, { width: number; height: number }>,
): Issue[] {
  const issues: Issue[] = [];
  const tokens = new TokenStore(document.tokens);
  const baseline = new Set(DEFAULT_TOKENS.map((t) => t.key));
  const usedTokens = new Set<string>();
  for (const page of document.pages) {
    for (const node of Object.values(page.nodes)) {
      for (const path of Object.keys(node.bindingsMap ?? {})) {
        const bound = (node.bindingsMap as Record<string, unknown>)[path];
        if (typeof bound === "string") usedTokens.add(bound);
      }
      for (const key of collectTokenRefs(node)) usedTokens.add(key);
    }
  }
  for (const token of document.tokens) {
    if (!usedTokens.has(token.key) && !baseline.has(token.key)) {
      issues.push({
        code: "unused-token",
        severity: "info",
        message: `自定义 token 未被使用：${token.key}`,
        suggestion: "保留为设计系统基线或删除",
      });
    }
  }
  for (const page of document.pages) {
    for (const node of Object.values(page.nodes)) {
      if (!node.visible) continue;
      // token 优先：字面颜色视为硬编码（§12）
      for (const fill of node.style.fills) {
        if (
          fill.kind === "solid" &&
          typeof fill.color === "string" &&
          !tokenRefKey(fill.color)
        ) {
          issues.push({
            code: "hardcoded-style",
            severity: "info",
            message: `${node.name} 使用字面颜色 ${fill.color}，建议绑定 token`,
            pageId: page.id,
            nodeId: node.id,
            path: "style.fills",
          });
        }
      }
      // 间距对齐 4px 栅格：padding 与 gap/rowGap/crossGap 同属栅格间距，一视同仁
      const spacings: Array<[string, number | string | undefined]> = [
        ["layout.gap", node.layout.gap],
        ["layout.rowGap", node.layout.rowGap],
        ["layout.crossGap", node.layout.crossGap],
        ...Object.entries(node.layout.padding).map(
          ([side, value]) => [`layout.padding.${side}`, value] as [string, number | string],
        ),
      ];
      for (const [path, value] of spacings) {
        if (value === undefined) continue;
        const resolved =
          typeof value === "number"
            ? value
            : Number(tokens.resolveValue(value, document.activeMode));
        if (Number.isFinite(resolved) && resolved % 4 !== 0) {
          issues.push({
            code: "off-px-spacing",
            severity: "info",
            message: `${node.name} 的 ${path}=${resolved} 不在 4px 栅格上`,
            pageId: page.id,
            nodeId: node.id,
            path,
            suggestion: "吸附到最近的 4 的倍数",
          });
        }
      }
      // 文本对比度（§90）：解析 token、沿祖先链合成真实背景，测不出来的不报（§159）
      const contrast = measureContrast(page, node, tokens, document.activeMode);
      if (contrast) {
        const fontSize = Number(
          tokens.resolveValue(
            node.typography?.fontSize ?? 16,
            document.activeMode,
          ),
        );
        const required =
          fontSize >= 24 || (node.typography?.fontWeight ?? 400) >= 700
            ? 3
            : 4.5;
        if (contrast.ratio < required) {
          issues.push({
            code: "low-contrast",
            severity: "warning",
            message: `${node.name} 文本对比度 ${contrast.ratio.toFixed(2)}:1，低于 ${required}:1（${contrast.foreground} on ${contrast.background}）`,
            pageId: page.id,
            nodeId: node.id,
            suggestion: "调亮文本或压暗背景",
          });
        }
      }
      // 可点击目标尺寸
      if (
        (node.type === "button" || node.type === "input") &&
        resolvedNodes?.[node.id]
      ) {
        const { width, height } = resolvedNodes[node.id]!;
        if (height < 32 || width < 32) {
          issues.push({
            code: "tap-target-small",
            severity: "warning",
            message: `${node.name} 点击区域 ${Math.round(width)}×${Math.round(height)} 小于 32px`,
            pageId: page.id,
            nodeId: node.id,
          });
        }
      }
      if ((node.type === "image" || node.type === "video") && !node.alt) {
        issues.push({
          code: "missing-alt",
          severity: "warning",
          message: `${node.name} 缺少替代文本（alt）`,
          pageId: page.id,
          nodeId: node.id,
          suggestion: "补一句描述，屏幕阅读器需要它",
        });
      }
      if (
        node.type === "button" &&
        !(node.text ?? "").trim() &&
        !node.children.length
      ) {
        issues.push({
          code: "no-text-on-button",
          severity: "warning",
          message: `${node.name} 没有文本也没有子节点，无障碍名称为空`,
          pageId: page.id,
          nodeId: node.id,
        });
      }
      for (const binding of node.bindings ?? []) {
        if (binding.source !== "static" && !binding.expression.trim()) {
          issues.push({
            code: "bad-binding",
            severity: "error",
            message: `${node.name} 的数据绑定缺少表达式`,
            pageId: page.id,
            nodeId: node.id,
            path: `bindings.${binding.property}`,
          });
        }
      }
    }
  }
  return issues;
}

/**
 * 一处文字与它真正落在什么颜色上的对比度（§90）。
 *
 * 三条纪律：
 * 1. token 引用必须先解析——不解析的话 `{color.text}` 会被当成"解析失败"，
 *    而 `contrastRatio` 对解析失败返回 1，于是每个正确使用 token 的设计都被误判成 1:1；
 * 2. 背景沿祖先链一层层合成，直到遇到不透明层——只看页面根会把卡片上的字比到页面底色上；
 * 3. 任何一边算不出来（渐变、图片填充、坏 token、最底层是半透明且身后无依据）就返回 null。
 *    算不出来却报一个数是造假，静默不报 + 交给 missing-token 那条发现才是诚实。
 */
export function measureContrast(
  page: Page,
  node: DesignNode,
  tokens: TokenStore,
  mode?: string | null,
): { ratio: number; foreground: string; background: string } | null {
  const foreground =
    node.type === "text"
      ? solidRgba(node, tokens, mode)
      : node.type === "button" || node.type === "input" || node.type === "card"
        ? solidColorValue(node.typography?.color, tokens, mode)
        : null;
  if (!foreground) return null;
  // 容器上没有字就没有可读性可言：只有真带文字（或直接子里有 text）才检查
  const hasText =
    node.type === "text" ||
    (node.text ?? "").trim().length > 0 ||
    node.children.some((id) => page.nodes[id]?.type === "text");
  if (!hasText) return null;

  const chain =
    node.type === "text" ? ancestorsOf(page, node) : [node, ...ancestorsOf(page, node)];
  const background = effectiveBackground(page, chain, tokens, mode);
  if (!background) return null;
  const settled =
    foreground.a >= 0.999 ? foreground : compositeOver(foreground, background);
  const ratio = contrastRatio(settled, background);
  return { ratio, foreground: toHex(settled), background: toHex(background) };
}

/** 由近到远的祖先链；父子数据坏掉时按链长上限停住，不跟着死循环 */
function ancestorsOf(page: Page, node: DesignNode): DesignNode[] {
  const out: DesignNode[] = [];
  const seen = new Set<string>([node.id]);
  let currentId = node.parentId;
  while (currentId && out.length < 64) {
    if (seen.has(currentId)) break;
    const parent = page.nodes[currentId];
    if (!parent) break;
    seen.add(currentId);
    out.push(parent);
    currentId = parent.parentId;
  }
  return out;
}

function solidColorValue(
  color: ColorValue | undefined,
  tokens: TokenStore,
  mode?: string | null,
): RGBA | null {
  if (color === undefined) return null;
  const resolved = tokens.resolveValue(color, mode);
  if (typeof resolved === "string") return parseHex(resolved);
  if (resolved && typeof resolved === "object" && "r" in resolved) {
    const rgba = resolved as RGBA;
    return Number.isFinite(rgba.r) && Number.isFinite(rgba.g) && Number.isFinite(rgba.b)
      ? rgba
      : null;
  }
  return null;
}

/** 节点第一个实心填充，含 paint 与节点自身的不透明度 */
function solidRgba(
  node: DesignNode,
  tokens: TokenStore,
  mode?: string | null,
): RGBA | null {
  for (const paint of node.style.fills) {
    if (paint.kind !== "solid" || paint.visible === false) continue;
    const base = solidColorValue(paint.color, tokens, mode);
    if (!base) return null;
    const alpha =
      base.a * (paint.opacity ?? 1) * (node.style.opacity ?? 1);
    return { ...base, a: Math.max(0, Math.min(1, alpha)) };
  }
  return null;
}

/** 从近到远叠加背景，撞到不透明层即止；页面底色兜底 */
function effectiveBackground(
  page: Page,
  nearToFar: DesignNode[],
  tokens: TokenStore,
  mode?: string | null,
): RGBA | null {
  const layers: RGBA[] = [];
  for (const node of nearToFar) {
    const fill = solidRgba(node, tokens, mode);
    if (!fill) continue;
    layers.push(fill);
    if (fill.a >= 0.999) break;
  }
  const pageBase = solidColorValue(page.backgroundColor, tokens, mode);
  if (pageBase) layers.push(pageBase);
  if (!layers.length) return null;
  const deepest = layers[layers.length - 1]!;
  if (deepest.a < 0.999) return null;
  let acc = deepest;
  for (let i = layers.length - 2; i >= 0; i -= 1) acc = compositeOver(layers[i]!, acc);
  return acc;
}

function compositeOver(fg: RGBA, bg: RGBA): RGBA {
  const a = Math.max(0, Math.min(1, fg.a));
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: Math.min(1, a + bg.a * (1 - a)),
  };
}

/** 收集节点内所有 token 引用（点号 key） */
export function collectTokenRefs(node: DesignNode): string[] {
  const out: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      const ref = tokenRefKey(value);
      if (ref) out.push(ref);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value && typeof value === "object")
      for (const item of Object.values(value)) visit(item);
  };
  visit(node.size);
  visit(node.layout);
  visit(node.style);
  visit(node.typography);
  visit(node.animation);
  visit(node.bindingsMap);
  return [...new Set(out)].filter((key) => parseHex(key) === null);
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

export function summarizeIssues(issues: Issue[]): {
  error: number;
  warning: number;
  info: number;
} {
  return {
    error: issues.filter((i) => i.severity === "error").length,
    warning: issues.filter((i) => i.severity === "warning").length,
    info: issues.filter((i) => i.severity === "info").length,
  };
}
