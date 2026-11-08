import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql as rawSql } from 'drizzle-orm';
import {
  SEARCH_GROUP_KEYS,
  SEARCH_NOT_COVERED,
  SEARCH_ORDER_METHOD,
  normalizeQuery,
  searchPlatform,
  type SearchGroupKey,
  type SearchResults,
} from '../src/server/domain/search';
import { createProject } from '../src/server/domain/projects';
import { saveStoryboard } from '../src/server/domain/storyboards';
import { planStoryboard } from '@nexus/video-model';
import { getDb } from '../src/server/db/client';
import {
  assets,
  characters,
  components,
  games,
  knowledgeChunks,
  projects,
  publishedProjects,
  snapshots,
  storyboards,
  users,
  worlds,
} from '../src/server/db/schema';

/**
 * §165 全平台搜索。打真库，因为这里唯一值得测的东西就是可见性：
 * 查询语法在内存里演出来毫无意义，"谁能搜到什么"只有把别人的项目真放进库里才试得出来。
 *
 * 每条"搜不到"的断言都配一条"换个人就搜得到"的反向断言——否则测试可能在断言一个
 * 根本没建成功的档案。搜不到有两种原因（规则挡的 / 数据不存在），必须区分开。
 *
 * 公开发布的那几行是直接插的：发布链路（门禁、机检、快照）有 `publish.integration.test.ts`
 * 管，这里只关心搜索怎么读 `published_projects` 那一行。
 */

const RUN = `s165${Date.now().toString(36)}`;
let meId: string;
let themId: string;
let meProject: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const rows = await db
    .insert(users)
    .values([
      { displayName: `搜索本人${RUN}`, email: `sr-a+${RUN}@nexus.test`, handle: `sra${RUN}` },
      { displayName: `搜索他人${RUN}`, email: `sr-b+${RUN}@nexus.test`, handle: `srb${RUN}` },
    ])
    .returning({ id: users.id });
  meId = rows[0]!.id;
  themId = rows[1]!.id;
  meProject = (await createProject(meId, { name: `起手项目${RUN}`, kind: 'website' })).id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(inArray(projects.ownerId, [meId, themId]));
  await db.delete(users).where(inArray(users.id, [meId, themId]));
});

function group(results: SearchResults, key: SearchGroupKey) {
  const found = results.groups.find((g) => g.key === key);
  if (!found) throw new Error(`结果里少了这一组：${key}`);
  return found;
}

/** 命中的行标识（projects 用项目 id，designs 用 page:/node: 前缀） */
function titles(results: SearchResults, key: SearchGroupKey): string[] {
  return group(results, key).hits.map((h) => h.title);
}

async function mine(name: string): Promise<string> {
  return (await createProject(meId, { name, kind: 'website' })).id;
}

/** 真库句柄：这几条要往库里写行才能验 */
function db() {
  return getDb();
}

