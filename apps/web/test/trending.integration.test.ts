import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray, sql as rawSql } from 'drizzle-orm';
import { createNode, findPage } from '@nexus/design-model';
import { discover } from '../src/server/domain/social';
import { clearBlock, setBlock } from '../src/server/domain/blocks';
import { publishProject } from '../src/server/domain/publish';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { likes, projects, publishedProjects, users } from '../src/server/db/schema';
import { TRENDING_WINDOW_DAYS } from '../src/server/domain/trending';

/**
 * §61 Trending 打真库。这一条要证明的不是"能排个序"，而是**它排的不是累计数**——
 * 否则这一栏就是"最多人看/赞"换了个名字，而那正是当初把它列进"排不出来"的理由。
 * 所以反向对照是同一份数据下 `popular` 给出的另一种顺序。
 */

let authorId: string;
let viewerId: string;
const fanIds: string[] = [];

/** 赞的人数 = 能给的分数上限（一人一票、权重 1）。2026-09-27 探针量到当页最高分 7.4、最低 0.2，
 *  所以 80 人足够让用例自己造的卡片压过全场，"在不在这一页"不再取决于别的用例此刻清了多少 */
const FANS = 80;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const stamp = Date.now().toString(36);
  const rows = await db
    .insert(users)
    .values([
      { displayName: 'Author', email: `tr-a+${Date.now()}@nexus.test`, handle: `tra${stamp}` },
      { displayName: 'Viewer', email: `tr-v+${Date.now()}@nexus.test`, handle: `trv${stamp}` },
      ...Array.from({ length: FANS }, (_, i) => ({
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

/**
 * 把自己的卡片顶进"前 60"这个窗口（只影响 popular 那一段的对照）。
 *
 * `discover` 的 limit 硬夹在 60，而这台开发库里积了上百条公开版本（2026-09-27 清理后 99 条、
 * 整套跑时 121 条，存量浏览量最高 151）。不给浏览量的话，"我的卡片在不在列表里"取决于别的用例
 * 此刻发布/清理了多少条——那测的是排位宽度，不是排序对不对。浏览量只进 popular 的口径
 * （views + 点赞数），trending 的分只吃互动事件，所以这一步不会把要对照的两个口径买通到同一边。
 */
async function pushIntoWindow(works: Work[], views: number): Promise<void> {
  const db = getDb();
  for (const work of works) {
    await db.update(publishedProjects).set({ views }).where(eq(publishedProjects.path, work.path));
  }
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
  // 一条语句插一批：count 可以是几十，逐行往返会把"造数据"变成用例的主要耗时
  await db.insert(likes).values(fanIds.slice(0, count).map((userId) => ({ projectId, userId, createdAt: at })));
  const [row] = await db
    .select({ n: rawSql<number>`count(*)::int` })
    .from(likes)
    .where(eq(likes.projectId, projectId));
  expect(row?.n ?? 0).toBe(count);
}

/**
 * 把发布时刻钉死。同分卡片要测的是"并列时按什么排"，而并列这件事本身不能靠运气：
 * 两条 publish 之间只隔几毫秒，撞上同一毫秒是运气、差一毫秒也是运气，
 * 所以这里显式写 published_at，让"同刻"和"谁更晚"都是用例设定的前提而不是环境量。
 */
async function pinPublishedAt(works: Work[], at: Date): Promise<void> {
  const db = getDb();
  await db.update(publishedProjects).set({ publishedAt: at }).where(inArray(publishedProjects.path, works.map((w) => w.path)));
}

const scoreOf = (result: Awaited<ReturnType<typeof discover>>, path: string): number =>
  result.cards.find((card) => card.path === path)?.score ?? -1;

describe('Trending 排的是最近，不是累计', () => {
  it('最近被赞的排前面；窗口外的赞不计；同一份数据下 popular 给出另一种顺序', async () => {
    const hot = await published('最近最热榜A');
    const stale = await published('最近最热榜B');
    const ancient = await published('最近最热榜C');
    // 赞的数量按"压过当页最高分"来定（见上面 FANS 的说明）：40 / 64 / 80 分别给出
    // 40、64×0.5^(5/3)≈20.1、0 分，前两张稳在页内，第三张落在窗口外
    await likeCount(hot.projectId, 40, 0);
    await likeCount(stale.projectId, 64, 5);
    await likeCount(ancient.projectId, 80, TRENDING_WINDOW_DAYS + 3);
    // 三张卡给同一个浏览量：popular 那一段的先后就只由点赞数决定（累计口径，80 > 40），
    // 而 trending 的分不吃浏览量，窗口外的 80 个赞仍然是 0 分
    await pushIntoWindow([hot, stale, ancient], 900);

    const trending = await discover({ sort: 'trending', limit: 60 });
    const rank = trending.cards.map((card) => card.path);
    expect(rank.indexOf(hot.path), '刚被赞过的那一张应当在列表里').toBeGreaterThanOrEqual(0);
    expect(rank.indexOf(stale.path), '窗口内但久远的那一张应当在列表里').toBeGreaterThanOrEqual(0);
    expect(rank.indexOf(hot.path)).toBeLessThan(rank.indexOf(stale.path));
    expect(scoreOf(trending, hot.path)).toBeGreaterThan(scoreOf(trending, stale.path));
    expect(scoreOf(trending, stale.path)).toBeGreaterThan(0);
    // 窗口外的 80 个赞一点不计：进得了这一页就是 0 分，进不了（-1）同样是不计。
    // 那 80 行赞真在库里，由 likeCount 里的 count(*) 断言兜着，不靠这张卡片露面证明
    expect(scoreOf(trending, ancient.path)).toBeLessThanOrEqual(0);
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
    // 这一条也要卡片稳定出现在页内：屏蔽生效的判据是"我看到了 / 我没看到"，
    // 卡片本来就挤不进前 60 的话，"没看到"就什么都不能证明
    await likeCount(work.projectId, fanIds.length, 0);

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

  /**
   * 同分排序要有卡片可测，而"卡片在不在这一页里"本身是个环境量：
   * `discover` 的 limit 硬夹在 60（见上面 pushIntoWindow 的注释），库里此刻有上百条公开版本、
   * 其中四十多条在最近 7 天里有互动 —— 于是**零分**卡片是否进得了前 60，取决于别的用例当时清了多少。
   * 2026-09-27 整套跑时它就是因此红的（"刚发布的应当在 trending 这一页里"）。
   * 所以这里自己造分数压倒全场的卡片（每人一票、80 票 = 80 分，当页最高分实测 7.4），
   * 并且把 published_at 钉死（见 pinPublishedAt）：并列、谁更晚，都是用例设定的前提而不是运气。
   *
   * 五张卡分两组，各自专挡比较器的一级：
   * - `tp-aa/bb/cc` 同一时刻发布、分数相同 → 只有"路径倒序"这一级能定先后，
   *   期望 cc > bb > aa，正好是发布顺序的反面；删掉那一级就会跟着库返回行的顺序漂。
   * - `ts-early` / `ta-late` 分数相同但 `ta-late` 更晚（路径却更小）→ 这一对专门让"时间倒序"
   *   与"路径倒序"给出矛盾答案，所以删掉时间那一级会翻面，删掉路径那一级也不会被它掩盖。
   */
  it('同分卡片的顺序是确定的：同刻靠路径倒序，跨时刻靠时间倒序，两次刷新不翻面', async () => {
    const sameInstantA = await published('tp-aa'); // 三张里最早发布，路径却最小 → 该排最后
    const sameInstantB = await published('tp-bb');
    const sameInstantC = await published('tp-cc');
    const earlier = await published('ts-early');
    const later = await published('ta-late'); // 路径比 ts-early 小：时间这一级必须赢过路径这一级
    const all = [sameInstantA, sameInstantB, sameInstantC, earlier, later];
    const likesEach = fanIds.length;
    for (const work of all) await likeCount(work.projectId, likesEach, 0);

    const now = Date.now();
    await pinPublishedAt([sameInstantA, sameInstantB, sameInstantC], new Date(now - 5 * 60_000));
    await pinPublishedAt([earlier], new Date(now - 2 * 60_000));
    await pinPublishedAt([later], new Date(now - 60_000));

    const first = await discover({ sort: 'trending', limit: 60 });
    const second = await discover({ sort: 'trending', limit: 60 });
    const scores = first.cards.map((card) => card.score ?? 0);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);

    // 前提先立住：五张全在页内、分数确实都是那 80 个赞、时刻确实是设的那样
    const byPath = new Map(first.cards.map((card) => [card.path, card]));
    const why = all.map((w) => `${w.path} 分 ${byPath.get(w.path)?.score ?? '不在页内'} @ ${byPath.get(w.path)?.publishedAt ?? '?'}`).join(' / ');
    for (const work of all) {
      const card = byPath.get(work.path);
      expect(card, `${likesEach} 个赞的「${work.path}」不在 trending 前 60 里：当页最高分 ${scores[0] ?? '空'}；五张为 ${why}`).toBeDefined();
      // 分数恰好等于那 80 个赞算出来的值：不补任何"看起来像热度"的底数
      expect(card!.score, `「${work.path}」的分不只来自那 ${likesEach} 个赞；五张为 ${why}`).toBe(likesEach);
    }
    const instantOf = (path: string) => byPath.get(path)!.publishedAt;
    expect(instantOf(sameInstantB.path), `三张同刻卡的时间没钉到一起；${why}`).toBe(instantOf(sameInstantA.path));
    expect(instantOf(sameInstantC.path), `三张同刻卡的时间没钉到一起；${why}`).toBe(instantOf(sameInstantA.path));
    expect(instantOf(earlier.path) > instantOf(sameInstantA.path), `前提：ts-early 要比同刻三张更晚；${why}`).toBe(true);
    expect(instantOf(later.path) > instantOf(earlier.path), `前提：ta-late 要比 ts-early 更晚；${why}`).toBe(true);
    // 另一组前提：路径的字典序确实和时间顺序相反，否则这两组就是空断言
    expect([later.path, earlier.path].sort((a, b) => a.localeCompare(b)), `前提：ta-late 的路径要比 ts-early 小（否则时间那级没被考验）`).toEqual([
      later.path,
      earlier.path,
    ]);

    // 期望顺序：时间倒序 → 同刻内路径倒序
    const expected = [later.path, earlier.path, sameInstantC.path, sameInstantB.path, sameInstantA.path];
    for (const [label, result] of [['第一次', first], ['第二次', second]] as const) {
      const seen = result.cards.filter((card) => expected.includes(card.path)).map((card) => card.path);
      expect(seen, `${label}那一次的并列顺序不是"时间倒序、同刻再路径倒序"；五张为 ${why}`).toEqual(expected);
    }

    // 全页检查同分段的内部次序（不只我们自己那五张）：任何一段并列都必须按 publishedAt↓ → path↓ 排
    const cards = first.cards;
    for (let i = 1; i < cards.length; i += 1) {
      if ((cards[i - 1]!.score ?? 0) !== (cards[i]!.score ?? 0)) continue;
      const a = cards[i - 1]!;
      const b = cards[i]!;
      expect(
        a.publishedAt.localeCompare(b.publishedAt) || a.path.localeCompare(b.path),
        `同分卡片 ${a.path} / ${b.path} 的先后不是"发布时间倒序、再路径倒序"`,
      ).toBeGreaterThanOrEqual(0);
    }
  });
});
