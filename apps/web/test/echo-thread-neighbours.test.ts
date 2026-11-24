import { describe, expect, it } from 'vitest';
import { BIBLE_ECHOES } from '@/world-bible/generated';
import { buildEchoThreads, echoThreadNeighbours } from '@/lib/echoThreads';

const INDEX = buildEchoThreads(BIBLE_ECHOES);

describe('§ECHO-THREAD · echoThreadNeighbours', () => {
  it('每一篇回响都能拿到自己的线索，且邻居里绝不含自己', () => {
    for (const echo of BIBLE_ECHOES.slice(0, 40)) {
      const n = echoThreadNeighbours(INDEX, echo.order, BIBLE_ECHOES);
      expect(n.order).toBe(echo.order);
      for (const t of n.threads) {
        expect(INDEX.motifs.map((m) => m.id)).toContain(t.id);
        expect(t.others.some((o) => o.order === echo.order)).toBe(false);
        // 邻居必须真的在该线索的回响表里
        const motif = INDEX.motifs.find((m) => m.id === t.id)!;
        expect(t.others.map((o) => o.order).sort()).toEqual(motif.echoes.filter((o) => o !== echo.order).sort());
      }
    }
  });

  it('邻居最多的线索排最前：最可能把读者带到没读过的地方', () => {
    const n = echoThreadNeighbours(INDEX, 171, BIBLE_ECHOES); // 潮印那一篇
    expect(n.threads.length).toBeGreaterThan(0);
    for (let i = 1; i < n.threads.length; i += 1) {
      expect(n.threads[i - 1]!.others.length).toBeGreaterThanOrEqual(n.threads[i]!.others.length);
    }
  });

  it('邻居带的 slug 真实存在，点得开', () => {
    const slugs = new Set(BIBLE_ECHOES.map((e) => e.slug));
    const n = echoThreadNeighbours(INDEX, 209, BIBLE_ECHOES);
    for (const t of n.threads) for (const o of t.others) expect(slugs.has(o.slug)).toBe(true);
  });

  it('没命中任何线索的序号：threads 为空，但不说它"无关"', () => {
    // 用合成序号而非真实 orphan：线索表补全后 orphans 可以为空（这是好事），
    // 但"无线索时 threads 为空"这个分支仍必须被验证，不能依赖某篇回响恰好没被收录。
    const synthetic = 10_000;
    expect(INDEX.motifs.some((m) => m.echoes.includes(synthetic))).toBe(false);
    const n = echoThreadNeighbours(INDEX, synthetic, BIBLE_ECHOES);
    expect(n.threads).toEqual([]);
    expect(n.order).toBe(synthetic);
  });
});