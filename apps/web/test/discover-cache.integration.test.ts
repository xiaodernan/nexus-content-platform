import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray, sql as rawSql } from 'drizzle-orm';
import { createNode, findPage } from '@nexus/creative-model';
import { raisePlan } from './support/test-plan';
import { clearBlock, setBlock } from '../src/server/domain/blocks';
import { discoverCached, toggleFollow } from '../src/server/domain/social';
import { resolveCase } from '../src/server/domain/moderation';
import { publishProject, unpublishProject } from '../src/server/domain/publish';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { discoverCacheStats, invalidateDiscoverFor, resetDiscoverCacheForTest } from '../src/server/domain/discover-cache';
import { getDb } from '../src/server/db/client';
import { moderationCases, projects, users } from '../src/server/db/schema';
import type { DiscoverResult } from '../src/server/domain/social';

/**
 * §SC-41 发现页缓存的**真库**判据。打真 Postgres（禁 mock 数据库，见 docs/TESTING.md）。
 *
 * 这一片最容易被"纯单测全绿"骗过去的地方，是缓存层接在真 `discover` 上之后，
 * 会不会把既有隐私边界（`blocks.integration.test.ts:246` 那条「我屏蔽的人不该出现」）弄坏。
 * 所以这里全部经 `discoverCached` 走真加载器，验证三件事：
 * 1. 两个 viewer 的私有视图经缓存后**仍互不串味**；
 * 2. 真写路径（`setBlock` / `clearBlock` / `toggleFollow`）成功后**即时**失效，不靠 TTL；
 * 3. 命中缓存确实不再打库（用 stats.loads 的增量证明降载是真的，不是摆设）。
 *
 * 断言纪律沿用既有真库套件：库里积着上百条别人的公开版本，**不数总数**，只问"某个 path 在不在"、
 * "hiddenAuthors 是否等于预期"；重用例显式给超时，避免撞 30s 后写入还在继续、afterAll 撞外键。
 */
const HEAVY_MS = 90_000;

let authorId: string;
let fanId: string;
let strangerId: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const stamp = Date.now().toString(36);
  const rows = await db
    .insert(users)
    .values([
      { displayName: 'CacheAuthor', email: `dca+${Date.now()}@nexus.test`, handle: `dca${stamp}` },
      { displayName: 'CacheFan', email: `dcf+${Date.now()}@nexus.test`, handle: `dcf${stamp}` },
      { displayName: 'CacheStranger', email: `dcs+${Date.now()}@nexus.test`, handle: `dcs${stamp}` },
    ])
    .returning({ id: users.id });
  authorId = rows[0]!.id;
  fanId = rows[1]!.id;
  strangerId = rows[2]!.id;
  await raisePlan(authorId);
  await raisePlan(fanId);
  await raisePlan(strangerId);
});

afterAll(async () => {
  const db = getDb();
  const ids = [authorId, fanId, strangerId];
  await db.delete(projects).where(inArray(projects.ownerId, ids));
  await db.delete(users).where(inArray(users.id, ids));
});

beforeEach(() => {
  // 每个用例独立缓存视图；globalGen 按设计不归零（reset 内部保留），故不会跨用例把旧隐私缓存复活。
  resetDiscoverCacheForTest({ ttlMs: 600_000, maxEntries: 256, maxViewers: 64 });
});

let seq = 0;
async function publishedBy(owner: string): Promise<string> {
  seq += 1;
  const name = `缓存隔离作品${seq}`;
  const project = await createProject(owner, { name, kind: 'website' });
  const document = await loadDocument(project.id);
  const page = findPage(document!, document!.activePageId) ?? document!.pages[0]!;
  const root = page.nodes[page.rootId]!;
  const node = createNode({ type: 'text', name: 'body', text: '缓存可见性', parentId: root.id });
  page.nodes[node.id] = node;
  root.children.push(node.id);
  await saveDocument(project.id, document!);
  const result = await publishProject(project.id, { visibility: 'public', createdById: owner });
  if (!result?.ok) throw new Error(`前置发布失败：${!result || result.ok ? '?' : result.reason}`);
  return result.publication.path;
}

