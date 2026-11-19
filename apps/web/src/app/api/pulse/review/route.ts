import { z } from 'zod';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { readJson, jsonError, badRequest } from '@/server/http';
import { getRateLimiter, rateKey, clientIp } from '@/server/security/rateLimit';
import { getAiCapabilities } from '@/lib/env';
import { chatWithCharacter } from '@/server/ai/client';
import { fitLinear, summarizeVolatility, type DayPoint } from '@/server/domain/pulseProjection';
import { canonPrelude } from '@/lib/canonPrefix';

export const dynamic = 'force-dynamic';

/**
 * ──PULSE-REVIEW · /observatory「规则复盘」（cont. 203）──────────────────────
 *
 * 输入：14 天 opens 系列 + 机器人占比 + 半周 delta（全部由客户端从 /api/pulse 原样上传，不重查库）。
 * 服务端把它们喂给纯函数规则引擎，得到与 /observatory 完全一致的规则推断，
 * 再让大模型**独立复核一次**：指标对不对、规则动作该不该做、如果只改一件事改哪件。
 *
 * 纪律：
 *  1. 模型只准引用输入里的数字（14 天序列、fit、CV、bot 占比、deltas、hot）——
 *     禁止"平台大概会增长"这类空话；每条复核必须带数字；
 *  2. DEMO MODE → 409 如实拒绝；限流 10/小时/IP；24h LRU（16 槽）；
 *  3. 输出缺数字即 502（与 deep-read / notifications-digest 同一机械检查）；
 *  4. 输出只展示，**不写任何库、不改任何规则**——规则引擎的代码本身就是真值，模型只说话；
 *  5. disclaimer 常驻「AI 复核 · 依据实测聚合数字 · 非人工背书」。
 */

const Body = z.object({
  locale: z.enum(['zh', 'en']).default('zh'),
  points: z.array(z.object({ day: z.string().min(1).max(16), opens: z.number().finite().int().min(0) })).min(2).max(60),
  opensBot: z.number().finite().int().min(0),
  opens: z.number().finite().int().min(0),
  opensDelta: z.number().finite().nullable().optional(),
  visitorDaysDelta: z.number().finite().nullable().optional(),
}).strict();

interface ReviewPayload {
  checks: { claim: string; verdict: 'agrees' | 'disagrees'; basis: string }[];
  bestNextMove: string;
  generatedAt: string;
  model: string;
  disclaimer: string;
  cached: boolean;
  /** 依据：规则引擎自算的真值（模型的复核对象——可逐条对账） */
  basis: { slope: number; intercept: number; residualStd: number; n: number; cv: number; lastDeltaPct: number | null; projected7d: number };
}

const TTL_MS = 24 * 60 * 60 * 1000;
const LRU_MAX = 16;
const cache = new Map<string, { at: number; payload: ReviewPayload }>();

function digest(body: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
}

function projected7dFrom(points: DayPoint[]): number {
  const fit = fitLinear(points);
  if (fit.n === 0) return 0;
  const x = fit.lastX + 7;
  return Math.max(0, Math.round(fit.slope * x + fit.intercept));
}

const Check = z.object({
  claim: z.string().min(4).max(200),
  verdict: z.enum(['agrees', 'disagrees']),
  basis: z.string().min(2).max(200),
});

const ReviewSchema = z.object({
  checks: z.array(Check).min(1).max(8),
  bestNextMove: z.string().min(4).max(300),
});

