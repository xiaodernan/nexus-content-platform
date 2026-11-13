import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoverResult } from '@/server/domain/social';
import { __resetDiscoverCacheDriverForTests, DISCOVER_REDIS_URL_ENV } from '@/server/cache/discoverRedis';

/**
 * § 发现页 anon 缓存的**语义契约**——`cachedDiscoverAnonymous` / `invalidateDiscoverRoute` 那一层。
 *
 * `discover-redis.integration.test.ts` 测的是驱动（跨进程共享、TTL、故障不静默降级），
 * `ttl-lru.test.ts` 测的是数据结构（有界 + 到期）。夹在中间这一层——"命中就不再算、出错不把错误记住、
 * 写入路径一 invalidate 就把窗口清空、不同 sort 各算各的"——此前**一件都没被钉**，
 * 而这几条正是 `discoverRouteCache.ts` 顶部注释白纸黑字声称的保证。
 *
 * 这一片用内存驱动（不设 NEXUS_REDIS_URL，零外部依赖）把它确定性地测出来：compute 是可数的替身，
 * 命中/未命中/抛错/invalidate 全是同步可观察的，不连库、不起 Redis、不改源码、低内存宿主也跑得动。
 * route 层"带 viewer 绝不进公共缓存"由 route.ts 的分支结构保证，末尾一条静态门钉住它不会被改回去。
 */

const ROUTE = join(process.cwd(), 'apps/web/src/app/api/discover/route.ts');

const sample = (tag: string): DiscoverResult => ({
  sort: 'new',
  cards: [
    {
      publicationId: `pub-${tag}`,
      path: `/n/owner/${tag}`,
      name: `Pub ${tag}`,
      owner: 'Owner',
      handle: 'owner',
      publishedAt: new Date(0).toISOString(),
      views: 0,
      likes: 0,
      comments: 0,
      remixes: 0,
      kind: 'website',
      coverAssetId: null,
      ownerHandle: 'owner',
    },
  ],
  hiddenAuthors: 0,
  method: null,
  unavailable: [],
});

beforeEach(() => {
  vi.stubEnv(DISCOVER_REDIS_URL_ENV, ''); // 内存驱动
  __resetDiscoverCacheDriverForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  __resetDiscoverCacheDriverForTests();
});

describe('cachedDiscoverAnonymous — anon 路有界缓存的语义', () => {
  it('未命中才算一次、并记住结果；窗口内第二次命中不再调用 compute', async () => {
    const { cachedDiscoverAnonymous } = await import('@/server/cache/discoverRouteCache');
    let calls = 0;
    const compute = async () => {
      calls += 1;
      return sample('fresh');
    };

    const first = await cachedDiscoverAnonymous('new', compute);
    const second = await cachedDiscoverAnonymous('new', compute);

    expect(first.cards[0]!.publicationId).toBe('pub-fresh');
    expect(second.cards[0]!.publicationId).toBe('pub-fresh');
    expect(calls, '窗口内重复读必须压成一次 compute，否则缓存没起作用').toBe(1);
  });

  it('compute 抛错时原样 reject，且不把这次失败写成缓存（下一次仍会重算）', async () => {
    const { cachedDiscoverAnonymous } = await import('@/server/cache/discoverRouteCache');
    let calls = 0;
    const compute = async (): Promise<DiscoverResult> => {
      calls += 1;
      throw new Error('upstream blew up');
    };

    await expect(cachedDiscoverAnonymous('new', compute)).rejects.toThrow('upstream blew up');
    // 错误之后换一个会成功的 compute；若失败被缓存了，这里会拿到旧的 reject / 不再调用。
    const recovered = await cachedDiscoverAnonymous('new', async () => sample('recovered'));
    expect(calls, '失败没有被记住：下一次仍应真的重算').toBe(1);
    expect(recovered.cards[0]!.publicationId).toBe('pub-recovered');
  });

  it('不同 sort 各占一格：new 的结果不会被 popular 读到', async () => {
    const { cachedDiscoverAnonymous } = await import('@/server/cache/discoverRouteCache');
    const newResult = await cachedDiscoverAnonymous('new', async () => sample('new-only'));
    const popularResult = await cachedDiscoverAnonymous('popular', async () => sample('popular-only'));

    expect(newResult.cards[0]!.publicationId).toBe('pub-new-only');
    expect(popularResult.cards[0]!.publicationId, 'sort 必须参与键，不能跨排序串味').toBe('pub-popular-only');
  });

  it('invalidateDiscoverRoute 真的清空窗口：失效后下一次必须重算', async () => {
    const { cachedDiscoverAnonymous, invalidateDiscoverRoute } = await import('@/server/cache/discoverRouteCache');
    let calls = 0;
    const compute = async () => {
      calls += 1;
      return sample(`v${calls}`);
    };

    expect((await cachedDiscoverAnonymous('new', compute)).cards[0]!.publicationId).toBe('pub-v1');
    expect((await cachedDiscoverAnonymous('new', compute)).cards[0]!.publicationId, '命中，未重算').toBe('pub-v1');
    expect(calls).toBe(1);

    await invalidateDiscoverRoute();
    expect((await cachedDiscoverAnonymous('new', compute)).cards[0]!.publicationId, '失效后必须拿到新值').toBe('pub-v2');
    expect(calls, 'publish/moderation 的失效必须让窗口真的重算，否则新发布的内容 15s 内不出现').toBe(2);
  });

  // 有意不测「调用方 mutate 缓存结果会不会污染下一位读者」：内存驱动返回同一引用，Redis 驱动
  // 走 JSON 往返是值拷贝，两驱在这条上语义不同。钉任何一边都会惩罚将来统一两驱的正当修复，
  // 而当前唯一调用方 route.ts 拿到即 NextResponse.json、从不 mutate，差异不可观测。
  // 如实记在 ADR（本片「仍欠」），不在这里伪造一条保证。
});

