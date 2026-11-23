import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/server/domain/session';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, ipWriteGate, rateKey } from '@/server/security/rateLimit';
import { badRequest, jsonError, readJson } from '@/server/http';
import { runCanonAnswerGraph } from '@/server/ai/canonGraph';
import { verifyAnchorCitation } from '@/server/domain/oracleCitation';
import { increment, observe } from '@/server/observability';

/**
 * §BIBLE-4 · POST /api/bible/q —— 问典：正典 Q&A。
 *
 * 规则：
 * - 只接受已登录用户（密钥扛不住匿名流量，§137/§160）；
 * - csrf + 按人 5 次/5 分钟限流 + 按 IP 的入口 gate 三层；
 * - provider 不可用 → 503 原样回真，不演示 AI 瞎编的答案（§159）；
 * - question 400 字以内；draft/revise 的 system 是字节级稳定的 CANON_DIGEST（KV 前缀复用，§CACHE-4）；
 * - 不写库、不写 usage、不扣 credit（这是一次阅读，不是一次生成作业）。
 */
const AskBodySchema = z.object({
  question: z.string().min(1).max(400),
  locale: z.enum(['zh', 'en']).optional(),
});

const RATE_PER_5_MIN = 5;

export async function POST(req: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const gate = await ipWriteGate('bible/q', req);
  if (gate.limited) return jsonError(429, 'rate_limited', { message: '问典太快了，缓一缓再问', retryAfterMs: gate.retryAfterMs });

  const body = await readJson(req);
  if (!body) return badRequest(['请求体必须是 JSON']);
  const parsed = AskBodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));

  const user = await requireUser();
  const rl = await getRateLimiter().hit(rateKey('bible/q', clientIp(req), user.id), RATE_PER_5_MIN, 5 * 60_000);
  if (!rl.allowed) {
    return jsonError(429, 'rate_limited', { message: '问典太快了，五分钟后见', retryAfterMs: rl.retryAfterMs });
  }

  const { question } = parsed.data;
  const wrapLanguage = parsed.data.locale === 'zh' ? 'zh' : 'en';
  // §GRAPH-1 正典问答走 StateGraph（analyze → retrieve → draft → verify/revise）；
  // draft/revise 的 system 仍是字节级稳定的 CANON_DIGEST，KV 前缀与旧路径同源。
  try {
    const result = await runCanonAnswerGraph({ question, locale: wrapLanguage });
    const durationMs = Date.now() - startedAt;
    if (!result.ok) {
      increment('nexus_bible_ask_total', { outcome: 'provider-unavailable' });
      // 真相原样透出：潮汐还没到，不是潮汐假装到了（§159/§160）。
      return jsonError(result.status ?? 503, 'provider-unavailable', {
        message: '潮汐现在不走 —— 正典问答暂时不可用，请稍后再来。',
      });
    }
    const verified = result.verdict === 'pass';
    observe('nexus_bible_ask_latency_ms', durationMs, { outcome: verified ? 'answer' : 'answer-unverified' });
    increment('nexus_bible_ask_total', { outcome: verified ? 'answer' : 'answer-unverified' });
    // §TIDE-ORACLE-VERIFY（ cont.359 延伸）· 潮语/问典同一条：确定性地逐字检测回答有没有出自典籍的锚句
    const citation = verifyAnchorCitation(result.answer);
    const anchorsCited = citation.clause === 'cited' ? citation.anchors.length : 0;
    increment('nexus_oracle_citation_total', { state: citation.clause });
    return NextResponse.json({
      answer: result.answer,
      capability: 'real',
      provider: result.provider,
      model: result.model,
      cachedTokens: result.usage.cachedTokens,
      cacheReported: result.usage.cacheReported,
      costUsd: result.usage.costUsd,
      // §COST-2：这里必须是 provider 真报的那一档（unknown | configured），
      // 不能自造第三个字面量——旧值 'usage' 不在契约值域里，把「算得出钱」和
      // 「不知道多少钱」这两件不同的事压成同一句 nobody 能核的话（§159）。
      costBasis: result.usage.costBasis,
      graph: {
        verdict: result.verdict,
        iterations: result.iterations,
        retrieved: result.retrieved.length,
        nodes: result.nodesVisited,
      },
      citation: citation.clause,
      anchorsCited,
      citationAnchors: citation.clause === 'cited' ? citation.anchors.slice(0, 3) : [],
      // §RAG-LINEAGE：真实的 top-3 检索依据（canonicalize 的 retrieve 节点产物，≤3 段 · ≤1.6KB 总量）
      // ——让读者看见模型被哪些锚句定住了，不用再相信「模型一定读了典籍」这句空话
      retrieval: result.retrieved,
    });
  } catch (_error) {
    increment('nexus_bible_ask_total', { outcome: 'error' });
    return jsonError(500, 'internal', { message: '问典遇到意外错误，稍后再问' });
  }
}
