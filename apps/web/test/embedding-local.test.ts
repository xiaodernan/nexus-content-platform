import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LOCAL_EMBEDDING_DIMENSIONS,
  LOCAL_EMBEDDING_MODEL,
  LOCAL_RERANKER_MODEL,
  LocalTokenBagEmbeddingProvider,
  LocalTokenBagRerankerProvider,
  getEmbeddingProvider,
  hasEmbeddingProvider,
  getRerankerProvider,
  hasRerankerProvider,
  localTokenBag,
  localTokenBagVector,
  tokenizeForLocalEmbedding,
} from '../src/server/ai/embedding';

/**
 * §49/§93 — the deterministic local embedding provider.
 *
 * It is NOT a semantic model, and this file refuses to pretend it is one: the vectors are
 * deterministic bag-of-token hashes (ASCII words + CJK bigrams), L2-normalized, nothing more.
 * What IS graded here: determinism, the dimension contract with the pgvector column, the
 * opt-in wiring (never silent), and the refusal of an unknown provider name.
 */

describe('the §49 local token-bag embedder', () => {
  it('tokenizes ascii words and CJK bigrams into disjoint tokens', () => {
    expect(tokenizeForLocalEmbedding('hello world 平台')).toEqual(['hello', 'world', '平台']);
    expect(tokenizeForLocalEmbedding('平台架构').length).toBe(3); // 平台 + 台架 + 架构
    expect(tokenizeForLocalEmbedding('Hello WORLD')).toEqual(['hello', 'world']);
  });

  it('produces vectors of exactly the pgvector column dimension', () => {
    expect(localTokenBag('猫 平台')).toBeDefined();
    expect(localTokenBagVector('')).toHaveLength(LOCAL_EMBEDDING_DIMENSIONS);
    expect(localTokenBagVector('a firm hello to the world')).toHaveLength(LOCAL_EMBEDDING_DIMENSIONS);
  });

  it('is byte-identical across calls', () => {
    expect(localTokenBagVector('确定性地计算向量')).toEqual(localTokenBagVector('确定性地计算向量'));
    const provider = new LocalTokenBagEmbeddingProvider();
    return Promise.all([
      provider.embed({ model: LOCAL_EMBEDDING_MODEL, texts: ['a', '确定', 'hello world'] }),
      provider.embed({ model: LOCAL_EMBEDDING_MODEL, texts: ['a', '确定', 'hello world'] }),
    ]).then(([a, b]) => {
      expect(b.vectors).toEqual(a.vectors);
      expect(b.provider).toBe('local-token-bag');
      expect(b.model).toBe(LOCAL_EMBEDDING_MODEL);
    });
  });

  it('L2-normalizes: a non-empty text yields unit norm', () => {
    const v = localTokenBagVector('a bit of everything here');
    const norm = Math.sqrt(v.reduce((acc, x) => acc + x * x, 0));
    expect(norm).toBeCloseTo(1, 6);
  });

  it('gives the empty text the zero vector, not NaN', () => {
    const v = localTokenBagVector('   ');
    expect(v.every((x) => x === 0)).toBe(true);
  });

  it('orders by overlap: shared tokens beat unrelated text', () => {
    const a = localTokenBagVector('the cat sat on the mat');
    const b = localTokenBagVector('the cat ran on the mat');
    const c = localTokenBagVector('quantum entropy across silicon');
    const cos = (x: number[], y: number[]) => x.reduce((acc, xi, i) => acc + xi * (y[i] ?? 0), 0);
    expect(cos(a, b)).toBeGreaterThan(cos(a, c));
  });

  it('models() and model_for name the one model it ships', () => {
    const provider = new LocalTokenBagEmbeddingProvider();
    expect(provider.models()).toEqual([LOCAL_EMBEDDING_MODEL]);
    expect(provider.model_for('embedding')).toBe(LOCAL_EMBEDDING_MODEL);
    expect(() => provider.model_for('reranker')).toThrow('reranker');
  });

  it('embed() refuses a model it does not ship', async () => {
    const provider = new LocalTokenBagEmbeddingProvider();
    await expect(provider.embed({ model: 'text-embedding-3-small', texts: ['x'] })).rejects.toThrow(LOCAL_EMBEDDING_MODEL);
  });

  it('embed() counts tokens instead of inventing prompt usage', async () => {
    const provider = new LocalTokenBagEmbeddingProvider();
    const tokens = (await provider.embed({ model: LOCAL_EMBEDDING_MODEL, texts: ['one two three', '平台架构'] })).tokens_in;
    expect(tokens).toBe(3 + 3); // 3 ascii words + 3 CJK bigrams of 平台架构
    const empty = await provider.embed({ model: LOCAL_EMBEDDING_MODEL, texts: [] });
    expect(empty.vectors).toEqual([]);
    expect(empty.tokens_in).toBe(0);
  });
});

