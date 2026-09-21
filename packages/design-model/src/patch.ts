import type { DesignDocument, DesignNode, Page } from "./types";
import { clone, findPage, requireNode } from "./nodes";

/**
 * 设计补丁：AI 与手工编辑的统一表达（§20 / §149-151）。
 * 每个补丁可应用、可求逆、可摘要 —— 因此 AI 修改天然是单个可撤销事务，并且能给出 AI Diff。
 */
export type PatchOp =
  | { op: "set"; nodeId: string; path: string; value: unknown }
  | {
      op: "merge";
      nodeId: string;
      path: string;
      value: Record<string, unknown>;
    }
  | { op: "insert"; node: DesignNode; parentId: string; index?: number }
  | { op: "remove"; nodeId: string }
  | { op: "reparent"; nodeId: string; parentId: string; index?: number }
  | { op: "reorder"; parentId: string; from: number; to: number }
  | { op: "setToken"; key: string; value: unknown; mode?: string }
  | { op: "addToken"; token: DesignDocument["tokens"][number] }
  | { op: "removeToken"; key: string }
  | { op: "addComponent"; component: DesignDocument["components"][number] }
  | { op: "addAsset"; asset: DesignDocument["assets"][number] };

export interface DesignPatch {
  /** 事务标识：同一次 AI 操作共享一个 id（§149） */
  id?: string;
  /** 面向用户的意图说明，用于 AI Diff 与 Activity Feed（§26/§151） */
  summary?: string;
  /** 目标页面；省略则作用于 activePage */
  pageId?: string;
  ops: PatchOp[];
}

export interface ApplyResult {
  document: DesignDocument;
  /** 被修改的节点 id，用于局部重渲染与 AI Diff 定位 */
  touchedNodeIds: string[];
  /** 被跳过的操作及原因（不静默失败，§159） */
  skipped: { index: number; reason: string }[];
}

function pathGet(target: Record<string, unknown>, path: string): unknown {
  let current: unknown = target;
  for (const raw of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[raw];
  }
  return current;
}

function pathSet(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let current: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]!;
    const next = current[key];
    if (next === null || typeof next !== "object") current[key] = {};
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

function deepMergeInto(
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(patch)) {
    const existing = target[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing)
    ) {
      deepMergeInto(
        existing as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      target[key] = clone(value);
    }
  }
}

