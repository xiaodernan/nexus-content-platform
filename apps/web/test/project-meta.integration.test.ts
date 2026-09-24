import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray, sql as rawSql } from 'drizzle-orm';
import { ProjectPatchRequestSchema } from '@nexus/schemas';
import { searchPlatform } from '../src/server/domain/search';
import { createProject, listProjects, updateProjectDescription } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, users } from '../src/server/db/schema';

/**
 * §49 项目简介。这一条要守住的不是"能不能写进去"，而是三件更容易出事的事：
 * 简介只有作者自己能改（别人的 id 传进来必须是 null，而不是"存在但看不到"）、
 * 写简介绝不能顺手把名字改掉（名字的真值在设计文档那边，§16）、
 * 空值表示"清空"而不是"没改"。
 */

const RUN = `s49${Date.now().toString(36)}`;
let ownerId: string;
let otherId: string;
const created: string[] = [];

async function newProject(name: string): Promise<string> {
  const doc = await createProject(ownerId, { name, kind: 'website' });
  created.push(doc.id);
  return doc.id;
}

async function rowOf(projectId: string) {
  const [row] = await getDb()
    .select({ name: projects.name, description: projects.description, updatedAt: projects.updatedAt, deletedAt: projects.deletedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return row!;
}

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const [owner] = await db
    .insert(users)
    .values({ displayName: `简介作者${RUN}`, email: `s49o+${RUN}@nexus.test`, handle: `s49${RUN}` })
    .returning({ id: users.id });
  const [other] = await db
    .insert(users)
    .values({ displayName: `简介路人${RUN}`, email: `s49a+${RUN}@nexus.test`, handle: `s49a${RUN}` })
    .returning({ id: users.id });
  ownerId = owner!.id;
  otherId = other!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(inArray(projects.id, created));
  await db.delete(users).where(inArray(users.id, [ownerId, otherId]));
});

describe('报文层：哪些简介算"要改"', () => {
  it('什么都不带不是合法的 PATCH，那是一次静默 no-op', () => {
    expect(ProjectPatchRequestSchema.safeParse({}).success).toBe(false);
    // 对照：显式清空是合法的
    expect(ProjectPatchRequestSchema.safeParse({ description: null }).success).toBe(true);
  });

  it('两端空白会被去掉，500 字以内通过，超一点就拒', () => {
    const trimmed = ProjectPatchRequestSchema.safeParse({ description: '  一座会下雨的王城  ' });
    expect(trimmed.success).toBe(true);
    if (trimmed.success) expect(trimmed.data.description).toBe('一座会下雨的王城');

    expect(ProjectPatchRequestSchema.safeParse({ description: '城'.repeat(500) }).success).toBe(true);
    expect(ProjectPatchRequestSchema.safeParse({ description: '城'.repeat(501) }).success).toBe(false);
  });
});

describe('库这一侧：谁能改、改成什么', () => {
  it('写入后 listProjects 就带上它；只留空白的调用是清空', async () => {
    const projectId = await newProject(`简介作品${RUN}`);
    const saved = await updateProjectDescription(ownerId, projectId, `  做给 workshop 用的一份演示${RUN}  `);
    expect(saved?.description).toBe(`做给 workshop 用的一份演示${RUN}`);
    expect((await listProjects(ownerId)).find((p) => p.id === projectId)?.description).toBe(saved?.description);

    const cleared = await updateProjectDescription(ownerId, projectId, '   ');
    expect(cleared?.description).toBeNull();
    // 对照：同一份调用换个非空值就写进去了，说明 null 不是"这条链坏掉了"
    const refilled = await updateProjectDescription(ownerId, projectId, '又写回来了一句');
    expect(refilled?.description).toBe('又写回来了一句');
  });

  it('改简介不会动名字——名字的真值在设计文档那边', async () => {
    const projectId = await newProject(`别动我的名字${RUN}`);
    const before = await rowOf(projectId);
    await updateProjectDescription(ownerId, projectId, '只写简介');
    const after = await rowOf(projectId);
    expect(after.name).toBe(before.name);
    expect(after.description).toBe('只写简介');
  });

  it('别人的项目改不了，返回 null 而不是"存在但看不到"；本人改同一个值就能改', async () => {
    const projectId = await newProject(`别人的简介${RUN}`);
    expect(await updateProjectDescription(otherId, projectId, '不该写进去')).toBeNull();
    expect((await rowOf(projectId)).description).toBeNull();

    const mine = await updateProjectDescription(ownerId, projectId, '不该写进去');
    expect(mine?.description).toBe('不该写进去');
  });

  it('软删除的项目不再接受写入（对照：删之前那条调用是成功的）', async () => {
    const projectId = await newProject(`删掉的简介${RUN}`);
    expect((await updateProjectDescription(ownerId, projectId, '删除前写的'))?.description).toBe('删除前写的');

    await getDb().update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, projectId));
    expect(await updateProjectDescription(ownerId, projectId, '删除后再写')).toBeNull();
    expect((await rowOf(projectId)).description).toBe('删除前写的');
    expect((await listProjects(ownerId)).some((p) => p.id === projectId)).toBe(false);
  });

  it('写简介会推后更新时间（项目列表按它排序，不推就等于改了东西界面却没反应）', async () => {
    const projectId = await newProject(`时间戳${RUN}`);
    const before = (await rowOf(projectId)).updatedAt.getTime();
    await new Promise((r) => setTimeout(r, 20));
    const after = (await updateProjectDescription(ownerId, projectId, '推一下时间'))?.updatedAt ?? '';
    expect(new Date(after).getTime()).toBeGreaterThan(before);
  });

  it('简介写进去之后 §165 的 projects 组才真能命中它（那条 ilike 之前是空转的）', async () => {
    const projectId = await newProject(`搜索对照${RUN}`);
    const phrase = `只有简介里才有的一句话${RUN}`;
    // 反向对照分两头：先确认这句话此时搜不到（不是搜索规则挡的，是这行还是 null）
    expect(await projectHits(phrase)).not.toContain(projectId);
    await updateProjectDescription(ownerId, projectId, phrase);
    const hits = await projectHits(phrase);
    expect(hits).toContain(projectId);
    // 命中项把简介原样带出来当 detail，而不是只报个名字
    expect((await searchPlatform(phrase, ownerId)).groups.find((g) => g.key === 'projects')?.hits[0]?.detail).toBe(phrase);
  });
});

async function projectHits(term: string): Promise<string[]> {
  const results = await searchPlatform(term, ownerId);
  return (results.groups.find((g) => g.key === 'projects')?.hits ?? []).map((h) => h.id);
}