describe('全平台搜索的可见性（真实数据库）', () => {
  it('少于两个字符不发查询', async () => {
    const blank = await searchPlatform(`起`, meId);
    expect(blank.tooShort).toBe(true);
    expect(blank.groups.every((g) => g.hits.length === 0)).toBe(true);
    // 空串与只有空格也一样：界面靠这个标志说"再打几个字"
    expect((await searchPlatform('   ', meId)).tooShort).toBe(true);
    // 反向：同样的查询多一个字就有结果，说明上一条不是数据不存在
    expect((await searchPlatform(`起手`, meId)).tooShort).toBe(false);
  });

  it('关键词两端都空白才算没输入', () => {
    expect(normalizeQuery(`  ${RUN}  `)).toBe(RUN);
    expect(normalizeQuery(undefined)).toBe('');
    expect(normalizeQuery(['a', 'b'])).toBe('a');
  });

  it('自己的项目搜得到、别人的私有项目搜不到；换本人身份就能搜到', async () => {
    const hidden = `秘密花园${RUN}`;
    await createProject(themId, { name: hidden, kind: 'website' });

    const asMe = await searchPlatform(hidden, meId);
    expect(titles(asMe, 'projects')).toEqual([]);

    const asThem = await searchPlatform(hidden, themId);
    expect(titles(asThem, 'projects')).toContain(hidden);
    // 自己的那条链接指向编辑器，不是发布页
    expect(group(asThem, 'projects').hits[0]!.href).toMatch(/^\/studio\/[0-9a-f-]{36}$/);
  });

  it('公开在跑的发布版本对匿名访客可见，链接指向发布路径', async () => {
    const name = `公开展厅${RUN}`;
    const projectId = await createProject(themId, { name, kind: 'website' }).then((p) => p.id);
    const path = `/n/sra${RUN}/${name}`;
    const db = getDb();
    await db.insert(publishedProjects).values({ projectId, path, visibility: 'public', moderation: 'approved' });

    const anon = await searchPlatform(name, null);
    const hit = group(anon, 'projects').hits.find((h) => h.title === name);
    expect(hit?.href).toBe(path);

    // 人工驳回的那条不再出现（§131：审核结论会改变能不能被搜到）
    await db.update(publishedProjects).set({ moderation: 'rejected' }).where(eq(publishedProjects.projectId, projectId));
    expect(titles(await searchPlatform(name, null), 'projects')).toEqual([]);
    // 反向：作者本人仍然搜得到自己的项目，说明上一条是审核挡的而不是行没了
    expect(titles(await searchPlatform(name, themId), 'projects')).toContain(name);

    await db.delete(publishedProjects).where(eq(publishedProjects.projectId, projectId));
  });

  it('软删除的项目不再出现', async () => {
    const name = `废弃码头${RUN}`;
    const projectId = await mine(name);
    expect(titles(await searchPlatform(name, meId), 'projects')).toContain(name);
    await getDb().update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, projectId));
    expect(titles(await searchPlatform(name, meId), 'projects')).toEqual([]);
  });

  it('用户组只列有公开主页的人', async () => {
    const db = getDb();
    // 无 handle 与 guest 都没有 /u/<handle> 可跳，列出来就是给访客一个空页
    const [noHandle] = await db
      .insert(users)
      .values({ displayName: `匿名过客${RUN}`, email: `sr-c+${RUN}@nexus.test` })
      .returning({ id: users.id });
    const [guest] = await db
      .insert(users)
      .values({ displayName: `未认领${RUN}`, guest: true, handle: `srg${RUN}` })
      .returning({ id: users.id });
    const [gone] = await db
      .insert(users)
      .values({ displayName: `注销用户${RUN}`, email: `sr-d+${RUN}@nexus.test`, handle: `srz${RUN}`, deletedAt: new Date() })
      .returning({ id: users.id });

    // 三条"搜不到"各自只排除一种情况：无 handle / guest / 已注销
    expect(titles(await searchPlatform(`过客${RUN}`, meId), 'users')).toEqual([]);
    expect(titles(await searchPlatform(`未认领${RUN}`, meId), 'users')).toEqual([]);
    expect(titles(await searchPlatform(`注销用户${RUN}`, meId), 'users')).toEqual([]);
    // guest 那条有 handle，所以按 handle 搜也必须为空，否则排除的就不是 guest 标记
    expect(titles(await searchPlatform(`srg${RUN}`, meId), 'users')).toEqual([]);

    expect(titles(await searchPlatform(`搜索本人`, meId), 'users')).toContain(`搜索本人${RUN}`);
    const hit = group(await searchPlatform(`搜索本人`, meId), 'users').hits.find((h) => h.title === `搜索本人${RUN}`);
    expect(hit?.href).toBe(`/u/sra${RUN}`);

    await db.delete(users).where(inArray(users.id, [noHandle!.id, guest!.id, gone!.id]));
  });

  it('六类内容只搜自己的项目，未登录时全空', async () => {
    const db = getDb();
    const theirs = await createProject(themId, { name: `别人的库${RUN}`, kind: 'website' });
    const term = `潮汐灯塔${RUN}`;

    await db.insert(worlds).values({ projectId: meProject, ownerId: meId, name: term, summary: '一座还会亮的世界' });
    await db.insert(games).values({ projectId: meProject, ownerId: meId, name: `${term}·玩法`, summary: null });
    await db.insert(characters).values({ projectId: meProject, ownerId: meId, name: `${term}·守灯人` });
    await db.insert(components).values({
      id: `comp-${RUN}`,
      projectId: meProject,
      name: `${term}·按钮`,
      rootNodeId: 'root',
      description: '一个组件',
    });
    await db.insert(assets).values({ projectId: meProject, name: `${term}.png`, kind: 'image', storageKey: `s165/${RUN}/a.png` });
    // 同名的一份别人的内容：一条都不许漏出来
    await db.insert(worlds).values({ projectId: theirs.id, ownerId: themId, name: term, summary: null });
    await db.insert(games).values({ projectId: theirs.id, ownerId: themId, name: `${term}·玩法`, summary: null });
    await db.insert(characters).values({ projectId: theirs.id, ownerId: themId, name: `${term}·守灯人` });

    const asMe = await searchPlatform(term, meId);
    expect(titles(asMe, 'worlds')).toEqual([term]);
    expect(titles(asMe, 'games')).toEqual([`${term}·玩法`]);
    expect(titles(asMe, 'characters')).toEqual([`${term}·守灯人`]);
    expect(titles(asMe, 'components')).toEqual([`${term}·按钮`]);
    expect(titles(asMe, 'assets')).toEqual([`${term}.png`]);
    // 世界条目跳 /world/<项目>，其余跳编辑器
    expect(group(asMe, 'worlds').hits[0]!.href).toBe(`/world/${meProject}`);
    expect(group(asMe, 'assets').hits[0]!.href).toBe(`/studio/${meProject}`);
    expect(group(asMe, 'assets').hits[0]!.detail).toBe('image');

    // 匿名访客：内容六组全空，但公开目标仍然能用
    const anon = await searchPlatform(term, null);
    for (const key of ['worlds', 'games', 'characters', 'designs', 'components', 'assets'] as const) {
      expect(group(anon, key).hits).toEqual([]);
    }
    expect(anon.signedIn).toBe(false);
    // 反向：这些行确实在库里，是规则挡住的而不是没建成功
    expect(titles(await searchPlatform(term, themId), 'worlds')).toEqual([term]);
    expect(titles(await searchPlatform(term, themId), 'worlds')).toEqual([term]);
  });

  it('设计稿组命中页面名与画布元素名', async () => {
    const byPage = await searchPlatform('Home', meId);
    expect(titles(byPage, 'designs')).toContain('Home');
    const pageHit = group(byPage, 'designs').hits.find((h) => h.title === 'Home');
    expect(pageHit?.id.startsWith('page:')).toBe(true);
    expect(pageHit?.detail).toBe('页面');

    const byNode = await searchPlatform('Eyebrow', meId);
    const nodeHits = group(byNode, 'designs').hits;
    expect(nodeHits.length).toBeGreaterThan(0);
    expect(nodeHits.every((h) => h.id.startsWith('node:'))).toBe(true);
    // 副标题给的是页面名而不是页面 id：这一条要靠 pages 那一跳 join 才拿得到
    expect(nodeHits.every((h) => h.detail === '画布元素 · 页面「Home」')).toBe(true);
    expect(nodeHits.every((h) => h.href.startsWith('/studio/'))).toBe(true);
  });

  it('`%` 与 `_` 是字符，不是通配符', async () => {
    const pct = `百分%达成${RUN}`;
    const under = `底_line${RUN}`;
    await mine(pct);
    await mine(`百分X达成${RUN}`);
    await mine(under);
    await mine(`底Xline${RUN}`);

    // 转义失效的话，`%` 会当成"任意串"把 百分X达成 一起命中，`_` 会命中 底Xline
    expect(titles(await searchPlatform(`分%达成`, meId), 'projects')).toEqual([pct]);
    expect(titles(await searchPlatform(`_li`, meId), 'projects')).toEqual([under]);
  });

  it('每组有上限，截断了就说"还有更多"而不是谎报总数', async () => {
    await mine(`三件套甲${RUN}`);
    await mine(`三件套乙${RUN}`);
    await mine(`三件套丙${RUN}`);
    const capped = await searchPlatform(`三件套`, meId, 2);
    expect(group(capped, 'projects').hits).toHaveLength(2);
    expect(group(capped, 'projects').capped).toBe(true);
    expect(capped.perGroup).toBe(2);
    // 反向：上限放宽就全部出现，且不再报截断
    const roomy = await searchPlatform(`三件套`, meId, 5);
    expect(group(roomy, 'projects').hits).toHaveLength(3);
    expect(group(roomy, 'projects').capped).toBe(false);
  });

  it('九组固定都在，顺序与标签稳定', async () => {
    const results = await searchPlatform(RUN, meId);
    expect(results.groups.map((g) => g.key)).toEqual([...SEARCH_GROUP_KEYS]);
    expect(results.groups.every((g) => g.label.length > 0)).toBe(true);
    expect(results.q).toBe(RUN);
  });
});

