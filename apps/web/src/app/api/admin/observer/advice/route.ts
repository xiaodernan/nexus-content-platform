import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readJson, jsonError } from '@/server/http';
import { getRateLimiter, rateKey, clientIp } from '@/server/security/rateLimit';
import { getAiCapabilities } from '@/lib/env';
import { currentUserOrNull } from '@/server/domain/session';
import { OBSERVER_COOKIE, OBSERVER_COOKIE_VALUE } from '../route';
import { readObserverMetrics } from '@/server/admin/observer';
import { generateAiAdvice } from '@/app/admin/observe/aiAdvice';

export const dynamic = 'force-dynamic';

/**
 * ──ADMIN-LLM-2 · 观察站「AI 深读 · 结构化清单」的服务端出口 ─────────────
 *
 * 为什么需要这一层：`ObserverAiAdvice` 是 client 组件，之前**直接 import 了
 * server-only 的 `chatWithCharacter`**——浏览器里既没有 ai-service 地址也没有
 * provider 凭据，按钮点下去只会拿到一个客户端异常。服务端调用必须留在服务端。
 *
 * 与 DeepRead 同纪律：
 *  1. 请求体只有 locale，指标由服务器用 `readObserverMetrics()` 现算（防伪造输入）；
 *  2. 口令 123 / role=admin 才可进；DEMO MODE 如实 409；
 *  3. 每 IP 5 次/小时（公开口令的页面，不能让任何人白烧 provider）；
 *  4. 失败原样返回，不回落模板建议。
 */

const IP_LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

async function observerAllowed(): Promise<boolean> {
  const user = await currentUserOrNull();
  if (user?.role === 'admin') return true;
  const store = await cookies();
  return store.get(OBSERVER_COOKIE)?.value === OBSERVER_COOKIE_VALUE;
}

export async function POST(req: Request): Promise<Response> {
  if (!(await observerAllowed())) {
    return await jsonError(401, 'not_authenticated', { message: '先带口令 123（或以 admin 身份）进只读观察站。' });
  }

  const caps = await getAiCapabilities();
  if (caps.text !== 'real') {
    return await jsonError(409, 'demo_mode', { message: 'AI provider 未就绪——当前 DEMO MODE，如实拒绝出建议（不编造）。' });
  }

  const ip = clientIp(req);
  const rl = await getRateLimiter().hit(rateKey('observer-advice', ip, 'observer'), IP_LIMIT, WINDOW_MS);
  if (!rl.allowed) {
    return await jsonError(429, 'rate_limited', { message: '次数超限（每小时 5 次），稍后再来。', retryAfterMs: rl.retryAfterMs });
  }

  const raw = await readJson(req).catch(() => null);
  const locale = raw && typeof raw === 'object' && (raw as { locale?: unknown }).locale === 'en' ? 'en' : 'zh';

  try {
    const metrics = await readObserverMetrics();
    const advice = await generateAiAdvice(metrics, locale);
    return NextResponse.json(advice, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const message = String((error as Error)?.message ?? error).slice(0, 400);
    return await jsonError(502, 'provider_failed', { message });
  }
}
