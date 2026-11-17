import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getRateLimiter, ipWriteGate, rateKey, clientIp } from '@/server/security/rateLimit';
import { jsonError } from '@/server/http';
import { chatWithCharacter } from '@/server/ai/client';
import { buildPulseDigest, readPulseMetrics } from '@/server/domain/pulse';
import { PULSE_COOKIE } from '@/server/domain/pulse-gate';
import { increment, observe } from '@/server/observability';

export const dynamic = 'force-dynamic';

const RATE_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT = 5;

/**
 * §PULSE-2 · POST /api/admin/pulse/narrate — 让大模型读这份聚合账，给出下一步优化。
 *
 * 公开口径（口令 123，见 unlock 路由）：任何人都能触发，所以：
 * - 只发聚合 digest（零个人字段，digest 由服务端现场从库里算，客户端给不了内容）；
 * - IP 10 分钟 5 次，谁喊得欢也刷不爆 provider 的钱包；
 * - provider 连不上 → 503 原样回真（§159），绝不拼模板假装「AI 已分析」。
 */
const NARRATE_SYSTEM_PROMPT = [
  '你是 NEXUS 内容平台的运营分析助手。下面是平台的聚合运营快照（没有任何个人数据）。',
  '基于这些数字给出 3 条「下一步该做什么」的建议，每条一句话，先说依据（哪个数字），再说动作。',
  '不许虚构数字；数字看不出结论的地方，就承认看不出。',
  '用提问者的语言回答：中文进中文，英文进英文。直接给 1/2/3 编号列表，不要寒暄。',
].join('\n');

export async function POST(req: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const store = await cookies();
  if (store.get(PULSE_COOKIE)?.value !== '1') {
    return jsonError(403, 'pulse-locked', { message: '先解锁公开管理台（口令 123）。' });
  }

  const ip = clientIp(req);
  const gate = await ipWriteGate('pulse/narrate', req);
  if (gate.limited) {
    return jsonError(429, 'rate_limited', { message: '模型分析太频繁了，缓一缓再来。', retryAfterMs: gate.retryAfterMs });
  }
  const rl = await getRateLimiter().hit(rateKey('pulse/narrate', ip, 'public'), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return jsonError(429, 'rate_limited', { message: '十分钟五次，缓一缓再来。', retryAfterMs: rl.retryAfterMs });
  }

  let locale = 'zh';
  try {
    const body = (await req.json()) as { locale?: unknown };
    if (body.locale === 'en') locale = 'en';
  } catch {
    // 空 body 也接受：locale 默认 zh
  }

  const metrics = await readPulseMetrics();
  const digest = buildPulseDigest(metrics);

  const result = await chatWithCharacter({
    requestId: `pulse-narrate-${Date.now()}`,
    system: NARRATE_SYSTEM_PROMPT,
    user: `语言：${locale === 'zh' ? '中文' : 'English'}\n${digest}`,
    modelClass: 'fast',
  });
  const durationMs = Date.now() - startedAt;

  if (!result.ok) {
    increment('nexus_pulse_narrate_total', { outcome: 'provider-unavailable' });
    return jsonError(result.status ?? 503, 'provider-unavailable', {
      message: locale === 'zh' ? '模型连不上——这里不会假装给分析。' : 'Model is unreachable — no fake analysis here.',
    });
  }
  increment('nexus_pulse_narrate_total', { outcome: 'answer' });
  observe('nexus_pulse_narrate_latency_ms', durationMs, { outcome: 'answer' });
  return NextResponse.json({
    answer: (result.response.text ?? '').trim(),
    model: result.response.model,
    cachedTokens: result.response.usage?.cachedTokens ?? 0,
    cacheReported: result.response.usage?.cacheReported ?? false,
    capturedAt: metrics.capturedAt,
    durationMs,
  });
}
