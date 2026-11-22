import type { WorldDocument, WorldLink, WorldNode } from '@nexus/world-model';

/**
 * §WORLD-NET · 万象脉络：把一个世界的节点与有向关系投影成"权力骨架"。
 *
 * 读的是 WorldDocument 的真实字段（nodes[].id/kind/title、links[].from/to/label），
 * 零写库、零 provider，纯函数、同输入永远同输出（次级键 id 字典序兜底所有平局）。
 *
 * 三件能自证的事：
 * 1. 入/出度枢纽榜——谁被最多关系指向（权力中心）、谁指向最多人（活跃源头）；
 * 2. 强连通分量（Tarjan）——互相可达的一簇就是"势力团"；
 * 3. 桥（割边，Tarjan lowlink）——删掉它图就多一块，是叙事上"一断全散"的关节。
 *
 * 图上所有算法都用**迭代**而非递归：一个史诗世界可能有上万节点，递归 DFS 会爆栈（OS 层的现实约束）。
 */

export interface HubRow {
  id: string;
  title: string;
  kind: string;
  in: number;
  out: number;
}

export interface Clique {
  /** 分量内节点 id，字典序 */
  members: string[];
  /** 是否为强连通（size>1 或自环） */
  strong: boolean;
}

export interface Bridge {
  from: string;
  to: string;
  label: string;
}

/** 割点：去掉它，它所在的连通块会裂成 parts 块（parts>1 才算）。 */
export interface CutVertex {
  id: string;
  /** 入度+出度（同一对端点的多条关系分别计数） */
  degree: number;
  /** 去掉它之后，它原所在连通块裂成的块数 */
  parts: number;
}

export interface CrossKindEdge {
  label: string;
  count: number;
  pairs: { fromKind: string; toKind: string; count: number }[];
}

export interface WorldNetwork {
  nodeCount: number;
  linkCount: number;
  hubs: HubRow[];
  cliques: Clique[];
  bridges: Bridge[];
  /** 割点榜：parts 降序、degree 降序、id 字典序（确定性） */
  cutVertices: CutVertex[];
  crossKind: CrossKindEdge[];
  /** 忽略方向后仍互不连通的块数（连通分量） */
  weakComponents: number;
  /** 没有任何关系的节点 id（字典序）——它们不在骨架里，如实列出 */
  isolated: string[];
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** 只认存在于节点表、且两端不同的边；自环和悬空边都不进骨架（与前几片 validateWorld 同口径）。 */
function cleanLinks(doc: WorldDocument): WorldLink[] {
  const ids = new Set(doc.nodes.map((n) => n.id));
  return doc.links
    .filter((l) => ids.has(l.from) && ids.has(l.to) && l.from !== l.to)
    .slice()
    .sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to) || cmp(a.label, b.label) || cmp(a.id, b.id));
}

interface Adj {
  out: Map<string, string[]>;
  in: Map<string, string[]>;
}

function adjacency(nodeIds: string[], links: WorldLink[]): Adj {
  const out = new Map<string, string[]>();
  const inn = new Map<string, string[]>();
  for (const id of nodeIds) { out.set(id, []); inn.set(id, []); }
  for (const l of links) {
    out.get(l.from)!.push(l.to);
    inn.get(l.to)!.push(l.from);
  }
  for (const list of [...out.values(), ...inn.values()]) list.sort(cmp);
  return { out, in: inn };
}

/** 忽略方向的连通分量数（并查集，迭代，路径压缩）。 */
function weakComponentCount(nodeIds: string[], links: WorldLink[]): number {
  const parent = new Map(nodeIds.map((id) => [id, id]));
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur) !== root) { const next = parent.get(cur)!; parent.set(cur, root); cur = next; }
    return root;
  };
  for (const l of links) {
    const a = find(l.from); const b = find(l.to);
    if (a !== b) parent.set(a, b);
  }
  return new Set(nodeIds.map(find)).size;
}

/**
 * Tarjan 桥（无向语义：忽略方向的边，删掉它无向连通分量 +1）。
 * 用出边的 (from,to) 规范化键去重双向；迭代 DFS 显式栈。
 */
