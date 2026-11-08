import { retrieveProjectKnowledge } from './knowledge';
import { listMemories, type MemoryEntry } from './memories';

/**
 * §48 的记忆面板要能搜，用的就是 §49 那套混合检索（全文 + 子串 + 词覆盖度的确定性融合）——
 * 而不是新写一份匹配逻辑。两处共用一份"什么叫命中"，面板里搜到的和 AI 上下文里带上的才是同一件事。
 *
 * 两句必须说在前头的边界：
 * 1. **这不是语义检索**。没有 embedding provider，用词不同但意思相近的那条就搜不到；
 * 2. **「我的偏好」那一类根本不在这一份语料里**——它不挂项目（`memories.project_id` 为 null），
 *    而 §49 的语料清单里没有用户偏好，把它混进项目语料会让"这个世界的检索结果"掺进跨项目的私人设定。
 * 所以搜不到某条偏好不是 bug，界面上也不能把它写成"没有相关记忆"。
 */

export interface MemorySearchHit extends MemoryEntry {
  score: number;
  matchedBy: ('fulltext' | 'substring')[];
}

export interface MemorySearchResult {
  hits: MemorySearchHit[];
  /** 这一串语料里一共多少段（0 段说明这个项目还没同步过语料） */
  totalChunks: number;
  /** 要说给界面的一句边界话；没有需要补充的说明时是 null */
  note: string | null;
}

const CHUNK_CAP = 60;

export async function searchMemories(
  ownerId: string,
  projectId: string,
  rawQuery: string,
  limit = 20,
): Promise<MemorySearchResult> {
  const query = rawQuery.trim();
  if (!query) return { hits: [], totalChunks: 0, note: null };
  const retrieved = await retrieveProjectKnowledge(projectId, query, CHUNK_CAP);
  // 只留来自记忆的那几段；同一条记忆可能被切成几段各命中一次，取最高那一分代表它
  const best = new Map<string, { score: number; matchedBy: ('fulltext' | 'substring')[] }>();
  for (const item of retrieved.items) {
    if (item.sourceType !== 'memory') continue;
    const seen = best.get(item.sourceId);
    if (!seen || item.score > seen.score) best.set(item.sourceId, { score: item.score, matchedBy: item.matchedBy });
  }
  const empty = `词面检索（全文 + 子串 + 词覆盖度）在这 ${retrieved.totalChunks} 段语料里没有命中。`
    + '这不等于"没有相关记忆"：语义相近但用词不同的搜不到（没有 embedding），'
    + '而「我的偏好」那一类不挂项目，本来就不在这一份语料里。';
  if (best.size === 0) return { hits: [], totalChunks: retrieved.totalChunks, note: empty };

  // 归属由 listMemories 自己那条件挡着：检索到的 id 里若有别人的（或已删的），这里就落不进来
  const rows = await listMemories({ ownerId, projectId, limit: 500 });
  const hits: MemorySearchHit[] = [];
  for (const row of rows) {
    const match = best.get(row.id);
    if (match) hits.push({ ...row, score: match.score, matchedBy: match.matchedBy });
  }
  hits.sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt));
  const dropped = best.size - hits.length;
  const note = hits.length
    ? `词面混合检索命中 ${hits.length} 条（不是语义检索：还没有 embedding；「我的偏好」那一类不在这个项目的语料里）`
      + (dropped > 0 ? `；另有 ${dropped} 段命中的语料对应的记忆已经不在你的列表里（被删掉或不属于这个项目）` : '')
    : empty;
  return { hits: hits.slice(0, limit), totalChunks: retrieved.totalChunks, note };
}