describe('the embedding provider selection (§49 wiring)', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.NEXUS_EMBEDDING_PROVIDER;
    delete process.env.NEXUS_OPENAI_API_KEY;
  });

  afterEach(() => {
    Object.assign(process.env, saved);
  });

  it('local mode returns the deterministic provider without any key', () => {
    process.env.NEXUS_EMBEDDING_PROVIDER = 'local';
    const provider = getEmbeddingProvider();
    expect(provider).not.toBeNull();
    expect(provider!.models()).toContain(LOCAL_EMBEDDING_MODEL);
    expect(hasEmbeddingProvider()).toBe(true);
  });

  it('local mode needs NEXUS_EMBEDDING_PROVIDER=local, a key alone does nothing', () => {
    // no env at all: same semantics as before this change
    expect(getEmbeddingProvider()).toBeNull();
    expect(hasEmbeddingProvider()).toBe(false);
    process.env.NEXUS_EMBEDDING_PROVIDER = 'openai-compatible';
    expect(getEmbeddingProvider()).toBeNull();
    expect(hasEmbeddingProvider()).toBe(false);
  });

  it('an unknown provider name is a loud refusal, never a silent lexical fallback', () => {
    process.env.NEXUS_EMBEDDING_PROVIDER = 'nonsense';
    expect(hasEmbeddingProvider()).toBe(true); // loud by design — see the refusal inside
    expect(() => getEmbeddingProvider()).toThrow('nonsense');
  });

  it('openai-compatible stays keyed on a key being present', () => {
    process.env.NEXUS_EMBEDDING_PROVIDER = 'openai-compatible';
    // 没有 key：不报假接入、不偷换成本地 brain——§49 的选择是调用方的事，不是这里的猜测权
    expect(getEmbeddingProvider()).toBeNull();
    expect(hasEmbeddingProvider()).toBe(false);
  });
});


describe('the §93 local token-bag reranker', () => {
  it('scores documents against the query by token overlap, deterministically', async () => {
    const provider = new LocalTokenBagRerankerProvider();
    const { scores } = await provider.rerank({
      model: LOCAL_RERANKER_MODEL,
      query: '设计文档的画布组件',
      documents: ['画布排版与组件栅格系统', '游戏关卡与副本规则', '设计文档里的画布与组件'],
    });
    expect(scores).toHaveLength(3);
    // the two design docs must outrank the game doc
    const design = Math.max(scores[0]!, scores[2]!);
    const game = scores[1]!;
    expect(design).toBeGreaterThan(game);
  });

  it('is byte-identical across calls (determinism)', async () => {
    const provider = new LocalTokenBagRerankerProvider();
    const docs = ['a b c', '设计图纸与排版栅格', 'the quick brown fox'];
    const a = await provider.rerank({ model: LOCAL_RERANKER_MODEL, query: '设计排版', documents: docs });
    const b = await provider.rerank({ model: LOCAL_RERANKER_MODEL, query: '设计排版', documents: docs });
    expect(b.scores).toEqual(a.scores);
    expect(b.provider).toBe('local-token-bag');
    expect(b.model).toBe(LOCAL_RERANKER_MODEL);
  });

  it('models() and model_for name the one model it ships', () => {
    const provider = new LocalTokenBagRerankerProvider();
    expect(provider.models()).toEqual([LOCAL_RERANKER_MODEL]);
    expect(provider.model_for('reranker')).toBe(LOCAL_RERANKER_MODEL);
    expect(() => provider.model_for('embedding')).toThrow('embedding');
  });

  it('rerank() refuses a model it does not ship', async () => {
    const provider = new LocalTokenBagRerankerProvider();
    await expect(
      provider.rerank({ model: 'text-embedding-3-small', query: 'q', documents: ['d'] }),
    ).rejects.toThrow(LOCAL_RERANKER_MODEL);
  });

  it('gives every document a score, even when the query is empty (0, stable)', async () => {
    const provider = new LocalTokenBagRerankerProvider();
    const { scores } = await provider.rerank({ model: LOCAL_RERANKER_MODEL, query: '', documents: ['任何东西', 'anything'] });
    expect(scores).toEqual([0, 0]);
  });

  it('gives the empty document list the empty score list', async () => {
    const provider = new LocalTokenBagRerankerProvider();
    const { scores } = await provider.rerank({ model: LOCAL_RERANKER_MODEL, query: 'x', documents: [] });
    expect(scores).toEqual([]);
  });
});


describe('the reranker provider selection (§93 wiring)', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.NEXUS_RERANKER_PROVIDER;
    delete process.env.NEXUS_OPENAI_API_KEY;
  });

  afterEach(() => {
    Object.assign(process.env, saved);
  });

  it('local mode returns the deterministic reranker without any key', () => {
    process.env.NEXUS_RERANKER_PROVIDER = 'local';
    const provider = getRerankerProvider();
    expect(provider).not.toBeNull();
    expect(provider!.models()).toContain(LOCAL_RERANKER_MODEL);
    expect(hasRerankerProvider()).toBe(true);
  });

  it('local mode needs NEXUS_RERANKER_PROVIDER=local, a key alone does nothing', () => {
    expect(getRerankerProvider()).toBeNull();
    expect(hasRerankerProvider()).toBe(false);
    process.env.NEXUS_RERANKER_PROVIDER = 'openai-compatible';
    expect(getRerankerProvider()).toBeNull();
    expect(hasRerankerProvider()).toBe(false);
  });

  it('an unknown provider name is a loud refusal, never a silent fallback', () => {
    process.env.NEXUS_RERANKER_PROVIDER = 'nonsense';
    expect(hasRerankerProvider()).toBe(true); // loud on purpose
    expect(() => getRerankerProvider()).toThrow('nonsense');
  });
});
