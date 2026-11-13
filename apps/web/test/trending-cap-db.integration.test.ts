import { desc, eq, inArray, sql as rawSql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '../src/server/db/client';
import { discover } from '../src/server/domain/social';
import { TRENDING_CANDIDATE_CAP } from '../src/server/domain/trending';
import { likes, projects, publishedProjects, users } from '../src/server/db/schema';

/**
 * §SEC 第四十五片 — ADR-0094「仍欠①」兑现：DB 平面的行为腿。
 *
 * `trending-cap-reader.test.ts` 只证明「SQL 那一行按名字读 TRENDING_CANDIDATE_CAP、方法句读同一个
 * 常数」——是静态同源。它证明不了「数据库真的只取了 200 条」：把 `.limit(CAP)` 改成 `.limit(201)`
 * 而常数不动，静态门照绿。这一片补的正是那个物理事实。
 *
 * 夹具（ADR-0094「仍欠」里设计好的双端判别）：造 CAP+1 条公开版本，publishedAt 从新到旧编号
 * 1…CAP+1，用未来时间戳让这批**独占全库最新位置**（消除其它测试残留的干扰）。第 CAP 位给 3 个赞、
 * 第 CAP+1 位给 10 个赞，其余零互动。discover 的候选集是「按 publishedAt DESC 取前 CAP 条」，
 * 在候选集内按衰减分排序。于是：
 *   - 第 CAP 位（3 赞）在候选集内、是唯一有分的 → 必须是头一张；
 *   - 第 CAP+1 位（10 赞，分更高）被 LIMIT 截在候选集外 → 必须不出现。
 * 这个**合取命题**唯一的绿条件是「LIMIT 边界恰好切在候选集第 CAP 与 CAP+1 之间」：
 *   - 上限变小（如 CAP-1）→ 第 CAP 位被截，头一张变成零分的最新那条 → 断言一红；
 *   - 上限变大/取消（CAP+1 或更大）→ 第 CAP+1 位冒到头部 → 两条断言都红。
 * 分数更高的那条被排除，只可能因为边界——不是因为它分低。静态门再钉死「这个边界读的是方法句
 * 那个常数」，两门串联覆盖「改小 / 改大 / 手抄数字 / 跟页长」四类变异。
 *
 * 诚实记：因本机与并行 lane 共享工作树、且内存紧张，本片**没有**对 social.ts 的 `.limit(...)` 行做
 * 源码级变异臂（§SEC 系列的惯例）。双端判别力由上面的合取命题 + 静态门串联给出，并有一条「库排序
 * 自检」确保夹具真的占据第 CAP/CAP+1 名（否则是假绿，不是真证明）。源码变异臂留待安静窗口补。
 *
 * 无 Postgres 时整文件跳过（同 job-lane-idempotency 的纪律）：行为腿不能给一台没有库的宿主发假绿。
 */

const dbUp = await (async () => {
  try {
    await getDb().execute(rawSql`select 1 as ok`);
    return true;
  } catch (err) {
    console.warn('[trending-cap-db] Postgres 不可用，跳过真库行为腿：', err instanceof Error ? err.message : String(err));
    return false;
  }
})();

const N = TRENDING_CANDIDATE_CAP + 1;
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const pathOf = (index: number): string => `cap-proof-${runId}-${index}`;

let ownerId: string | null = null;
let likerIds: string[] = [];

beforeAll(async () => {
  if (!dbUp) return;
  const db = getDb();
  // 1 owner + 10 liker；likes 主键是 (userId, projectId)，给同一 project 的 N 个赞要 N 个不同 user。
  const allUsers = await db
    .insert(users)
    .values([
      { displayName: `cap-owner-${runId}`, email: `cap-owner-${runId}@nexus.test`, handle: `co${runId.replace(/\W/g, '')}` },
      ...Array.from({ length: 10 }, (_, i) => ({
        displayName: `cap-liker-${i}-${runId}`,
        email: `cap-liker-${i}-${runId}@nexus.test`,
        handle: `cl${i}${runId.replace(/\W/g, '')}`.slice(0, 40),
      })),
    ])
    .returning({ id: users.id });
  ownerId = allUsers[0]!.id;
  likerIds = allUsers.slice(1).map((u) => u.id);

  const created = await db
    .insert(projects)
    .values(Array.from({ length: N }, (_, i) => ({ ownerId: ownerId!, slug: `cap-${runId}-${i}`, name: `CAP ${i}` })))
    .returning({ id: projects.id });
  const projectIds = created.map((p) => p.id);

  // 未来时间戳 + 逐条 -1s：这批 201 条严格递增排在全库最前，且 publishedAt 只决定「谁进候选集」，
  // 不参与衰减分（分只看 likes.createdAt，仍是 now()，dayAgo=0、落在一周窗口内）。
  const base = Date.now() + 3 * 86_400_000;
  await db.insert(publishedProjects).values(
    Array.from({ length: N }, (_, i) => ({
      projectId: projectIds[i]!,
      path: pathOf(i),
      visibility: 'public' as const,
      publishedAt: new Date(base - i * 1000),
    })),
  );

  // 第 CAP 位（index N-2）3 赞 → 候选集内唯一有分；第 CAP+1 位（index N-1）10 赞 → 被边界截掉。
  const last = projectIds[N - 1]!;
  const boundary = projectIds[N - 2]!;
  await db.insert(likes).values([
    ...likerIds.slice(0, 3).map((userId) => ({ userId, projectId: boundary })),
    ...likerIds.map((userId) => ({ userId, projectId: last })),
  ]);
});

afterAll(async () => {
  if (!ownerId) return;
  const db = getDb();
  // projects ON DELETE CASCADE 带走 published_projects 与 likes（likes.project_id 也是 cascade），
  // 所以先删项目、再删用户（projects.owner_id 对 users 是 restrict）。
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(inArray(users.id, [ownerId, ...likerIds]));
});

describe.skipIf(!dbUp)('候选集上限的真库边界（CAP / CAP+1 双端判别）', () => {
  it('自检：这 CAP+1 条确实独占最新位置，第 CAP / CAP+1 名正是带 3 赞 / 10 赞的那两条', async () => {
    const head = await getDb()
      .select({ path: publishedProjects.path })
      .from(publishedProjects)
      .where(eq(publishedProjects.visibility, 'public'))
      .orderBy(desc(publishedProjects.publishedAt))
      .limit(N + 1);
    expect(head.length, `库里公开版本不足 CAP+1=${N} 条，夹具没有落地`).toBeGreaterThanOrEqual(N);
    expect(head[N - 2]!.path, '库排序第 CAP 名不是那条 3 赞的边界卡——夹具没占据边界，会是假绿').toBe(pathOf(N - 2));
    expect(head[N - 1]!.path, '库排序第 CAP+1 名不是那条 10 赞的卡——夹具没占据边界，会是假绿').toBe(pathOf(N - 1));
  });

  it('行为：第 CAP 位（3 赞）是 trending 头一张，第 CAP+1 位（10 赞、分更高）被 LIMIT 挡在候选集外', async () => {
    const result = await discover({ sort: 'trending', limit: 60 });
    expect(result.sort).toBe('trending');
    expect(result.cards.length, 'trending 没有返回任何卡').toBeGreaterThan(0);

    const top = result.cards[0]!;
    expect(top.path, '候选集内唯一有分的第 CAP 位（3 赞）没排到头一张——上限可能变小了').toBe(pathOf(N - 2));
    expect(top.score ?? 0, '头一张没有衰减分，说明likes 没进 trendScores，这条证明是空的').toBeGreaterThan(0);
    expect(
      result.cards.some((c) => c.path === pathOf(N - 1)),
      '分更高的第 CAP+1 位（10 赞）出现在结果里——LIMIT 没把它截在候选集外，上限可能变大或取消了',
    ).toBe(false);
  });

  it('判别前提：被 LIMIT 排除的第 CAP+1 位（10 赞）确实比进候选集的第 CAP 位（3 赞）分更高——它的缺席只可能来自边界', async () => {
    const db = getDb();
    const likesFor = async (path: string): Promise<number> => {
      const [row] = await db
        .select({ n: rawSql<number>`count(*)::int` })
        .from(likes)
        .innerJoin(publishedProjects, eq(likes.projectId, publishedProjects.projectId))
        .where(eq(publishedProjects.path, path));
      return row?.n ?? 0;
    };
    const boundaryLikes = await likesFor(pathOf(N - 2));
    const lastLikes = await likesFor(pathOf(N - 1));
    expect(boundaryLikes, '第 CAP 位不是 3 赞，夹具没按设计落地').toBe(3);
    expect(lastLikes, '第 CAP+1 位不是 10 赞，夹具没按设计落地').toBe(10);
    expect(lastLikes, '被排除者分数并不更高——「因边界而缺席」的论证不成立').toBeGreaterThan(boundaryLikes);
  });

  it('方法句披露的候选集上限，与这次真库行为观测到的边界是同一个数', async () => {
    const result = await discover({ sort: 'trending', limit: 60 });
    expect(result.method, 'trending 没有附带方法句（候选集上限没被披露）').toBeTruthy();
    expect(result.method, `方法句没说出这次实测的候选集上限 ${TRENDING_CANDIDATE_CAP}`).toContain(
      String(TRENDING_CANDIDATE_CAP),
    );
  });
});
