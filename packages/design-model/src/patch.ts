import type { AssetRef, DesignDocument, DesignNode, Page, Paint, VisualDna } from "./types";
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
  | { op: "removeComponent"; componentId: string }
  /** removeComponent 的逆：放回定义，并还原当时引用它的实例节点的 componentId。 */
  | {
      op: "restoreComponent";
      component: DesignDocument["components"][number];
      nodes: { pageId: string; nodeId: string }[];
    }
  | { op: "addAsset"; asset: DesignDocument["assets"][number] }
  | { op: "removeAsset"; assetId: string }
  /** removeAsset 的逆：把资产放回清单，并还原它当时被引用处的 paints / 节点 assetId。 */
  | {
      op: "restoreAsset";
      asset: AssetRef;
      paints: { pageId: string; nodeId: string; fills: Paint[] }[];
      nodes: { pageId: string; nodeId: string; assetId: string; src?: string }[];
    }
  | { op: "addPage"; page: Page; setActive?: boolean }
  | { op: "removePage"; pageId: string }
  /** §30/§174：整份替换项目的视觉 DNA（null = 清掉）。DNA 是文档级真值，不是节点属性 */
  | { op: "setVisualDna"; dna: VisualDna | null };

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

/**
 * 结构共享（`docs/PERFORMANCE.md` §147 第一条欠账）：`applyPatch` 不再整份克隆文档。
 *
 * 一次补丁通常只动一两个节点，而 `clone(document)` 在 10000 节点上是每次编辑都要付的
 * 全量同步大块——里面 99% 的节点这轮根本没被碰过。这里改成写时拷贝，三层各自懒：
 * 文档只浅拷会被改写的容器（metadata / pages / tokens / components / assets），
 * 页面在第一次被写时换一次（对象与 `nodes` 表，只浅拷一层），
 * 节点在第一次被写时深拷**那一个**（它的 style / layout / children 都在里面，所以嵌套改动是安全的）。
 *
 * 代价必须写在前面：**历史版本从此共享未被触碰的子树**。因此
 * ① 这次 apply 里，输入文档与 op 携带的 payload 一个字段都不许改（结构共享测试用深冻结钉死）；
 * ② 拿到文档的调用方同样不许原地改——这本来就是 `DesignStore` 写在类注释里的不变量
 *    （"document 只能通过 execute/undo/redo 改变"），结构共享把它从口头约定变成了必须成立的条件。
 */
class CopyOnWrite {
  readonly document: DesignDocument;
  private readonly sourcePages = new Map<string, Page>();

  constructor(private readonly source: DesignDocument) {
    for (const page of source.pages) this.sourcePages.set(page.id, page);
    this.document = {
      ...source,
      metadata: { ...source.metadata },
      pages: [...source.pages],
      tokens: [...source.tokens],
      components: [...source.components],
      assets: [...source.assets],
    };
  }

  /** 本次可写的页面；第一次拿到时把对象与 `nodes` 表换成本次的副本 */
  page(pageId?: string): Page | undefined {
    const source = findPage(this.source, pageId);
    if (!source) {
      // 不在源文档里 = 同一个补丁里 addPage 进来的新页（入库时已换成副本），直接给
      const wanted = pageId ?? this.document.activePageId;
      return this.document.pages.find((p) => p.id === wanted);
    }
    const at = this.document.pages.findIndex((p) => p.id === source.id);
    // 源文档有、本次却没有 = 同一个补丁里刚被 removePage 掉：照旧算 page not found
    if (at < 0) return undefined;
    const current = this.document.pages[at]!;
    // 不是源对象就已经是本次的（COW 换过的，或 addPage 换上来的）
    if (current !== source) return current;
    const copy: Page = { ...source, nodes: { ...source.nodes } };
    this.document.pages[at] = copy;
    return copy;
  }

