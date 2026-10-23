import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, ne, sql as rawSql } from 'drizzle-orm';
import { addMemory, deleteMemory } from '../src/server/domain/memories';
import { createProjectCharacter, updateCharacterProfile } from '../src/server/domain/characters';
import { saveWorld } from '../src/server/domain/worlds';
import { saveStoryboard } from '../src/server/domain/storyboards';
import { saveGame } from '../src/server/domain/games';
import {planStoryboard, type Storyboard} from '@nexus/video-model';
import { createGame, linkEntities, updateEntity, type GameDocument } from '@nexus/game-model';
import { knowledgeStats, readKnowledgeBlock, retrieveProjectKnowledge, syncProjectKnowledge } from '../src/server/domain/knowledge';
import { createWorld } from '@nexus/world-model';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
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
    // `other` 是新建项目，它自己的起始模板文案就是它仅有的语料（§49 Documents）；
    // 隔离要断言的是"我这批世界内容一条都没过去"，不是"它总块数为 0"
    const isolated = await knowledgeStats(other);
    expect(isolated.bySource.geography ?? 0, '别的项目的世界条目串过来了').toBe(0);
    expect(isolated.bySource.lore ?? 0, '别的项目的世界条目串过来了').toBe(0);
    expect(isolated.bySource.design).toBe(1);
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

/**
 * §49 × §54：游戏文档进语料库。
 *
 * 纯函数那格说了"骨架不该进索引"，这里要的是只有真库能回答的部分：
 * ① 写入方（`saveGame`）真的挂了同步，不是只有 HTTP 通了；
 * ② 改了说明之后**旧说法再也查不到**；
 * ③ 两个项目各存一份 id 相同的文档时，全局唯一约束 `(source_type, source_id, chunk_index)`
 *    不会把第二个项目挡在写库外面——这一条是分镜那一片真的红过一次（23505）之后留下的形状。
 */
