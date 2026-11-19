import { z } from 'zod';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { readJson, jsonError, badRequest } from '@/server/http';
import { getRateLimiter, rateKey, clientIp } from '@/server/security/rateLimit';
import { getAiCapabilities } from '@/lib/env';
import { chatWithCharacter } from '@/server/ai/client';
import { SYSTEM_PROMPT } from '@/lib/bibleAsk';

export const dynamic = 'force-dynamic';

/**
 * ──SHIP-DIGEST · /ship 的"AI 平台速览"（cont. 204 · cont.450 深口径注入）──────
 *
 * 输入：一个极简摘要包——收录天数、45 天内提交计数按 kind、最近 12 条 subject、累计提交/ADR 数。
 * 不重读 git log，不读任何源文件——只认客户端交上来的、由 git log 真实生成的数字。
 *
 * 上下文纪律（2026-11-19 · ADR-0295 · 紧随契约漂移修复后）：
 *   system = [字节稳定的 canon 前缀（SYSTEM_PROMPT——与 /bible/ask 同一份 259K chars digest）, 速览纪律]
 *   user   = [histo JSON, 一句 locale 提示]
 * 前缀字节稳定 → 前缀 KV 复用率与 digest 车道同源（实测 ≥93.9% → 100%）。模型从此不仅会数 git log，
 * 也"知道"这个平台在讲什么——这是「大模型能力与项目完美融合」落到 /ship 这一格。
 *
 * 纪律：
 *  1. 模型只准引用输入里的数字——禁止"平台大量迭代"这类空话（缺数字即 502）；
 *     259K 前缀给的是身份与口径，不是"允许它编里程碑"；
 *  2. DEMO MODE → 409；每 IP 每小时 5 次；24h LRU（16 槽，键=输入摘要）；
 *  3. 纯只读展示——不写任何库；
 *  4. disclaimer 常驻「AI 速览 · 依据真实 git 日志 · 非人工背书」。
 */

const Body = z.object({
  locale: z.enum(['zh', 'en']).default('zh'),
  shownDays: z.number().finite().int().min(1).max(400),
  totalCommits: z.number().finite().int().min(0),
  adrs: z.number().finite().int().min(0),
  counts: z.record(z.string().max(24), z.number().finite().int().min(0)),
  latest: z.array(z.object({ kind: z.string().max(16), subject: z.string().max(200), date: z.string().max(16) })).max(12),
}).strict();

interface ShipDigestPayload {
  digest: string;
  generatedAt: string;
  model: string;
  disclaimer: string;
  cached: boolean;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const LRU_MAX = 16;
const cache = new Map<string, { at: number; payload: ShipDigestPayload }>();

function digest(body: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
}

const COMMON_RULES_ZH = [
  '纪律（不可违反）：',
  '1. 只允许依据这些数字下判断——不许想象未给的指标、不许说"平台持续高速发展"这类空话；',
  '2. 必须引用输入里的具体数字（天数、kind 计数、ADR 数、最近几条 subject 各举一个例子）——禁止缺数字的句子；',
  '3. 语气像写给旁观者看的一句"这是个什么平台现在到了什么阶段"，不装、不吹、不编造里程碑；',
  '4. 2-4 句话；不替项目下结论，只呈现它交出的东西；',
  '5. 输出格式：纯文本，不加标题、不加 markdown。',
].join('\n');

const COMMON_RULES_EN = [
  'Rules (non-negotiable):',
  '1. Judge only from these figures — no imagined metrics, no “the platform keeps iterating rapidly”;',
  '2. Cite concrete figures from the input (days, per-kind counts, ADR count, one recent subject as an example) — no empty sentences;',
  '3. Tone: an honest “what stage is this platform at, judged by what it shipped” — no marketer voice, no invented milestones;',
  '4. 2-4 sentences; do not conclude for the user, only reflect what was shipped;',
  '5. Output format: plain text, no headers, no markdown.',
].join('\n');

export async function POST(req: Request): Promise<Response> {
  const caps = await getAiCapabilities();
  if (caps.text !== 'real') {
    return await jsonError(409, 'demo_mode', { message: 'AI provider 未就绪——当前 DEMO MODE，如实拒绝出速览（不编造进度）。' });
  }

  const ip = clientIp(req);
  const rl = await getRateLimiter().hit(rateKey('ship-digest', ip, 'anon'), 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return await jsonError(429, 'rate_limited', { message: '速览次数超限（每小时 5 次），稍后再来。', retryAfterMs: rl.retryAfterMs });
  }

  const raw = await readJson(req);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return await badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  const { locale, ...body } = parsed.data;

  const key = digest({ body, locale });
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ...hit.payload, cached: true }, { headers: { 'cache-control': 'no-store' } });
  }

  const histoJson = JSON.stringify(body, null, 2);
  // 字节稳定的 canon 前缀常驻 system——与 /bible/ask 完全同一份 SYSTEM_PROMPT；§CACHE-4 生效。
  // canonical prefix is the model's "room identity": the platform is named NEXUS, the canon is the institute's tide-counting world.
  // 数字纪律照旧：模型只能引用本次 JSON 里的数字，禁虚构里程碑（缺数字 → 502 不展示）。
  const system = locale === 'zh'
    ? [
        SYSTEM_PROMPT,
        '',
        '--- 以下为 /ship 交付日志的真实 git log 机械计数 JSON（不是文案）---',
        histoJson,
        '',
        '你现在扮演 NEXUS /ship 交付日志的"平台速览"。上面的正典前缀只为让你知道这是什么平台、世界在讲什么。',
        COMMON_RULES_ZH,
        '',
        '输出：直写 2-4 句速览，不写前言。',
      ].join('\n')
    : [
        SYSTEM_PROMPT,
        '',
        '--- Live git-log tally JSON for /ship (mechanically counted, not copy) ---',
        histoJson,
        '',
        'You are the "platform at a glance" for the NEXUS /ship log. The canon prefix above tells you what this platform is and what its world is about; judge ONLY from the JSON below.',
        COMMON_RULES_EN,
        '',
        'Output: just the 2-4 sentence glance, no preamble.',
      ].join('\n');

  const user = locale === 'en' ? 'English, please.' : '请用中文写。';
  const reqId = `ship_digest_${Date.now().toString(36)}`;
  const chat = await chatWithCharacter({ requestId: reqId, system, user, modelClass: 'balanced' });
  if (!chat.ok) {
    const status = chat.status && chat.status >= 400 && chat.status < 600 ? chat.status : 503;
    return await jsonError(status, chat.error.code, { message: chat.error.message });
  }

  const text = chat.response.text.trim();
  // 计数纪律的机械检查：输出必须包含至少两个数字
  if ((text.match(/\d/g) ?? []).length < 2) {
    return await jsonError(502, 'provider_failed', { message: '模型速览未落在实测数字上——不展示这类空话，请稍后重试。' });
  }

  const payload: ShipDigestPayload = {
    digest: text.slice(0, 1200),
    generatedAt: new Date().toISOString(),
    model: chat.response.model,
    disclaimer: locale === 'zh'
      ? 'AI 速览 · 依据真实 git 日志（机械统计，非人工背书）· 不作平台立论。'
      : 'AI glance · grounded in the real git log (mechanically counted, not human endorsement) · no platform claim.',
    cached: false,
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
    headers: { 'cache-control': 'no-store', 'x-nexus-ai': 'ship-digest' },
  });
}
