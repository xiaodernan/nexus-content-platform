import { NextResponse } from 'next/server';
import { jsonError } from '@/server/http';
import { getRateLimiter, rateKey, clientIp } from '@/server/security/rateLimit';
import { getAiCapabilities } from '@/lib/env';
import { runDesignGraph } from '@/server/ai/client';

/**
 * cont. 169 · `/api/stategraph` —— 公开只读的一次"真图试跑"。
 *
 * 为什么存在：StateGraph 这一步（validate → check_provider → build_prefix → call_llm →
 * cache_read → parse_and_release → assemble）以前只能在代码里看、或在真 Studio 会话里撞见。
 * 现在它有一个公开按钮：任何人都能按一次，拿到**真实的** HTTP 状态、`x-nexus-orchestration`
 * 头与 provider 回报，不包装、不美化 —— provider 挂了就如实看到 502/503/409。
 *
 * 纪律：
 *  1. 请求体**固定**（critique 意图 + dryRun + fast 模型类），不读用户输入、不进个人数据，
 *     也不构造可被塞进 prompt 的自由字段 —— 参数注入面为 0。
 *  2. 限流：每 IP 6 次 / 10 分钟（与 /api/bible/whisper 的口径一致，保护 provider 额度）。
 *  3. DEMO MODE 下按 409 如实拒绝，绝不编一个"成功"。
 *  4. 成功也如实：返回 `dryRun: true` 与 patchesApplied（永远 0），不假装"真的改了东西"。
 */
export const dynamic = 'force-dynamic';

const TRY_PROMPT =
  '这是一次公开只读试跑。页面只有一个标题和一个按钮。请用一句话评价它。';

export async function POST(request: Request): Promise<NextResponse> {
  const caps = await getAiCapabilities();
  if (caps.text !== 'real') {
    return await jsonError(409, 'demo_mode', {
      message: 'AI provider 未就绪，当前为 DEMO MODE —— 试跑如实拒绝，不编造结果。',
    });
  }

  const ip = clientIp(request);
  const rl = await getRateLimiter().hit(rateKey('stategraph-try', ip, 'anon'), 6, 10 * 60 * 1000);
  if (!rl.allowed) {
    return await jsonError(429, 'rate_limited', {
      message: '试跑次数超限，稍后再来。',
      retryAfterMs: rl.retryAfterMs,
    });
  }

  const requestId = `stategraph_try_${Date.now().toString(36)}`;
  const result = await runDesignGraph({
    requestId,
    intent: 'critique',
    prompt: TRY_PROMPT,
    modelClass: 'fast',
    variants: 1,
    dryRun: true,
    references: [],
    approvalPolicy: [],
    context: { projectId: 'stategraph-try', pageId: 'page-1', viewport: 'desktop', selection: [], recentChanges: [] },
  });

  if (!result.ok) {
    const status = result.status && result.status >= 400 && result.status < 600 ? result.status : 503;
    return await jsonError(status, result.error.code, {
      message: result.error.message,
      hint: result.error.hint,
      orchestrationHeader: result.orchestration,
    });
  }

  const usage = result.response.usage;
  return NextResponse.json(
    {
      ok: true,
      httpStatus: result.status,
      orchestrationHeader: result.orchestration,
      requestId,
      provider: result.response.provider,
      model: result.response.model,
      explanation: result.response.explanation,
      dryRun: true,
      patchesApplied: result.response.patches.length,
      labels: result.response.labels,
      usage: {
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        cachedTokens: usage.cachedTokens,
        cacheReported: usage.cacheReported,
        latencyMs: usage.latencyMs,
        costUsd: usage.costUsd,
        costBasis: usage.costBasis,
      },
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