/** 在 page 上原地执行 ops；调用方传入的 page 必须是副本 */
function applyToPage(
  page: Page,
  ops: PatchOp[],
  skipped: { index: number; reason: string }[],
  touched: Set<string>,
  document?: DesignDocument,
): void {
  ops.forEach((op, index) => {
    switch (op.op) {
      case "set": {
        const node = page.nodes[op.nodeId];
        if (!node) {
          skipped.push({ index, reason: `node ${op.nodeId} not found` });
          break;
        }
        pathSet(
          node as unknown as Record<string, unknown>,
          op.path,
          clone(op.value),
        );
        touched.add(op.nodeId);
        break;
      }
      case "merge": {
        const node = page.nodes[op.nodeId];
        if (!node) {
          skipped.push({ index, reason: `node ${op.nodeId} not found` });
          break;
        }
        const holder = (
          op.path
            ? pathGet(node as unknown as Record<string, unknown>, op.path)
            : node
        ) as Record<string, unknown> | undefined;
        if (!holder || typeof holder !== "object") {
          skipped.push({ index, reason: `path ${op.path} is not an object` });
          break;
        }
        deepMergeInto(holder, op.value);
        touched.add(op.nodeId);
        break;
      }
      case "insert": {
        const parent = page.nodes[op.parentId];
        if (!parent) {
          skipped.push({ index, reason: `parent ${op.parentId} not found` });
          break;
        }
        if (page.nodes[op.node.id]) {
          skipped.push({ index, reason: `duplicate node id ${op.node.id}` });
          break;
        }
        const node = clone(op.node);
        node.parentId = parent.id;
        page.nodes[node.id] = node;
        const at =
          op.index === undefined
            ? parent.children.length
            : Math.max(0, Math.min(parent.children.length, op.index));
        parent.children = [
          ...parent.children.slice(0, at),
          node.id,
          ...parent.children.slice(at),
        ];
        touched.add(node.id);
        touched.add(parent.id);
        break;
      }
      case "remove": {
        const node = page.nodes[op.nodeId];
        if (!node) {
          skipped.push({ index, reason: `node ${op.nodeId} not found` });
          break;
        }
        if (op.nodeId === page.rootId) {
          skipped.push({ index, reason: "cannot remove page root" });
          break;
        }
        const subtree = collectSubtree(page, op.nodeId);
        for (const id of subtree) delete page.nodes[id];
        if (node.parentId) {
          const parent = page.nodes[node.parentId];
          if (parent) {
            parent.children = parent.children.filter((c) => c !== op.nodeId);
            touched.add(parent.id);
          }
        }
        touched.add(op.nodeId);
        break;
      }
      case "reparent": {
        const node = page.nodes[op.nodeId];
        const parent = page.nodes[op.parentId];
        if (!node || !parent) {
          skipped.push({ index, reason: "reparent: node or parent missing" });
          break;
        }
        if (op.nodeId === page.rootId) {
          skipped.push({ index, reason: "cannot reparent page root" });
          break;
        }
        if (
          op.nodeId === op.parentId ||
          isWithin(page, op.parentId, op.nodeId)
        ) {
          skipped.push({ index, reason: "reparent would create a cycle" });
          break;
        }
        if (node.parentId && page.nodes[node.parentId]) {
          page.nodes[node.parentId]!.children = page.nodes[
            node.parentId
          ]!.children.filter((c) => c !== op.nodeId);
          touched.add(node.parentId);
        }
        node.parentId = parent.id;
        const at =
          op.index === undefined
            ? parent.children.length
            : Math.max(0, Math.min(parent.children.length, op.index));
        parent.children = [
          ...parent.children.slice(0, at),
          node.id,
          ...parent.children.slice(at),
        ];
        touched.add(node.id);
        touched.add(parent.id);
        break;
      }
      case "reorder": {
        const parent = page.nodes[op.parentId];
        if (!parent) {
          skipped.push({ index, reason: `parent ${op.parentId} not found` });
          break;
        }
        if (
          op.from < 0 ||
          op.from >= parent.children.length ||
          op.to < 0 ||
          op.to >= parent.children.length
        ) {
          skipped.push({ index, reason: "reorder: index out of range" });
          break;
        }
        const children = [...parent.children];
        const [moved] = children.splice(op.from, 1);
        children.splice(op.to, 0, moved!);
        parent.children = children;
        touched.add(parent.id);
        break;
      }
      default: {
        // token / component / asset 级操作作用于 document
        if (!document) {
          skipped.push({
            index,
            reason: `${op.op} requires a document target`,
          });
          break;
        }
        applyDocumentOp(document, op, skipped, index);
      }
    }
  });
}

function applyDocumentOp(
  document: DesignDocument,
  op: PatchOp,
  skipped: { index: number; reason: string }[],
  index: number,
): void {
  switch (op.op) {
    case "setToken": {
      const token = document.tokens.find((t) => t.key === op.key);
      if (!token) {
        skipped.push({ index, reason: `token ${op.key} not found` });
        break;
      }
      if (op.mode) {
        token.modes = { ...(token.modes ?? {}), [op.mode]: clone(op.value) };
      } else {
        token.value = clone(op.value);
      }
      break;
    }
    case "addToken": {
      const at = document.tokens.findIndex((t) => t.key === op.token.key);
      if (at >= 0) document.tokens[at] = op.token;
      else document.tokens.push(op.token);
      break;
    }
    case "removeToken": {
      document.tokens = document.tokens.filter((t) => t.key !== op.key);
      break;
    }
    case "addComponent": {
      const at = document.components.findIndex((c) => c.id === op.component.id);
      if (at >= 0) document.components[at] = op.component;
      else document.components.push(op.component);
      break;
    }
    case "addAsset": {
      const at = document.assets.findIndex((a) => a.id === op.asset.id);
      if (at >= 0) document.assets[at] = op.asset;
      else document.assets.push(op.asset);
      break;
    }
    default:
      skipped.push({ index, reason: "unknown op" });
  }
}

export function collectSubtree(page: Page, id: string): string[] {
  const out: string[] = [];
  const visit = (nodeId: string) => {
    const node = page.nodes[nodeId];
    if (!node) return;
    out.push(nodeId);
    for (const child of node.children) visit(child);
  };
  visit(id);
  return out;
}

export function isWithin(
  page: Page,
  maybeDescendant: string,
  ancestorId: string,
): boolean {
  let current = page.nodes[maybeDescendant];
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = page.nodes[current.parentId];
  }
  return false;
}

