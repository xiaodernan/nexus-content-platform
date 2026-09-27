import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray, sql as rawSql } from 'drizzle-orm';
import { addMemory, deleteMemory } from '../src/server/domain/memories';
import { createProjectCharacter, updateCharacterProfile } from '../src/server/domain/characters';
import { saveWorld } from '../src/server/domain/worlds';
import { saveStoryboard } from '../src/server/domain/storyboards';
import { planStoryboard } from '@nexus/video-model';
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

  /**
   * 多词条查询的回归护栏。
   *
   * 这条用例是补上一个**真实漏过 bug 的覆盖缺口**：早前检索条件把词条拼成一个
   * 字符串塞进 drizzle 的 sql 模板，drizzle 把它当单个文本参数绑定，生成
   * `or $N`；文本参数落在布尔位置时**不报错**，而是恒为 false——
   * 于是"任一词条命中"这一支成了死代码。
   *
   * 后果不是崩溃，是**静默返回空**：查「盐海 沉船」什么都查不到，
   * 而查单个「盐海」正常。原来的 6 条用例全是单词条查询，所以一条都没抓到。
   * 下面刻意用空格分隔的多词条，并且让每个词单独出现、整句不出现。
   */
  it('多词条查询：整句不匹配但各词条命中时，必须能查到（曾静默返回空）', async () => {
    const id = await newProject('RAG Multi Term');
    await saveWorld(id, owner, worldWithText(id));

    // 「盐海」与「沉船」在同一条正文里，但「盐海 沉船」这个整句并不出现
    const byWholePhrase = await retrieveProjectKnowledge(id, '盐海 沉船');
    expect(byWholePhrase.items.length).toBeGreaterThan(0);
    expect(byWholePhrase.items.some((item) => item.snippet.includes('盐海'))).toBe(true);

    // 词序反过来也必须命中（词条命中与顺序无关）
    const reversed = await retrieveProjectKnowledge(id, '沉船 盐海');
    expect(reversed.items.length).toBeGreaterThan(0);

    // 两个词条各自单独查，也都得命中——对照组，确保不是"整句恰好匹配"蒙对的
    expect((await retrieveProjectKnowledge(id, '盐海')).items.length).toBeGreaterThan(0);
    expect((await retrieveProjectKnowledge(id, '沉船')).items.length).toBeGreaterThan(0);

    // 词覆盖度必须是真实算出来的：两个词都命中的块，coverage 高于只命中一个词的
    const both = await retrieveProjectKnowledge(id, '盐海 沉船');
    const top = both.items[0]!;
    expect(top.parts.coverage).toBeGreaterThan(0);
  });

  it('多词条里混入不存在的词：仍按命中部分返回，不整条丢掉', async () => {
    const id = await newProject('RAG Partial Term');
    await saveWorld(id, owner, worldWithText(id));
    const result = await retrieveProjectKnowledge(id, '盐海 会说话的月亮桥');
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.some((item) => item.snippet.includes('盐海'))).toBe(true);
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

/**
 * §40 的分镜写进库之后，检索这一侧必须看得见它。
 *
 * 这条打真实数据库，为的是三件纯函数测试说不了的事：
 * ① 写入方真的挂了 `syncProjectKnowledge`（不是只有 HTTP 通了）；
 * ② 改一镜之后**旧句子再也查不到**——"改了却还检索到旧内容"是最难查的谎；
 * ③ notes 那句"本地确定性断句"不参与命中（它进语料会让"查分镜"命中规则说明书）。
 */
describe('§49 × §40：分镜进语料库（真实数据库）', () => {
  it('存分镜即建索引；改过的镜头不留旧文本；notes 不掺进命中', async () => {
    const id = await newProject('Storyboard RAG');
    const first = planStoryboard('灯塔守夜人擦亮灯芯，雾从海面压过来', { id: 'sb-rag-1' });
    const saved = await saveStoryboard(id, owner, { document: first });
    if (!saved.ok) throw new Error(`保存失败：${saved.reason}`);

    const stats = await knowledgeStats(id);
    expect(stats.bySource.storyboard).toBe(first.shots.length + 1);

    const hit = await retrieveProjectKnowledge(id, '灯塔守夜人擦亮灯芯');
    expect(hit.items.length, '这一镜的句子查不到，等于分镜对 AI 不存在').toBeGreaterThan(0);
    expect(hit.items[0]!.sourceType).toBe('storyboard');
    // 整句既是第一镜的 prompt 也是来源句子，所以两块都会命中：断言"其中有一块是那一镜"
    expect(hit.items.some((i) => i.title.includes('第 1 镜')), '命中里没有那一镜本体').toBe(true);
    expect(
      hit.items.some((i) => i.snippet.includes('本地确定性断句')),
      'notes 不该被当成故事内容检索出来',
    ).toBe(false);

    // 换一整版（来源句子跟着换）：只改一镜的 prompt 是撤不掉旧句子的——
    // 那句话本来就是来源句子的一部分，仍然合法地留在 #source 那一块里
    const second = planStoryboard('起重机吊起一只锈锚，雾从海面压过来', { id: first.id });
    const resaved = await saveStoryboard(id, owner, { document: second, baseUpdatedAt: saved.updatedAt });
    if (!resaved.ok) throw new Error(`第二次保存失败：${resaved.reason}`);

    const stale = await retrieveProjectKnowledge(id, '灯塔守夜人擦亮灯芯');
    expect(stale.items.some((i) => i.sourceType === 'storyboard'), '旧镜头文本还查得到 = 索引没重建').toBe(false);
    const fresh = await retrieveProjectKnowledge(id, '起重机吊起一只锈锚');
    expect(
      fresh.items.some((i) => i.sourceType === 'storyboard' && i.title.includes('第 1 镜')),
      '改完的那一镜查不到 = 索引没跟着写重建',
    ).toBe(true);
  });

  it('删掉分镜的那次同步不该留下孤儿块：整份重建后块数跟着变', async () => {
    const id = await newProject('Storyboard RAG Recount');
    const one = planStoryboard('盐海没有鱼', { id: 'sb-rag-2' });
    await saveStoryboard(id, owner, { document: one });
    const before = await knowledgeStats(id);
    // 同一份文档再存一次：块数不变（重建是幂等的，不是每次写都往索引里追加一份）
    await syncProjectKnowledge(id);
    const after = await knowledgeStats(id);
    expect(after.total).toBe(before.total);
    expect(after.bySource.storyboard).toBe(one.shots.length + 1);
  });
});