describe('route 层：个人化答案绝不进 anon 公共缓存（静态门）', () => {
  it('带 viewer 的分支直接算 discover，只有 anon 分支走 cachedDiscoverAnonymous', () => {
    const text = readFileSync(ROUTE, 'utf8').replace(/\r\n/g, '\n');
    // 这里只钉「缓存调用被 anon 块包住」，不把应答写法写死——返回头由下面那片门单独钉，
    // 两片各自只管一件事，改 response header 不该牵连这条缓存归属门（反向对照：门不惩罚正当改动）。
    const anonBranch = /if \(!viewer\)\s*\{[\s\S]*?cachedDiscoverAnonymous\(sort,[\s\S]*?\)[\s\S]*?\}/.exec(text);
    expect(anonBranch, 'anon 分支不再包住 cachedDiscoverAnonymous——谁在缓存私人答案就说不清了').not.toBeNull();
    // 登录分支必须是直接 discover({ sort, viewerId: viewer.id })，不能经缓存
    const viewerBranch = /const result = await discover\(\{\s*sort,\s*viewerId: viewer\.id\s*\}\)/.exec(text);
    expect(viewerBranch, '带 viewer 的路径不再直接算——private/following 的私人答案可能混进公共键').not.toBeNull();
    // 全文件只有 anon 那一处碰缓存，没有第二条调用点
    const calls = text.split('cachedDiscoverAnonymous(').length - 1;
    expect(calls, '缓存调用点不止一处，个人化答案可能从别处漏进去').toBe(1);
  });
});

describe('discoverResponseHeaders — /api/discover 应答的 HTTP 缓存契约（纯数据门）', () => {
  it('anon 分支：Vary: Cookie + no-store，且不误加 private', async () => {
    const { discoverResponseHeaders } = await import('@/server/cache/discoverRouteCache');
    const headers = discoverResponseHeaders(false);
    expect(headers.vary, '同一 URL 对 anon / 登录内容不同，Cookie 必须进缓存键，否则中间缓存会串味').toBe('Cookie');
    expect(headers['cache-control'], '下游不许存，否则绕过服务端 15s invalidate').toContain('no-store');
    expect(headers['cache-control'], 'anon 结果不是某个用户的私人数据，不必标 private').not.toContain('private');
  });

  it('登录分支：Vary: Cookie + private, no-store', async () => {
    const { discoverResponseHeaders } = await import('@/server/cache/discoverRouteCache');
    const headers = discoverResponseHeaders(true);
    expect(headers.vary, '登录分支同样随 Cookie 变化，Vary 不能缺').toBe('Cookie');
    expect(headers['cache-control'], '登录结果属于单个用户，private 挡住共享缓存').toContain('private');
    expect(headers['cache-control'], '登录分支同样不许下游存').toContain('no-store');
  });

  it('两分支都不许声称可被共享缓存存储：无 public / max-age / s-maxage / immutable', async () => {
    const { discoverResponseHeaders } = await import('@/server/cache/discoverRouteCache');
    for (const authenticated of [false, true]) {
      const cc = discoverResponseHeaders(authenticated)['cache-control'];
      expect(cc, `authenticated=${authenticated} 缺 no-store`).toMatch(/\bno-store\b/);
      expect(cc, `不许 public：共享缓存存下 anon / 登录结果都会串味`).not.toMatch(/\bpublic\b/);
      expect(cc, `不许 max-age / s-maxage：下游一存就绕过服务端 invalidate 的 15s 承诺`).not.toMatch(/\bmax-age\b|\bs-maxage\b/);
      expect(cc, `不许 immutable：内容会随发布 / 过审变化`).not.toMatch(/\bimmutable\b/);
    }
  });
});

describe('route 层：两个应答分支都挂上 discoverResponseHeaders（静态接线门）', () => {
  it('anon 传 false、登录传 true，任何分支都不许退回裸 NextResponse.json(result)', () => {
    const text = readFileSync(ROUTE, 'utf8').replace(/\r\n/g, '\n');
    const anonReturn = /return NextResponse\.json\(result,\s*\{\s*headers:\s*discoverResponseHeaders\(\s*false\s*\)\s*\}\);/.exec(text);
    const viewerReturn = /return NextResponse\.json\(result,\s*\{\s*headers:\s*discoverResponseHeaders\(\s*true\s*\)\s*\}\);/.exec(text);
    expect(anonReturn, 'anon 分支没接 discoverResponseHeaders(false)——应答缺 Vary/no-store').not.toBeNull();
    expect(viewerReturn, '登录分支没接 discoverResponseHeaders(true)——私人结果可能被共享缓存存下').not.toBeNull();
    // 凡是 return 出去的 json 应答都不得超过「带 headers」这一种形态：漏接一门就会静默退回无头应答。
    const bareReturns = text.match(/return NextResponse\.json\(result\);/g) ?? [];
    expect(bareReturns, '仍有裸 NextResponse.json(result)——该分支会退回无缓存头应答').toHaveLength(0);
    const jsonCalls = text.split('NextResponse.json(').length - 1;
    expect(jsonCalls, '应答点数量变了（不是 2），需重新核对每个分支是否都挂了头').toBe(2);
  });
});
