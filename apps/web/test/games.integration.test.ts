import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { addEntity, createGame, linkEntities, removeEntity, setStat } from '@nexus/game-model';
import { gameDraft } from '../src/lib/agent-game-draft';
import { retrieveProjectKnowledge } from '../src/server/domain/knowledge';
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

/**
 * §52 接受入口的写模式（`createOnly`）。这一片的主张只有一句：
 * **接受是"多给一份东西"，不是"顶掉你已经有的那份"**。
 * 所以两道门都要真跑过：没有时写得进，已有时写不进、且原来那份逐字节没动。
 */
describe('createOnly：只在项目还没有游戏文档时写（§52 接受入口）', () => {
  const draft = (projectId: string | null) =>
    gameDraft({ goal: '接受入口测试', at: '2026-10-10T00:00:00.000Z', seed: 'games-integration', projectId });

  it('项目没有游戏时写进去，读回来的是草稿那一份内容', async () => {
    const id = await newProject('接受空档');
    const result = await saveGame(id, ownerId, draft(null), { createOnly: true });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    const loaded = await loadGame(id);
    if (!loaded?.ok) throw new Error('读不出来');
    expect(loaded.document.entities).toEqual(draft(null).entities);
    // 草稿自己声明的 projectId 是 null（它还不属于任何项目），落库后由路径决定
    expect(loaded.document.projectId).toBe(id);
  });

  it('项目已有游戏时拒绝，并且原来那份逐字节没动', async () => {
    const id = await newProject('接受不覆盖');
    const mine = addEntity(createGame('我自己的游戏', id), { kind: 'enemy', name: '我的敌人' });
    expect((await saveGame(id, ownerId, mine)).ok).toBe(true);
    const before = await getDb()
      .select({ document: games.document })
      .from(games)
      .where(eq(games.projectId, id));

    const refused = await saveGame(id, ownerId, draft(null), { createOnly: true });
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error('已经有游戏，接受却写进去了');
    // 拒绝的话要说清"已经有哪一份"，否则用户只看到一个"失败"
    expect(refused.reason).toContain('我自己的游戏');
    expect(refused.reason).toContain('不会覆盖');

    const after = await getDb()
      .select({ document: games.document })
      .from(games)
      .where(eq(games.projectId, id));
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    expect(await countGames(id)).toBe(1);
    const loaded = await loadGame(id);
    expect(loaded?.ok && loaded.document.name).toBe('我自己的游戏');
  });

  it('反向控制：同一份草稿不带 createOnly 时会覆盖——拒绝确实来自这一道门，不是文档本身有问题', async () => {
    const id = await newProject('接受门对照');
    expect((await saveGame(id, ownerId, createGame('原样', id))).ok).toBe(true);
    // 这一句是关键：草稿过不了的是 createOnly 那道门，契约与结构校验它全都过。
    // 少了这条对照，"refused" 就可能只是"这份文档本来就写不进去"的同义反复。
    // 覆盖用的那份草稿必须用"当前时刻"的时间戳：`saveGame` 里那道"更旧的写"守卫
    // （两个 PUT 乱序到达时不能让旧版本赢）会拿 updatedAt 比大小，而 `draft()` 的
    // 固定过去时间戳会被它当成过期写入拒掉——那会让这条对照假绿（证明的是守卫而非 createOnly）。
    const freshDraft = gameDraft({ goal: '接受入口测试', at: new Date().toISOString(), seed: 'games-integration', projectId: null });
    expect((await saveGame(id, ownerId, freshDraft)).ok).toBe(true);
    const loaded = await loadGame(id);
    expect(loaded?.ok && loaded.document.entities.length).toBe(freshDraft.entities.length);
  });

  it('接受写进去的草稿进得了语料库（AI 事后读得到它，§49 那条链不断）', async () => {
    const id = await newProject('接受进语料');
    expect((await saveGame(id, ownerId, draft(null), { createOnly: true })).ok).toBe(true);
    // 找一个只存在于配方表里的词：命中它就说明块体来自这份草稿，而不是项目自己的东西
    const found = await retrieveProjectKnowledge(id, '巡逻兵');
    expect(found.totalChunks, '写进库的草稿没有重建语料').toBeGreaterThan(0);
    const fromGame = found.items.filter((item) => item.sourceType === 'game');
    expect(fromGame.length, '检索结果里没有一条来自游戏文档').toBeGreaterThan(0);
    expect(fromGame.some((item) => item.snippet.includes('巡逻兵')), '游戏块里没有草稿的那句说明').toBe(true);
  });
});
