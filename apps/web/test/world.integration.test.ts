import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { addWorldNode, createWorld, removeWorldNode } from '@nexus/world-model';
import { countWorlds, loadWorld, saveWorld } from '../src/server/domain/worlds';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, users, worlds } from '../src/server/db/schema';

/**
 * §44 世界文档的存储。打真实 Postgres：世界文档是 JSONB，
 * "写得进读得出、契约外的进不来"只有在真库上才算验证过（内存里改一改看不出来）。
 */

let ownerId: string;

beforeAll(async () => {
  const db = getDb();
  const probe = await db.execute(rawSql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可用');
  const [owner] = await db
    .insert(users)
    .values({ displayName: 'Worldbuilder', email: `world+${Date.now()}@nexus.test` })
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

describe('世界文档读写（真实数据库）', () => {
  it('没有世界时返回 null，而不是凭空造一份空文档', async () => {
    const id = await newProject('World Empty');
    expect(await loadWorld(id)).toBeNull();
    expect(await countWorlds(id)).toBe(0);
  });

  it('保存后读回同一份；再保存换的是同一行', async () => {
    const id = await newProject('World Roundtrip');
    let world = createWorld('低语诸王', id);
    world = addWorldNode(world, { kind: 'characters', title: '守夜人', body: '她记得每一次日落。' });
    const first = await saveWorld(id, ownerId, world);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.reason);

    const loaded = await loadWorld(id);
    expect(loaded?.ok).toBe(true);
    if (!loaded?.ok) throw new Error(loaded && !loaded.ok ? loaded.reason : '读不出来');
    expect(loaded.document.name).toBe('低语诸王');
    expect(loaded.document.projectId).toBe(id);
    expect(loaded.document.nodes.some((n) => n.title === '守夜人')).toBe(true);
    // 模板不是内容：除了我加的那条，其余条目正文仍然是空的
    expect(loaded.document.nodes.filter((n) => n.body === '').length).toBe(
      loaded.document.nodes.length - 1,
    );

    const second = await saveWorld(id, ownerId, removeWorldNode(loaded.document, world.nodes[0]!.id));
    expect(second.ok).toBe(true);
    expect(await countWorlds(id)).toBe(1);
    const again = await loadWorld(id);
    expect(again?.ok && again.document.nodes.some((n) => n.id === world.nodes[0]!.id)).toBe(false);
  });

  it('契约外的文档进不了库，也不留半行数据', async () => {
    const id = await newProject('World Rejected');
    const world = createWorld('脏', id);
    const badKind = { ...world, nodes: [{ ...world.nodes[0]!, kind: 'vibes' }] };
    const rejected = await saveWorld(id, ownerId, badKind);
    expect(rejected.ok).toBe(false);
    if (rejected.ok) throw new Error('未知类型不该被接受');
    expect(rejected.reason).toContain('kind');

    const blankTitle = { ...world, nodes: [{ ...world.nodes[0]!, title: '   ' }] };
    expect((await saveWorld(id, ownerId, blankTitle)).ok).toBe(false);
    expect(await countWorlds(id)).toBe(0);
  });

  it('别的项目的世界不能写进来：路径上的 projectId 才是权威', async () => {
    const mine = await newProject('World Mine');
    const theirs = await newProject('World Theirs');
    const stolen = { ...createWorld('偷来的', theirs), };
    const result = await saveWorld(mine, ownerId, stolen);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('跨项目写入不该成功');
    expect(result.reason).toContain('别的项目');
    expect(await countWorlds(mine)).toBe(0);
  });

  it('删掉项目时世界跟着走（外键级联），不留孤儿行', async () => {
    const db = getDb();
    const id = await newProject('World Cascade');
    const saved = await saveWorld(id, ownerId, createWorld('随项目消失', id));
    expect(saved.ok).toBe(true);
    expect(await countWorlds(id)).toBe(1);
    await db.delete(projects).where(eq(projects.id, id));
    const rows = await db.select({ id: worlds.id }).from(worlds).where(eq(worlds.projectId, id));
    expect(rows).toEqual([]);
  });
});

describe('世界文档的形状演进（§45 加字段之后）', () => {
  it('上一版存的世界没有 links / positions，照样读得出来：default 不是摆设', async () => {
    const db = getDb();
    const id = await newProject('World Legacy');
    const legacy = createWorld('旧版形状', id) as unknown as Record<string, unknown>;
    delete legacy.links;
    delete legacy.positions;
    await db
      .insert(worlds)
      .values({ projectId: id, ownerId, name: '旧版形状', summary: '', document: legacy });

    const loaded = await loadWorld(id);
    expect(loaded?.ok).toBe(true);
    if (!loaded?.ok) throw new Error(loaded && !loaded.ok ? loaded.reason : '旧形状读不出来');
    expect(loaded.document.links).toEqual([]);
    expect(loaded.document.positions).toEqual({});
    expect(loaded.document.nodes).toHaveLength(9);
  });
});

describe('并发写入的次序（卸载时会有两个 PUT 在飞）', () => {
  it('更旧的写被拒，更新的版本留着：乱序到达不能让旧内容赢', async () => {
    const id = await newProject('World Ordering');
    const fresh = addWorldNode(createWorld('新的那份', id), { kind: 'story', title: '结局' });
    const saved = await saveWorld(id, ownerId, fresh);
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error(saved.reason);

    // 一份时间戳更早的文档：这是"卸载时补发的那次旧请求"的替身
    const stale: typeof fresh = {
      ...fresh,
      name: '旧的那份',
      updatedAt: '2000-01-01T00:00:00.000Z',
    };
    const rejected = await saveWorld(id, ownerId, stale);
    expect(rejected.ok).toBe(false);
    if (rejected.ok) throw new Error('更旧的写入不该成功');
    expect(rejected.reason).toContain('更新的世界');

    const loaded = await loadWorld(id);
    expect(loaded?.ok && loaded.document.name).toBe('新的那份');
    expect(loaded?.ok && loaded.document.nodes.some((n) => n.title === '结局')).toBe(true);
  });
});