describe('§49 × §54：游戏文档进语料库（真实数据库）', () => {
  /** 把骨架里那位敌人填出内容来：其余 10 类保持空壳 */
  function flesh(doc: GameDocument, notes: string): GameDocument {
    const enemy = doc.entities.find((e) => e.kind === 'enemy')!;
    const player = doc.entities.find((e) => e.kind === 'player')!;
    let next = updateEntity(doc, enemy.id, { name: '苦痛主教', notes });
    next = updateEntity(next, player.id, { name: '守夜人' });
    return { ...next, summary: '一座被雾封住的港口城，玩家替死人送信。' };
  }

  it('空骨架存进去零块语料；填过的实体才有块；改完不留旧说法', async () => {
    const id = await newProject('Game RAG');
    const skeleton = createGame('黑雾港', id);
    await saveGame(id, owner, skeleton);

    // 模板骨架（11 个只有名字的实体 + 空摘要）对检索不存在：这是刻意的，
    // 让空壳进索引等于告诉 AI "这个项目有内容"。
    // 注意总数不是 0——这个项目自己的设计正文有一块（§49 Documents），那是真文字。
    const empty = await knowledgeStats(id);
    expect(empty.bySource.game ?? 0, '空骨架进了索引 = 把建档痕迹当内容').toBe(0);
    expect(empty.bySource.design, '起始模板的文案是真语料，不是空壳').toBe(1);

    const saved = await saveGame(id, owner, flesh(skeleton, '披着船帆的胖主教，只在钟声里移动。'));
    if (!saved.ok) throw new Error(`保存失败：${saved.reason}`);
    const stats = await knowledgeStats(id);
    // 概述一块 + 那位敌人一块；其余 10 个空壳不产生块
    expect(stats.bySource.game).toBe(2);

    const hit = await retrieveProjectKnowledge(id, '披着船帆的胖主教');
    expect(hit.items.length, '这句设计查不到 = 游戏对 AI 不存在').toBeGreaterThan(0);
    expect(hit.items.some((i) => i.sourceType === 'game' && i.title.includes('苦痛主教'))).toBe(true);
    // 概述与实体是两块语料，查询词不重合就不会顺带命中——所以单独查摘要那句话，
    // 断言的是"这款游戏在讲什么"也查得着，而不是"随便查一句都能带出全库"
    const bySummary = await retrieveProjectKnowledge(id, '玩家替死人送信');
    expect(
      bySummary.items.some((i) => i.sourceType === 'game' && i.title.includes('概述')),
      '查摘要这句话命中不了概述块 = 游戏的设定对 AI 不存在',
    ).toBe(true);

    // 换掉那句说明：旧说法再也查不到（"改了却还检索到旧的"是最难查的谎）
    const resaved = await saveGame(id, owner, flesh(skeleton, '只在雾号里移动，见不得日光。'));
    if (!resaved.ok) throw new Error(`第二次保存失败：${resaved.reason}`);
    const stale = await retrieveProjectKnowledge(id, '披着船帆的胖主教');
    expect(stale.items.some((i) => i.sourceType === 'game'), '旧说明还查得到 = 索引没跟着写重建').toBe(false);
    const fresh = await retrieveProjectKnowledge(id, '只在雾号里移动');
    expect(fresh.items.some((i) => i.sourceType === 'game' && i.title.includes('苦痛主教'))).toBe(true);

    // 同一份文档再同步一次：块数不变（重建是幂等的）
    const before = await knowledgeStats(id);
    await syncProjectKnowledge(id);
    const after = await knowledgeStats(id);
    expect(after.total).toBe(before.total);
  });

  it('引用在语料里说的是目标实体的名字（真库路径）', async () => {
    const id = await newProject('Game RAG Refs');
    const base = flesh(createGame('黑雾港', id), '披着船帆的胖主教。');
    const enemy = base.entities.find((e) => e.kind === 'enemy')!;
    const player = base.entities.find((e) => e.kind === 'player')!;
    const linked = linkEntities(base, enemy.id, player.id, '追杀');
    if (linked.reason) throw new Error(`连引用失败：${linked.reason}`);
    const saved = await saveGame(id, owner, linked.document);
    if (!saved.ok) throw new Error(`保存失败：${saved.reason}`);

    const hit = await retrieveProjectKnowledge(id, '追杀');
    const boss = hit.items.find((i) => i.sourceType === 'game' && i.title.includes('苦痛主教'));
    expect(boss?.snippet, '带引用的那一块没进语料').toBeDefined();
    // 装配方读的是这句话：里面出现 ge_xxx 那种内部 id 就是噪音，谁也查不到
    expect(boss?.snippet).toContain('追杀 → 守夜人');
    expect(boss?.snippet).not.toContain(player.id);
  });

  it('两个项目存同一份文档（文档 id 相同）不撞全局唯一约束', async () => {
    const a = await newProject('Game RAG 复制 A');
    const b = await newProject('Game RAG 复制 B');
    const shared = flesh(createGame('黑雾港', a), '披着船帆的胖主教。');
    const first = await saveGame(a, owner, shared);
    // 从别的项目复制来的一份：文档自带的 id 一模一样，只有行 id 是各自的
    const second = await saveGame(b, owner, { ...shared, projectId: b });
    // 这一条红过就是回归：第二个项目插不进去（23505），而且报错会甩在保存分镜/游戏的人脸上
    if (!first.ok) throw new Error(`A 那份存失败：${first.reason}`);
    if (!second.ok) throw new Error(`B 那份存失败：${second.reason}`);
    expect(first.document.id).not.toBe(second.document.id);

    const statsA = await knowledgeStats(a);
    const statsB = await knowledgeStats(b);
    expect(statsA.bySource.game).toBe(2);
    expect(statsB.bySource.game).toBe(2);
    // 两边的块各自独立，游戏行数就是 2 + 2（只数 game：每个项目还各有一份自己的设计正文）
    const rows = await getDb()
      .select({ id: knowledgeChunks.id })
      .from(knowledgeChunks)
      .where(
        and(
          inArray(knowledgeChunks.projectId, [a, b]),
          eq(knowledgeChunks.sourceType, 'game'),
        ),
      );
    expect(rows.length).toBe(4);
  });
});

