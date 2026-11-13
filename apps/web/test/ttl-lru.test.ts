import { describe, expect, it } from 'vitest';
import { TtlLru } from '@/server/cache/ttlLru';

const clock = () => {
  let now = 1_000;
  return {
    now: () => now,
    tick: (ms: number) => { now += ms; },
  };
};

describe('TtlLru（有界 + TTL 的进程内缓存）', () => {
  it('命中返回设置的值', () => {
    const cache = new TtlLru<string, number>({ maxEntries: 4 });
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    expect(cache.liveSize()).toBe(1);
  });

  it('到期后读出 undefined，并顺手删掉自身——liveSize 反映过期', () => {
    const c = clock();
    const cache = new TtlLru<string, string>({ maxEntries: 4, defaultTtlMs: 10 });
    cache.set('a', 'value', 10, c.now());
    expect(cache.liveSize(c.now())).toBe(1);
    c.tick(11);
    expect(cache.get('a', c.now())).toBeUndefined();
    expect(cache.liveSize(c.now())).toBe(0);
    expect(cache.get('a', c.now())).toBeUndefined();
  });

  it('LRU 顺序：命中把条目刷到尾部；满时淘汰最久没碰的头部', () => {
    const c = clock();
    const cache = new TtlLru<string, number>({ maxEntries: 2, defaultTtlMs: 10_000 });
    cache.set('a', 1, 10_000, c.now());
    c.tick(1);
    cache.set('b', 2, 10_000, c.now());
    c.tick(1);
    // 命中 a——a 现在排在 b 后面
    expect(cache.get('a', c.now())).toBe(1);
    c.tick(1);
    cache.set('c', 3, 10_000, c.now());
    expect(cache.get('a', c.now())).toBe(1); // a 因被命中而活着
    expect(cache.get('b', c.now())).toBeUndefined(); // b 最久没被碰，被淘汰
  });

  it('每条条目可以自己的 TTL：负数/0 意味着永不过期（0 = 手动管理）', () => {
    const c = clock();
    const cache = new TtlLru<string, number>({ maxEntries: 4, defaultTtlMs: 100 });
    cache.set('forever', 1, 0, c.now()); // 0 = 手动
    cache.set('short', 2, 50, c.now());
    c.tick(60);
    expect(cache.get('forever', c.now())).toBe(1);
    expect(cache.get('short', c.now())).toBeUndefined();
  });

  it('set 同键是覆盖，且不重复占容量', () => {
    const c = clock();
    const cache = new TtlLru<string, number>({ maxEntries: 4 });
    cache.set('a', 1, 100, c.now());
    c.tick(1);
    cache.set('a', 2, 100, c.now());
    expect(cache.liveSize(c.now())).toBe(1);
    expect(cache.get('a', c.now())).toBe(2);
  });

  it('delete 存在与否的语义与重复删除都安全落地', () => {
    const cache = new TtlLru<string, number>({ maxEntries: 4 });
    expect(cache.delete('nope')).toBe(false);
    cache.set('x', 1);
    expect(cache.delete('x')).toBe(true);
    expect(cache.delete('x')).toBe(false);
  });

  it('上界硬生效：洪水来了也不会涨过 maxEntries', () => {
    const cache = new TtlLru<string, number>({ maxEntries: 8 });
    for (let i = 0; i < 1000; i += 1) cache.set(`k${i}`, i);
    expect(cache.liveSize()).toBe(8);
    expect(cache.get('k999')).toBe(999);
  });

  it('stats() 报活实数据——sets / gets / hits / evicted / live 都对得上', () => {
    const c = clock();
    const cache = new TtlLru<string, number>({ maxEntries: 4, defaultTtlMs: 100 });
    cache.set('a', 1, 100, c.now());
    cache.set('b', 2, 100, c.now());
    cache.set('c', 3, 100, c.now());
    cache.set('d', 4, 100, c.now());  // 第 4 条到顶
    cache.set('e', 5, 100, c.now());  // 淘汰 'a'（最久没碰）
    expect(cache.stats(c.now())).toEqual({
      size: 4,
      liveSize: 4,
      evictedCount: 1,
      sets: 5,
      gets: 0,
      hits: 0,
    });
    expect(cache.get('e', c.now())).toBe(5);  // hits:1
    expect(cache.get('missing', c.now())).toBeUndefined();  // gets:2
    expect(cache.stats(c.now()).hits).toBe(1);
    expect(cache.stats(c.now()).gets).toBe(2);
  });
});