/** 与 publishedBy 同一条发布链，但把 projectId 也带出来（给需要 unpublish 的用例）。 */
async function publishedProjectBy(owner: string): Promise<{ path: string; projectId: string }> {
  seq += 1;
  const name = `缓存隔离作品${seq}`;
  const project = await createProject(owner, { name, kind: 'website' });
  const document = await loadDocument(project.id);
  const page = findPage(document!, document!.activePageId) ?? document!.pages[0]!;
  const root = page.nodes[page.rootId]!;
  const node = createNode({ type: 'text', name: 'body', text: '缓存可见性', parentId: root.id });
  page.nodes[node.id] = node;
  root.children.push(node.id);
  await saveDocument(project.id, document!);
  const result = await publishProject(project.id, { visibility: 'public', createdById: owner });
  if (!result?.ok) throw new Error(`前置发布失败：${!result || result.ok ? '?' : result.reason}`);
  return { path: result.publication.path, projectId: project.id };
}

const has = (r: DiscoverResult, path: string) => r.cards.some((c) => c.path === path);

describe('缓存接真库：隐私边界不回退', () => {
  it(
    '两个 viewer 经 discoverCached 拿各自视图；缓存命中后再读仍互不串味',
    async () => {
      const fanWork = await publishedBy(fanId);
      const authorView = await discoverCached({ sort: 'new', viewerId: authorId, limit: 60 });
      const strangerView = await discoverCached({ sort: 'new', viewerId: strangerId, limit: 60 });
      expect(has(authorView, fanWork)).toBe(true);
      expect(has(strangerView, fanWork)).toBe(true);

      // 只让 author 屏蔽 fan。stranger 与 author 的键不同，一份缓存不该漏给另一份。
      const s = await setBlock(authorId, fanId, 'mute');
      expect(s).toMatchObject({ ok: true });

      const authorAfter = await discoverCached({ sort: 'new', viewerId: authorId, limit: 60 });
      expect(has(authorAfter, fanWork)).toBe(false);
      expect(authorAfter.hiddenAuthors).toBe(1);

      // 反向对照：换个人经同一缓存层看，那张卡片还在（否则"过滤"其实是"缓存串味"）
      const strangerAfter = await discoverCached({ sort: 'new', viewerId: strangerId, limit: 60 });
      expect(has(strangerAfter, fanWork)).toBe(true);
      expect(strangerAfter.hiddenAuthors).toBe(0);

      // 再读一次 author：必须仍是过滤后的结果，不得在 TTL 内被 stranger 那份污染回来
      const authorAgain = await discoverCached({ sort: 'new', viewerId: authorId, limit: 60 });
      expect(has(authorAgain, fanWork)).toBe(false);
      await clearBlock(authorId, fanId);
    },
    HEAVY_MS,
  );

  it(
    'setBlock 即时失效：拉黑前预热缓存，拉黑后立刻看不到（不靠 TTL）',
    async () => {
      const fanWork = await publishedBy(fanId);
      // 预热：把"未屏蔽"视图写进缓存，TTL 设得极长，唯一能改它的只有失效钩子
      const before = await discoverCached({ sort: 'new', viewerId: authorId, limit: 60 });
      expect(has(before, fanWork)).toBe(true);

      await setBlock(authorId, fanId, 'mute');
      const after = await discoverCached({ sort: 'new', viewerId: authorId, limit: 60 });
      // 若失效钩子没接，这里会吃到 TTL 内的旧缓存 → 拉黑后仍看得到 → 隐私事故，判据必须红
      expect(has(after, fanWork)).toBe(false);
      expect(after.hiddenAuthors).toBe(1);
      await clearBlock(authorId, fanId);
    },
    HEAVY_MS,
  );

  it(
    'clearBlock 即时失效：解除后作品立刻回来，不等 TTL',
    async () => {
      const fanWork = await publishedBy(fanId);
      await setBlock(authorId, fanId, 'mute');
      const hidden = await discoverCached({ sort: 'new', viewerId: authorId, limit: 60 });
      expect(has(hidden, fanWork)).toBe(false);

      await clearBlock(authorId, fanId);
      const restored = await discoverCached({ sort: 'new', viewerId: authorId, limit: 60 });
      // 若失效钩子没接，这里会继续吃"屏蔽中"的缓存 → 解除后仍看不到
      expect(has(restored, fanWork)).toBe(true);
      expect(restored.hiddenAuthors).toBe(0);
    },
    HEAVY_MS,
  );

  it(
    'toggleFollow 即时失效：following 视图随关注动作重算',
    async () => {
      const fanWork = await publishedBy(fanId);
      // 未关注：following 里没有 fan 的作品
      const notFollowing = await discoverCached({ sort: 'following', viewerId: authorId, limit: 60 });
      expect(has(notFollowing, fanWork)).toBe(false);

      const state = await toggleFollow(authorId, fanId);
      expect(state.following).toBe(true);
      const following = await discoverCached({ sort: 'following', viewerId: authorId, limit: 60 });
      // 若失效钩子没接，这里会吃到"未关注"的缓存 → 关注了却看不到
      expect(has(following, fanWork)).toBe(true);

      await toggleFollow(authorId, fanId); // 取消关注，复位
      const unfollowed = await discoverCached({ sort: 'following', viewerId: authorId, limit: 60 });
      expect(has(unfollowed, fanWork)).toBe(false);
    },
    HEAVY_MS,
  );
});

