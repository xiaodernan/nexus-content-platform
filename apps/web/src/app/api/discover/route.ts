import { NextResponse } from 'next/server';
import { currentUserOrNull } from '@/server/domain/session';
import { discover, type DiscoverSort } from '@/server/domain/social';

/**
 * §61 发现列表。只承诺排得出来的三种：New / Popular / Following。
 * Trending 与 AI Picks 随结果一起返回"排不出来 + 为什么"，
 * 而不是拿累计浏览数换个名字冒充热度——那正是 §159 说的假信号。
 */
const SORTS: DiscoverSort[] = ['new', 'popular', 'following'];

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const requested = url.searchParams.get('sort') ?? 'new';
  const sort: DiscoverSort = SORTS.includes(requested as DiscoverSort) ? (requested as DiscoverSort) : 'new';
  const viewer = await currentUserOrNull();
  const result = await discover({ sort, viewerId: viewer?.id ?? null });
  return NextResponse.json(result);
}
