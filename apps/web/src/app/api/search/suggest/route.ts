import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserOrNull } from '@/server/domain/session';
import { searchPlatform } from '@/server/domain/search';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { badRequest, jsonError } from '@/server/http';

/**
 * §165 搜索建议（键入时那一条）。
 *
 * 建议**不是猜词**：它复用 `searchPlatform` 的同一份查询与可见性判定，只把每组前两条
 * 的标题与链接挑出来。于是"建议里有的，结果里一定有；建议里没有的，不是被藏起来了"。
 *
 * 为什么单独一条路由而不是把结果页边打边刷：结果页是整页 SSR（九组、每组一次查询），
 * 逐键调用会把九组查询乘以击键数。这里 `perGroup=2` 把代价钉住，再加一道按
 * IP+用户的限流（120 次/分钟）——自动补全是最容易被脚本放大的入口。
 */

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  q: z.string().max(200),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({ q: url.searchParams.get('q') ?? '' });
  if (!parsed.success) return badRequest(['q 最长 200 字符']);

  const viewer = await currentUserOrNull();
  const gate = await getRateLimiter().hit(rateKey('search/suggest', clientIp(request), viewer?.id ?? null), 120, 60_000);
  if (!gate.allowed) return jsonError(429, 'rate_limited', { message: '打字太快了，歇一秒再试', retryAfterMs: gate.retryAfterMs });

  const result = await searchPlatform(parsed.data.q, viewer?.id ?? null, 2);
  const suggestions = result.groups
    .flatMap((group) => group.hits.map((hit) => ({ ...hit, group: group.key, label: group.label })))
    .slice(0, 6);

  return NextResponse.json(
    { q: result.q, tooShort: result.tooShort, suggestions },
    { headers: { 'cache-control': 'no-store' } },
  );
}