/**
 * §165 欠的最后一组：分镜（`storyboards`）。这一类的两个来源要分开证明：
 * 标题查 `storyboards` 表（不依赖语料库，那批内容进库之前存的分镜也搜得到），
 * 画面描述查 §49 的语料块。孤儿块那条是机制探针——它证明搜索真的 join 回了
 * `storyboards`，而不是把 `knowledge_chunks` 里的残留当成结果。
 */
describe('§165 × §40：分镜进全平台搜索', () => {
  it('标题命中走表，画面描述命中的是那一句所在的镜头', async () => {
    const projectId = await mine(`分镜搜索${RUN}`);
    // 把标题改开：`planStoryboard` 的标题就是那句来源文本，任何句子片段都会先被标题那条路命中，
    // 于是"语料块这条路"永远测不到。改标题正是用户会做的事（重命名一份分镜），不是测试替身。
    const doc = {
      ...planStoryboard('起重机吊起一只锈锚，雾从海面压过来', { id: `sb-s165-${RUN}` }),
      title: `夜班分镜${RUN}`,
    };
    const saved = await saveStoryboard(projectId, meId, { document: doc });
    if (!saved.ok) throw new Error(`保存失败：${saved.reason}`);

    const byTitle = await searchPlatform(doc.title, meId);
    const titleHit = group(byTitle, 'storyboards').hits.find((h) => h.title === doc.title);
    expect(titleHit, '分镜标题搜不到 = 这一组没接进搜索').toBeDefined();
    expect(titleHit!.href).toBe(`/studio/${projectId}`);
    expect(titleHit!.detail).toBe('分镜标题');

    expect(doc.shots.length, '这条分镜只切出一镜，测不到"序号"这回事').toBeGreaterThan(1);
    const byShot = await searchPlatform(doc.shots[doc.shots.length - 1]!.prompt.slice(0, 10), meId);
    const shotHit = group(byShot, 'storyboards').hits.find((h) => h.title === doc.title);
    expect(shotHit, '画面描述搜不到 = 语料块没接进全平台搜索').toBeDefined();
    // 标题不命中这句，所以这里能拿到结果就只有语料块那条路；命中里带着"是哪一镜"，
    // 光说"这份分镜里有"不够定位。序号从同一份 doc 推导，不是我抄进来的常量。
    expect(shotHit!.detail, '语料块的标题没带镜头序号').toContain(`第 ${doc.shots.length} 镜`);

    // 反向控制：把查询词换成一句库里根本没有的话，这一组必须空
    expect(group(await searchPlatform('这句描述根本不存在于任何分镜里', meId), 'storyboards').hits).toEqual([]);
  });

  it('孤儿块不产结果：分镜行删掉后那句描述再也搜不到，而块还留在库里', async () => {
    const projectId = await mine(`孤儿分镜${RUN}`);
    const doc = {
      ...planStoryboard('盐海没有鱼。只有钟声在码头那边一遍遍响。', { id: `sb-s165-orphan-${RUN}` }),
      title: `盐海分镜${RUN}`,
    };
    const saved = await saveStoryboard(projectId, meId, { document: doc });
    if (!saved.ok) throw new Error(`保存失败：${saved.reason}`);
    // 用最后一镜的句子去查：标题里没有它，能命中的只有 §49 的语料块这条路。
    // 否则这条测试就退化成"删了行就搜不到"，证不到 join 回 storyboards 的保护作用。
    expect(doc.shots.length, '这条分镜只切出一镜，测不到孤儿块这条路').toBeGreaterThan(1);
    const shotTerm = doc.shots[doc.shots.length - 1]!.prompt.slice(0, 8);
    const preDelete = group(await searchPlatform(shotTerm, meId), 'storyboards').hits;
    expect(preDelete.length, '语料块那条路本来就没通，下面的删除测不出什么').toBe(1);
    expect(preDelete[0]!.detail).toContain(`第 ${doc.shots.length} 镜`);

    // 故意只删 `storyboards` 那一行、不重建索引：这就是"索引里留着已删内容的块"的形状
    const db = getDb();
    await db.delete(storyboards).where(eq(storyboards.projectId, projectId));
    const leftovers = await db
      .select({ sourceId: knowledgeChunks.sourceId })
      .from(knowledgeChunks)
      .where(and(eq(knowledgeChunks.projectId, projectId), eq(knowledgeChunks.sourceType, 'storyboard')));
    expect(leftovers.length, '孤儿块没留下来 = 最后那条断言是在测空气').toBeGreaterThan(0);
    expect(group(await searchPlatform(shotTerm, meId), 'storyboards').hits, '点开就是 404 的结果还是给了出来').toEqual([]);
  });

  it('别人的分镜不进我的结果，他自己搜得到，匿名也搜不到', async () => {
    const theirs = await createProject(themId, { name: `他人分镜${RUN}`, kind: 'website' });
    const doc = planStoryboard('灯塔只在有人失踪时才亮', { id: `sb-s165-theirs-${RUN}` });
    const saved = await saveStoryboard(theirs.id, themId, { document: doc });
    if (!saved.ok) throw new Error(`保存失败：${saved.reason}`);

    expect(group(await searchPlatform('灯塔只在有人失踪时才亮', meId), 'storyboards').hits).toEqual([]);
    expect(group(await searchPlatform('灯塔只在有人失踪时才亮', themId), 'storyboards').hits.length).toBeGreaterThan(0);
    // 分镜没有发布链路（§56/§57 发的是设计文档那一版），匿名列出来就是给访客一个 404
    expect(group(await searchPlatform('灯塔只在有人失踪时才亮', null), 'storyboards').hits).toEqual([]);
  });
});

