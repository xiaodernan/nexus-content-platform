import { raisePlan } from './support/test-plan';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { GameDocumentSchema } from '@nexus/schemas';
import { compileForKind, compileGame, createGame, entitiesOfKind, setStat, type GameDocument } from '@nexus/game-model';
import { publishProject, resolvePublishedPath } from '../src/server/domain/publish';
import { saveGame } from '../src/server/domain/games';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, publishedProjects, users } from '../src/server/db/schema';

/**
 * §50 / ADR-0009：公开可玩读的是"发布那一刻钉住的那一份"。
 * 这里最要紧的一条是中间那次：作者改完工作稿、**没有重新发布**，公开的那一份必须一个字节都不动。
 * 少这一条断言，"直接读 games 工作稿"的错误实现就能全绿通过——它平时看起来是对的，
 * 只在"分享出去之后作者又改了"这一刻才错，而那一刻正是用户最先撞的时候。
 */

let ownerId: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const [row] = await db
    .insert(users)
    .values({ displayName: 'GameDev', email: `gp+${Date.now()}@nexus.test`, handle: `gp${Date.now().toString(36)}` })
    .returning({ id: users.id });
  ownerId = row!.id;
  await raisePlan(ownerId);
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
});

function gameWith(enemyHealth: number, stamp: string): GameDocument {
  let doc = createGame(`关卡 ${stamp}`, null);
  const enemy = entitiesOfKind(doc, 'enemy')[0]!;
  const player = entitiesOfKind(doc, 'player')[0]!;
  doc = setStat(doc, enemy.id, 'health', enemyHealth).document;
  doc = setStat(doc, player.id, 'attackPower', 10).document;
  // saveGame 拒收"比库里更旧的写"，所以每次造一份都要往前走时间
  doc = { ...doc, updatedAt: new Date(Date.now() + Math.round(enemyHealth)).toISOString() };
  return doc;
}

async function gameProject(name: string): Promise<string> {
  const project = await createProject(ownerId, { name, kind: 'game' });
  return project.id;
}

async function enemyHealthOf(path: string): Promise<number> {
  const page = await resolvePublishedPath(path);
  if (!page) throw new Error(`公开路径读不出来：${path}`);
  const parsed = GameDocumentSchema.safeParse(page.gameDocument);
  if (!parsed.success) throw new Error(`钉住的文档解析不出来：${parsed.error.issues[0]?.message}`);
  return compileGame(parsed.data as unknown as GameDocument).enemies[0]?.health ?? -1;
}