/** 应用补丁：返回新 document（不修改入参），并记录被触碰的节点 */
export function applyPatch(
  document: DesignDocument,
  patch: DesignPatch,
): ApplyResult {
  const next = clone(document);
  const page = findPage(next, patch.pageId);
  const touched = new Set<string>();
  const skipped: { index: number; reason: string }[] = [];
  if (!page) {
    return {
      document: next,
      touchedNodeIds: [],
      skipped: [{ index: 0, reason: "page not found" }],
    };
  }
  const pageOps: PatchOp[] = [];
  const docOps: PatchOp[] = [];
  for (const op of patch.ops) {
    if (
      op.op === "setToken" ||
      op.op === "addToken" ||
      op.op === "removeToken" ||
      op.op === "addComponent" ||
      op.op === "addAsset"
    )
      docOps.push(op);
    else pageOps.push(op);
  }
  applyToPage(page, pageOps, skipped, touched, next);
  // docOps 的 index 需与原始 ops 对齐以便定位，这里单独走一遍
  const offsetIndexSkips: { index: number; reason: string }[] = [];
  applyDocumentOpsWithIndex(next, patch.ops, offsetIndexSkips);
  skipped.push(...offsetIndexSkips);
  next.metadata.updatedAt = new Date().toISOString();
  return { document: next, touchedNodeIds: [...touched], skipped };
}

function applyDocumentOpsWithIndex(
  document: DesignDocument,
  ops: PatchOp[],
  skipped: { index: number; reason: string }[],
): void {
  ops.forEach((op, index) => {
    if (
      op.op === "setToken" ||
      op.op === "addToken" ||
      op.op === "removeToken" ||
      op.op === "addComponent" ||
      op.op === "addAsset"
    ) {
      applyDocumentOp(document, op, skipped, index);
    }
  });
}

export interface PatchSnapshot {
  document: DesignDocument;
  patch: DesignPatch;
}

/**
 * 求逆补丁：用于 Undo。set/merge 记录旧值，insert/remove 互为逆，reparent/reorder 反向。
 * 必须在 apply 之前对同一 document 计算。
 */
export function invertPatch(
  document: DesignDocument,
  patch: DesignPatch,
): DesignPatch {
  const page = findPage(document, patch.pageId);
  const ops: PatchOp[] = [];
  for (const op of patch.ops) {
    switch (op.op) {
      case "set": {
        const node = page?.nodes[op.nodeId];
        if (!node) break;
        ops.push({
          op: "set",
          nodeId: op.nodeId,
          path: op.path,
          value: clone(
            pathGet(node as unknown as Record<string, unknown>, op.path),
          ),
        });
        break;
      }
      case "merge": {
        const node = page?.nodes[op.nodeId];
        if (!node) break;
        const holder = (
          op.path
            ? pathGet(node as unknown as Record<string, unknown>, op.path)
            : node
        ) as Record<string, unknown> | undefined;
        if (!holder || typeof holder !== "object") break;
        const before: Record<string, unknown> = {};
        for (const key of Object.keys(op.value))
          before[key] = clone(holder[key]);
        ops.push({
          op: "merge",
          nodeId: op.nodeId,
          path: op.path,
          value: before,
        });
        break;
      }
      case "insert": {
        const parent = page?.nodes[op.parentId];
        const index = parent ? parent.children.indexOf(op.node.id) : -1;
        ops.push({ op: "remove", nodeId: op.node.id });
        void index;
        break;
      }
      case "remove": {
        if (!page) break;
        const subtree = collectSubtree(page, op.nodeId);
        const removed = subtree.map((id) => clone(requireNode(page, id)));
        const node = page.nodes[op.nodeId];
        if (!node) break;
        const parent = node.parentId ? page.nodes[node.parentId] : undefined;
        const index = parent ? parent.children.indexOf(op.nodeId) : 0;
        // 逆序插回：先根后子，保证父子引用可用
        const restore: PatchOp[] = removed.map((child) => ({
          op: "insert" as const,
          node: child,
          parentId: child.parentId ?? "",
          index:
            child.parentId && page.nodes[child.parentId]
              ? page.nodes[child.parentId]!.children.indexOf(child.id)
              : 0,
        }));
        ops.unshift(...restore);
        void index;
        break;
      }
      case "reparent": {
        if (!page) break;
        const node = page.nodes[op.nodeId];
        if (!node?.parentId) break;
        const oldParent = page.nodes[node.parentId];
        const index = oldParent ? oldParent.children.indexOf(op.nodeId) : 0;
        ops.push({
          op: "reparent",
          nodeId: op.nodeId,
          parentId: node.parentId,
          index,
        });
        break;
      }
      case "reorder": {
        ops.push({
          op: "reorder",
          parentId: op.parentId,
          from: op.to,
          to: op.from,
        });
        break;
      }
      case "setToken": {
        const token = document.tokens.find((t) => t.key === op.key);
        if (!token) break;
        const value = op.mode ? token.modes?.[op.mode] : token.value;
        ops.push({
          op: "setToken",
          key: op.key,
          value: clone(value),
          ...(op.mode ? { mode: op.mode } : {}),
        });
        break;
      }
      case "addToken": {
        ops.push({ op: "removeToken", key: op.token.key });
        break;
      }
      case "removeToken": {
        const token = document.tokens.find((t) => t.key === op.key);
        if (token) ops.push({ op: "addToken", token: clone(token) });
        break;
      }
      case "addComponent": {
        const existing = document.components.find(
          (c) => c.id === op.component.id,
        );
        if (existing)
          ops.push({ op: "addComponent", component: clone(existing) });
        break;
      }
      case "addAsset": {
        const existing = document.assets.find((a) => a.id === op.asset.id);
        if (existing) ops.push({ op: "addAsset", asset: clone(existing) });
        break;
      }
    }
  }
  return {
    ...patch,
    id: patch.id,
    ops: ops.reverse(),
    summary: patch.summary ? `撤销：${patch.summary}` : undefined,
  };
}

