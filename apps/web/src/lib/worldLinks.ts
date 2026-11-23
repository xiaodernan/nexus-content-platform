/**
 * 条目串联建议：纯函数、零 provider、零写库、零随机。
 * 只根据已经写下的真实字段（纪元、题名、正文里的共同词）指出"这两条可能有关"，
 * 不替用户编造关系内容；已经连过的不再建议。同输入永远同输出。
 */
import type { WorldDocument } from '@nexus/world-model';

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
