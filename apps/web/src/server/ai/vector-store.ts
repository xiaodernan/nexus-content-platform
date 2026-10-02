/**
 * §49 / §93 pgvector RAG：向量存储与混合检索。
 *
 * 能力：
 * - 向量相似度搜索（HNSW + cosine）
 * - 全文检索（tsvector + GIN）
 * - 混合检索：向量得分 × 权重 + 全文得分 × 权重，RRF 或加权融合
 * - 重排序：使用 reranker provider（可选）对融合结果二次打分
 *
 * 依赖：
 * - ai-service 的 EmbeddingProvider（§49）生成向量
 * - ai-service 的 RerankerProvider（可选，§93）重排
 * - pgvector 的 HNSW 索引 + pg_trgm/tsvector GIN 索引
 */

import { randomUUID } from 'node:crypto';
import { getDb } from '@/server/db/client';
import { knowledgeChunks } from '@/server/db/schema';
import { eq, and, sql, desc, isNotNull } from 'drizzle-orm';

/** §49 embedding 切片的 TypeScript 接口（Python ai-service 侧的对应物） */
export interface EmbeddingProvider {
  models(): string[];
  embed(args: { model: string; texts: string[] }): Promise<{ vectors: number[][]; provider: string; model: string; tokens_in: number; latency_ms: number }>;
}

export interface EmbeddingResult {
  vectors: number[][];
  provider: string;
  model: string;
  tokens_in: number;
  latency_ms: number;
}

export interface ChunkRecord {
  id: string;
  projectId: string | null;
  worldId: string | null;
  sourceType: string;
  sourceId: string;
  chunkIndex: number;
  content: string;
  tokens: number | null;
  embedding: number[] | null;
  meta: Record<string, unknown> | null;
  createdAt: Date;
}

export interface SearchOptions {
  projectId: string;
  query: string;
  /** 向量检索权重（默认 0.6） */
  vectorWeight?: number;
  /** 全文检索权重（默认 0.4） */
  textWeight?: number;
  /** 向量检索候选数（默认 20） */
  vectorK?: number;
  /** 全文检索候选数（默认 20） */
  textK?: number;
  /** 最终返回数量（默认 10） */
  limit?: number;
  /** 可选：按 sourceType 过滤 */
  sourceType?: string;
  /** 可选：reranker provider 用于重排 */
  reranker?: RerankerProvider;
}

export interface SearchResult {
  chunk: ChunkRecord;
  /** 混合得分（0-1，越大越相关） */
  score: number;
  /** 向量相似度（cosine，0-1） */
  vectorScore: number | null;
  /** 全文检索排名（BM25 近似） */
  textRank: number | null;
}

export interface RerankerProvider {
  rerank(query: string, documents: string[]): Promise<number[]>;
}

const DEFAULT_VECTOR_WEIGHT = 0.6;
const DEFAULT_TEXT_WEIGHT = 0.4;
const DEFAULT_VECTOR_K = 20;
const DEFAULT_TEXT_K = 20;
const DEFAULT_LIMIT = 10;

/** 生成查询向量 */
async function embedQuery(
  provider: EmbeddingProvider,
  model: string,
  query: string,
): Promise<number[] | null> {
  const result = await provider.embed({ model, texts: [query] });
  return result.vectors[0] ?? null;
}

/** 余弦相似度搜索（使用 pgvector 的 <=> 算子，距离越小越相似） */
async function vectorSearch(
  db: ReturnType<typeof getDb>,
  projectId: string,
  queryVector: number[],
  k: number,
  sourceType?: string,
): Promise<{ chunk: ChunkRecord; distance: number }[]> {
  const vectorLiteral = `[${queryVector.join(',')}]`;
  const where = sourceType
    ? and(eq(knowledgeChunks.projectId, projectId), eq(knowledgeChunks.sourceType, sourceType), isNotNull(knowledgeChunks.embedding))
    : and(eq(knowledgeChunks.projectId, projectId), isNotNull(knowledgeChunks.embedding));

  const rows = await db
    .select({
      id: knowledgeChunks.id,
      projectId: knowledgeChunks.projectId,
      worldId: knowledgeChunks.worldId,
      sourceType: knowledgeChunks.sourceType,
      sourceId: knowledgeChunks.sourceId,
      chunkIndex: knowledgeChunks.chunkIndex,
      content: knowledgeChunks.content,
      tokens: knowledgeChunks.tokens,
      embedding: knowledgeChunks.embedding,
      meta: knowledgeChunks.meta,
      createdAt: knowledgeChunks.createdAt,
      distance: sql<number>`${knowledgeChunks.embedding} <=> ${vectorLiteral}::vector`.as('distance'),
    })
    .from(knowledgeChunks)
    .where(where)
    .orderBy(sql`${knowledgeChunks.embedding} <=> ${vectorLiteral}::vector`)
    .limit(k);

  return rows.map((r) => ({
    chunk: {
      id: r.id,
      projectId: r.projectId,
      worldId: r.worldId,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      chunkIndex: r.chunkIndex,
      content: r.content,
      tokens: r.tokens,
      embedding: r.embedding,
      meta: (r.meta as Record<string, unknown> | null),
      createdAt: r.createdAt,
    },
    distance: r.distance,
  }));
}

