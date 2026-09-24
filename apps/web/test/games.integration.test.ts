import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { addEntity, createGame, linkEntities, removeEntity, setStat } from '@nexus/game-model';
import { countGames, loadGame, saveGame } from '../src/server/domain/games';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { games, projects, users } from '../src/server/db/schema';

/**
 * §54 游戏设计文档的存储。打真实 Postgres：文档是 JSONB，
 * "写得进读得出、契约外的进不来"只有在真库上才算验证过（与 world.integration 同一条理由）。
 */

let ownerId: string;

beforeAll(async () => {
  const db = getDb();
  const probe = await db.execute(rawSql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可用');
  const [owner] = await db
    .insert(users)
    .values({ displayName: 'Gamedesigner', email: `game+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  ownerId = owner!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
});

async function newProject(name: string): Promise<string> {
  return (await createProject(ownerId, { name, kind: 'game' })).id;
}

describe('游戏文档读写（真实数据库）', () => {
  it('没有游戏时返回 null，GET 不顺手建档', async () => {
    const id = await newProject('Game Empty');
    expect(await loadGame(id)).toBeNull();
    expect(await countGames(id)).toBe(0);
  });

  it('保存后读回同一份；再保存换的还是同一行', async () => {
    const id = await newProject('Game Roundtrip');
    let game = createGame('星屑航线', id);
    game = addEntity(game, { kind: 'weapon', name: '折跃刃', notes: '只在下落时挥得动' });
    const first = await saveGame(id, ownerId, game);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.reason);

    const loaded = await loadGame(id);
    expect(loaded?.ok).toBe(true);
    if (!loaded?.ok) throw new Error(loaded && !loaded.ok ? loaded.reason : '读不出来');
    expect(loaded.document.name).toBe('星屑航线');
    expect(loaded.document.projectId).toBe(id);
    expect(loaded.document.entities.some((e) => e.name === '折跃刃')).toBe(true);
    // 模板不是内容：11 类骨架之外我只加了一条
    expect(loaded.document.entities).toHaveLength(12);

    const again = await saveGame(id, ownerId, { ...game, summary: '一条航线，十一类零件' });
    expect(again.ok).toBe(true);
    expect(await countGames(id)).toBe(1);
    const row = await getDb().select({ id: games.id }).from(games).where(eq(games.projectId, id));
    expect(row).toHaveLength(1);
    const reread = await loadGame(id);
    expect(reread?.ok && reread.document.summary).toBe('一条航线，十一类零件');
  });

  it('文档自己的 id 以行上的 uuid 为准：模板里那个临时 id 不会留在读回的文档上', async () => {
    const id = await newProject('Game Identity');
    const game = createGame('身份', id);
    await saveGame(id, ownerId, game);
    const loaded = await loadGame(id);
    if (!loaded?.ok) throw new Error('读不出来');
    expect(loaded.document.id).not.toBe(game.id);
  });

  it('契约外的文档进不来：未知类型与非有限数值都在写门处被拒', async () => {
    const id = await newProject('Game Rejected');
    const game = createGame('脏数据', id);
    const first = game.entities[0]!;
    const badKind = await saveGame(id, ownerId, {
      ...game,
      entities: [{ ...first, kind: 'vibes' as typeof first.kind }, ...game.entities.slice(1)],
    });
    expect(badKind.ok).toBe(false);
    if (badKind.ok) throw new Error('不该写进去');
    expect(badKind.reason).toContain('契约');

    const badStat = await saveGame(id, ownerId, {
      ...game,
      entities: [{ ...first, stats: { damage: Number.NaN } }, ...game.entities.slice(1)],
    });
    expect(badStat.ok).toBe(false);
    if (badStat.ok) throw new Error('NaN 不该进得了 JSONB');
    expect(await countGames(id)).toBe(0);
  });

  it('结构不完整的进不来：指向不存在实体的引用被 validateGame 挡下', async () => {
    const id = await newProject('Game Dangling');
    const game = createGame('悬空', id);
    const first = game.entities[0]!;
    const result = await saveGame(id, ownerId, {
      ...game,
      entities: [{ ...first, refs: [{ id: 'gr-1', to: 'ge-不存在', role: '掉落' }] }, ...game.entities.slice(1)],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('悬空引用不该写进去');
    expect(result.reason).toContain('不存在的实体');
  });

  it('别的项目复制来的文档不能写进当前项目', async () => {
    const a = await newProject('Game A');
    const b = await newProject('Game B');
    const game = createGame('归属', a);
    expect((await saveGame(b, ownerId, game)).ok).toBe(false);
    expect((await saveGame(a, ownerId, game)).ok).toBe(true);
  });

  it('比库里更旧的写被拒：两个 PUT 乱序到达时旧版本不能赢', async () => {
    const id = await newProject('Game Stale');
    const fresh = createGame('新的', id);
    expect((await saveGame(id, ownerId, fresh)).ok).toBe(true);
    const stale = { ...fresh, name: '旧的', updatedAt: '2000-01-01T00:00:00.000Z' };
    const result = await saveGame(id, ownerId, stale);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('旧写不该赢');
    expect(result.reason).toContain('比这次更新');
    const loaded = await loadGame(id);
    expect(loaded?.ok && loaded.document.name).toBe('新的');
  });

  it('数值与引用走模型层改完再存：库读回来的是同一套结论', async () => {
    const id = await newProject('Game Refs');
    let game = createGame('引用', id);
    const blade = addEntity(game, { kind: 'weapon', name: '长剑' });
    const bladeEntity = blade.entities.find((e) => e.name === '长剑')!;
    game = blade;
    const stat = setStat(game, bladeEntity.id, 'damage', 21);
    expect(stat.reason).toBeNull();
    game = stat.document;
    const player = game.entities.find((e) => e.kind === 'player')!;
    const linked = linkEntities(game, bladeEntity.id, player.id, '装备于');
    expect(linked.reason).toBeNull();
    game = linked.document;

    expect((await saveGame(id, ownerId, game)).ok).toBe(true);
    const loaded = await loadGame(id);
    if (!loaded?.ok) throw new Error('读不出来');
    const back = loaded.document.entities.find((e) => e.id === bladeEntity.id)!;
    expect(back.stats.damage).toBe(21);
    expect(back.refs.map((r) => [r.to, r.role])).toEqual([[player.id, '装备于']]);
    // 删掉玩家：入边也要跟着消失，读回来的不该有悬空引用
    const pruned = removeEntity(loaded.document, player.id);
    expect((await saveGame(id, ownerId, pruned)).ok).toBe(true);
    const after = await loadGame(id);
    if (!after?.ok) throw new Error('删完之后读不回来了');
    expect(after.document.entities.flatMap((e) => e.refs)).toEqual([]);
  });
});
