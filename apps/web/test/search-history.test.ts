import { describe, expect, it } from 'vitest';
import {
  SEARCH_HISTORY_KEY,
  SEARCH_HISTORY_MAX,
  addSearchHistory,
  normalizeHistoryQuery,
  readSearchHistory,
  removeSearchHistory,
  writeSearchHistory,
} from '@/app/search/search-history';

/**
 * §165 搜索历史：只存在这台设备上（ADR-0075）。这里钉的是"存什么、怎么合并、坏数据怎么办"——
 * 这些东西一旦漂了，用户看到的历史与真正搜过的词就不是同一回事，而那种错没人会报。
 */

class FakeStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const storageWith = (value: string): FakeStorage => {
  const storage = new FakeStorage();
  storage.setItem(SEARCH_HISTORY_KEY, value);
  return storage;
};

describe('normalizeHistoryQuery', () => {
  it('去首尾空白、压连续空白、最长 80 字符', () => {
    expect(normalizeHistoryQuery('  王城   守卫  ')).toBe('王城 守卫');
    expect(normalizeHistoryQuery('a'.repeat(100))).toHaveLength(80);
    expect(normalizeHistoryQuery('   ')).toBe('');
  });
});

describe('addSearchHistory', () => {
  it('空串不记；新词进最前；大小写不同视为同一串只留最近一次', () => {
    expect(addSearchHistory([], '   ')).toEqual([]);
    expect(addSearchHistory(['旧'], '新')).toEqual(['新', '旧']);
    expect(addSearchHistory(['Hero', '旧'], 'hero')).toEqual(['hero', '旧']);
  });

  it('超过上限丢最旧的', () => {
    const list = Array.from({ length: SEARCH_HISTORY_MAX }, (_, i) => `q${i}`);
    const next = addSearchHistory(list, '最新');
    expect(next).toHaveLength(SEARCH_HISTORY_MAX);
    expect(next[0]).toBe('最新');
    expect(next).not.toContain(`q${SEARCH_HISTORY_MAX - 1}`);
  });
});

describe('removeSearchHistory', () => {
  it('按规整后的串删，大小写不敏感；删不存在的不改列表', () => {
    expect(removeSearchHistory(['Hero', '王城'], ' hero ')).toEqual(['王城']);
    expect(removeSearchHistory(['王城'], '没有')).toEqual(['王城']);
  });
});

describe('readSearchHistory', () => {
  it('坏 JSON / 非数组 / 非字符串都当空历史或跳过，不抛', () => {
    expect(readSearchHistory(storageWith('{oops'))).toEqual([]);
    expect(readSearchHistory(storageWith('{"a":1}'))).toEqual([]);
    expect(readSearchHistory(storageWith(JSON.stringify(['王城', 42, null, '  ', '王城'])))).toEqual(['王城']);
  });

  it('读的时候也去重并截到上限', () => {
    const many = Array.from({ length: SEARCH_HISTORY_MAX + 3 }, (_, i) => `q${i}`);
    expect(readSearchHistory(storageWith(JSON.stringify(many)))).toHaveLength(SEARCH_HISTORY_MAX);
    expect(readSearchHistory(storageWith(JSON.stringify(['A', 'a'])))).toEqual(['A']);
  });
});

describe('writeSearchHistory', () => {
  it('写进去的是数组，超上限的尾巴被截掉', () => {
    const storage = new FakeStorage();
    writeSearchHistory(storage, Array.from({ length: SEARCH_HISTORY_MAX + 2 }, (_, i) => `q${i}`));
    const parsed = JSON.parse(storage.getItem(SEARCH_HISTORY_KEY)!);
    expect(parsed).toHaveLength(SEARCH_HISTORY_MAX);
  });

  it('存储抛错（隐私模式/配额满）不影响调用方', () => {
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => writeSearchHistory(throwing, ['x'])).not.toThrow();
  });
});