/** 全文检索（tsvector + websearch_to_tsquery 近似） */
async function textSearch(
  db: ReturnType<typeof getDb>,
  projectId: string,
  query: string,
  k: number,
  sourceType?: string,
): Promise<{ chunk: ChunkRecord; rank: number }[]> {
  // 使用 websearch_to_tsquery 支持短语、否定等
  const tsquery = sql`websearch_to_tsquery('simple', ${query})`;

  const where = sourceType
    ? and(eq(knowledgeChunks.projectId, projectId), eq(knowledgeChunks.sourceType, sourceType))
    : eq(knowledgeChunks.projectId, projectId);

  const rows = await db
    .select({
      id: knowledgeChunks.id,
      projectId: knowledgeChunks.projectId,
      worldId: knowledgeChunks.worldId,
      sourceType: knowledgeChunks.sourceType,
      sourceId: knowledgeChunks.sourceId,
      chunkIndex: knowledgeChunks.chunkIndex,
      content: knowledgeChunks.content,
      tokens: knowledgeChunks.tokens,
      embedding: knowledgeChunks.embedding,
      meta: knowledgeChunks.meta,
      createdAt: knowledgeChunks.createdAt,
      rank: sql<number>`ts_rank_cd(${knowledgeChunks.tsv}, ${tsquery})`.as('rank'),
    })
    .from(knowledgeChunks)
    .where(and(where, sql`${knowledgeChunks.tsv} @@ ${tsquery}`))
    .orderBy(desc(sql`ts_rank_cd(${knowledgeChunks.tsv}, ${tsquery})`))
    .limit(k);

  return rows.map((r) => ({
    chunk: {
      id: r.id,
      projectId: r.projectId,
      worldId: r.worldId,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      chunkIndex: r.chunkIndex,
      content: r.content,
      tokens: r.tokens,
      embedding: r.embedding,
      meta: (r.meta as Record<string, unknown> | null),
      createdAt: r.createdAt,
    },
    rank: r.rank,
  }));
}

/** 互补秩融合（RRF）：score = 1 / (k + rank_vec) + 1 / (k + rank_text) */
function reciprocalRankFusion(
  vectorResults: { chunk: ChunkRecord; distance: number }[],
  textResults: { chunk: ChunkRecord; rank: number }[],
  vectorWeight: number,
  textWeight: number,
  k: number = 60,
): Map<string, { chunk: ChunkRecord; score: number; vectorScore: number | null; textRank: number | null }> {
  const fused = new Map<string, { chunk: ChunkRecord; score: number; vectorScore: number | null; textRank: number | null }>();

  // 向量结果：distance 越小越好，转为 rank（1-based）
  for (const [idx, { chunk, distance }] of vectorResults.entries()) {
    const rank = idx + 1;
    const score = (1 / (k + rank)) * vectorWeight;
    const vectorScore = 1 - distance; // cosine distance -> similarity
    fused.set(chunk.id, {
      chunk,
      score,
      vectorScore,
      textRank: null,
    });
  }

  // 文本结果：rank 已按相关性排序
  for (const [idx, { chunk, rank }] of textResults.entries()) {
    const r = idx + 1;
    const score = (1 / (k + r)) * textWeight;
    const existing = fused.get(chunk.id);
    if (existing) {
      existing.score += score;
      existing.textRank = rank;
    } else {
      fused.set(chunk.id, {
        chunk,
        score,
        vectorScore: null,
        textRank: rank,
      });
    }
  }

  return fused;
}