/**
 * §49 清单最后一格「Documents」：设计文档（§16）的正文进语料库。
 *
 * 只有真库能回答的四件事：
 * ① `saveDocument` 这个写入方真的挂了同步——Studio 每次自动保存都走它，不是只有 HTTP 通了；
 * ② 改一句文案之后**旧句子再也查不到**（这一条在分镜和游戏那两片都红过，是本项目最贵的形状）；
 * ③ 世界/游戏那次"整库重建"不许顺手把设计正文删掉——它的删除范围必须等于它的重写范围；
 * ④ 两个项目可以有同名页面：sourceId 认的是**行 id**（`projectId#pageId`），不撞全局唯一约束。
 */
describe('§49 × §16：设计文档正文进语料库（真实数据库）', () => {
  /** 把起始模板里那条 Headline 换成给定文案，然后走真正的写库路径 */
  async function saveHeadline(projectId: string, text: string): Promise<void> {
    const doc = await loadDocument(projectId);
    if (!doc) throw new Error('项目读不回来，测试前提就断了');
    const page = doc.pages[0]!;
    const headline = Object.values(page.nodes).find((n) => n.name === 'Headline');
    if (!headline) throw new Error('起始模板里没有 Headline 节点，切分前提变了');
    page.nodes[headline.id] = { ...headline, text };
    await saveDocument(projectId, doc);
  }

  it('新建项目即有设计语料；改文案后旧句子再也查不到', async () => {
    const id = await newProject('Design RAG');
    // 起始模板带着真文案，所以创建那一刻就可检索——这不是"空壳也算内容"，
    // §54 那条禁的是只有名字的骨架，这里是实打实的标题文案
    const stats = await knowledgeStats(id);
    expect(stats.bySource.design, '新建项目的起始文案没进索引 = 创建路径没挂同步').toBe(1);

    const before = await retrieveProjectKnowledge(id, '从一句话到一个可发布的产品');
    expect(
      before.items.some((i) => i.sourceType === 'design' && i.title.includes('Home')),
      '模板标题那句话查不到 = 设计正文对 AI 不存在',
    ).toBe(true);

    await saveHeadline(id, '雾里的港口只有一条会响的钟');
    const stale = await retrieveProjectKnowledge(id, '从一句话到一个可发布的产品');
    expect(
      stale.items.some((i) => i.sourceType === 'design'),
      '改完还查得到旧标题 = 索引没跟着写重建',
    ).toBe(false);
    const fresh = await retrieveProjectKnowledge(id, '雾里的港口只有一条会响的钟');
    expect(
      fresh.items.some((i) => i.sourceType === 'design' && i.snippet.includes('会响的钟')),
      '改后的句子查不到 = 保存路径没换块',
    ).toBe(true);

    // 块数不随保存次数增长：一次保存换一块，不是追加一块
    expect((await knowledgeStats(id)).bySource.design).toBe(1);
  });

  it('写路径的重建不碰设计块；「重建索引」按钮补得回脏块', async () => {
    const id = await newProject('Design RAG Survives Rebuild');
    await saveHeadline(id, '灯塔只在有人失踪时才亮');
    const designBefore = (await knowledgeStats(id)).bySource.design;
    await saveWorld(id, owner, worldWithText(id));

    // 手工把那一块内容改成一句文档里根本没有的话：这就是"这批内容进库之前建好的项目"
    // 留下的缺块形状，或者某次同步半途失败的形状。
    const db = getDb();
    const dirty = '设计文档：脏 · Home\n页面：Home\nHeadline：紫色香蕉从不迟到';
    await db
      .update(knowledgeChunks)
      .set({ content: dirty })
      .where(and(eq(knowledgeChunks.projectId, id), eq(knowledgeChunks.sourceType, 'design')));
    /** 直接数行：`RetrievedChunk` 只带 snippet，脏块有没有被动过要在行本身上看 */
    const designContents = async () => {
      const rows = await db
        .select({ content: knowledgeChunks.content })
        .from(knowledgeChunks)
        .where(and(eq(knowledgeChunks.projectId, id), eq(knowledgeChunks.sourceType, 'design')));
      return rows.map((r) => r.content);
    };
    expect(
      await designContents(),
      '脏块没写进去 = 下面两条断言是在测空气',
    ).toEqual([dirty]);

    // ① 世界/游戏那些写路径走的重建**不带** includeDesign：它没重切设计，所以也不许删设计。
    //    这一步断言的是"没碰"——脏块还在原位。
    await syncProjectKnowledge(id);
    expect(await designContents(), '一次世界保存就把设计块删了 = 删除范围大于重写范围').toEqual([dirty]);
    expect((await knowledgeStats(id)).bySource.geography ?? 0, '世界那批没进索引').toBeGreaterThan(0);

    // ② 显式「重建索引」（按钮那条路，带 includeDesign）真的重切了设计：
    //    脏块换掉、当前正文回来、块数不是追加。断的是"重建"这两个字覆盖清单最后一格，
    //    而不是只对前七格成立。
    await syncProjectKnowledge(id, { includeDesign: true });
    const after = await knowledgeStats(id);
    expect(after.bySource.design, '重建后设计块数变了 = 不是换块而是删了没补').toBe(designBefore);
    expect(await designContents(), '重建之后脏块还在 = 按钮那条路没重切设计').not.toContain(dirty);
    expect(
      (await retrieveProjectKnowledge(id, '灯塔只在有人失踪时才亮')).items.some(
        (i) => i.sourceType === 'design',
      ),
      '重建后设计正文查不到了 = 按钮那条路没重切设计',
    ).toBe(true);
    expect(after.bySource.geography ?? 0).toBeGreaterThan(0);
  });

  it('两个项目的同名页面各自成块，sourceId 认的是行身份', async () => {
    const a = await newProject('Design RAG 双份 A');
    const b = await newProject('Design RAG 双份 B');
    await saveHeadline(a, '甲港的钟只在涨潮时响');
    await saveHeadline(b, '乙港的桥只在退潮时塌');
    const rows = await getDb()
      .select({ projectId: knowledgeChunks.projectId, sourceId: knowledgeChunks.sourceId })
      .from(knowledgeChunks)
      .where(
        and(
          inArray(knowledgeChunks.projectId, [a, b]),
          eq(knowledgeChunks.sourceType, 'design'),
        ),
      );
    expect(rows.length, '两个项目各一块，行数应该是 2').toBe(2);
    // 前缀是项目行 id：这一串是唯一约束 `(source_type, source_id, chunk_index)` 能全局成立的前提
    for (const row of rows) {
      expect(row.sourceId.startsWith(`${row.projectId}#page-`), `sourceId 没带项目身份：${row.sourceId}`).toBe(true);
    }
    expect(
      (await retrieveProjectKnowledge(a, '甲港的钟只在涨潮时响')).items.some((i) => i.sourceType === 'design'),
      'B 存过之后 A 的文案查不到 = 两边的块互相覆盖了',
    ).toBe(true);
    expect(
      await retrieveProjectKnowledge(b, '甲港的钟只在涨潮时响'),
      'A 的文案串到 B 的项目里 = 隔离破了',
    ).toMatchObject({ items: [] });
  });
});

