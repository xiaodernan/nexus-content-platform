/**
 * `/api/discover` 的 anon 路有界缓存。
 *
 * 只服务 anon 调用——看这几十行就懂：`/api/discover` 只是把 `discover()` 摊成 JSON，
 * 而 `discover()` 每次调用要算三件事：读 follow-edges（仅 following feed），读所有 public +
 * moderation + 屏蔽过滤的连接，再每行算三条 count(*) 子查询。同 sort、同 limit
 * 的答案，15 秒内一字不差。
 *
 * **为什么 15 秒**：发现页读者点进去之后，已经走到那张真实的 path 上；这条缓存只改
 * "下次 /api/discover?sort=new 的人"看到的头部 ≤60 条，不会把谁一直挡在已经消逝的内容
 * 之外——超过 15 秒就重新算，没有人能在 256 次展示里看到陈旧数据。
 *
 * **运行驱动**：单进程开发/测试 → `MemoryDiscoverCache`（与 Redis 同形状）；
 * 设 `NEXUS_REDIS_URL` → `RedisDiscoverCache`（按 sort 共享同一份窗口，实例之间零重复）。
 *
 * **不缓存的三条**——明说在这里：
 * - 带 viewerId（following feed 是按人照做的）；
 * - 出错（抛什么都不缓存，错误保持第一现场）；
 * - 未经调用方拆包的 rejection（写入缓存里会记着谁，没人知道——所以不）。
 *
 * 接受的界：缓存命中时各计各的——"51 秒前谁改了一笔计数"这个粒度，对任何读都不是可见差异。
 * 跨实例一致性由 Redis 侧 TTL 兜底，不由强一致事务兜底（强一致要分布式信号量才难吃下）。
 */
import type { DiscoverResult, DiscoverSort } from '@/server/domain/social';
import { getDiscoverCache } from './discoverRedis';

export async function cachedDiscoverAnonymous(
  sort: DiscoverSort,
  compute: () => Promise<DiscoverResult>,
): Promise<DiscoverResult> {
  const cache = getDiscoverCache();
  const hit = await cache.get(sort);
  if (hit) return hit;
  const fresh = await compute();
  await cache.set(sort, fresh);
  return fresh;
}

/** The two public write paths (publish + moderation verdict) call this to drain the route's 15s window. */
export async function invalidateDiscoverRoute(): Promise<void> {
  await getDiscoverCache().clear();
}

/**
 * `/api/discover` 应答的 HTTP 缓存契约（§ 计网 × 前后端协同）。
 *
 * 放在这一层、和上面那个 15s 服务端窗口同一个模块，不是随手：这两条头各自护着一件这里发生的事——
 *
 * - `Vary: Cookie`。同一个 URL（`?sort=new`）对 anon 与登录用户返回**不同内容**：登录分支按
 *   `nexus_session` 算出 following feed 与屏蔽过滤。不声明 Cookie 参与缓存键，任何中间缓存
 *   （浏览器 / CDN / 反代）都可能把一个用户的私人结果发给另一个人，或把 anon 结果端给登录者。
 *   今天写着 no-store 所以"暂时没人存"，但漏掉 Vary 正是"现在没事、以后加缓存就出事"那类欠账
 *   （§188 对 Accept-Encoding 立过的同一纪律，这里落到更危险的 cookie 维度）。
 * - `cache-control: no-store`。`invalidateDiscoverRoute()` 只清**服务端**这一层窗口；它清不了浏览器或
 *   CDN。下游若再存一层，新发布/过审内容要等那个下游自己过期才出现，"15s 内可见"的承诺被绕过、
 *   且最坏翻倍。所以下游一律不存，重复 DB 查询由服务端那层 15s 缓存挡住——两层各管一段，不重叠。
 *   登录分支额外标 `private`：这份结果属于单个用户，即使将来有人误把 no-store 放宽成短缓存，
 *   private 仍挡住共享缓存碰它。
 *
 * 返回值是纯数据，`route.ts` 两分支都用它（不手抄头字符串），门钉它不许声称可被共享缓存存储。
 */
export function discoverResponseHeaders(authenticated: boolean): Record<string, string> {
  return {
    vary: 'Cookie',
    'cache-control': authenticated ? 'private, no-store' : 'no-store',
  };
}