export class VectorStore {
  private embeddingProvider: EmbeddingProvider;
  private embeddingModel: string;

  constructor(embeddingProvider: EmbeddingProvider, embeddingModel: string) {
    this.embeddingProvider = embeddingProvider;
    this.embeddingModel = embeddingModel;
  }

  /** 混合检索入口 */
  async search(options: SearchOptions): Promise<SearchResult[]> {
    const db = getDb();
    const {
      projectId,
      query,
      vectorWeight = DEFAULT_VECTOR_WEIGHT,
      textWeight = DEFAULT_TEXT_WEIGHT,
      vectorK = DEFAULT_VECTOR_K,
      textK = DEFAULT_TEXT_K,
      limit = DEFAULT_LIMIT,
      reranker,
    } = options;

    // 1. 生成查询向量
    const queryVector = await embedQuery(this.embeddingProvider, this.embeddingModel, query);
    if (!queryVector) {
      // 无向量时退回纯全文
      const textResults = await textSearch(db, projectId, query, limit, options.sourceType);
      return textResults.map((r, idx) => ({
        chunk: r.chunk,
        score: r.rank,
        vectorScore: null,
        textRank: idx + 1,
      }));
    }

    // 2. 并行跑向量与全文检索
    const [vectorResults, textResults] = await Promise.all([
      vectorSearch(db, projectId, queryVector, vectorK, options.sourceType),
      textSearch(db, projectId, query, textK, options.sourceType),
    ]);

    // 3. RRF 融合
    const fused = reciprocalRankFusion(vectorResults, textResults, vectorWeight, textWeight);

    // 4. 排序取 top-k
    let results = [...fused.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // 4. 可选：reranker 重排
    if (reranker && results.length > 1) {
      const docs = results.map((r) => r.chunk.content);
      const scores = await reranker.rerank(query, docs);
      results = results
        .map((r, i) => ({ ...r, score: scores[i] ?? r.score }))
        .sort((a, b) => b.score - a.score);
    }

    return results.map((r) => ({
      chunk: r.chunk,
      score: r.score,
      vectorScore: r.vectorScore,
      textRank: r.textRank,
    }));
  }

  /** 存储文档分块（带向量） */
  async upsertChunks(
    projectId: string,
    chunks: Array<{
      worldId: string | null;
      sourceType: string;
      sourceId: string;
      chunkIndex: number;
      content: string;
      meta?: Record<string, unknown>;
    }>,
  ): Promise<void> {
    const db = getDb();
    const contents = chunks.map((c) => c.content);

    // 批量生成向量
    const result = await this.embeddingProvider.embed({
      model: this.embeddingModel,
      texts: contents,
    });

    const now = new Date();
    const rows = chunks.map((c, i) => ({
      id: randomUUID(),
      projectId,
      worldId: c.worldId,
      sourceType: c.sourceType,
      sourceId: c.sourceId,
      chunkIndex: c.chunkIndex,
      content: c.content,
      tokens: estimateTokens(c.content),
      embedding: result.vectors[i],
      meta: c.meta ?? null,
      createdAt: now,
    }));

    await db.insert(knowledgeChunks).values(rows).onConflictDoUpdate({
      target: [knowledgeChunks.sourceType, knowledgeChunks.sourceId, knowledgeChunks.chunkIndex],
      set: {
        content: sql`EXCLUDED.content`,
        tokens: sql`EXCLUDED.tokens`,
        embedding: sql`EXCLUDED.embedding`,
        meta: sql`EXCLUDED.meta`,
      },
    });
  }

  /** 删除文档的所有分块 */
  async deleteBySource(projectId: string, sourceType: string, sourceId: string): Promise<void> {
    const db = getDb();
    await db
      .delete(knowledgeChunks)
      .where(
        and(
          eq(knowledgeChunks.projectId, projectId),
          eq(knowledgeChunks.sourceType, sourceType),
          eq(knowledgeChunks.sourceId, sourceId),
        ),
      );
  }
}

/** 粗略估算 token 数（中文约 1.5 字/token，英文约 4 字/token） */
function estimateTokens(text: string): number {
  const chinese = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const other = text.length - chinese;
  return Math.ceil(chinese / 1.5 + other / 4);
}