import type { DesignDocument, DesignNode, NodeId, Page } from "./types";
import { TokenStore, contrastRatio, parseHex, tokenRefKey } from "./tokens";
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
  | "bad-binding";

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
    const background = resolveBackground(document, page);
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
      // 文本对比度（§90）
      const textColor = firstSolid(node.style.fills);
      if (node.type === "text" && textColor && background) {
        const ratio = contrastRatio(textColor, background);
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
        if (ratio < required) {
          issues.push({
            code: "low-contrast",
            severity: "warning",
            message: `${node.name} 文本对比度 ${ratio.toFixed(2)}:1，低于 ${required}:1`,
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

function resolveBackground(
  document: DesignDocument,
  page: Page,
): string | null {
  const root = page.nodes[page.rootId];
  const fill = root ? firstSolid(root.style.fills) : null;
  const candidate = fill ?? (page.backgroundColor as string | null);
  if (!candidate) return null;
  const resolved =
    typeof candidate === "string" && tokenRefKey(candidate)
      ? new TokenStore(document.tokens).resolveValue(
          candidate,
          document.activeMode,
        )
      : candidate;
  return typeof resolved === "string" ? resolved : null;
}

function firstSolid(node: DesignNode["style"]["fills"]): string | null {
  for (const paint of node) {
    if (paint.kind !== "solid" || paint.visible === false) continue;
    const color = paint.color;
    if (typeof color === "string") return color;
    const r = Math.round(color.r);
    const g = Math.round(color.g);
    const b = Math.round(color.b);
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  }
  return null;
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