export async function POST(req: Request): Promise<Response> {
  const caps = await getAiCapabilities();
  if (caps.text !== 'real') {
    return await jsonError(409, 'demo_mode', { message: 'AI provider 未就绪——当前 DEMO MODE，如实拒绝出复核（不编造论据）。' });
  }

  const ip = clientIp(req);
  const rl = await getRateLimiter().hit(rateKey('pulse-review', ip, 'anon'), 10, 60 * 60 * 1000);
  if (!rl.allowed) {
    return await jsonError(429, 'rate_limited', { message: '复核次数超限（每小时 10 次），稍后再来。', retryAfterMs: rl.retryAfterMs });
  }

  const raw = await readJson(req);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return await badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  const { locale, points, opens, opensBot, opensDelta, visitorDaysDelta } = parsed.data;

  const fit = fitLinear(points);
  const volatility = summarizeVolatility(points);
  const projected7d = projected7dFrom(points);
  const botShare = opens > 0 ? opensBot / opens : 0;

  const basisObj = {
    slope: fit.slope,
    intercept: fit.intercept,
    residualStd: fit.residualStd,
    n: fit.n,
    cv: volatility.coefficientOfVariation,
    lastDeltaPct: volatility.lastDayDeltaPct,
    projected7d,
    opensDelta: opensDelta ?? null,
    visitorDaysDelta: visitorDaysDelta ?? null,
    botShare,
  };

  const key = digest({ points, opens, opensBot, opensDelta, visitorDaysDelta, locale });
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ...hit.payload, cached: true }, { headers: { 'cache-control': 'no-store' } });
  }

  const basisJson = JSON.stringify({ points, ...basisObj }, null, 2);
  // 字节稳定的 canon 前缀常驻 system——观察站审核官也知道这是个什么平台。
  const system = locale === 'zh'
    ? [
        canonPrelude('zh', { zh: '--- /observatory 当前展板的全部输入（JSON；points=近若干天 opens 序列，其余为规则引擎自算值）---', en: '' }),
        basisJson,
        '',
        '你是 NEXUS /observatory 的"独立复核官"。',
        '纪律（不可违反）：',
        '1. 你看到的只是上面这份 JSON 里的数字——不许引用任何外部知识或想象未给的指标；',
        '2. 每条复核必须带具体数字（例如"斜率 slope=0.03"、"CV=1.94"、"botShare=0.46"）——禁止"看起来不错"这类空话；',
        '3. 对 2-5 条规则引擎当前站得住/站不住的判断各写一条（agree/disagree + 一句依据 + 数字）；',
        '4. 最后给一句"如果只改一件事，改哪件"，落在 JSON 的数字上；',
        '5. 输出格式：严格 JSON，无 markdown、无前言：',
        '   {"checks":[{"claim":"…","verdict":"agrees|disagrees","basis":"…"}, …],"bestNextMove":"…"}',
        '6. 语言：跟随输入（此条为中文）。',
      ].join('\n')
    : [
        canonPrelude('en', { zh: '', en: '--- EVERY input on the /observatory dashboard right now (JSON; points is the opens series; the rest are values the rule engine computed itself) ---' }),
        basisJson,
        '',
        'You are the independent reviewer of the /observatory dashboard for NEXUS.',
        'Rules (non-negotiable):',
        '1. You only see what is in the JSON above — no outside knowledge, no imagined metrics;',
        '2. Each check MUST cite concrete figures (e.g. “slope=0.03”, “CV=1.94”, “botShare=0.46”) — no “looks fine”;',
        '3. Give 2-5 checks on whether the rule engine’s current stances hold up (agrees/disagrees + one-line basis with numbers);',
        '4. End with one “if you could change only one thing…” grounded in the JSON figures;',
        '5. Output format: strict JSON, no markdown, no preamble:',
        '   {"checks":[{"claim":"…","verdict":"agrees|disagrees","basis":"…"}, …],"bestNextMove":"…"}',
        '6. Language: follow the input (this one is English).',
      ].join('\n');

  const user = locale === 'en' ? 'English review, please.' : '请用中文复核。';
  const reqId = `pulse_review_${Date.now().toString(36)}`;
  const chat = await chatWithCharacter({ requestId: reqId, system, user, modelClass: 'balanced' });
  if (!chat.ok) {
    const status = chat.status && chat.status >= 400 && chat.status < 600 ? chat.status : 503;
    return await jsonError(status, chat.error.code, { message: chat.error.message });
  }

  const text = chat.response.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return await jsonError(502, 'provider_failed', { message: '模型输出没达到可展示的质量（未返回可解析的复核 JSON）。请稍后重试。' });
  }
  let parsedReview;
  try {
    parsedReview = ReviewSchema.parse(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return await jsonError(502, 'provider_failed', { message: '模型输出未通过质量校验（checks 不足或缺数字）。请稍后重试。' });
  }
  // 计数纪律的机械检查：每条 check 的依据必须带数字
  for (const check of parsedReview.checks) {
    if (!/\d/.test(check.basis) && !/\d/.test(check.claim)) {
      return await jsonError(502, 'provider_failed', { message: '模型复核未落在实测数字上——不展示这类空话，请稍后重试。' });
    }
  }

  const payload: ReviewPayload = {
    checks: parsedReview.checks,
    bestNextMove: parsedReview.bestNextMove.slice(0, 300),
    generatedAt: new Date().toISOString(),
    model: chat.response.model,
    disclaimer: locale === 'zh'
      ? 'AI 复核 · 依据实测聚合数字（可与上面展板逐条对账）· 非人工背书。'
      : 'AI review · grounded in the measured aggregates on the board (cross-check item by item) · not human endorsement.',
    cached: false,
    basis: basisObj,
  };

  if (cache.size >= LRU_MAX) {
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [k, v] of cache) {
      if (v.at < oldestAt) { oldestAt = v.at; oldestKey = k; }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { at: Date.now(), payload });

  return NextResponse.json(payload, {
    headers: { 'cache-control': 'no-store', 'x-nexus-ai': 'pulse-review' },
  });
}
