import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray, sql as rawSql } from 'drizzle-orm';
import { addMemory, deleteMemory } from '../src/server/domain/memories';
import { createProjectCharacter, updateCharacterProfile } from '../src/server/domain/characters';
import { saveWorld } from '../src/server/domain/worlds';
import { knowledgeStats, retrieveProjectKnowledge, syncProjectKnowledge } from '../src/server/domain/knowledge';
import { createWorld } from '@nexus/world-model';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { knowledgeChunks, projects, users } from '../src/server/db/schema';

/**
 * §49 的语料索引与混合检索。打真实 Postgres：全文命中靠 tsvector、子串命中靠 lower/like，
 * 这两件事都没法在内存里假装验证。
 */

let owner: string;

beforeAll(async () => {
  const db = getDb();
  const probe = await db.execute(rawSql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可用');
  const [row] = await db
    .insert(users)
    .values({ displayName: 'Librarian', email: `rag+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  owner = row!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, owner));
  await db.delete(users).where(eq(users.id, owner));
});

async function newProject(name: string): Promise<string> {
  return (await createProject(owner, { name, kind: 'website' })).id;
}

/** 一份有内容的世界：两个条目写了中英文，一个条目留空 */
function worldWithText(projectId: string) {
  const world = createWorld('低语诸王', projectId);
  const nodes = world.nodes.map((node) => {
    if (node.kind === 'lore') {
      return { ...node, title: '日蚀编年史', body: '王城在第七次日蚀下投降。The city fell during the seventh eclipse.' };
    }
    if (node.kind === 'geography') {
      return { ...node, title: '盐海', body: '盐海没有鱼，只有沉船的路标。' };
    }
    return node;
  });
  return { ...world, nodes, summary: '一个日蚀不停的王国。' };
}

describe('语料索引与检索（真实数据库）', () => {
  it('存世界即建索引：块数 > 0，没有 provider 时向量数是 0', async () => {
    const id = await newProject('RAG Index');
    const saved = await saveWorld(id, owner, worldWithText(id));
    expect(saved.ok).toBe(true);
    const stats = await knowledgeStats(id);
    expect(stats.total).toBeGreaterThan(2);
    expect(stats.vectorized).toBe(0);
    expect(stats.bySource.lore ?? 0).toBeGreaterThanOrEqual(1);
    // 空正文的模板条目不该进索引
    const db = getDb();
    const empties = await db
      .select({ id: knowledgeChunks.id })
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.projectId, id));
    expect(empties.length).toBe(stats.total);
  });

  it('中文靠子串命中，英文有全文命中；matchedBy 说清是怎么中的', async () => {
    const id = await newProject('RAG Hybrid');
    await saveWorld(id, owner, worldWithText(id));

    const cjk = await retrieveProjectKnowledge(id, '盐海');
    expect(cjk.items.length).toBeGreaterThan(0);
    expect(cjk.items[0]!.matchedBy).toContain('substring');
    expect(cjk.items[0]!.snippet).toContain('盐海');
    expect(cjk.vectorAvailable).toBe(false);
    expect(cjk.reranker).toBe('deterministic-fusion');

    const latin = await retrieveProjectKnowledge(id, 'eclipse');
    expect(latin.items.length).toBeGreaterThan(0);
    expect(latin.items[0]!.matchedBy).toContain('fulltext');
  });

  it('空查询不查、也不炸；totalChunks 仍然报得出', async () => {
    const id = await newProject('RAG Empty Query');
    await saveWorld(id, owner, worldWithText(id));
    const result = await retrieveProjectKnowledge(id, '   ');
    expect(result.items).toEqual([]);
    expect(result.totalChunks).toBeGreaterThan(0);
  });

  it('角色档案与记忆也进索引，删掉记忆后不再命中', async () => {
    const id = await newProject('RAG Sources');
    const savedWorld = await saveWorld(id, owner, worldWithText(id));
    if (!savedWorld.ok) throw new Error(savedWorld.reason);
    const created = await createProjectCharacter(id, owner, { name: '守夜人' });
    if (!created.ok) throw new Error(created.reason);
    const updated = await updateCharacterProfile(created.character.id, id, {
      ...created.character.profile,
      name: '守夜人',
      personality: '她记得每一条巡逻路，包括不存在的那条。',
    });
    if (!updated.ok) throw new Error(updated.reason);
    // 世界类记忆必须指明主体（§48）：这里就是刚存进去的那份世界
    const memory = await addMemory({
      ownerId: owner,
      projectId: id,
      scope: 'world',
      subjectId: savedWorld.document.id,
      content: '盐海其实是一片打翻的镜子。',
    });
    expect(memory.ok).toBe(true);

    const byCharacter = await retrieveProjectKnowledge(id, '巡逻路');
    expect(byCharacter.items.some((item) => item.sourceType === 'character')).toBe(true);

    const byMemory = await retrieveProjectKnowledge(id, '打翻的镜子');
    expect(byMemory.items.some((item) => item.sourceType === 'memory')).toBe(true);

    if (!memory.ok) throw new Error('上面已断言成功');
    expect(await deleteMemory(memory.entry.id, owner)).toBe(true);
    const afterDelete = await retrieveProjectKnowledge(id, '打翻的镜子');
    expect(afterDelete.items).toEqual([]);
  });

  it('语料按项目隔离：别的项目查不到这批内容', async () => {
    const mine = await newProject('RAG Mine');
    const other = await newProject('RAG Other');
    await saveWorld(mine, owner, worldWithText(mine));
    expect((await knowledgeStats(other)).total).toBe(0);
    expect((await retrieveProjectKnowledge(other, '盐海')).items).toEqual([]);
    expect((await retrieveProjectKnowledge(mine, '盐海')).items.length).toBeGreaterThan(0);
  });

  it('重建索引是幂等的：同一份内容重跑两次，块数不变', async () => {
    const id = await newProject('RAG Idempotent');
    await saveWorld(id, owner, worldWithText(id));
    const first = (await knowledgeStats(id)).total;
    await syncProjectKnowledge(id);
    await syncProjectKnowledge(id);
    expect((await knowledgeStats(id)).total).toBe(first);
    const db = getDb();
    const rows = await db
      .select({ sourceType: knowledgeChunks.sourceType, sourceId: knowledgeChunks.sourceId, chunkIndex: knowledgeChunks.chunkIndex })
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.projectId, id));
    const keys = rows.map((r) => `${r.sourceType}#${r.sourceId}#${r.chunkIndex}`);
    expect(new Set(keys).size).toBe(keys.length);
    await db.delete(knowledgeChunks).where(inArray(knowledgeChunks.projectId, [id]));
  });
});
