import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray, sql as rawSql } from 'drizzle-orm';
import { searchMemories } from '../src/server/domain/memory-search';
import { syncProjectKnowledge } from '../src/server/domain/knowledge';
import { addMemory } from '../src/server/domain/memories';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, users } from '../src/server/db/schema';

/**
 * §48 的记忆搜索走的是 §49 那套词面混合检索。打真库是因为这两件事只有在库里才成立：
 * tsvector 的 `plainto_tsquery('simple', …)` 对中文怎么切，以及"语料要先同步过才搜得到"。
 */

const RUN = `s48b${Date.now().toString(36)}`;
let ownerId: string;
let otherId: string;
let projectId: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const rows = await db
    .insert(users)
    .values([
      { displayName: `记忆作者${RUN}`, email: `ms+${RUN}@nexus.test`, handle: `ms${RUN}` },
      { displayName: `记忆路人${RUN}`, email: `mx+${RUN}@nexus.test`, handle: `mx${RUN}` },
    ])
    .returning({ id: users.id });
  ownerId = rows[0]!.id;
  otherId = rows[1]!.id;
  projectId = (await createProject(ownerId, { name: '记忆搜索', kind: 'website' })).id;
  for (const content of [
    '守夜人公会在今晚子时清点灯塔的火油存量',
    '主角习惯在雨天检查马鞍的皮带',
  ]) {
    const added = await addMemory({ ownerId, projectId, scope: 'session', subjectId: '', content });
    if (!added.ok) throw new Error(`记忆没写进去：${added.reason}`);
  }
  // 语料是同步进 knowledge_chunks 的：不先同步，检索就是搜一份空表
  const synced = await syncProjectKnowledge(projectId);
  expect(synced.chunks).toBeGreaterThan(0);
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(inArray(projects.ownerId, [ownerId, otherId]));
  await db.delete(users).where(inArray(users.id, [ownerId, otherId]));
});

describe('searchMemories（§48 × §49）', () => {
  it('词面命中：搜"火油"只回那一条记忆，并说清是怎么命中的', async () => {
    const out = await searchMemories(ownerId, projectId, '火油');
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0]?.content).toContain('火油');
    expect(out.hits[0]?.scope).toBe('session');
    expect(out.hits[0]!.matchedBy.length).toBeGreaterThan(0);
    expect(out.hits[0]!.score).toBeGreaterThan(0);
    // 边界那句必须跟着结果走，不能只在没命中的时候才说
    expect(out.note).toContain('不是语义检索');
  });

  it('反向对照：换一条的词就该搜不到，且那句"不等于没有相关记忆"会出来', async () => {
    const out = await searchMemories(ownerId, projectId, '完全不搭界的词组zz');
    expect(out.hits).toEqual([]);
    expect(out.note).toContain('不挂项目');
  });

  it('空查询不检索、也不假装扫过语料', async () => {
    const out = await searchMemories(ownerId, projectId, '   ');
    expect(out).toEqual({ hits: [], totalChunks: 0, note: null });
  });

  it('别人的 ownerId 拿不到任何一条：归属条件在 listMemories 那一侧兜住', async () => {
    const out = await searchMemories(otherId, projectId, '火油');
    expect(out.hits).toEqual([]);
  });
});