/** AI Diff（§151）：把补丁翻译成人能读懂的变更清单 */
export interface DiffEntry {
  nodeId: string;
  nodeName: string;
  path: string;
  before: unknown;
  after: unknown;
  kind: "modified" | "added" | "removed" | "moved" | "token";
}

export function diffPatch(
  document: DesignDocument,
  patch: DesignPatch,
): DiffEntry[] {
  const page = findPage(document, patch.pageId);
  const entries: DiffEntry[] = [];
  for (const op of patch.ops) {
    const node = page && "nodeId" in op ? page.nodes[op.nodeId] : undefined;
    const nameOf = (id: string) => page?.nodes[id]?.name ?? id;
    switch (op.op) {
      case "set":
        entries.push({
          nodeId: op.nodeId,
          nodeName: node?.name ?? nameOf(op.nodeId),
          path: op.path,
          before: node
            ? clone(
                pathGet(node as unknown as Record<string, unknown>, op.path),
              )
            : undefined,
          after: clone(op.value),
          kind: "modified",
        });
        break;
      case "merge": {
        const holder = node
          ? ((op.path
              ? pathGet(node as unknown as Record<string, unknown>, op.path)
              : node) as Record<string, unknown>)
          : undefined;
        for (const [key, value] of Object.entries(op.value)) {
          entries.push({
            nodeId: op.nodeId,
            nodeName: node?.name ?? nameOf(op.nodeId),
            path: op.path ? `${op.path}.${key}` : key,
            before: holder ? clone(holder[key]) : undefined,
            after: clone(value),
            kind: "modified",
          });
        }
        break;
      }
      case "insert":
        entries.push({
          nodeId: op.node.id,
          nodeName: op.node.name,
          path: `children[${op.parentId}]`,
          before: undefined,
          after: op.node.name,
          kind: "added",
        });
        break;
      case "remove":
        entries.push({
          nodeId: op.nodeId,
          nodeName: nameOf(op.nodeId),
          path: "node",
          before: nameOf(op.nodeId),
          after: undefined,
          kind: "removed",
        });
        break;
      case "reparent":
        entries.push({
          nodeId: op.nodeId,
          nodeName: nameOf(op.nodeId),
          path: "parentId",
          before: node?.parentId ?? null,
          after: op.parentId,
          kind: "moved",
        });
        break;
      case "reorder":
        entries.push({
          nodeId: op.parentId,
          nodeName: nameOf(op.parentId),
          path: "children",
          before: op.from,
          after: op.to,
          kind: "moved",
        });
        break;
      case "setToken":
      case "addToken":
      case "removeToken": {
        const key = op.op === "addToken" ? op.token.key : op.key;
        entries.push({
          nodeId: "document",
          nodeName: "Design System",
          path: `tokens.${key}`,
          before: undefined,
          after:
            op.op === "removeToken"
              ? undefined
              : op.op === "addToken"
                ? op.token.value
                : op.value,
          kind: "token",
        });
        break;
      }
      default:
        break;
    }
  }
  return entries;
}

export function countOps(patch: DesignPatch): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const op of patch.ops) counts[op.op] = (counts[op.op] ?? 0) + 1;
  return counts;
}