/**
 * §49 的最后一格：按出处取回**整块**正文。
 *
 * 上下文装配与检索面板发出去的都是命中位置附近的窗口（那条 `unavailable` 就是这么写的），
 * 所以这里要证的是：报文里那个 `sourceId` 真能顺回一整块，顺序稳定，且跨项目顺不回去。
 */
describe('§49：按出处取回整块语料（readKnowledgeBlock）', () => {
  it('检索命中的 sourceId 顺得回整块：块比摘录大、顺序稳定、别人的项目拿不到', async () => {
    const id = await newProject('Block Read');
    const hit = await retrieveProjectKnowledge(id, '从一句话到一个可发布的产品');
    const item = hit.items.find((i) => i.sourceType === 'design');
    if (!item) throw new Error('起点就不是绿的：检索没命中设计正文');

    const full = await readKnowledgeBlock(id, 'design', item.sourceId);
    const block = full.blocks[0];
    if (!block) throw new Error('取回了空列表：这条用例的前提断了');
    expect(full.blocks.length).toBeGreaterThan(0);
    expect(block.chunkIndex, '块的顺序不是从 0 开始数：拼回去的次序会变').toBe(0);
    expect(block.content).toContain(item.snippet.replace(/^…|…$/g, ''));
    // 这条才是开这一格的理由：整块比那块窗口大，而且带着块自己的抬头行
    expect(block.content.length, '整块应当不小于摘录（新项目的小块与窗口一样长是正常的）').toBeGreaterThanOrEqual(
      item.snippet.length,
    );
    expect(block.content).toContain('设计文档：');
    expect(block.title).toContain('Home');
    expect(block.tokens, '块没带 token 数：预算没法核对').toBeGreaterThan(0);

    const again = await readKnowledgeBlock(id, 'design', item.sourceId);
    expect(
      again.blocks.map((b) => b.content),
      '同一出处取两次内容不同：ORDER BY 没起作用',
    ).toEqual(full.blocks.map((b) => b.content));

    // 大于一眼可见的那种才证明这条通道有用：长文案的块超过摘录窗口，
    // 只发窗口就读不全。（第一版这里直接断"块 > 摘录"，红在 145 vs 145——
    // 新项目的块本来就短于一整个窗口，那条断言测的其实不是这条通道的理由。）
    const longDoc = await loadDocument(id);
    if (!longDoc) throw new Error('项目读不回来，测试前提断了');
    const longPage = longDoc.pages[0]!;
    const longHeadline = Object.values(longPage.nodes).find((n) => n.name === 'Headline');
    if (!longHeadline) throw new Error('起始模板里没有 Headline 节点');
    const longText = '夜里港口的钟一圈圈数着人：' + '雾从海面压过来，灯芯擦亮一次就多一个人回来。'.repeat(12);
    longPage.nodes[longHeadline.id] = { ...longHeadline, text: longText };
    await saveDocument(id, longDoc);

    const longHit = await retrieveProjectKnowledge(id, '就多一个人回来');
    const longItem = longHit.items.find((i) => i.sourceType === 'design');
    if (!longItem) throw new Error('长文案没被检索到：这条用例的前提断了');
    const longBlocks = (await readKnowledgeBlock(id, 'design', longItem.sourceId)).blocks;
    const longBlock = longBlocks[0]!;
    expect(
      longBlock.content.length,
      '长文案的块不比摘录窗口大：那这条通道就没有意义',
    ).toBeGreaterThan(longItem.snippet.length);
    expect(longBlock.content).toContain(longItem.snippet.replace(/^…|…$/g, ''));
    const other = await newProject('Block Read Other');
    expect(
      (await readKnowledgeBlock(other, 'design', item.sourceId)).blocks,
      '项目边界没生效：把别人的语料块发出去了',
    ).toEqual([]);
    expect((await readKnowledgeBlock(id, 'design', '#page-没有这一页')).blocks).toEqual([]);
  });
});