describe('§SC-44 新作品即时进发现页（真库端到端：写路径 → 全局失效 → 重查）', () => {
  it(
    'public 发布后所有 viewer（含匿名）立刻看到，无需等 TTL；且屏蔽名单不被全局失效绕过',
    async () => {
      await setBlock(authorId, fanId, 'mute'); // author 屏蔽 fan，验证隐私在全局失效后仍生效
      const oldWork = await publishedBy(fanId); // 旧作品（fan 的，author 该看不到）
      const anonInput = { sort: 'new' as const, viewerId: null, limit: 60 };
      const authorInput = { sort: 'new' as const, viewerId: authorId, limit: 60 };

      // 预热缓存：此刻两份视图都缓存了，且都没有"待发布的新作品"
      await discoverCached(anonInput);
      const authorBefore = await discoverCached(authorInput);
      expect(has(authorBefore, oldWork)).toBe(false); // author 屏蔽生效
      expect(authorBefore.hiddenAuthors).toBe(1);
      const epochBefore = discoverCacheStats().globalEpoch;
      const loadsBefore = discoverCacheStats().loads;

      // 真发布一个 public 新作品（走 publishProject，内部应触发全局失效）
      const freshPath = await publishedBy(authorId);

      // 断言 1：epoch 因这次发布 +1（写路径钩子真的接上了）
      expect(discoverCacheStats().globalEpoch).toBe(epochBefore + 1);
      // 断言 2：匿名与 author 重查都能立刻看到新作品（没吃 TTL 内的旧缓存）
      const anonAfter = await discoverCached(anonInput);
      const authorAfter = await discoverCached(authorInput);
      expect(has(anonAfter, freshPath)).toBe(true);
      expect(has(authorAfter, freshPath)).toBe(true);
      // 断言 3：全局失效后 loads 增长 = 确实重查了库（不是继续命中旧键）
      expect(discoverCacheStats().loads).toBeGreaterThan(loadsBefore);
      // 断言 4（隐私不串味）：author 仍看不到被自己屏蔽的 fan 旧作品——
      // 全局失效只清缓存、不碰库里的屏蔽关系，重查后隐私过滤照旧。
      expect(has(authorAfter, oldWork)).toBe(false);
      expect(authorAfter.hiddenAuthors).toBe(1);
      expect(has(anonAfter, oldWork)).toBe(true); // 匿名没屏蔽，仍在

      await clearBlock(authorId, fanId);
    },
    HEAVY_MS,
  );

  it(
    '从 public 下架后所有 viewer 立刻看不到，无需等 TTL',
    async () => {
      const { path: victim, projectId } = await publishedProjectBy(fanId);
      const anonInput = { sort: 'new' as const, viewerId: null, limit: 60 };
      const strangerInput = { sort: 'new' as const, viewerId: strangerId, limit: 60 };

      // 预热：匿名与 stranger 都缓存了"作品还在"的视图
      expect(has(await discoverCached(anonInput), victim)).toBe(true);
      expect(has(await discoverCached(strangerInput), victim)).toBe(true);
      const epochBefore = discoverCacheStats().globalEpoch;

      // 真下架：unpublishProject 把 visibility 切回 private
      expect(await unpublishProject(projectId, fanId)).toBe(true);

      // 全局失效 + 重查：两份视图都该立刻看不到它
      expect(discoverCacheStats().globalEpoch).toBe(epochBefore + 1);
      expect(has(await discoverCached(anonInput), victim)).toBe(false);
      expect(has(await discoverCached(strangerInput), victim)).toBe(false);
    },
    HEAVY_MS,
  );

  it(
    'public 内容被人工判 rejected 后所有 viewer 立刻看不到，无需等 TTL',
    async () => {
      const { path: victim, projectId } = await publishedProjectBy(fanId);
      // publishProject 对每次 outward 发布都会立案（recordScan），取那条未结案的案卷。
      const [openCase] = await getDb()
        .select({ id: moderationCases.id })
        .from(moderationCases)
        .where(eq(moderationCases.projectId, projectId))
        .limit(1);
      expect(openCase).toBeTruthy();

      const anonInput = { sort: 'new' as const, viewerId: null, limit: 60 };
      const strangerInput = { sort: 'new' as const, viewerId: strangerId, limit: 60 };
      // 预热：两份视图都缓存了"作品还在"（pending 本就在发现页里）
      expect(has(await discoverCached(anonInput), victim)).toBe(true);
      expect(has(await discoverCached(strangerInput), victim)).toBe(true);
      const epochBefore = discoverCacheStats().globalEpoch;

      // 真裁决：rejected。resolveCase 把该 publication 的 moderation 写 rejected → 发现页收录失效。
      const outcome = await resolveCase(openCase!.id, { adminId: strangerId, resolution: 'rejected' });
      expect(outcome).toMatchObject({ ok: true, hidden: true });

      // 全局失效 + 重查：两份视图都该立刻看不到它（不该等到 TTL）
      expect(discoverCacheStats().globalEpoch).toBe(epochBefore + 1);
      expect(has(await discoverCached(anonInput), victim)).toBe(false);
      expect(has(await discoverCached(strangerInput), victim)).toBe(false);
    },
    HEAVY_MS,
  );
});

