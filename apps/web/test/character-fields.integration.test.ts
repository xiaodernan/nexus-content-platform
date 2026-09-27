import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray, like, sql as rawSql } from 'drizzle-orm';
import { createProjectCharacter, listCharacters, updateCharacterProfile } from '../src/server/domain/characters';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { characters, knowledgeChunks, projects, users } from '../src/server/db/schema';

/**
 * §39 点名的四栏（identity / appearance / style / clothing / traits）里，
 * `appearance` 早就有了，另外四栏**过去根本没地方存**——需求写着"系统保存"，
 * 而档案里只有 personality / backstory / 视觉标识，填无可填。
 *
 * 这一格要证的不是"类型里有这几个字段"，而是：写进库 → 从库里读回来 → 值还在。
 * 少了后半句，加字段只是加装饰。
 */

let userId: string;
let projectId: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const stamp = Date.now().toString(36);
  const [user] = await db
    .insert(users)
    .values({ displayName: 'CharacterFields', email: `cf+${stamp}@nexus.test`, handle: `cf${stamp}` })
    .returning({ id: users.id });
  userId = user!.id;
  const doc = await createProject(userId, { name: '角色字段用例', kind: 'website' });
  projectId = doc.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(inArray(projects.ownerId, [userId]));
  await db.delete(users).where(inArray(users.id, [userId]));
});

describe('§39 角色档案的四栏真的存得下来', () => {
  it('建档时这四栏是空的，但**在**——不是 undefined 冒充"有这一栏"', async () => {
    const created = await createProjectCharacter(projectId, userId, { name: '空档角色' });
    expect(created.ok, created.ok ? '' : created.reason).toBe(true);
    if (!created.ok) return;
    const p = created.character.profile;
    expect(p).toMatchObject({ identity: '', style: '', clothing: '' });
    expect(Array.isArray(p.traits)).toBe(true);
    expect(p.traits).toEqual([]);
  });

  it('写进库再读回来，四栏一个字都不许丢', async () => {
    const created = await createProjectCharacter(projectId, userId, { name: '阿蓝' });
    expect(created.ok, created.ok ? '' : created.reason).toBe(true);
    if (!created.ok) return;
    const id = created.character.id;
    const next = {
      ...created.character.profile,
      identity: '左眉一道疤，眼睛很圆',
      style: '厚涂、暖光',
      clothing: '靛蓝斗篷，袖口卷起',
      traits: ['怕水', '话多', '认路很快'],
    };
    const saved = await updateCharacterProfile(id, projectId, next);
    expect(saved.ok, saved.ok ? '' : saved.reason).toBe(true);
    if (!saved.ok) return;

    // 关键一步：**重新从库里读**，不看 update 自己回给的那份内存对象
    const listed = await listCharacters(projectId);
    const reread = listed.items.find((c) => c.id === id);
    expect(reread, '清单里找不到刚存过的角色').toBeDefined();
    expect(reread!.profile).toMatchObject({
      identity: '左眉一道疤，眼睛很圆',
      style: '厚涂、暖光',
      clothing: '靛蓝斗篷，袖口卷起',
    });
    expect(reread!.profile.traits).toEqual(['怕水', '话多', '认路很快']);

    const [row] = await getDb().select({ profile: characters.profile }).from(characters).where(eq(characters.id, id)).limit(1);
    expect((row!.profile as Record<string, unknown>).clothing, 'jsonb 里这一列根本没写进去').toBe('靛蓝斗篷，袖口卷起');

    // 存下来只是第一半：**检索拿不到就等于对 AI 不存在**。
    // 保存档案时服务端会同步知识索引，所以这里直接查索引里有没有这句话。
    const hits = await getDb()
      .select({ content: knowledgeChunks.content })
      .from(knowledgeChunks)
      .where(like(knowledgeChunks.content, '%靛蓝斗篷%'));
    expect(hits.length, '穿着写进了档案，却没进知识索引：查"穿靛蓝斗篷的那个角色"永远查不到').toBeGreaterThan(0);
    const traitHits = await getDb()
      .select({ content: knowledgeChunks.content })
      .from(knowledgeChunks)
      .where(like(knowledgeChunks.content, '%认路很快%'));
    expect(traitHits.length, 'traits 没进索引').toBeGreaterThan(0);
  });

  it('库里已有的旧档案（没有这四栏）仍然读得出来，不会被界面弄丢', async () => {
    const created = await createProjectCharacter(projectId, userId, { name: '旧档' });
    expect(created.ok, created.ok ? '' : created.reason).toBe(true);
    if (!created.ok) return;
    const id = created.character.id;
    // 手工把 jsonb 里那四栏抹掉，模拟加字段之前入库的行
    const db = getDb();
    const [before] = await db.select({ profile: characters.profile }).from(characters).where(eq(characters.id, id)).limit(1);
    const stripped = { ...(before!.profile as Record<string, unknown>) };
    delete stripped.identity;
    delete stripped.style;
    delete stripped.clothing;
    delete stripped.traits;
    await db.update(characters).set({ profile: stripped as never }).where(eq(characters.id, id));

    const listed = await listCharacters(projectId);
    const found = listed.items.find((c) => c.id === id);
    expect(found, '旧行读不出来：契约把没写过的栏位当成缺字段了').toBeDefined();
    expect(found!.profile).toMatchObject({ identity: '', style: '', clothing: '', traits: [] });
    expect(listed.unreadable).toEqual([]);
  });
});
