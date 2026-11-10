import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inArray, sql as rawSql } from 'drizzle-orm';
import { createNode, findPage } from '@nexus/creative-model';
import { raisePlan } from './support/test-plan';
import { clearBlock, setBlock } from '../src/server/domain/blocks';
import { discoverCached, toggleFollow } from '../src/server/domain/social';
import { publishProject } from '../src/server/domain/publish';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { discoverCacheStats, invalidateDiscoverFor, resetDiscoverCacheForTest } from '../src/server/domain/discover-cache';
import { getDb } from '../src/server/db/client';
import { projects, publishedProjects, users } from '../src/server/db/schema';
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