describe('降载是真的：命中不再打库', () => {
  it(
    '同 (viewer,sort,limit) 连读两次，第二次命中缓存（loads 不增）',
    async () => {
      await publishedBy(fanId);
      const input = { sort: 'new' as const, viewerId: strangerId, limit: 60 };
      // 直接走生产入口 discoverCached（它内部才包 loadDiscoverCached）。
      // 首版测试错在「外面又套一层 loadDiscoverCached」：同键嵌套 singleflight 会自等待死锁——
      // 那是夹具错，不是生产路径（生产里 discoverCached 是唯一入口、loader 是原 discover，不重入）。
      const first = await discoverCached(input);
      const loadsAfterFirst = discoverCacheStats().loads;
      const second = await discoverCached(input);
      const loadsAfterSecond = discoverCacheStats().loads;

      expect(loadsAfterFirst).toBeGreaterThanOrEqual(1);
      expect(loadsAfterSecond).toBe(loadsAfterFirst); // 第二次走命中，没再发起加载 = 没再打库
      expect(second.cards.map((c) => c.path)).toEqual(first.cards.map((c) => c.path));
      expect(discoverCacheStats().hits).toBeGreaterThanOrEqual(1);
    },
    HEAVY_MS,
  );

  it(
    'invalidate 让下一读重新打库（loads +1），证明失效真的发生',
    async () => {
      await publishedBy(fanId);
      const input = { sort: 'new' as const, viewerId: strangerId, limit: 60 };
      await discoverCached(input);
      const loadsBefore = discoverCacheStats().loads;

      invalidateDiscoverFor(strangerId);
      await discoverCached(input);
      expect(discoverCacheStats().loads).toBe(loadsBefore + 1);
    },
    HEAVY_MS,
  );
});
