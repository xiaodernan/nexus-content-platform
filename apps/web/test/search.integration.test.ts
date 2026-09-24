import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray, sql as rawSql } from 'drizzle-orm';
import {
  SEARCH_GROUP_KEYS,
  normalizeQuery,
  searchPlatform,
  type SearchGroupKey,
  type SearchResults,
} from '../src/server/domain/search';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { assets, characters, components, games, projects, publishedProjects, users, worlds } from '../src/server/db/schema';

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

  it('八组固定都在，顺序与标签稳定', async () => {
    const results = await searchPlatform(RUN, meId);
    expect(results.groups.map((g) => g.key)).toEqual([...SEARCH_GROUP_KEYS]);
    expect(results.groups.every((g) => g.label.length > 0)).toBe(true);
    expect(results.q).toBe(RUN);
  });
});
