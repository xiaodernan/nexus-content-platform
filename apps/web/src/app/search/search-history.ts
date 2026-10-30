/**
 * §165 搜索建议与历史的**纯函数**那一半。
 *
 * 历史只存在这台设备上（localStorage），不上传、不建表：搜索词本身可能带着
 * 用户还没准备好公开的意图（人名、项目代号）。所以这里没有"服务端最近搜索"——
 * 那会变成一份需要访问控制的个人数据，而它的产品价值只是"再点一次"。
 *
 * 规则：去首尾空白、把连续空白压成一个空格、最长 80 字符；同一串（忽略大小写）
 * 只留最近一次，最多 8 条。坏 JSON / 非数组 / 非字符串一律当作空历史，不抛。
 */

export const SEARCH_HISTORY_KEY = 'nexus.search.history.v1';
export const SEARCH_HISTORY_MAX = 8;
const MAX_LENGTH = 80;

/** 存进来的搜索词：界面与存储共用这一份规整，免得"显示的和存的不是同一串" */
export function normalizeHistoryQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_LENGTH);
}

const same = (a: string, b: string): boolean => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/** 记一次搜索：空串不记；同串挪到最前；超过上限丢最旧的 */
export function addSearchHistory(list: readonly string[], raw: string): string[] {
  const query = normalizeHistoryQuery(raw);
  if (!query) return [...list];
  return [query, ...list.filter((item) => !same(item, query))].slice(0, SEARCH_HISTORY_MAX);
}

/** 删一条（按规整后的串比较，大小写不敏感） */
export function removeSearchHistory(list: readonly string[], raw: string): string[] {
  const query = normalizeHistoryQuery(raw);
  if (!query) return [...list];
  return list.filter((item) => !same(item, query));
}

interface ReadableStorage {
  getItem(key: string): string | null;
}

interface WritableStorage {
  setItem(key: string, value: string): void;
}

/** 读：任何形状可疑的内容都当空历史——坏数据不该让搜索页整页崩掉 */
export function readSearchHistory(storage: ReadableStorage): string[] {
  try {
    const raw = storage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cleaned: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string') continue;
      const query = normalizeHistoryQuery(item);
      if (!query || cleaned.some((kept) => same(kept, query))) continue;
      cleaned.push(query);
      if (cleaned.length >= SEARCH_HISTORY_MAX) break;
    }
    return cleaned;
  } catch {
    return [];
  }
}

/** 写：满了就少存几条，不因为配额/隐私模式把交互打断 */
export function writeSearchHistory(storage: WritableStorage, list: readonly string[]): void {
  try {
    storage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list.slice(0, SEARCH_HISTORY_MAX)));
  } catch {
    // 隐私模式或配额满：历史是锦上添花，写不进去就算了
  }
}