/**
 * 挂在镜头上的角色，在语料里应当是**名字**。这里打真库：角色由 `createProjectCharacter` 建出来
 * （id 是库生成的 uuid），分镜走 `saveStoryboard`，所以整条链——名册、写路径、同步、检索、
 * 整块通道——用的都是同一份身份。§54 给引用定过这条规矩，镜头这一格此前漏了。
 */
describe('§49 × §46：镜头的角色在语料里是名字（真实数据库）', () => {
  it('存好角色与分镜后，整块正文写「角色：守夜人」，不写那串 uuid', async () => {
    const id = await newProject('Storyboard Named Character');
    const created = await createProjectCharacter(id, owner, { name: '守夜人' });
    if (!created.ok) throw new Error(`角色没建出来：${created.reason}`);
    const characterId = created.character.id;

    const planned = planStoryboard('灯塔的光扫过浮冰，她数着回来的每一条船', { id: 'sb-named' });
    const doc: Storyboard = { ...planned, shots: planned.shots.map((s) => ({ ...s, characterId })) };
    const saved = await saveStoryboard(id, owner, { document: doc });
    if (!saved.ok) throw new Error(`分镜没存进去：${saved.reason}`);

    const hit = await retrieveProjectKnowledge(id, '她数着回来的每一条船');
    // 取**镜头那块**（还有一块是作者写的那句来源，它不带机位/角色这些行）
    const block = hit.items.find((i) => i.sourceType === 'storyboard' && i.title.includes('第 '));
    expect(block, '镜头正文查不到 = 这一片的前提断了').toBeDefined();

    // 摘录是窗口，所以整块要走 §49 那条按出处取回的路（顺手也证明那条通道服务的是这件事）
    const full = await readKnowledgeBlock(id, 'storyboard', block!.sourceId);
    expect(full.blocks.length).toBeGreaterThan(0);
    const text = full.blocks.map((b) => b.content).join('\n');
    expect(text, '语料里没写出角色名字 = 名册与镜头之间那一格还空着').toContain('角色：守夜人');
    expect(text, '内部 uuid 还留在可检索的散文里').not.toContain(characterId);
  });
  it('并发同步语料：删与插一起成功一起失败，不 23505（#175）', async () => {
    const db = getDb();
    const id = await newProject('RAG Race');
    const saved = await saveWorld(id, owner, worldWithText(id));
    expect(saved.ok).toBe(true);
    // 先同步一次，把这一次会产出的块键读出来（下面要用其中一个键去撞唯一索引）。
    // 只取非 design 的键：syncProjectKnowledge 默认不重切 design 那一类（删除范围必须等于
    // 重写范围），拿 design 的键去撞根本不会发生。
    await syncProjectKnowledge(id);
    const keys = await db
      .select({
        sourceType: knowledgeChunks.sourceType,
        sourceId: knowledgeChunks.sourceId,
        chunkIndex: knowledgeChunks.chunkIndex,
      })
      .from(knowledgeChunks)
      .where(and(eq(knowledgeChunks.projectId, id), ne(knowledgeChunks.sourceType, 'design')));
    expect(keys.length).toBeGreaterThan(0);
    await db.delete(knowledgeChunks).where(eq(knowledgeChunks.projectId, id));

    // 真实竞态：另一个会话已经占了其中一个块键、还没提交。同步读的是**源表**，
    // 看不见这一行，于是照样删（删不到它）照样插，后到者阻塞在 knowledge_chunks_source_key 上。
    // 那个会话按 ADR-0016 拿着同一把项目写锁——修好之后，同步会先拿到锁才动手，
    // 于是排在那之后：它删得掉那一行，也插得进自己的。
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let landed!: () => void;
    const inserted = new Promise<void>((resolve) => {
      landed = resolve;
    });
    const { lockProjectWrites } = await import('../src/server/domain/projects');
    const other = db.transaction(async (tx) => {
      await lockProjectWrites(tx, id);
      await tx.insert(knowledgeChunks).values({ ...keys[0]!, projectId: id, content: '占位', tokens: 1 });
      landed();
      await gate;
    });
    await inserted;
    const pending = syncProjectKnowledge(id);
    // 等到这一发真的阻塞住了（等锁或等唯一索引，都是 wait_event_type='Lock'）再放开那个事务
    let blocked = false;
    for (let i = 0; i < 600 && !blocked; i += 1) {
      const rows = await db.execute(
        rawSql`select 1 as hit from pg_stat_activity
               where pid <> pg_backend_pid() and wait_event_type = 'Lock' limit 1`,
      );
      blocked = rows.length > 0;
      if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(blocked, 'syncProjectKnowledge 没能阻塞——竞态窗口没造出来').toBe(true);
    release();
    const out = await pending;
    await other;

    expect(out.chunks).toBeGreaterThan(0);
    const after = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.projectId, id));
    expect(after).toHaveLength(out.chunks);
  });
});