describe('组内按相关度排（§165 那一格"没有相关度排序"的补上）', () => {
  it('标题完全一样 > 标题开头 > 标题里有 > 只在简介里有；相关度压过更新时间', async () => {
    const token = `样板${RUN}`;
    const exact = await mine(token);
    const prefix = await mine(`${token}·续篇`);
    const contains = await mine(`归档${token}旧稿`);
    const detailOnly = await mine(`别的东西${RUN}`);
    const db = getDb();
    // 只有简介里提到那个词 ⇒ 相关度最低（标题一个字都没沾上）
    await db.update(projects).set({ description: `这一版的简介里提到 ${token}` }).where(eq(projects.id, detailOnly));
    // 而且它是**最新**的那一条：按更新时间排的话它会排第一
    // ⇒ 这一条钉的是"相关度优先于时间"，不是"顺序没变"
    await db
      .update(projects)
      .set({ updatedAt: new Date(Date.now() + 3600_000) })
      .where(eq(projects.id, detailOnly));

    const order = titles(await searchPlatform(token, meId), 'projects');
    expect(order[0], '标题与搜索词完全一样的那条要排第一').toBe(token);
    expect(order.indexOf(`${token}·续篇`), '标题以搜索词开头的排在只在简介里匹配的前面').toBeLessThan(
      order.indexOf(`别的东西${RUN}`),
    );
    expect(order.indexOf(`归档${token}旧稿`), '标题里有搜索词的排在只在简介里匹配的前面').toBeLessThan(
      order.indexOf(`别的东西${RUN}`),
    );
    expect(order[order.length - 1], '只在简介里匹配的那条（哪怕它是最新更新的）排最后').toBe(`别的东西${RUN}`);

    // 反向：只按更新时间排的话，"只在简介里匹配"那条会跑到第一 ⇒ 证明上一条不是顺序碰巧
    const byTime = await db
      .select({ id: projects.id, updatedAt: projects.updatedAt })
      .from(projects)
      .where(eq(projects.id, detailOnly));
    expect(byTime[0]!.updatedAt.getTime(), '这条得真的比别的新，否则这个断言量不到东西').toBeGreaterThan(
      Date.now(),
    );

    // 清理：那条被推到"未来"的更新时间，免得它影响别的用例
    await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, detailOnly));
    // 每一档指向的确实是那一个项目（不是"名字碰巧像"的那一行）
    const hits = group(await searchPlatform(token, meId), 'projects').hits;
    expect(hits.find((h) => h.title === token)?.href).toBe(`/studio/${exact}`);
    expect(hits.find((h) => h.title === `${token}·续篇`)?.href).toBe(`/studio/${prefix}`);
    expect(hits.find((h) => h.title === `归档${token}旧稿`)?.href).toBe(`/studio/${contains}`);
  });

  it('页面上写着的口径与代码里排出来的一致（藏起来的序会被读成"平台公认最相关"）', () => {
    expect(SEARCH_ORDER_METHOD).toContain('完全一样');
    expect(SEARCH_ORDER_METHOD).toContain('开头');
    // "没覆盖"那几行里不许再留"没有相关度排序"这句旧话 ⇒ 它说的是今天的限度，不是历史
    expect(SEARCH_NOT_COVERED.join(' ')).not.toContain('相关度排序——子串匹配没有打分');
    expect(SEARCH_NOT_COVERED.join(' ')).toContain('不看词频');
  });

  it('六档口径写的是六档（档数与刻度数要对上，六档说成五档就是谎话）', () => {
    // 页面那句话里数得出六档
    expect(SEARCH_ORDER_METHOD).toContain('只在简介/摘要/正文里有');
    expect(SEARCH_ORDER_METHOD).toContain('只在文档正文里有');
    expect(SEARCH_ORDER_METHOD).toContain('只在语料库里');
    // "没覆盖"那行也说的是六档，不能一处六档另一处四档
    expect(SEARCH_NOT_COVERED.join(' ')).toContain('相关度只分六档');
    expect(SEARCH_NOT_COVERED.join(' ')).not.toContain('相关度只分四档');
  });

  it('文档正文里的词能被搜到（第 5 档：snapshots.search_text）', async () => {
    const token = `正文词${RUN}`;
    const project = await mine(`正文项目${RUN}`);
    // 往这个项目的快照 search_text 里写一个词（正文那一列的写入方是 createSnapshot）
    await db()
      .update(snapshots)
      .set({ search_text: `这一版的正文里提到 ${token}` })
      .where(eq(snapshots.projectId, project));

    const results = await searchPlatform(token, meId);
    const hit = group(results, 'designs').hits.find((h) => h.href === `/studio/${project}`);
    expect(hit, '正文里的词应该能把那个项目的设计稿搜出来').toBeTruthy();
  });

  it('正文那一档不会把同一个结果重复很多遍（join 快照会翻倍，这里用关联子查询）', async () => {
    const token = `不重复${RUN}`;
    const project = await mine(`不重复项目${RUN}`);
    const writeSnapshot = (n: number) =>
      db()
        .insert(snapshots)
        .values({
          projectId: project,
          source: 'manual',
          document: {
            id: project,
            schemaVersion: 1,
            name: 'x',
            pages: [],
            activePageId: '',
            components: [],
            tokens: [],
            assets: [],
            variables: [],
            metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), modes: [] },
          },
          search_text: `正文 ${token} 第${n}份`,
        });
    const countHits = async () =>
      group(await searchPlatform(token, meId, 25), 'designs').hits.filter((h) => h.href === `/studio/${project}`).length;

    await writeSnapshot(1);
    const one = await countHits();
    expect(one, '正文命中时设计稿要出得来').toBeGreaterThan(0);

    // 再存两份正文同样含这个词的快照 ⇒ 命中条数不该变
    await writeSnapshot(2);
    await writeSnapshot(3);
    const three = await countHits();
    expect(three, '快照多几份不该让同一个结果多出几行（join 会翻倍）').toBe(one);
  });

  it('语料库里的词能被搜到（第 6 档：knowledge_chunks.content）', async () => {
    const token = `语料词${RUN}`;
    const project = await mine(`语料项目${RUN}`);
    // 先有一条世界条目（它是「世界」那一组的结果载体）
    await db()
      .insert(worlds)
      .values({ projectId: project, ownerId: meId, name: `语料世界${RUN}`, summary: null })
      .returning({ id: worlds.id });
    // 再往语料库里写一块正文（§49 那一路）
    await db()
      .insert(knowledgeChunks)
      .values({
        projectId: project,
        sourceType: 'lore',
        sourceId: `${project}#lore-1`,
        chunkIndex: 0,
        content: `传说里说 ${token} 出现在王城`,
      });

    const hits = group(await searchPlatform(token, meId), 'worlds').hits;
    expect(hits.length, '语料库里的词要能命中「世界」那一组').toBeGreaterThan(0);
    expect(hits.some((h) => h.title === `语料世界${RUN}`), '命中的那条就是那个世界').toBe(true);
  });
});
