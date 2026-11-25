import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { gateIp, getRateLimiter, rateKey, IP_RATE_RULES } from '@/server/security/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/insight/login { password } —— 洞察台（/insight）的公共口令门。
 *
 * 产品决策（2026-11-15，用户拍板）：口令为 `123`，任何知道口令的人都可以进入
 * 「观察所有用户的统计数据 · 趋势预测 · 深度优化建议」——页面**只展示聚合数据**，
 * 不出邮箱、token、密钥、单人明细。这道门挡的是路过的手，不是蓄意的人，
 * 因此不给它包装成某种「安全边界」：它是门铃，不是保险柜（§159 口径）。
 * 口令可用环境变量 `NEXUS_INSIGHT_PASSWORD` 覆盖（默认 123）；换了之后所有现场用户
 * 都要重输，改口令 = 产品决策。
 * 限流：按 IP 30 次 / 5 分钟，穷举 123 这种三位数没有意义，但脚本也没必要无成本地刷。
 */
const INSIGHT_PASSWORD = process.env.NEXUS_INSIGHT_PASSWORD ?? '123';
export const INSIGHT_COOKIE = 'nexus-insight';

export async function POST(request: Request) {
  const ip = gateIp(request);
  if (ip) {
    const rule = IP_RATE_RULES['insight/login'];
    const rl = await getRateLimiter().hit(rateKey('insight/login', ip), rule.limit, rule.windowMs);
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, error: 'rate-limited', retryAfterMs: rl.retryAfterMs }, { status: 429 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid-json' }, { status: 400 });
  }
  const password = (body as { password?: unknown } | null)?.password;
  if (typeof password !== 'string' || password !== INSIGHT_PASSWORD) {
    return NextResponse.json({ ok: false, error: 'wrong-password' }, { status: 401 });
  }

  const store = await cookies();
  store.set(INSIGHT_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return NextResponse.json({ ok: true });
}
