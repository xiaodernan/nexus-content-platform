/**
 * 世界体检：纯投影，零 provider、零写库。
 * 世界变大以后靠肉眼很难发现空条目、重名、断链——这里如实量出来，不伪造健康分。
 */
import type { WorldDocument } from '@nexus/world-model';

export type WorldAudit = {
  nodes: number;
  emptyBodies: number;      // 没有正文的条目数
  duplicateTitles: { title: string; count: number }[]; // 同名 ≥2 的题名
  orphans: number;          // 一条关系都没有的条目数（有链接时才统计）
  brokenLinks: number;      // 端点指向不存在条目的关系数
  linkCount: number;
  healthy: boolean;
};

export function auditWorld(world: WorldDocument): WorldAudit {
  const nodes = world.nodes || [];
  const links = world.links || [];
  const ids = new Set(nodes.map((n) => n.id));
  const connected = new Set<string>();
  let brokenLinks = 0;
  for (const l of links) {
    if (ids.has(l.from) && ids.has(l.to)) {
      connected.add(l.from);
      connected.add(l.to);
    } else {
      brokenLinks += 1;
    }
  }
  const byTitle = new Map<string, number>();
  for (const n of nodes) {
    const t = n.title.trim();
    if (t) byTitle.set(t, (byTitle.get(t) ?? 0) + 1);
  }
  const duplicateTitles = [...byTitle.entries()]
    .filter(([, count]) => count > 1)
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, 'zh-Hans-CN'));
  const emptyBodies = nodes.filter((n) => !(n.body || '').trim()).length;
  const orphans = links.length ? nodes.filter((n) => !connected.has(n.id)).length : 0;
  const healthy = emptyBodies === 0 && duplicateTitles.length === 0 && brokenLinks === 0 && orphans === 0;
  return { nodes: nodes.length, emptyBodies, duplicateTitles, orphans, brokenLinks, linkCount: links.length, healthy };
}

/** 给一条可执行的建议；没有问题时明确说不用动，不凑话术。 */
export function auditSuggestion(a: WorldAudit, locale: 'zh' | 'en'): string {
  if (a.healthy) {
    return locale === 'zh'
      ? '体检通过：没有空条目、重名、孤儿条目或断链。想继续变大，就用「AI 补全空节」或「掷命运骰」添细节。'
      : 'Check passed: no empty bodies, duplicate titles, orphan nodes or broken links. To keep growing, fill empty sections or roll fate for details.';
  }
  if (a.emptyBodies) {
    return locale === 'zh'
      ? `先处理 ${a.emptyBodies} 条空正文：选中类别用填充补上，或手写；补齐后再跑一次体检看读数。`
      : `Start with ${a.emptyBodies} empty bodies: fill them per section or write by hand, then re-run the check.`;
  }
  if (a.duplicateTitles.length) {
    const top = a.duplicateTitles[0]!;
    return locale === 'zh'
      ? `有 ${a.duplicateTitles.length} 组重名（例如「${top.title}」×${top.count}）：用筛选框找出来，改题名让每条可区分。`
      : `${a.duplicateTitles.length} duplicate title groups (e.g. “${top.title}” ×${top.count}): use the filter to find them and rename for uniqueness.`;
  }
  if (a.brokenLinks) {
    return locale === 'zh'
      ? `有 ${a.brokenLinks} 条关系指向已不存在的条目：在世界图里删掉这些连线，再体检。`
      : `${a.brokenLinks} links point to entries that no longer exist: remove those edges in the world graph, then re-check.`;
  }
  return locale === 'zh'
    ? `有 ${a.orphans} 条条目还没任何关系：在世界图里把它们连到相关条目，世界才会连成网。`
    : `${a.orphans} entries have no relations yet: connect them to related entries in the world graph so it becomes a web.`;
}

export function formatWorldAudit(a: WorldAudit, locale: 'zh' | 'en'): string {
  const core = locale === 'zh'
    ? `条目 ${a.nodes} · 空正文 ${a.emptyBodies} · 重名组 ${a.duplicateTitles.length} · 孤儿 ${a.orphans} · 断链 ${a.brokenLinks}/${a.linkCount}`
    : `entries ${a.nodes} · empty bodies ${a.emptyBodies} · duplicate groups ${a.duplicateTitles.length} · orphans ${a.orphans} · broken links ${a.brokenLinks}/${a.linkCount}`;
  const verdict = a.healthy
    ? (locale === 'zh' ? ' · 体检通过' : ' · check passed')
    : (locale === 'zh' ? ' · 有待处理' : ' · needs work');
  return core + verdict;
}
