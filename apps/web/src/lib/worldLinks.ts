/**
 * 条目串联建议：纯函数、零 provider、零写库、零随机。
 * 只根据已经写下的真实字段（纪元、题名、正文里的共同词）指出"这两条可能有关"，
 * 不替用户编造关系内容；已经连过的不再建议。同输入永远同输出。
 */
import { linkWorldNodes, type WorldDocument } from '@nexus/world-model';

export type LinkReason = 'same-era' | 'shared-word';
export type LinkSuggestion = {
  fromId: string;
  toId: string;
  fromTitle: string;
  toTitle: string;
  reason: LinkReason;
  evidence: string;
  score: number;
};

const STOP_BIGRAMS = new Set(['的与', '和与', '在中', '的时', '了。', '是一', '一个', '上的', '里有', '不为']);

/** CJK 二元组 + 长度≥3 的拉丁词：只取真实写下的字，不生成新词。 */
function tokens(text: string): Set<string> {
  const out = new Set<string>();
  const runs = text.match(/[\p{Script=Han}]{2,}|[A-Za-z]{3,}/gu) ?? [];
  for (const run of runs) {
    if (/^[A-Za-z]/.test(run)) {
      out.add(run.toLowerCase());
      continue;
    }
    for (let i = 0; i + 1 < run.length; i++) {
      const bg = run.slice(i, i + 2);
      if (!STOP_BIGRAMS.has(bg)) out.add(bg);
    }
  }
  return out;
}

export function suggestWorldLinks(world: WorldDocument, limit = 6): LinkSuggestion[] {
  const authored = world.nodes.filter((n) => (n.body || '').trim().length > 0);
  const linked = new Set<string>();
  for (const l of world.links || []) {
    linked.add(`${l.from}\u0000${l.to}`);
    linked.add(`${l.to}\u0000${l.from}`);
  }

  const info = authored.map((n) => ({
    node: n,
    era: n.lore?.era?.trim() ?? '',
    words: tokens(`${n.title} ${n.body}`),
  }));
  const out: LinkSuggestion[] = [];
  for (let i = 0; i < info.length; i++) {
    for (let j = i + 1; j < info.length; j++) {
      const a = info[i]!;
      const b = info[j]!;
      if (linked.has(`${a.node.id}\u0000${b.node.id}`)) continue;
      const shared = [...a.words].filter((w) => b.words.has(w)).sort();
      if (a.era && a.era === b.era) {
        out.push({
          fromId: a.node.id, toId: b.node.id,
          fromTitle: a.node.title, toTitle: b.node.title,
          reason: 'same-era', evidence: a.era, score: 10 + shared.length,
        });
      } else if (shared.length) {
        out.push({
          fromId: a.node.id, toId: b.node.id,
          fromTitle: a.node.title, toTitle: b.node.title,
          reason: 'shared-word', evidence: shared.slice(0, 3).join('、'), score: shared.length,
        });
      }
    }
  }
  out.sort((x, y) =>
    y.score - x.score ||
    x.fromTitle.localeCompare(y.fromTitle, 'zh-Hans-CN') ||
    x.toTitle.localeCompare(y.toTitle, 'zh-Hans-CN') ||
    x.fromId.localeCompare(y.fromId) || x.toId.localeCompare(y.toId));
  return out.slice(0, Math.max(0, Math.min(limit, 20)));
}

export function formatSuggestion(s: LinkSuggestion, locale: 'zh' | 'en'): string {
  return locale === 'zh'
    ? `${s.fromTitle} ↔ ${s.toTitle}：${s.reason === 'same-era' ? `同属「${s.evidence}」` : `都写到「${s.evidence}」`}`
    : `${s.fromTitle} ↔ ${s.toTitle}: ${s.reason === 'same-era' ? `both in “${s.evidence}”` : `both mention “${s.evidence}”`}`;
}

export type WeaveResult = { document: WorldDocument; added: number; skipped: number; labels: string[] };

/**
 * 一键织网：把 suggestWorldLinks 给出的建议批量写成真实关系。
 * 纪律与单条采纳完全相同——每条都过 linkWorldNodes 的自环/重复门；只写"可能有关"
 * 的判定依据（同纪元 / 共同词）作 label，不编造关系语义；上限受 limit 约束且从高分开始。
 * 纯函数、零 provider、零随机；同输入永远同输出。
 */
export function weaveSuggestedLinks(world: WorldDocument, limit = 6): WeaveResult {
  const hints = suggestWorldLinks(world, Math.max(0, Math.min(limit, 20)));
  let doc = world;
  let added = 0;
  let skipped = 0;
  const labels: string[] = [];
  for (const h of hints) {
    const before = (doc.links ?? []).length;
    const result = linkWorldNodes(doc, h.fromId, h.toId, h.evidence);
    if (result.reason || (result.document.links ?? []).length === before) {
      skipped += 1;
      continue;
    }
    doc = result.document;
    added += 1;
    labels.push(`${h.fromTitle} ↔ ${h.toTitle}`);
  }
  return { document: doc, added, skipped, labels };
}
