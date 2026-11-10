import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { createWorld } from '@nexus/world-model';
import { createProject } from '../src/server/domain/projects';
import { saveWorld } from '../src/server/domain/worlds';
import {
  knowledgeStats,
  retrieveProjectKnowledge,
  syncProjectKnowledge,
} from '../src/server/domain/knowledge';
import {
  getEmbeddingProvider,
  getRerankerProvider,
  hasEmbeddingProvider,
  hasRerankerProvider,
  LOCAL_EMBEDDING_MODEL,
  LOCAL_RERANKER_MODEL,
  LocalTokenBagEmbeddingProvider,
  LocalTokenBagRerankerProvider,
} from '../src/server/ai/embedding';
import { VectorStore } from '../src/server/ai/vector-store';
import { getDb } from '../src/server/db/client';
import { knowledgeChunks, projects, users } from '../src/server/db/schema';

/**
 * §49/§93 — local deterministic embedding + reranker end-to-end.
 *
 * This file opts in to the LOCAL providers for real (NEXUS_EMBEDDING_PROVIDER=local and
 * NEXUS_RERANKER_PROVIDER=local) and proves the full loop works without any credentials:
 *   save project -> syncProjectKnowledge -> chunks get written -> knowledgeStats vectorized > 0 ->
 *   VectorStore.search (the hybrid path the knowledge route calls) returns results, reranked by
 *   the local deterministic reranker.
 * The lexical fallback (`retrieveProjectKnowledge`) is asserted honestly: it stays vectorAvailable=false
 * because THERE is no vector path inside the domain function — the vector route calls VectorStore separately.
 * Env is restored in afterAll so no other test file sees local mode by accident.
 */

let owner: string;
const saved: Record<string, string | undefined> = {};

beforeAll(async () => {
  saved.NEXUS_EMBEDDING_PROVIDER = process.env.NEXUS_EMBEDDING_PROVIDER;
  saved.NEXUS_RERANKER_PROVIDER = process.env.NEXUS_RERANKER_PROVIDER;
  process.env.NEXUS_EMBEDDING_PROVIDER = 'local';
  process.env.NEXUS_RERANKER_PROVIDER = 'local';

  const db = getDb();
  const probe = await db.execute(rawSql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可达');
  const [row] = await db
    .insert(users)
    .values({ displayName: 'Cartographer', email: `localrag+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  owner = row!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, owner));
  await db.delete(users).where(eq(users.id, owner));
  process.env.NEXUS_EMBEDDING_PROVIDER = saved.NEXUS_EMBEDDING_PROVIDER;
  process.env.NEXUS_RERANKER_PROVIDER = saved.NEXUS_RERANKER_PROVIDER;
});

describe('local embedding + reranker end-to-end (real Postgres)', () => {
  it('the hybrid path VectorStore.search runs whole on the local providers, deterministically', async () => {
    const projectId = (await createProject(owner, { name: `local-${Date.now()}`, kind: 'website' })).id;
    const world = createWorld('灯塔之下', projectId);
    const nodes = world.nodes.map((node) => {
      if (node.kind === 'lore') {
        return { ...node, title: '潮汐灯塔', body: 'The tide locks open every seventh night and the light walks inward.' };
      }
      if (node.kind === 'geography') {
        return { ...node, title: '盐海', body: 'Salt wind. No roads. People row everything.' };
      }
      return node;
    });
    const withSummary = { ...world, nodes, summary: 'the salt sea' };
    const savedWorld = await saveWorld(projectId, owner, withSummary);
    expect(savedWorld.ok).toBe(true);

    await syncProjectKnowledge(projectId);

    const stats = await knowledgeStats(projectId);
    expect(stats.vectorized).toBeGreaterThan(0);
    expect(stats.bySource.lore ?? 0).toBeGreaterThanOrEqual(1);

    const db = getDb();
    const rows = await db
      .select({ id: knowledgeChunks.id, embedding: knowledgeChunks.embedding })
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.projectId, projectId));
    const withVector = rows.filter((r) => r.embedding !== null && r.embedding.length === 1536);
    expect(withVector.length).toBe(stats.vectorized);

    expect(hasEmbeddingProvider()).toBe(true);
    expect(hasRerankerProvider()).toBe(true);

    const embeddingProvider = getEmbeddingProvider()!;
    const reranker = getRerankerProvider()!;
    expect(embeddingProvider.models()).toContain(LOCAL_EMBEDDING_MODEL);
    expect(reranker.models()).toContain(LOCAL_RERANKER_MODEL);
    // 模型名匹配还不够：必须证明 opt-in 选中的**就是**本地那一支，而不是别的 provider 恰好报了同一个模型名
    expect(embeddingProvider).toBeInstanceOf(LocalTokenBagEmbeddingProvider);
    expect(reranker).toBeInstanceOf(LocalTokenBagRerankerProvider);

    // 直接用 Route 同款组合：VectorStore + 本地 embedding + 本地 rerank（调用 route 那条路所做的事，不差一步）
    const store = new VectorStore(embeddingProvider as LocalTokenBagEmbeddingProvider, LOCAL_EMBEDDING_MODEL);
    const result = await store.search({
      projectId,
      query: 'tide light seventh night',
      limit: 5,
      reranker,
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((r) => r.chunk.content.includes('tide'))).toBe(true);
    const ids = result.map((r) => r.chunk.id);
    // 两次跑，同一段询问、同一份项目，顺序必须一字不差
    const again = await store.search({ projectId, query: 'tide light seventh night', limit: 5, reranker });
    expect(again.map((r) => r.chunk.id)).toEqual(ids);

    // 词法回退是可用的、诚实的——它说自己不是 vector 路径（没有写假调用，也没报过度）
    // （这个 world 的正文是英文，所以词法查询用英文词；chunks 只存 body，不含 CJK 标题）
    const lexical = await retrieveProjectKnowledge(projectId, 'tide');
    expect(lexical.vectorAvailable).toBe(false);
    expect(lexical.items.length).toBeGreaterThan(0);
  });

  it('knowledge sync does not crash when the world has zero chunks', async () => {
    const projectId = (await createProject(owner, { name: `empty-${Date.now()}`, kind: 'website' })).id;
    await expect(syncProjectKnowledge(projectId)).resolves.not.toThrow();
    const stats = await knowledgeStats(projectId);
    expect(stats.vectorized).toBe(0);
  });
});