describe('发布钉住游戏设计', () => {
  it('发布时钉住当时那份；改工作稿不重新发布，公开的那一份不动', async () => {
    const projectId = await gameProject('钉住测试');
    const first = await saveGame(projectId, ownerId, gameWith(10, 'a'));
    expect(first.ok).toBe(true);
    const published = await publishProject(projectId, { visibility: 'public', createdById: ownerId });
    if (!published?.ok) throw new Error('前置发布失败');
    const path = published.publication.path;

    expect(published.publication.hasGame).toBe(true);
    expect(await enemyHealthOf(path)).toBe(10);

    // 作者把敌人血量调到 999，但**没有重新发布**
    const edited = await saveGame(projectId, ownerId, gameWith(999, 'b'));
    expect(edited.ok).toBe(true);
    expect(await enemyHealthOf(path)).toBe(10);

    // 重新发布才换：版本号也往前走，公开页说的是"第几版"
    const again = await publishProject(projectId, { visibility: 'public', createdById: ownerId });
    if (!again?.ok) throw new Error('第二次发布失败');
    expect(again.publication.version).toBe(published.publication.version + 1);
    expect(await enemyHealthOf(path)).toBe(999);
  });

  it('§51 的类型跟着文档进发布快照：存 interactive-story，钉住那份读出来还是它', async () => {
    const projectId = await gameProject('对话游戏');
    const doc: GameDocument = { ...gameWith(10, 'story'), kind: 'interactive-story' };
    expect((await saveGame(projectId, ownerId, doc)).ok).toBe(true);
    const published = await publishProject(projectId, { visibility: 'public', createdById: ownerId });
    if (!published?.ok) throw new Error('前置发布失败');

    const page = await resolvePublishedPath(published.publication.path);
    const parsed = GameDocumentSchema.safeParse(page?.gameDocument);
    if (!parsed.success) throw new Error(`钉住的文档读不出来：${parsed.error.issues[0]?.message}`);
    expect(parsed.data.kind).toBe('interactive-story');
    // 分派点就吃这个字段：这一版该出对话投影，而不是 2D 关卡
    expect(compileForKind(parsed.data as unknown as GameDocument).pipeline).toBe('story');

    // 反向对照：把 kind 从这份**合法**的钉住文档里整个去掉（§51 之前的老行就是这个形状），
    // 要读出 2d 并落到 topdown——证明缺省真的在起作用，而不是这个字段一直被人剥掉
    const without = { ...parsed.data } as Record<string, unknown>;
    delete without.kind;
    const legacy = GameDocumentSchema.safeParse(without);
    expect(legacy.success && legacy.data.kind).toBe('2d');
    expect(compileForKind(legacy.data as unknown as GameDocument).pipeline).toBe('topdown');

    // 清单之外的类型进不了库：写路径上也得是这道门，不能只在读的时候挑
    const dirty = await saveGame(projectId, ownerId, {
      ...doc,
      kind: 'open-world' as never,
      updatedAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(dirty.ok).toBe(false);
    if (!dirty.ok) expect(dirty.reason).toContain('kind');
  });

  it('没有游戏设计的项目：这一版没钉住东西，公开页不该出现试玩入口', async () => {
    const projectId = await gameProject('只有设计稿');
    const published = await publishProject(projectId, { visibility: 'public', createdById: ownerId });
    if (!published?.ok) throw new Error('前置发布失败');
    expect(published.publication.hasGame).toBe(false);
    const page = await resolvePublishedPath(published.publication.path);
    expect(page?.gameDocument).toBe(null);
  });

  it('切成 private 之后整条公开路径不可达（play 复用同一个判定，不抄第二份谓词）', async () => {
    const projectId = await gameProject('要下架的关卡');
    expect((await saveGame(projectId, ownerId, gameWith(5, 'c'))).ok).toBe(true);
    const published = await publishProject(projectId, { visibility: 'public', createdById: ownerId });
    if (!published?.ok) throw new Error('前置发布失败');
    expect(await resolvePublishedPath(published.publication.path)).not.toBe(null);

    const off = await publishProject(projectId, { visibility: 'private', createdById: ownerId });
    if (!off?.ok) throw new Error('下架失败');
    expect(await resolvePublishedPath(published.publication.path)).toBe(null);
    // 反向对照：行还在（下架不删历史），只是公开路径不再认它
    const [row] = await getDb()
      .select({ visibility: publishedProjects.visibility })
      .from(publishedProjects)
      .where(eq(publishedProjects.id, off.publication.id));
    expect(row?.visibility).toBe('private');
  });

  it('钉住的文档坏得读不出来时，是"坏了"而不是"没有内容"', async () => {
    const projectId = await gameProject('坏掉的钉');
    expect((await saveGame(projectId, ownerId, gameWith(7, 'd'))).ok).toBe(true);
    const published = await publishProject(projectId, { visibility: 'public', createdById: ownerId });
    if (!published?.ok) throw new Error('前置发布失败');
    await getDb()
      .update(publishedProjects)
      .set({ gameDocument: { entities: [{ kind: 'nope' }] } })
      .where(eq(publishedProjects.id, published.publication.id));

    const page = await resolvePublishedPath(published.publication.path);
    expect(page).not.toBe(null);
    expect(page?.gameDocument).not.toBe(null);
    const parsed = GameDocumentSchema.safeParse(page?.gameDocument);
    expect(parsed.success).toBe(false);
    // 反向对照：换回一份合法钉住的文档，同一个解析入口就给得出关卡——
    // 少了这一条，"永远解析失败"的实现也能通过上面那行
    await getDb()
      .update(publishedProjects)
      .set({ gameDocument: gameWith(7, 'd') })
      .where(eq(publishedProjects.id, published.publication.id));
    expect(await enemyHealthOf(published.publication.path)).toBe(7);
  });
});
