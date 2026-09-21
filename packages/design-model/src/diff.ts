import { sameValue } from "./nodes";
import type { DiffEntry } from "./patch";
import type { DesignDocument, DesignNode, Page } from "./types";

/**
 * Compare（§27）：两份设计文档之间的字段级差异。
 *
 * 和 AI Diff（§151）用同一种条目形状，所以历史面板与快照比较共用一套展示。
 * 刻意在"最浅的、真正不同的那一层"停下：`style.fills` 变了就报这一条，
 * 而不是拆成 fills[0].color.value —— 用户读的是"背景色改了"，不是 JSON 路径。
 */

export interface DocumentDiff {
  entries: DiffEntry[];
  /** 差异过大时截断，如实说明而不是给半份清单（§159） */
  truncated: boolean;
  total: number;
}

/** 结构字段单独处理：它们决定"谁是谁的子节点"，不是样式改动 */
const STRUCTURAL = new Set(["id", "parentId", "children"]);

const DEFAULT_LIMIT = 300;

type Row = [nodeId: string, nodeName: string, path: string, before: unknown, after: unknown, kind: DiffEntry["kind"]];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 递归到第一个不同的层；数组和标量当作一个整体比较 */
function walkLeaves(before: unknown, after: unknown, path: string, out: [string, unknown, unknown][]): void {
  if (sameValue(before, after)) return;
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) walkLeaves(before[key], after[key], path ? `${path}.${key}` : key, out);
    return;
  }
  out.push([path, before, after]);
}

/** 新增/删除整节点时不倾倒整个对象，只给一眼能读懂的摘要 */
function nodeSummary(node: DesignNode): Record<string, unknown> {
  return {
    type: node.type,
    name: node.name,
    ...(node.text === undefined ? {} : { text: node.text }),
    children: node.children.length,
  };
}

function diffPage(before: Page, after: Page, rows: Row[]): void {
  const beforeIds = new Set(Object.keys(before.nodes));
  for (const [id, node] of Object.entries(after.nodes)) {
    if (!beforeIds.has(id)) rows.push([id, node.name, "node", undefined, nodeSummary(node), "added"]);
  }
  for (const [id, was] of Object.entries(before.nodes)) {
    const now = after.nodes[id];
    if (!now) {
      rows.push([id, was.name, "node", nodeSummary(was), undefined, "removed"]);
      continue;
    }
    if (was.parentId !== now.parentId) {
      rows.push([id, now.name, "parentId", was.parentId ?? null, now.parentId ?? null, "moved"]);
    }
    if (!sameValue(was.children, now.children)) {
      rows.push([id, now.name, "children", [...was.children], [...now.children], "moved"]);
    }
    const fields: [string, unknown, unknown][] = [];
    for (const key of [...new Set([...Object.keys(was), ...Object.keys(now)])].sort()) {
      if (STRUCTURAL.has(key)) continue;
      walkLeaves(
        (was as unknown as Record<string, unknown>)[key],
        (now as unknown as Record<string, unknown>)[key],
        key,
        fields,
      );
    }
    for (const [path, b, a] of fields) rows.push([id, now.name, path, b, a, "modified"]);
  }
}

export function diffDocuments(
  before: DesignDocument,
  after: DesignDocument,
  limit = DEFAULT_LIMIT,
): DocumentDiff {
  const rows: Row[] = [];

  const beforePages = new Map(before.pages.map((p) => [p.id, p]));
  const afterPages = new Map(after.pages.map((p) => [p.id, p]));

  for (const page of after.pages) {
    const was = beforePages.get(page.id);
    if (!was) {
      rows.push([page.rootId, page.name, "page", undefined, `${page.nodes.length} 个节点`, "added"]);
      continue;
    }
    for (const key of ["name", "width", "height", "backgroundColor"] as const) {
      if (!sameValue(was[key], page[key])) {
        rows.push([page.rootId, was.name, `page.${key}`, was[key], page[key], "modified"]);
      }
    }
    diffPage(was, page, rows);
  }
  for (const page of before.pages) {
    if (!afterPages.has(page.id)) {
      rows.push([page.rootId, page.name, "page", `${page.nodes.length} 个节点`, undefined, "removed"]);
    }
  }

  const beforeTokens = new Map(before.tokens.map((t) => [t.key, t]));
  const afterTokens = new Map(after.tokens.map((t) => [t.key, t]));
  for (const token of after.tokens) {
    const was = beforeTokens.get(token.key);
    if (!was) {
      rows.push(["tokens", "设计令牌", token.key, undefined, token.value, "token"]);
      continue;
    }
    for (const key of ["type", "value", "modes"] as const) {
      if (!sameValue(was[key], token[key])) {
        rows.push(["tokens", "设计令牌", `${token.key}.${key}`, was[key], token[key], "token"]);
      }
    }
  }
  for (const token of before.tokens) {
    if (!afterTokens.has(token.key)) {
      rows.push(["tokens", "设计令牌", token.key, token.value, undefined, "token"]);
    }
  }

  return {
    entries: rows.slice(0, limit).map(([nodeId, nodeName, path, b, a, kind]) => ({
      nodeId,
      nodeName,
      path,
      before: b,
      after: a,
      kind,
    })),
    truncated: rows.length > limit,
    total: rows.length,
  };
}