  /** 本次可写的节点：仍与源文档同一对象时才深拷，这一次深拷就是全部成本 */
  node(page: Page, nodeId: string): DesignNode | undefined {
    const current = page.nodes[nodeId];
    if (!current) return undefined;
    if (this.sourcePages.get(page.id)?.nodes[nodeId] === current) {
      const copy = clone(current);
      page.nodes[nodeId] = copy;
      return copy;
    }
    return current;
  }

  /** 跨页面取可写节点（document 级 op 的引用清理走这里）：页面先 COW，节点再 COW */
  nodeOn(pageId: string, nodeId: string): DesignNode | undefined {
    const page = this.page(pageId);
    return page ? this.node(page, nodeId) : undefined;
  }
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

/**
 * 在 page 上原地执行 ops；`page` 必须是 `cow` 给出的本次副本，
 * 而**节点**在每次写之前都要过 `cow.node()`——那一步才决定这个节点要不要深拷。
 */
function applyToPage(
  cow: CopyOnWrite,
  page: Page,
  ops: PatchOp[],
  skipped: { index: number; reason: string }[],
  touched: Set<string>,
): void {
  ops.forEach((op, index) => {
    switch (op.op) {
      case "set": {
        const node = cow.node(page, op.nodeId);
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
        const node = cow.node(page, op.nodeId);
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
        const parent = cow.node(page, op.parentId);
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
          const parent = cow.node(page, node.parentId);
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
        // 校验全部读源数据即可；从这里开始每一处写都要先过 cow
        const mutableNode = cow.node(page, op.nodeId)!;
        const mutableParent = cow.node(page, op.parentId)!;
        if (node.parentId && page.nodes[node.parentId]) {
          const oldParent = cow.node(page, node.parentId)!;
          oldParent.children = oldParent.children.filter((c) => c !== op.nodeId);
          touched.add(node.parentId);
        }
        mutableNode.parentId = mutableParent.id;
        const at =
          op.index === undefined
            ? mutableParent.children.length
            : Math.max(0, Math.min(mutableParent.children.length, op.index));
        mutableParent.children = [
          ...mutableParent.children.slice(0, at),
          mutableNode.id,
          ...mutableParent.children.slice(at),
        ];
        touched.add(op.nodeId);
        touched.add(op.parentId);
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
        const mutableParent = cow.node(page, op.parentId)!;
        const children = [...mutableParent.children];
        const [moved] = children.splice(op.from, 1);
        children.splice(op.to, 0, moved!);
        mutableParent.children = children;
        touched.add(parent.id);
        break;
      }
      default: {
        // token / component / asset 级操作作用于 document
        applyDocumentOp(cow, op, skipped, index);
      }
    }
  });
}

/** 作用于 document（而非单个 page）的 op */
function isDocumentOp(op: PatchOp): boolean {
  switch (op.op) {
    case "setToken":
    case "addToken":
    case "removeToken":
    case "addComponent":
    case "removeComponent":
    case "restoreComponent":
    case "addAsset":
    case "removeAsset":
    case "restoreAsset":
    case "addPage":
    case "removePage":
    case "setVisualDna":
      return true;
    default:
      return false;
  }
}

function applyDocumentOp(
  cow: CopyOnWrite,
  op: PatchOp,
  skipped: { index: number; reason: string }[],
  index: number,
): void {
  const document = cow.document;
  switch (op.op) {
    case "addPage": {
      // 换成副本再入库：op 里的 payload 不许被后续 op 原地改（结构共享的①）
      const incoming = { ...op.page, nodes: { ...op.page.nodes } };
      const at = document.pages.findIndex((p) => p.id === incoming.id);
      if (at >= 0) document.pages[at] = incoming;
      else document.pages.push(incoming);
      if (op.setActive) document.activePageId = incoming.id;
      break;
    }
    case "removePage": {
      if (document.pages.length <= 1) {
        skipped.push({ index, reason: "cannot remove the last page" });
        break;
      }
      document.pages = document.pages.filter((p) => p.id !== op.pageId);
      if (document.activePageId === op.pageId) {
        document.activePageId = document.pages[0]?.id ?? "";
      }
      break;
    }
    case "setVisualDna": {
      // 整份替换而不是逐字段 merge：DNA 是一组互相耦合的约束，拼半套会自相矛盾
      if (op.dna === null) delete document.visualDna;
      else document.visualDna = clone(op.dna);
      break;
    }
    case "setToken": {
      const at = document.tokens.findIndex((t) => t.key === op.key);
      if (at < 0) {
        skipped.push({ index, reason: `token ${op.key} not found` });
        break;
      }
      // 换一个新对象而不是改原对象：源文档里那条 token 可能正被历史版本共享着
      const token = document.tokens[at]!;
      document.tokens[at] = op.mode
        ? { ...token, modes: { ...(token.modes ?? {}), [op.mode]: clone(op.value) } }
        : { ...token, value: clone(op.value) };
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
    case "removeComponent": {
      // 与 removeAsset 同一条规则（§159）：定义移出目录时，把引用它的实例节点一起解开，
      // 绝不留下"组件没了但画布还指着它"——那会让渲染与 AI Diff 各自猜一个答案。
      if (!document.components.some((c) => c.id === op.componentId)) {
        skipped.push({ index, reason: `component ${op.componentId} not found` });
        break;
      }
      document.components = document.components.filter((c) => c.id !== op.componentId);
      for (const page of [...document.pages]) {
        for (const nodeId of Object.keys(page.nodes)) {
          if (page.nodes[nodeId]!.componentId === op.componentId) {
            cow.nodeOn(page.id, nodeId)!.componentId = undefined;
          }
        }
      }
      break;
    }
    case "restoreComponent": {
      if (!document.components.some((c) => c.id === op.component.id)) {
        document.components = [...document.components, clone(op.component)];
      }
      for (const r of op.nodes) {
        const node = cow.nodeOn(r.pageId, r.nodeId);
        if (node) node.componentId = op.component.id;
      }
      break;
    }
    case "addAsset": {
      const at = document.assets.findIndex((a) => a.id === op.asset.id);
      if (at >= 0) document.assets[at] = op.asset;
      else document.assets.push(op.asset);
      break;
    }
    case "removeAsset": {
      // 有 document 全域可达，所以引用清理放在这里：删清单条目 + 剥掉所有页面上引用它的
      // 图片填充与 image/video 节点，绝不留下"清单没了但画布还指着它"的悬空引用（§159）。
      if (!document.assets.some((a) => a.id === op.assetId)) {
        skipped.push({ index, reason: `asset ${op.assetId} not found` });
        break;
      }
      document.assets = document.assets.filter((a) => a.id !== op.assetId);
      for (const page of [...document.pages]) {
        for (const nodeId of Object.keys(page.nodes)) {
          const node = page.nodes[nodeId]!;
          const hitsFill =
            Array.isArray(node.style.fills) &&
            node.style.fills.some(
              (p) => p.kind === "image" && p.assetId === op.assetId,
            );
          if (!hitsFill && node.assetId !== op.assetId) continue;
          const mutable = cow.nodeOn(page.id, nodeId);
          if (!mutable) continue;
          if (Array.isArray(mutable.style.fills)) {
            const kept = mutable.style.fills.filter(
              (p) => !(p.kind === "image" && p.assetId === op.assetId),
            );
            if (kept.length !== mutable.style.fills.length) mutable.style.fills = kept;
          }
          if (mutable.assetId === op.assetId) {
            mutable.assetId = undefined;
            mutable.src = undefined;
          }
        }
      }
      break;
    }
    case "restoreAsset": {
      if (!document.assets.some((a) => a.id === op.asset.id)) {
        document.assets = [...document.assets, clone(op.asset)];
      }
      for (const r of op.paints) {
        const node = cow.nodeOn(r.pageId, r.nodeId);
        if (node) node.style.fills = clone(r.fills);
      }
      for (const r of op.nodes) {
        const node = cow.nodeOn(r.pageId, r.nodeId);
        if (node) {
          node.assetId = r.assetId;
          if (r.src !== undefined) node.src = r.src;
        }
      }
      break;
    }
    default:
      skipped.push({ index, reason: "unknown op" });
  }
}

export function collectSubtree(page: Page, id: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (nodeId: string) => {
    const node = page.nodes[nodeId];
    if (!node) return;
    // 防环：畸形文档（a→b→a）会让 naive 递归栈溢出；加 seen 后无环树的输出不变
    if (seen.has(nodeId)) return;
    seen.add(nodeId);
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
  const seen = new Set<string>();
  while (current?.parentId) {
    if (seen.has(current.parentId)) break; // 防环：畸形 parent 链不再死循环（ADR-0050 第 9 处）
    seen.add(current.parentId);
    if (current.parentId === ancestorId) return true;
    current = page.nodes[current.parentId];
  }
  return false;
}

/**
 * 应用补丁：返回新 document（不修改入参），并记录被触碰的节点。
 * 结构共享见 `CopyOnWrite`——不整份克隆，只拷被写过的那几层。
 */
export function applyPatch(
  document: DesignDocument,
  patch: DesignPatch,
): ApplyResult {
  const cow = new CopyOnWrite(document);
  const next = cow.document;
  const page = cow.page(patch.pageId);
  const touched = new Set<string>();
  const skipped: { index: number; reason: string }[] = [];
  if (!page) {
    return {
      document: next,
      touchedNodeIds: [],
      skipped: [{ index: 0, reason: "page not found" }],
    };
  }
  const pageOps: PatchOp[] = patch.ops.filter((op) => !isDocumentOp(op));
  applyToPage(cow, page, pageOps, skipped, touched);
  // document 级 op 单独走一遍，index 与原始 ops 对齐以便定位
  const offsetIndexSkips: { index: number; reason: string }[] = [];
  applyDocumentOpsWithIndex(cow, patch.ops, offsetIndexSkips);
  skipped.push(...offsetIndexSkips);
  next.metadata.updatedAt = new Date().toISOString();
  return { document: next, touchedNodeIds: [...touched], skipped };
}

function applyDocumentOpsWithIndex(
  cow: CopyOnWrite,
  ops: PatchOp[],
  skipped: { index: number; reason: string }[],
): void {
  ops.forEach((op, index) => {
    if (isDocumentOp(op)) applyDocumentOp(cow, op, skipped, index);
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
        // 逆序插回：先根后子，保证父子引用可用。
        // 这里必须先反着摆：函数末尾有一次 `ops.reverse()`（一笔补丁要按应用的反序撤销），
        // 直接按子树顺序摆进去，总反转之后就成了"子在前、根在后"——
        // 撤销时子节点因为父级还没回来被一条条 skip 掉，节点悄悄少一半而没人报错。
        const restore: PatchOp[] = removed.map((child) => ({
          op: "insert" as const,
          // children 一律清空，交给随后那几条 insert 逐条重建。跟着克隆塞回整份数组，
          // 会和子节点自己的 insert 叠成双份——节点数对得上，画布上每个子节点却画两遍。
          node: { ...child, children: [] },
          parentId: child.parentId ?? "",
          index:
            child.parentId && page.nodes[child.parentId]
              ? page.nodes[child.parentId]!.children.indexOf(child.id)
              : 0,
        }));
        ops.unshift(...restore.reverse());
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
        // 与 addAsset 同一形状的洞（§150）：过去只在目录里本来就有同 id 那一条时写还原，
        // "新建组件"那一路什么都不写，于是 AI 建完组件后撤销无从下手——组件永远留在目录里。
        if (existing) ops.push({ op: "addComponent", component: clone(existing) });
        else ops.push({ op: "removeComponent", componentId: op.component.id });
        break;
      }
      case "removeComponent": {
        const component = document.components.find(
          (c) => c.id === op.componentId,
        );
        if (!component) break;
        // 实例链接要在还原时一起接回去：只放回定义会得到"组件回来了，但画布上那些实例
        // 再也不属于它"的半成品（§16 设计模型是唯一真值，撤销不能只恢复一半）。
        const nodes: { pageId: string; nodeId: string }[] = [];
        for (const page of document.pages) {
          for (const node of Object.values(page.nodes)) {
            if (node.componentId === op.componentId) {
              nodes.push({ pageId: page.id, nodeId: node.id });
            }
          }
        }
        ops.push({
          op: "restoreComponent",
          component: clone(component),
          nodes,
        });
        break;
      }
      case "restoreComponent": {
        // 和 restoreAsset 一样：这一条只会由 invertPatch 生成（撤销 removeComponent 时用），
        // 永远不会作为用户/AI 补丁进 invertPatch，所以它没有逆操作可求 —— 不写这一句，
        // 也不许在这里"顺手"补一个 removeComponent：定义本来就在时那样做等于删掉真值。
        break;
      }
      case "addAsset": {
        const existing = document.assets.find((a) => a.id === op.asset.id);
        // 目录里本来没有这一条：撤销必须真的把它移出去。
        // 这里原来只在 `existing` 存在时才写逆操作，于是"新增资产"根本没有逆操作可写——
        // 上传/生成的图片贴上去能撤销，目录里那一条却永远撤不掉（§150 说所有编辑都可撤销）。
        // 走 removeAsset 而不是新造一个 op：它带"顺带剥掉引用它的填充/节点"的既有语义，
        // 而同一个事务里那些填充的撤销排在它前面（逆操作按倒序应用），所以不会剥到不该剥的。
        if (existing) ops.push({ op: "addAsset", asset: clone(existing) });
        else ops.push({ op: "removeAsset", assetId: op.asset.id });
        break;
      }
      case "removeAsset": {
        const asset = document.assets.find((a) => a.id === op.assetId);
        if (!asset) break;
        const paints: { pageId: string; nodeId: string; fills: Paint[] }[] = [];
        const nodes: { pageId: string; nodeId: string; assetId: string; src?: string }[] =
          [];
        for (const page of document.pages) {
          for (const node of Object.values(page.nodes)) {
            if (
              Array.isArray(node.style.fills) &&
              node.style.fills.some((p) => p.kind === "image" && p.assetId === op.assetId)
            ) {
              paints.push({ pageId: page.id, nodeId: node.id, fills: clone(node.style.fills) });
            }
            if (node.assetId === op.assetId) {
              nodes.push({
                pageId: page.id,
                nodeId: node.id,
                assetId: op.assetId,
                src: node.src === undefined ? undefined : clone(node.src),
              });
            }
          }
        }
        ops.push({ op: "restoreAsset", asset: clone(asset), paints, nodes });
        break;
      }
      case "setVisualDna": {
        // 之前没有 DNA 时逆操作是 null（清掉），而不是留着一份"看起来像但其实是新的"约束
        ops.push({
          op: "setVisualDna",
          dna: document.visualDna ? clone(document.visualDna) : null,
        });
        break;
      }
      case "addPage": {
        ops.push({ op: "removePage", pageId: op.page.id });
        break;
      }
      case "removePage": {
        const existing = document.pages.find((p) => p.id === op.pageId);
        if (existing)
          ops.push({
            op: "addPage",
            page: clone(existing),
            // 删除时若它就是当前页，撤销要把它重新设为当前页
            setActive: document.activePageId === op.pageId,
          });
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
      case "addPage":
        entries.push({
          nodeId: "document",
          nodeName: "Pages",
          path: "pages",
          before: undefined,
          after: op.page.name,
          kind: "added",
        });
        break;
      case "removePage":
        entries.push({
          nodeId: "document",
          nodeName: "Pages",
          path: "pages",
          before: document.pages.find((p) => p.id === op.pageId)?.name ?? op.pageId,
          after: undefined,
          kind: "removed",
        });
        break;
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