function findBridges(nodeIds: string[], links: WorldLink[]): Bridge[] {
  // 邻接表按"边"存而不是按"邻居节点"存：a→b 与 b→a 是两条不同的边，
  // 若按父节点名跳过父边，双向边里第二条会被漏掉，于是把本该成环的 a-b 误判成桥。
  // 每件事都带一条唯一的 edgeId，DFS 只跳过那条父边本身。
  interface Arc { to: string; id: string }
  const adj = new Map<string, Arc[]>();
  for (const id of nodeIds) adj.set(id, []);
  const edgeKey = (a: string, b: string) => (cmp(a, b) < 0 ? `${a}\u0000${b}` : `${b}\u0000${a}`);
  const labelOf = new Map<string, string>();
  for (const l of links) {
    const k = edgeKey(l.from, l.to);
    const id = `${k}\u0000${l.id}`;
    adj.get(l.from)!.push({ to: l.to, id });
    adj.get(l.to)!.push({ to: l.from, id });
    if (!labelOf.has(id)) labelOf.set(id, l.label);
  }
  for (const list of adj.values()) list.sort((a, b) => cmp(a.to, b.to) || cmp(a.id, b.id));

  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const bridges: Bridge[] = [];
  let time = 0;
  for (const root of nodeIds) {
    if (disc.has(root)) continue;
    // 栈帧：节点 + 下一个要访问的弧下标 + 父节点 + 走到父节点的那条边 id
    const stack: { v: string; i: number; parent: string | null; parentEdge: string | null }[] = [
      { v: root, i: 0, parent: null, parentEdge: null },
    ];
    disc.set(root, time); low.set(root, time); time++;
    while (stack.length) {
      const frame = stack[stack.length - 1]!;
      const arcs = adj.get(frame.v)!;
      if (frame.i < arcs.length) {
        const arc = arcs[frame.i++]!;
        if (arc.id === frame.parentEdge) continue; // 只跳过父边这一条，不跳过同端的其它边
        const w = arc.to;
        if (!disc.has(w)) {
          disc.set(w, time); low.set(w, time); time++;
          stack.push({ v: w, i: 0, parent: frame.v, parentEdge: arc.id });
        } else {
          low.set(frame.v, Math.min(low.get(frame.v)!, disc.get(w)!));
        }
      } else {
        stack.pop();
        if (frame.parent !== null && frame.parentEdge !== null) {
          const p = frame.parent;
          low.set(p, Math.min(low.get(p)!, low.get(frame.v)!));
          if (low.get(frame.v)! > disc.get(p)!) {
            const [from, to] = cmp(p, frame.v) < 0 ? [p, frame.v] : [frame.v, p];
            bridges.push({ from: from!, to: to!, label: labelOf.get(frame.parentEdge) ?? '' });
          }
        }
      }
    }
  }
  return bridges.sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to) || cmp(a.label, b.label));
}

/**
 * 割点（articulation points）——"谁一倒，这张网会裂开"。
 *
 * 与割边是两种不同的性质：割边是**一条关系**断了会分家；割点是**一个条目**没了会分家。
 * 一个节点的所有边都可能是割边、它自己却不是割点（比如三角形的一个角）。
 *
 * 迭代 Tarjan（大世界不爆栈），父边按 **edge id** 跳过而不是按父节点——
 * 双向 a→b / b→a 是两条边，按节点跳会把第二条当成回边漏掉（§WORLD-NET 第一版踩过的坑）。
 * parts 由 DFS 直接算：非根节点 = 分离子树数 + 1（父侧）；根 = 子树数。
 * 回边只更新 low，不改 disc——这是"无向图里 back edge 只往上连"的那一格。
 */
function findCutVertices(nodeIds: string[], links: WorldLink[]): CutVertex[] {
  const adj = new Map<string, { to: string; id: string }[]>();
  for (const id of nodeIds) adj.set(id, []);
  links.forEach((l, i) => {
    const id = l.id || `e${i}`;
    adj.get(l.from)!.push({ to: l.to, id });
    adj.get(l.to)!.push({ to: l.from, id });
  });
  for (const list of adj.values()) list.sort((a, b) => cmp(a.to, b.to) || cmp(a.id, b.id));

  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const children = new Map<string, number>();
  const separated = new Map<string, number>();
  const roots = new Set<string>();
  let time = 0;

  for (const root of nodeIds) {
    if (disc.has(root)) continue;
    roots.add(root);
    const stack: { v: string; i: number; parent: string | null; parentEdge: string | null }[] = [
      { v: root, i: 0, parent: null, parentEdge: null },
    ];
    disc.set(root, time); low.set(root, time); time++;
    while (stack.length) {
      const frame = stack[stack.length - 1]!;
      const arcs = adj.get(frame.v)!;
      if (frame.i < arcs.length) {
        const arc = arcs[frame.i++]!;
        if (arc.id === frame.parentEdge) continue;
        const w = arc.to;
        if (!disc.has(w)) {
          children.set(frame.v, (children.get(frame.v) ?? 0) + 1);
          disc.set(w, time); low.set(w, time); time++;
          stack.push({ v: w, i: 0, parent: frame.v, parentEdge: arc.id });
        } else {
          low.set(frame.v, Math.min(low.get(frame.v)!, disc.get(w)!));
        }
      } else {
        stack.pop();
        if (frame.parent !== null) {
          const p = frame.parent;
          low.set(p, Math.min(low.get(p)!, low.get(frame.v)!));
          if (low.get(frame.v)! >= disc.get(p)!) separated.set(p, (separated.get(p) ?? 0) + 1);
        }
      }
    }
  }

  const degree = new Map<string, number>();
  for (const l of links) {
    degree.set(l.from, (degree.get(l.from) ?? 0) + 1);
    degree.set(l.to, (degree.get(l.to) ?? 0) + 1);
  }

  const out: CutVertex[] = [];
  for (const id of nodeIds) {
    // 根节点：子树 > 1 才是割点，parts = 子树数（根没有父侧）。
    // 非根：分离子树数 + 1（父侧那一块）——注意根的每个子树都会让 separated 自增，
    // 不能拿 separated 去套根，否则一条链的根会被误报成 parts=2。
    const parts = roots.has(id) ? (children.get(id) ?? 0) : (separated.get(id) ?? 0) > 0 ? separated.get(id)! + 1 : 0;
    if (parts > 1) out.push({ id, degree: degree.get(id) ?? 0, parts });
  }
  return out.sort((a, b) => b.parts - a.parts || b.degree - a.degree || cmp(a.id, b.id));
}

