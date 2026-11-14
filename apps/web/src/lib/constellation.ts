/**
 * 「人物关系星图」的纯布局（v704 / ROADMAP；视觉在 components/ConstellationPanel.tsx）。
 *
 * 设计要点（无随机、无依赖、可单测）：
 * - 排序：degree 降序、再按名字升序——同一批输入永远摆出同一张图（"星座"不会每次刷新就重排）；
 * - 摆位：黄金角螺旋（phyllotaxis）。r = sqrt((i+1)/n) 语义就是"每加一个新人，他占一个环带"，
 *   视觉天然成片；第一个点在中心，不会顶满角落；
 * - 边只画双方都解析到的关系（角色↔角色）；指向世界条目的解析成"world anchor"暗星，常驻外环；
 *   两端都解析不出的关系：不画（堆到 unresolved，面板脚注如实说"N 条未上图"）；
 * - 双向关系（A→B 且 B→A）在图上合并成一条双箭头、标签各带一条（守夜人·效忠 ↔ 苍雪盟约·统辖）。
 */

import type { Character } from '@nexus/world-model';

export interface ConstellationNode {
  id: string;
  name: string;
  /** visualIdentity.palette 里格式合法的 hex 色（非法丢弃）；空数组 → 调用方回退品牌渐变 */
  palette: string[];
  degree: number;
  /** 黄金角螺旋角度（弧度），0..2π */
  angle: number;
  /** 0..1 的半径（相对最大半径） */
  radius: number;
  traits: string[];
}

export interface ConstellationEdge {
  /** 稳定 id：`a|b`（a<b 排序后），双向合并时一个边、两条 label */
  id: string;
  from: string;
  to: string;
  kind: string;
  note: string;
  /** 反向关系的 kind/note（B→A 存在时）；否则 null */
  reverse: { kind: string; note: string } | null;
}

export interface ConstellationWorldAnchor {
  /** 世界条目 id */
  id: string;
  label: string;
  angle: number;
}

export interface UnresolvedRelationship {
  ownerId: string;
  ownerName: string;
  kind: string;
  target: string;
  note: string;
}

export interface ConstellationGraph {
  nodes: ConstellationNode[];
  edges: ConstellationEdge[];
  worldAnchors: ConstellationWorldAnchor[];
  /** 两端都解析不出的关系（用户写了一串世界里不存在的名字） */
  unresolved: UnresolvedRelationship[];
  totalRelationships: number;
  charLinked: number;
  worldLinked: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.39996 弧度（137.5°）
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function buildConstellation(
  characters: readonly Character[],
  worldNodes: readonly { id: string; title: string }[],
): ConstellationGraph {
  const byId = new Map(characters.map((c) => [c.id, c] as const));
  const worldTitles = new Map(worldNodes.map((n) => [n.id, n.title] as const));
  const nameOf = (id: string): string => byId.get(id)?.profile.name || worldTitles.get(id) || '';

  // 先把每个人的出边分类，再算度数
  const degree = new Map<string, number>();
  const parsed: { owner: Character; rel: { target: string; kind: string; note: string } }[] = [];
  for (const character of characters) {
    for (const rel of character.profile.relationships) {
      const target = typeof rel?.target === 'string' ? rel.target : '';
      if (!target) continue; // 空指向不算一条关系
      parsed.push({ owner: character, rel: { target, kind: String(rel?.kind ?? '').trim(), note: String(rel?.note ?? '') } });
      degree.set(character.id, (degree.get(character.id) ?? 0) + 1);
      if (byId.has(target)) degree.set(target, (degree.get(target) ?? 0) + 1);
    }
  }

  const ordered = [...characters].sort((a, b) => {
    const d = (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0);
    if (d !== 0) return d;
    const an = a.profile.name || '';
    const bn = b.profile.name || '';
    return an < bn ? -1 : an > bn ? 1 : a.id.localeCompare(b.id);
  });

  const n = Math.max(ordered.length, 1);
  const nodes: ConstellationNode[] = ordered.map((character, i) => {
    const t = (i + 1) / n; // (0, 1]
    const palette = (character.profile.visualIdentity.palette ?? []).filter(
      (hex) => typeof hex === 'string' && HEX_RE.test(hex.trim()),
    );
    return {
      id: character.id,
      name: character.profile.name || '（没有名字）',
      palette,
      degree: degree.get(character.id) ?? 0,
      angle: i * GOLDEN_ANGLE,
      radius: 0.12 + 0.88 * Math.sqrt(t),
      traits: (character.profile.traits ?? []).slice(0, 6),
    };
  });

  // 边：按 unordered pair 合并双向关系
  interface PartialEdge {
    a: string; b: string;
    forward: { kind: string; note: string } | null;
    reverse: { kind: string; note: string } | null;
  }
  const pairs = new Map<string, PartialEdge>();
  const worldHitIds = new Set<string>();
  const unresolved: UnresolvedRelationship[] = [];
  for (const { owner, rel } of parsed) {
    const target = rel.target;
    if (byId.has(target)) {
      const [a, b] = owner.id < target ? [owner.id, target] : [target, owner.id];
      const key = `${a}|${b}`;
      const cur = pairs.get(key) ?? { a, b, forward: null, reverse: null };
      if (owner.id === a) cur.forward = { kind: rel.kind, note: rel.note };
      else cur.reverse = { kind: rel.kind, note: rel.note };
      pairs.set(key, cur);
    } else if (worldTitles.has(target)) {
      worldHitIds.add(target);
    } else {
      unresolved.push({
        ownerId: owner.id,
        ownerName: owner.profile.name || '（没有名字）',
        kind: rel.kind,
        target,
        note: rel.note,
      });
    }
  }

  const edges: ConstellationEdge[] = [...pairs.values()].map((p) => ({
    id: `${p.a}|${p.b}`,
    from: p.a,
    to: p.b,
    kind: p.forward?.kind ?? p.reverse?.kind ?? '',
    note: p.forward?.note ?? p.reverse?.note ?? '',
    reverse: p.reverse && p.forward ? { kind: p.reverse.kind, note: p.reverse.note } : null,
  }));
  edges.sort((a, b) => a.id.localeCompare(b.id));

  // 世界锚点：解析到世界的目标，摆在外环（半径 1），等角分布
  const anchorIds = [...worldHitIds].sort();
  const worldAnchors: ConstellationWorldAnchor[] = anchorIds.map((id, i) => ({
    id,
    label: nameOf(id),
    angle: (i * Math.PI * 2) / Math.max(anchorIds.length, 1) + Math.PI / 7,
  }));

  const charLinked = edges.length;
  const worldLinked = anchorIds.length;
  const totalRelationships = parsed.length;
  return { nodes, edges, worldAnchors, unresolved, totalRelationships, charLinked, worldLinked };
}
