import type { ComponentDefinition, DesignNode, Page } from "./types";
import { clone } from "./nodes";

/** 组件系统：Variant / Property / Slot / Instance / Override（§13） */
export interface ResolvedInstance {
  /** 实例的可视子树（主组件子树 + 变体覆盖 + 实例覆盖） */
  nodes: Record<string, DesignNode>;
  rootId: string;
}

/** 变体匹配：给定 props，选出匹配度最高的变体 */
export function matchVariant(
  component: ComponentDefinition,
  props: Record<string, string>,
): ComponentDefinition["variants"][number] | null {
  let best: ComponentDefinition["variants"][number] | null = null;
  let bestScore = -1;
  for (const variant of component.variants) {
    let score = 0;
    let ok = true;
    for (const [key, value] of Object.entries(variant.props)) {
      if (props[key] === value) score += 1;
      else if (props[key] !== undefined) ok = false;
    }
    if (ok && score > bestScore) {
      best = variant;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

/** 把实例的 overrides 投影回节点：overrides 以 nodeId → {path: value} 表达 */
export function applyInstanceOverrides(
  page: Page,
  instance: DesignNode,
  component?: ComponentDefinition,
): ResolvedInstance {
  const nodes: Record<string, DesignNode> = {};
  const seen = new Set<string>();
  const collect = (id: string) => {
    if (seen.has(id)) return; // 防环：畸形 children 链不再无限递归（ADR-0050）
    seen.add(id);
    const node = page.nodes[id];
    if (!node) return;
    nodes[id] = clone(node);
    for (const child of node.children) collect(child);
  };
  // 从实例本体开始收：rootId 指它，nodes 表若不含它就自洽不了（重映射的 instance.id 特判等的就是它）
  collect(instance.id);

  const variant =
    component && matchVariant(component, instance.variantProps ?? {});
  const layered = [variant?.overrides, instance.overrides].filter(
    Boolean,
  ) as Record<string, Record<string, unknown>>[];

  for (const layer of layered) {
    for (const [nodeId, patches] of Object.entries(layer)) {
      const target = nodes[nodeId];
      if (!target) continue;
      for (const [path, value] of Object.entries(patches)) {
        assignPath(target as unknown as Record<string, unknown>, path, value);
      }
    }
  }

  // 重映射父子指针，保证只读投影内部自洽
  for (const node of Object.values(nodes)) {
    node.children = node.children.filter((childId) => nodes[childId]);
    if (node.parentId && !nodes[node.parentId] && node.parentId !== instance.id)
      node.parentId = instance.id;
  }

  return { nodes, rootId: instance.id };
}

function assignPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let current = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]!;
    const next = current[key];
    if (next === null || typeof next !== "object") current[key] = {};
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = clone(value);
}

/** §124 状态层：把 hover/active/focus/… 的状态补丁叠加到节点样式上（渲染层调用） */
export function withState(
  node: DesignNode,
  state: keyof NonNullable<DesignNode["states"]> | null,
): DesignNode {
  if (!state) return node;
  const patch = node.states?.[state];
  if (!patch) return node;
  const next = clone(node);
  Object.assign(next.style, patch);
  return next;
}

/** 组件的可用变体属性矩阵，UI 属性面板用 */
export function variantMatrix(
  component: ComponentDefinition,
): Record<string, string[]> {
  const matrix: Record<string, Set<string>> = {};
  for (const variant of component.variants) {
    for (const [key, value] of Object.entries(variant.props)) {
      matrix[key] = matrix[key] ?? new Set();
      matrix[key]!.add(value);
    }
  }
  for (const prop of component.props) {
    if (prop.type === "select" && prop.options) {
      matrix[prop.name] = new Set([
        ...(matrix[prop.name] ?? []),
        ...prop.options,
      ]);
    }
  }
  return Object.fromEntries(
    Object.entries(matrix).map(([k, v]) => [k, [...v]]),
  );
}

/** 未使用的组件（Design Lint 一致性检查输入） */
export function findUnusedComponents(document: {
  pages: Page[];
  components: ComponentDefinition[];
}): ComponentDefinition[] {
  const used = new Set<string>();
  for (const page of document.pages) {
    for (const node of Object.values(page.nodes)) {
      if (node.componentId) used.add(node.componentId);
      if (node.type === "component") used.add(node.name);
    }
  }
  return document.components.filter(
    (c) => !used.has(c.id) && !used.has(c.name),
  );
}

/** 近似重复组件检测：同一 props 名集合 + 相同根布局视为候选重复（§121） */
export function findDuplicateComponents(
  components: ComponentDefinition[],
): [ComponentDefinition, ComponentDefinition][] {
  const pairs: [ComponentDefinition, ComponentDefinition][] = [];
  const signature = (c: ComponentDefinition) =>
    [
      c.props
        .map((p) => `${p.name}:${p.type}`)
        .sort()
        .join("|"),
      c.variants
        .map((v) => JSON.stringify(v.props))
        .sort()
        .join("|"),
    ].join("##");
  for (let i = 0; i < components.length; i += 1) {
    for (let j = i + 1; j < components.length; j += 1) {
      if (signature(components[i]!) === signature(components[j]!))
        pairs.push([components[i]!, components[j]!]);
    }
  }
  return pairs;
}