/**
 * Tarjan 强连通分量（迭代版 Kosaraju 更直白：两次 DFS，第二次按逆后序在反图上染色）。
 * 用 Kosaraju 而非 Tarjan——同样 O(V+E)，但迭代写法更短、更不容易写错。
 */
function strongComponents(nodeIds: string[], adj: Adj): Clique[] {
  const visited = new Set<string>();
  const order: string[] = [];
  for (const root of nodeIds) {
    if (visited.has(root)) continue;
    const stack: { v: string; i: number }[] = [{ v: root, i: 0 }];
    visited.add(root);
    while (stack.length) {
      const frame = stack[stack.length - 1]!;
      const list = adj.out.get(frame.v)!;
      if (frame.i < list.length) {
        const w = list[frame.i++]!;
        if (!visited.has(w)) { visited.add(w); stack.push({ v: w, i: 0 }); }
      } else {
        order.push(frame.v);
        stack.pop();
      }
    }
  }
  const assigned = new Set<string>();
  const cliques: Clique[] = [];
  for (let i = order.length - 1; i >= 0; i--) {
    const root = order[i]!;
    if (assigned.has(root)) continue;
    const members: string[] = [];
    const stack = [root];
    assigned.add(root);
    while (stack.length) {
      const v = stack.pop()!;
      members.push(v);
      for (const w of adj.in.get(v)!) {
        if (!assigned.has(w)) { assigned.add(w); stack.push(w); }
      }
    }
    members.sort(cmp);
    // 单点分量只有它自己有自环才算"强"；自环已被 cleanLinks 排除，故单点一律非强
    cliques.push({ members, strong: members.length > 1 });
  }
  cliques.sort((a, b) => b.members.length - a.members.length || cmp(a.members[0] ?? '', b.members[0] ?? ''));
  return cliques;
}

export function buildWorldNetwork(doc: WorldDocument): WorldNetwork {
  const nodes = doc.nodes.slice().sort((a, b) => cmp(a.id, b.id));
  const nodeIds = nodes.map((n) => n.id);
  const links = cleanLinks(doc);
  const adj = adjacency(nodeIds, links);
  const titleOf = new Map(nodes.map((n) => [n.id, n]));

  const hubs: HubRow[] = nodes.map((n) => ({
    id: n.id,
    title: n.title,
    kind: n.kind,
    in: adj.in.get(n.id)!.length,
    out: adj.out.get(n.id)!.length,
  })).sort((a, b) => (b.in + b.out) - (a.in + a.out) || b.in - a.in || cmp(a.id, b.id));

  const crossAgg = new Map<string, Map<string, number>>();
  for (const l of links) {
    const fromKind = titleOf.get(l.from)!.kind;
    const toKind = titleOf.get(l.to)!.kind;
    if (fromKind === toKind) continue; // 跨类才进这张表
    let byPair = crossAgg.get(l.label);
    if (!byPair) { byPair = new Map(); crossAgg.set(l.label, byPair); }
    const pair = `${fromKind}\u0000${toKind}`;
    byPair.set(pair, (byPair.get(pair) ?? 0) + 1);
  }
  const crossKind: CrossKindEdge[] = [...crossAgg.entries()]
    .map(([label, byPair]) => ({
      label,
      count: [...byPair.values()].reduce((a, b) => a + b, 0),
      pairs: [...byPair.entries()].map(([pair, count]) => {
        const [fromKind, toKind] = pair.split('\u0000');
        return { fromKind: fromKind!, toKind: toKind!, count };
      }).sort((a, b) => b.count - a.count || cmp(a.fromKind, b.fromKind) || cmp(a.toKind, b.toKind)),
    }))
    .sort((a, b) => b.count - a.count || cmp(a.label, b.label));

  return {
    nodeCount: nodes.length,
    linkCount: links.length,
    hubs,
    cliques: strongComponents(nodeIds, adj),
    bridges: findBridges(nodeIds, links),
    cutVertices: findCutVertices(nodeIds, links),
    crossKind,
    weakComponents: weakComponentCount(nodeIds, links),
    isolated: hubs.filter((h) => h.in === 0 && h.out === 0).map((h) => h.id),
  };
}
