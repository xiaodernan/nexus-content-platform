import { NextResponse } from 'next/server';
import { currentUserOrNull } from '@/server/domain/session';
import { discover, type DiscoverSort } from '@/server/domain/social';
import { cachedDiscoverAnonymous } from '@/server/cache/discoverRouteCache';

/**
 * §61 发现列表。只承诺排得出来的三种：New / Popular / Following。
 * Trending 与 AI Picks 随结果一起返回"排不出来 + 为什么"，
 * 而不是拿累计浏览数换个名字冒充热度——那正是 §159 说的假信号。
 *
 * Anon 路径下 (`viewer` 为空) 走一个 15 秒的进程内 TTL 缓存（`cachedDiscoverAnonymous`）：
 * 发现页最贵的一组连接 + 子查询在同一 sort 下反复轰本机 DB，而答案在 15 秒尺度上完全
 * 稳定。带 viewerId 时直接算（following 按人照做；收敛炸弹：绝不把个人答案混进公共缓存）。
 */
const SORTS: DiscoverSort[] = ['new', 'popular', 'following'];

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const requested = url.searchParams.get('sort') ?? 'new';
  const sort: DiscoverSort = SORTS.includes(requested as DiscoverSort) ? (requested as DiscoverSort) : 'new';
  const viewer = await currentUserOrNull();
  if (!viewer) {
    const result = await cachedDiscoverAnonymous(sort, () => discover({ sort, viewerId: null }));
    return NextResponse.json(result);
  }
  const result = await discover({ sort, viewerId: viewer.id });
  return NextResponse.json(result);
}
