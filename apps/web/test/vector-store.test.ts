import { describe, expect, it } from 'vitest';
import { estimateTokens, reciprocalRankFusion } from '@/server/ai/vector-store';
import type { ChunkRecord } from '@/server/ai/vector-store';

/**
 * §49 混合检索的**融合算术**与**token 估算口径**的第一份单测。
 *
 * 这两个函数原先都是私有的，于是：
 * - RRF 的三件事从没被验证过：**rank 是 1-based**、文本侧存的 `textRank` 是 **BM25 原始分**
 *   （不是名次——名次只用来算分）、两边都命中时**分数相加**；
 * - `estimateTokens` 算出来的数**要写进语料库**（`knowledge_chunks.tokens`），
 *   它的口径（中文 1.5 字/token、英文 4 字/token）也就没人能核对。
 *
 * 纯函数：不读库、不联网、不碰时钟。
 */

function chunk(id: string): ChunkRecord {
  return {
    id,
    projectId: 'p1',
    worldId: null,
    sourceType: 'world',
    sourceId: 'w1',
    chunkIndex: 0,
    content: `内容 ${id}`,
    tokens: 1,
    embedding: null,
    meta: null,
    createdAt: new Date(0),
  };
}

describe('reciprocalRankFusion · 融合的算术', () => {
  it('只在向量侧命中 → 分数 = 1/(k+1) × 向量权重，相似度 = 1 - 距离，文本名次为空', () => {
    const fused = reciprocalRankFusion(
      [{ chunk: chunk('a'), distance: 0.25 }],
      [],
      0.6,
      0.4,
    );
    const entry = fused.get('a')!;
    expect(entry.score).toBeCloseTo((1 / 61) * 0.6, 10);
    expect(entry.vectorScore).toBeCloseTo(0.75, 10);
    expect(entry.textRank).toBeNull();
  });

  it('只在文本侧命中 → 分数 = 1/(k+1) × 文本权重，文本名次存的是 BM25 原始分（不是名次）', () => {
    const fused = reciprocalRankFusion(
      [],
      [{ chunk: chunk('b'), rank: 3.7 }],
      0.6,
      0.4,
    );
    const entry = fused.get('b')!;
    expect(entry.score).toBeCloseTo((1 / 61) * 0.4, 10);
    expect(entry.vectorScore).toBeNull();
    // 名次只用来算分（这里它是 1），存下来的是原文那份 BM25 分
    expect(entry.textRank).toBe(3.7);
  });

  it('两边都命中 → 分数相加，两边的读数都留着', () => {
    const fused = reciprocalRankFusion(
      [{ chunk: chunk('c'), distance: 0.1 }],
      [{ chunk: chunk('c'), rank: 2.5 }],
      0.6,
      0.4,
    );
    const entry = fused.get('c')!;
    expect(entry.score).toBeCloseTo((1 / 61) * 0.6 + (1 / 61) * 0.4, 10);
    expect(entry.vectorScore).toBeCloseTo(0.9, 10);
    expect(entry.textRank).toBe(2.5);
  });

  it('名次是 1-based：第二个结果分数低于第一个', () => {
    const fused = reciprocalRankFusion(
      [
        { chunk: chunk('first'), distance: 0.1 },
        { chunk: chunk('second'), distance: 0.2 },
      ],
      [],
      1,
      0,
    );
    expect(fused.get('first')!.score).toBeGreaterThan(fused.get('second')!.score);
    // 1/(k+1) 与 1/(k+2)
    expect(fused.get('first')!.score).toBeCloseTo(1 / 61, 10);
    expect(fused.get('second')!.score).toBeCloseTo(1 / 62, 10);
  });

  it('k 可以调：k 越小，头名与次名的差距越大', () => {
    const wide = reciprocalRankFusion(
      [
        { chunk: chunk('a'), distance: 0 },
        { chunk: chunk('b'), distance: 1 },
      ],
      [],
      1,
      0,
      1,
    );
    const narrow = reciprocalRankFusion(
      [
        { chunk: chunk('a'), distance: 0 },
        { chunk: chunk('b'), distance: 1 },
      ],
      [],
      1,
      0,
      60,
    );
    expect(wide.get('a')!.score - wide.get('b')!.score).toBeGreaterThan(
      narrow.get('a')!.score - narrow.get('b')!.score,
    );
  });

  it('某一侧权重为 0 → 那一侧不贡献分数', () => {
    const fused = reciprocalRankFusion(
      [{ chunk: chunk('a'), distance: 0.5 }],
      [{ chunk: chunk('a'), rank: 1 }],
      0,
      1,
    );
    // 向量侧权重 0：只剩文本侧那一份
    expect(fused.get('a')!.score).toBeCloseTo(1 / 61, 10);
  });

  it('两边的结果没有交集 → 两份都在表里（互不吞掉）', () => {
    const fused = reciprocalRankFusion(
      [{ chunk: chunk('v'), distance: 0.3 }],
      [{ chunk: chunk('t'), rank: 1 }],
      0.6,
      0.4,
    );
    expect(fused.size).toBe(2);
    expect(fused.get('v')!.textRank).toBeNull();
    expect(fused.get('t')!.vectorScore).toBeNull();
  });

  it('两边都空 → 空表（不是崩，是空）', () => {
    expect(reciprocalRankFusion([], [], 0.6, 0.4).size).toBe(0);
  });
});

describe('estimateTokens · 写进语料库的那个口径', () => {
  it('中文约 1.5 字/token', () => {
    // 3 个中文字 = 3/1.5 = 2 个 token
    expect(estimateTokens('中文字')).toBe(2);
  });

  it('英文约 4 字/token', () => {
    // 8 个英文字 = 8/4 = 2 个 token
    expect(estimateTokens('abcdefgh')).toBe(2);
  });

  it('不足一个整档也向上取整（不记 0）', () => {
    expect(estimateTokens('a')).toBe(1);
    expect(estimateTokens('中')).toBe(1);
  });

  it('空串 → 0', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('中英混排：各自按自己的档算再相加', () => {
    // 中文 3 字 = 2，英文 8 字 = 2 → 4
    expect(estimateTokens('中文字abcdefgh')).toBe(4);
  });
});
