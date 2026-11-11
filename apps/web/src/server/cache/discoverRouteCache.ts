/**
 * `/api/discover` 的**匿名路**有界缓存。
 *
 * 只服务 anon 调用——看这几十行就懂：`/api/discover` 只是把 `discover()` 摊成 JSON，
 * 而 `discover()` 每次调用要算三件事：读 follow-edges（仅 following feed), 读所有 public +
 * moderation + 屏蔽过滤的连接，再每行算三条 count(*) 子查询。同 sort、同 limit
 * 的答案，15 秒内一字不差。
 *
 * **为什么 15 秒**：发现页读者点进去之后，已经走到那张真实的 path 上；这条缓存只改
 * "下次 /api/discover?sort=new 的人"看到的头部 ≤60 条，不会把谁一直挡在已经消逝的内容
 * 之外——超过 15 秒就重新算，没有人能在 256 次展示里看到陈旧数据。
 *
 * **不缓存的三条——Also 中文风格明说**：
 * - 带 viewerId（following feed 是按人照做的，投票/屏蔽影响结果，这条路绝不把任何人
 *   的可读片段混进公共缓存——§60 明说这种分享是不允许的）；
 * - 出错（抛出什么都不缓存，错误保持第一现场）；
 * - 未经调用方拆包的 rejection（"id/hasHidden" 写入缓存里会记着谁，没人知道——所以不).,
 *
 * 接受的界，明说在这里：这张映射只在一个进程内生效——多实例部署每个实例在自己的 TTL
 * 过后各自重算（这正是短 TTL 应该做的：不共享空白、不要共享肮脏读，不要试图成为
 * "正确答案"）。多实例下 debounce / 跨实例广播由 redisBus 承担，不在这个导出上。
 */
import { TtlLru } from './ttlLru';
import type { DiscoverResult, DiscoverSort } from '@/server/domain/social';

export const DISCOVER_ROUTE_TTL_MS = 15_000;

const cache = new TtlLru<string, DiscoverResult>({ maxEntries: 8, defaultTtlMs: DISCOVER_ROUTE_TTL_MS });

const keyOf = (sort: DiscoverSort): string => `anon:${sort}`;

/**
 * 返回 anon discover 的缓存内容——命中即还，未命中就重新算并填进去。
 * 运行时安全：`compute()` 只有一条 `discover()` 调用链；内层抛的是什么，
 * 这个函数就是什么，缓存里不留疤。
 */
export async function cachedDiscoverAnonymous(sort: DiscoverSort, compute: () => Promise<DiscoverResult>): Promise<DiscoverResult> {
  const hit = cache.get(keyOf(sort));
  if (hit) return hit;
  const fresh = await compute();
  cache.set(keyOf(sort), fresh);
  return fresh;
}

/** 写入路径侧：删一个 `discover()` 到 `/api/discover` 的那层薄锈。*/
export function invalidateDiscoverRoute(): void {
  cache.clear();
}
