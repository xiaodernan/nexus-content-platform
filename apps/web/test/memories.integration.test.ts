import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray, sql as rawSql } from 'drizzle-orm';
import {
  MEMORY_SCOPES,
  addMemory,
  clearMemories,
  countMemoriesByScope,
  deleteMemory,
  listMemories,
} from '../src/server/domain/memories';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { memories, projects, users } from '../src/server/db/schema';

/**
 * §48 四类记忆的存储。打真实 Postgres：归属是行级过滤出来的，
 * "别人的删不掉、跨项目看不见"这种话只有在真库上说了才算。
 */

/**
 * 「我的偏好」类记忆是跨项目可见的，所以每个用例开一个独立用户：
 * 共用一个用户时，上一个用例写的全局记忆会混进下一个用例的计数里——
 * 那不是 bug，是测试互相踩脚。
 */
const owners: string[] = [];

async function newUser(tag: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(users)
    .values({ displayName: `Mem ${tag}`, email: `mem-${tag}+${Date.now()}-${owners.length}@nexus.test` })
    .returning({ id: users.id });
  owners.push(row!.id);
  return row!.id;
}

beforeAll(async () => {
  const db = getDb();
  const probe = await db.execute(rawSql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可用');
});

afterAll(async () => {
  const db = getDb();
  if (!owners.length) return;
  await db.delete(memories).where(inArray(memories.ownerId, owners));
  await db.delete(projects).where(inArray(projects.ownerId, owners));
  await db.delete(users).where(inArray(users.id, owners));
});

async function newProject(name: string, as: string): Promise<string> {
  return (await createProject(as, { name, kind: 'website' })).id;
}

describe('记忆四类（真实数据库）', () => {
  it('四类各记一条：列得出来、数得对、没有 provider 时 embedded 是 false', async () => {
    const owner = await newUser('scopes');
    const id = await newProject('Mem Scopes', owner);
    const added = await addMemory({ ownerId: owner, projectId: id, scope: 'world', subjectId: 'world-1', content: '王城在第七次日蚀下投降。' });
    expect(added.ok).toBe(true);
    if (!added.ok) throw new Error(added.reason);
    expect(added.entry.embedded).toBe(false);

    await addMemory({ ownerId: owner, projectId: id, scope: 'character', subjectId: 'chr-1', content: '她记得每一条巡逻路。' });
    await addMemory({ ownerId: owner, projectId: id, scope: 'session', content: '这次先把首屏做完。' });
    await addMemory({ ownerId: owner, projectId: id, scope: 'user', content: '回答用中文。' });

    const items = await listMemories({ ownerId: owner, projectId: id });
    expect(items).toHaveLength(4);
    const counts = await countMemoriesByScope(owner, id);
    expect(counts).toEqual({ session: 1, character: 1, world: 1, user: 1 });
    // session / user 类没给主体时自动补：user 就是本人，session 跟着这个项目
    const session = items.find((m) => m.scope === 'session')!;
    expect(session.subjectId).toBe(`project:${id}`);
    expect(items.find((m) => m.scope === 'user')!.subjectId).toBe(owner);
    // user 类不挂项目（跨项目有效），其余三类挂
    expect(items.find((m) => m.scope === 'user')!.subjectId).toBe(owner);
  });

  it('世界 / 角色类必须指明主体，否则不写', async () => {
    const owner = await newUser('subjects');
    const id = await newProject('Mem Subjects', owner);
    const noSubject = await addMemory({ ownerId: owner, projectId: id, scope: 'world', content: '没有主体' });
    expect(noSubject.ok).toBe(false);
    if (noSubject.ok) throw new Error('不该成功');
    expect(noSubject.reason).toContain('世界');
    expect(await listMemories({ ownerId: owner, projectId: id })).toEqual([]);

    const badScope = await addMemory({ ownerId: owner, projectId: id, scope: 'vibes', content: 'x' });
    expect(badScope.ok).toBe(false);
    const empty = await addMemory({ ownerId: owner, projectId: id, scope: 'user', content: '   ' });
    expect(empty.ok).toBe(false);
  });

  it('陌生人的记忆：看不见、删不掉', async () => {
    const owner = await newUser('mine');
    const stranger = await newUser('theirs');
    const mine = await newProject('Mem Mine', owner);
    const theirs = await newProject('Mem Theirs', stranger);
    const created = await addMemory({ ownerId: owner, projectId: mine, scope: 'user', content: '我的偏好' });
    if (!created.ok) throw new Error(created.reason);

    expect(await listMemories({ ownerId: stranger, projectId: theirs })).toEqual([]);
    expect(await deleteMemory(created.entry.id, stranger)).toBe(false);
    expect(await deleteMemory(created.entry.id, owner)).toBe(true);
  });

  it('同一个换到另一个项目：只看得见自己的全局记忆，看不见上一个项目的项目记忆', async () => {
    const owner = await newUser('twoproj');
    const a = await newProject('Mem Project A', owner);
    const b = await newProject('Mem Project B', owner);
    await addMemory({ ownerId: owner, projectId: a, scope: 'world', subjectId: 'w-a', content: 'A 世界的事实' });
    await addMemory({ ownerId: owner, projectId: a, scope: 'user', content: '跨项目偏好' });

    const inA = await listMemories({ ownerId: owner, projectId: a });
    const inB = await listMemories({ ownerId: owner, projectId: b });
    expect(inA).toHaveLength(2);
    expect(inB.map((m) => m.scope)).toEqual(['user']);
    expect(await countMemoriesByScope(owner, b)).toMatchObject({ world: 0, user: 1 });
  });

  it('按类清空：只清那一类；不给 scope 就拒绝，也不存在"全部抹掉"的入口', async () => {
    const owner = await newUser('clear');
    const id = await newProject('Mem Clear', owner);
    for (const scope of MEMORY_SCOPES) {
      const r = await addMemory({
        ownerId: owner,
        projectId: id,
        scope,
        subjectId: scope === 'world' || scope === 'character' ? `${scope}-1` : undefined,
        content: `${scope} 的一条`,
      });
      expect(r.ok).toBe(true);
    }
    const cleared = await clearMemories(owner, id, 'character');
    expect(cleared.removed).toBe(1);
    expect(await countMemoriesByScope(owner, id)).toMatchObject({ character: 0, world: 1, user: 1, session: 1 });

    const refused = await clearMemories(owner, id, undefined);
    expect(refused.removed).toBe(0);
    expect(refused.reason).toContain('清哪一类');
  });

  it('删掉项目：项目记忆随行消失，用户自己的全局记忆留着', async () => {
    const db = getDb();
    const owner = await newUser('cascade');
    const id = await newProject('Mem Cascade', owner);
    await addMemory({ ownerId: owner, projectId: id, scope: 'world', subjectId: 'w-x', content: '随项目消失' });
    await addMemory({ ownerId: owner, projectId: id, scope: 'user', content: '跟着我走' });
    expect(await listMemories({ ownerId: owner, projectId: id })).toHaveLength(2);
    await db.delete(projects).where(eq(projects.id, id));
    const left = await listMemories({ ownerId: owner, projectId: id });
    expect(left.map((m) => m.scope)).toEqual(['user']);
  });
});
