import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { addRelationship, withProfile } from '@nexus/world-model';
import {
  createProjectCharacter,
  deleteCharacter,
  listCharacters,
  updateCharacterProfile,
} from '../src/server/domain/characters';
import { createProject } from '../src/server/domain/projects';
import { loadWorld, saveWorld } from '../src/server/domain/worlds';
import { createWorld } from '@nexus/world-model';
import { getDb } from '../src/server/db/client';
import { projects, users } from '../src/server/db/schema';

/**
 * §46 角色档案的存储。打真实 Postgres：档案整份存在 JSONB 里，
 * "写得进、读得出、跨项目拿不到"只有在真库上才算验证过。
 */

let ownerId: string;

beforeAll(async () => {
  const db = getDb();
  const probe = await db.execute(rawSql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可用');
  const [owner] = await db
    .insert(users)
    .values({ displayName: 'Caster', email: `chars+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  ownerId = owner!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
});

async function newProject(name: string): Promise<string> {
  return (await createProject(ownerId, { name, kind: 'website' })).id;
}

describe('角色档案读写（真实数据库）', () => {
  it('建档只给名字，其余字段是空的（不是预设性格）', async () => {
    const id = await newProject('Chars Basic');
    const created = await createProjectCharacter(id, ownerId, { name: '守夜人' });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.reason);
    expect(created.character.profile.personality).toBe('');
    expect(created.character.profile.goals).toEqual([]);

    const list = await listCharacters(id);
    expect(list.items.map((c) => c.profile.name)).toEqual(['守夜人']);
    expect(list.unreadable).toEqual([]);
  });

  it('没有名字建不了档，改了也不留半行', async () => {
    const id = await newProject('Chars NoName');
    const rejected = await createProjectCharacter(id, ownerId, { name: '   ' });
    expect(rejected.ok).toBe(false);
    expect(await listCharacters(id)).toEqual({ items: [], unreadable: [] });
  });

  it('改档案：换出新时间戳，关系与色板都读得回来', async () => {
    const id = await newProject('Chars Update');
    const created = await createProjectCharacter(id, ownerId, { name: '拾荒王' });
    if (!created.ok) throw new Error(created.reason);
    let c = withProfile(created.character, {
      personality: '只信看得见的东西',
      goals: ['修好城墙'],
      fears: ['再次被流放'],
    });
    c = addRelationship(c, { target: 'wn-ghost', kind: '仇恨' });
    c = withProfile(c, { visualIdentity: { ...c.profile.visualIdentity, palette: ['#1b1205'] } });

    const saved = await updateCharacterProfile(c.id, id, c.profile);
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error(saved.reason);
    const list = await listCharacters(id);
    expect(list.items[0]!.profile.goals).toEqual(['修好城墙']);
    expect(list.items[0]!.profile.relationships[0]).toMatchObject({ target: 'wn-ghost', kind: '仇恨' });
    expect(Date.parse(saved.character.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.character.updatedAt));
  });

  it('空名字的档案更新被拒，库里那份原样留着', async () => {
    const id = await newProject('Chars Reject');
    const created = await createProjectCharacter(id, ownerId, { name: '信使' });
    if (!created.ok) throw new Error(created.reason);
    const bad = withProfile(created.character, { name: '   ' });
    const rejected = await updateCharacterProfile(bad.id, id, bad.profile);
    expect(rejected.ok).toBe(false);
    if (rejected.ok) throw new Error('空名字不该存进去');
    expect(rejected.reason).toContain('没有名字');
    const list = await listCharacters(id);
    expect(list.items[0]!.profile.name).toBe('信使');
  });

  it('跨项目拿不到别人的角色：按 (id, projectId) 查', async () => {
    const mine = await newProject('Chars Mine');
    const theirs = await newProject('Chars Theirs');
    const created = await createProjectCharacter(mine, ownerId, { name: '隐者' });
    if (!created.ok) throw new Error(created.reason);
    const stranger = withProfile(created.character, { personality: '偷来的' });
    const result = await updateCharacterProfile(created.character.id, theirs, stranger.profile);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('跨项目写入不该成功');
    expect(result.reason).toContain('这个项目里没有');
    expect((await listCharacters(theirs)).items).toEqual([]);
    expect(await deleteCharacter(created.character.id, theirs)).toBe(false);
    expect(await deleteCharacter(created.character.id, mine)).toBe(true);
    expect((await listCharacters(mine)).items).toEqual([]);
  });

  it('角色默认挂在当前世界上（没有世界时才是 null）', async () => {
    const id = await newProject('Chars World');
    const before = await createProjectCharacter(id, ownerId, { name: '无世界时' });
    if (!before.ok) throw new Error(before.reason);
    expect(before.character.worldId).toBeNull();

    const saved = await saveWorld(id, ownerId, createWorld('低语诸王', id));
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error(saved.reason);
    const loaded = await loadWorld(id);
    expect(loaded?.ok).toBe(true);
    // 一份世界只有一个 id：库里那行的 uuid（读回来与写进去的必须是同一个）
    expect(loaded?.ok && loaded.document.id).toBe(saved.document.id);
    const after = await createProjectCharacter(id, ownerId, { name: '有世界时' });
    if (!after.ok) throw new Error(after.reason);
    expect(after.character.worldId).toBe(saved.document.id);
    // 显式给了别的 worldId 时不擅自改成当前世界
    const pinned = await createProjectCharacter(id, ownerId, { name: '指定世界', worldId: null });
    if (!pinned.ok) throw new Error(pinned.reason);
    expect(pinned.character.worldId).toBeNull();
  });

  it('项目删掉后角色随行消失（外键级联）', async () => {
    const db = getDb();
    const id = await newProject('Chars Cascade');
    const created = await createProjectCharacter(id, ownerId, { name: '随项目消失' });
    if (!created.ok) throw new Error(created.reason);
    expect((await listCharacters(id)).items).toHaveLength(1);
    await db.delete(projects).where(eq(projects.id, id));
    expect((await listCharacters(id)).items).toEqual([]);
  });
});
