import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray, sql as rawSql } from 'drizzle-orm';
import { createNode, findPage } from '@nexus/design-model';
import { discover } from '../src/server/domain/social';
import { clearBlock, setBlock } from '../src/server/domain/blocks';
import { publishProject } from '../src/server/domain/publish';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { likes, projects, users } from '../src/server/db/schema';
import { TRENDING_WINDOW_DAYS } from '../src/server/domain/trending';

/**
 * §61 Trending 打真库。这一条要证明的不是"能排个序"，而是**它排的不是累计数**——
 * 否则这一栏就是"最多人看/赞"换了个名字，而那正是当初把它列进"排不出来"的理由。
 * 所以反向对照是同一份数据下 `popular` 给出的另一种顺序。
 */

let authorId: string;
let viewerId: string;
const fanIds: string[] = [];

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const stamp = Date.now().toString(36);
  const rows = await db
    .insert(users)
    .values([
      { displayName: 'Author', email: `tr-a+${Date.now()}@nexus.test`, handle: `tra${stamp}` },
      { displayName: 'Viewer', email: `tr-v+${Date.now()}@nexus.test`, handle: `trv${stamp}` },
      ...Array.from({ length: 6 }, (_, i) => ({
        displayName: `Fan${i}`,
        email: `tr-f${i}+${Date.now()}@nexus.test`,
        handle: `trf${i}${stamp}`,
      })),
    ])
    .returning({ id: users.id });
  authorId = rows[0]!.id;
  viewerId = rows[1]!.id;
  fanIds.push(...rows.slice(2).map((r) => r.id));
});

afterAll(async () => {
  const db = getDb();
  const ids = [authorId, viewerId, ...fanIds];
  await db.delete(projects).where(inArray(projects.ownerId, ids));
  await db.delete(users).where(inArray(users.id, ids));
});

interface Work {
  projectId: string;
  path: string;
}

async function published(name: string): Promise<Work> {
  const project = await createProject(authorId, { name, kind: 'website' });
  const document = await loadDocument(project.id);
  const page = findPage(document!, document!.activePageId) ?? document!.pages[0]!;
  const root = page.nodes[page.rootId]!;
  const node = createNode({ type: 'text', name: 'body', text: '正文', parentId: root.id });
  page.nodes[node.id] = node;
  root.children.push(node.id);
  await saveDocument(project.id, document!);
  const result = await publishProject(project.id, { visibility: 'public', createdById: authorId });
  if (!result?.ok) throw new Error('前置发布失败');
  return { projectId: project.id, path: result.publication.path };
}

/** 若干个赞，全部落到 daysAgo 那天：时间序列是真的写进库里的，不是在测试里模拟一个分数 */
async function likeCount(projectId: string, count: number, daysAgo: number): Promise<void> {
  const db = getDb();
  const at = new Date(Date.now() - daysAgo * 86_400_000);
  for (const userId of fanIds.slice(0, count)) {
    await db.insert(likes).values({ projectId, userId, createdAt: at });
  }
  const [row] = await db
    .select({ n: rawSql<number>`count(*)::int` })
    .from(likes)
    .where(eq(likes.projectId, projectId));
  expect(row?.n ?? 0).toBe(count);
}

const scoreOf = (result: Awaited<ReturnType<typeof discover>>, path: string): number =>
  result.cards.find((card) => card.path === path)?.score ?? -1;

describe('Trending 排的是最近，不是累计', () => {
  it('最近被赞的排前面；窗口外的赞不计；同一份数据下 popular 给出另一种顺序', async () => {
    const hot = await published('最近最热榜A');
    const stale = await published('最近最热榜B');
    const ancient = await published('最近最热榜C');
    await likeCount(hot.projectId, 2, 0);
    await likeCount(stale.projectId, 4, 5);
    await likeCount(ancient.projectId, 6, TRENDING_WINDOW_DAYS + 3);

    const trending = await discover({ sort: 'trending', limit: 60 });
    const rank = trending.cards.map((card) => card.path);
    expect(rank.indexOf(hot.path)).toBeLessThan(rank.indexOf(stale.path));
    expect(rank.indexOf(stale.path)).toBeLessThan(rank.indexOf(ancient.path));
    expect(scoreOf(trending, hot.path)).toBeGreaterThan(scoreOf(trending, stale.path));
    expect(scoreOf(trending, stale.path)).toBeGreaterThan(0);
    // 窗口外的 6 个赞一点不计：这条被放宽，Trending 就退回成累计数了
    expect(scoreOf(trending, ancient.path)).toBe(0);
    expect(trending.method).toContain('半衰期');

    // 反向对照：累计口径下顺序正好反过来，说明这一栏没有冒充那一栏
    const popular = await discover({ sort: 'popular', limit: 60 });
    const cumulative = popular.cards.map((card) => card.path);
    expect(cumulative.indexOf(ancient.path)).toBeLessThan(cumulative.indexOf(hot.path));
    expect(popular.method).toBe(null);
    expect(popular.cards.find((card) => card.path === hot.path)!.score).toBeUndefined();
  });

  it('屏蔽名单在 trending 里同样生效（过滤按查看者算，与排序无关）', async () => {
    // 只盯自己造的那一条：库里同时有别的用例发布的公开版本，用"有没有 /n/ 开头"当判据会串台
    const work = await published('屏蔽与trending');
    await likeCount(work.projectId, 2, 0);

    const before = await discover({ sort: 'trending', viewerId, limit: 60 });
    expect(before.cards.some((card) => card.path === work.path)).toBe(true);

    await setBlock(viewerId, authorId, 'mute');
    const after = await discover({ sort: 'trending', viewerId, limit: 60 });
    expect(after.cards.some((card) => card.path === work.path)).toBe(false);
    expect(after.hiddenAuthors).toBe(1);
    // 反向对照：换个人看，这一张还在——屏蔽是个人的视图，不是全站下架
    const still = await discover({ sort: 'trending', viewerId: fanIds[0]!, limit: 60 });
    expect(still.cards.some((card) => card.path === work.path)).toBe(true);

    await clearBlock(viewerId, authorId);
  });

  it('同分卡片的顺序是确定的：两次刷新、同一批零分卡片，顺序一模一样', async () => {
    const first = await discover({ sort: 'trending', limit: 60 });
    const second = await discover({ sort: 'trending', limit: 60 });
    const scores = first.cards.map((card) => card.score ?? 0);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);

    // 只比"两次都是零分"的那一批。整张列表逐位相等是测不了的：
    // 并行的用例正在发布与清理作品，被点过赞的卡片分数会在两次调用之间变——
    // 那正是"分数由真互动算出来"的证据，不是排序不稳定
    const zero = (result: Awaited<ReturnType<typeof discover>>) =>
      result.cards.filter((card) => (card.score ?? 0) === 0).map((card) => card.path);
    const firstZero = zero(first);
    const secondZero = new Set(zero(second));
    const stable = firstZero.filter((path) => secondZero.has(path));
    expect(stable.length).toBeGreaterThan(1);
    expect(stable).toEqual(zero(second).filter((path) => firstZero.includes(path)));
    // 零分这一堆里的相对顺序必须是发布时间倒序；同秒的再按路径倒序（路径唯一，所以是全序）
    const cards = new Map(first.cards.map((card) => [card.path, card]));
    for (let i = 1; i < stable.length; i += 1) {
      const a = cards.get(stable[i - 1]!)!;
      const b = cards.get(stable[i]!)!;
      expect(a.publishedAt.localeCompare(b.publishedAt) || a.path.localeCompare(b.path)).toBeGreaterThanOrEqual(0);
    }
  });
});
