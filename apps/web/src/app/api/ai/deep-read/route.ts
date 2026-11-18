import { z } from 'zod';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { readJson, jsonError, badRequest } from '@/server/http';
import { getRateLimiter, rateKey, clientIp } from '@/server/security/rateLimit';
import { getAiCapabilities } from '@/lib/env';
import { chatWithCharacter } from '@/server/ai/client';

export const dynamic = 'force-dynamic';

/**
 * ──AI-DEEP-READ · 观测大厅的"AI 深读"（cont. 190）────────────────────────
 *
 * 输入：`/api/pulse` 已经给客户端的**实测聚合数字**（客户端原样 POST 过来，服务端不再二次查库）。
 * 输出：**4 条按可操作性排序的优化建议**——每条都带依据（直接引用输入数字）、
 * 预期收益（可带算式）、下一步动作、置信度。模型不得编制输入里没有的数字（§159）。
 *
 * 纪律：
 *  1. 只使用输入数字——要百分比必须由已有数字相除得出并写出算式。
 *  2. 不说"优化用户体验""提升留存"之类无依据空话。
 *  3. DEMO MODE 下按 409 如实拒绝（不编造"成功"）。
 *  4. 限流 10 次/小时/IP；同一组数字缓存 20 分钟（LRU 4 槽）——省 provider 额度。
 *  5. 输出带 disclaimer：AI 起草 · 数字均为实测聚合值 · 执行前人工复核。
 */

const TrendPoint = z.object({ day: z.string().max(10), opens: z.number().finite().min(0), visitorDays: z.number().finite().min(0) });
const HotItem = z.object({
  projectName: z.string().max(80),
  path: z.string().max(140),
  opensCurr: z.number().finite().min(0),
  opensPrev: z.number().finite().min(0),
  velocityPct: z.number().nullable(),
});
const WarnItem = z.object({ kind: z.string().max(40), zh: z.string().max(200), en: z.string().max(200) });

const Body = z
  .object({
    locale: z.enum(['zh', 'en']).default('zh'),
    users: z.number().finite().min(0),
    admins: z.number().finite().min(0).default(0),
    publishedVersions: z.number().finite().min(0).default(0),
    opens: z.number().finite().min(0),
    opensBot: z.number().finite().min(0).default(0),
    opensToday: z.number().finite().min(0).default(0),
    visitors: z.number().finite().min(0).default(0),
    visitorsToday: z.number().finite().min(0).default(0),
    visitorDays: z.number().finite().min(0),
    visibleMs: z.number().finite().min(0).default(0),
    gameClears: z.number().finite().min(0).default(0),
    workCompletions: z.number().finite().min(0).default(0),
    likes: z.number().finite().min(0).default(0),
    comments: z.number().finite().min(0).default(0),
    remixes: z.number().finite().min(0).default(0),
    follows: z.number().finite().min(0).default(0),
    trend: z.object({
      days: z.number().int().min(1).max(30).default(14),
      points: z.array(TrendPoint).min(0).max(30).default([]),
      opensDelta: z.number().nullable().default(null),
      visitorDaysDelta: z.number().nullable().default(null),
    }),
    hot: z.array(HotItem).max(5).default([]),
    warnings: z.array(WarnItem).max(6).default([]),
  })
  .strict();

const Suggestion = z.object({
  title: z.string().min(1).max(60),
  basis: z.string().min(1).max(300),
  impact: z.string().min(1).max(200),
  action: z.string().min(1).max(300),
  confidence: z.enum(['high', 'medium', 'low']),
});

interface DeepReadPayload {
  suggestions: z.infer<typeof Suggestion>[];
  generatedAt: string;
  model: string;
  disclaimer: string;
  cached: boolean;
}

const TTL_MS = 20 * 60 * 1000;
const LRU_MAX = 4;
const cache = new Map<string, { at: number; payload: DeepReadPayload }>();

function digest(body: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
}

function buildSystem(b: z.infer<typeof Body>): string {
  const isZh = b.locale === 'zh';
  const compact = {
    users: b.users, admins: b.admins, publishedVersions: b.publishedVersions,
    opens: b.opens, opensBot: b.opensBot, opensToday: b.opensToday,
    visitors: b.visitors, visitorsToday: b.visitorsToday, visitorDays: b.visitorDays,
    visibleMs: b.visibleMs, gameClears: b.gameClears, workCompletions: b.workCompletions,
    likes: b.likes, comments: b.comments, remixes: b.remixes, follows: b.follows,
    trend: {
      days: b.trend.days,
      opensDeltaPct: b.trend.opensDelta, visitorDaysDeltaPct: b.trend.visitorDaysDelta,
      points: b.trend.points.map((p) => [p.day, p.opens, p.visitorDays]),
    },
    hotTop: b.hot.map((h) => [h.projectName, h.opensCurr, h.opensPrev, h.velocityPct]),
    ruleWarnings: b.warnings.map((w) => (isZh ? w.zh : w.en)),
  };
  const zh = [
    '你是 NEXUS 平台的数据分析师。下面是你的平台在过去窗口的**实测聚合数字**（全部来自数据库真实统计，含 bot 计数、日粒度趋势、热度 Top 与规则初判警告）。',
    '纪律（不可违反）：',
    '1. 你只能使用下面给出的数字——不得编造任何新数字。若要写百分比/比率，必须由已有数字相除并写出算式。',
    '2. 每条建议必须给出：标题（≤20字）、依据（引用哪一个输入数字及其口径）、预期收益（含算式或区间）、下一步动作（可执行、可验证）、confidence。',
    '3. 不要输出"优化用户体验""提升留存"之类没有数字支撑的空话；依据不足时直说"数据不足，无法最近切片（需要更多日粒度）"。',
    '4. 输出 4 条，按"可操作性 / 收益 / 置信度"降序排列。',
    '5. 语言：跟随用户（此条为中文）。',
    '6. 输出格式：严格 JSON 数组，无 markdown、无解释性前言：',
    '   [{"title":"…","basis":"…","impact":"…","action":"…","confidence":"high|medium|low"}, …]',
    '',
    '--- 平台实测聚合数据（JSON）---',
    JSON.stringify(compact, null, 2),
  ].join('\n');
  const en = [
    'You are NEXUS platform analytics. Below are REAL aggregated numbers for this platform over the current window — measured in the database (bot counts, day-grained trend, hot-list, rule-based warnings).',
    'Rules (non-negotiable):',
    '1. Use ONLY the numbers below — invent NOTHING. Any ratio must be derived from given numbers with the arithmetic written out.',
    '2. Each of the 4 suggestions must carry: title (≤60 chars), basis (which input number, and its definition), expected impact (with arithmetic or a range), action (executable and verifiable), confidence.',
    '3. No filler phrases like "improve UX" or "boost retention" without numeric grounding. When evidence is thin, say so explicitly ("insufficient data").',
    '4. Output exactly 4 suggestions, ordered by actionability / impact / confidence.',
    '5. Language: follow the user (this one is English).',
    '6. Output format: a strict JSON array, no markdown, no preamble:',
    '   [{"title":"…","basis":"…","impact":"…","action":"…","confidence":"high|medium|low"}, …]',
    '',
    '--- Real platform aggregates (JSON) ---',
    JSON.stringify(compact, null, 2),
  ].join('\n');
  return isZh ? zh : en;
}

function parseSuggestions(text: string): z.infer<typeof Suggestion>[] {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('no json array found');
  const raw = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  const arr = Array.isArray(raw) ? raw : [];
  const out: z.infer<typeof Suggestion>[] = [];
  for (const item of arr) {
    const parsed = Suggestion.safeParse(item);
    if (parsed.success) out.push(parsed.data);
    if (out.length >= 4) break;
  }
  if (out.length < 2) throw new Error(`only ${out.length} valid suggestions parsed`);
  return out;
}

export async function POST(req: Request): Promise<Response> {
  const caps = await getAiCapabilities();
  if (caps.text !== 'real') {
    return await jsonError(409, 'demo_mode', { message: 'AI provider 未就绪——当前 DEMO MODE，如实拒绝出数（不编造分析）。' });
  }

  const ip = clientIp(req);
  const rl = await getRateLimiter().hit(rateKey('ai-deep-read', ip, 'anon'), 10, 60 * 60 * 1000);
  if (!rl.allowed) {
    return await jsonError(429, 'rate_limited', { message: 'AI 深读次数超限（每小时 10 次），稍后再来。', retryAfterMs: rl.retryAfterMs });
  }

  const raw = await readJson(req);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return await badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  const body = parsed.data;

  const key = digest(body);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ...hit.payload, cached: true }, { headers: { 'cache-control': 'no-store' } });
  }

  const system = buildSystem(body);
  const user = body.locale === 'en' ? 'English output, please.' : '请用中文输出。';
  const reqId = `deep_read_${Date.now().toString(36)}`;
  const chat = await chatWithCharacter({ requestId: reqId, system, user, modelClass: 'balanced' });
  if (!chat.ok) {
    const status = chat.status && chat.status >= 400 && chat.status < 600 ? chat.status : 503;
    return await jsonError(status, chat.error.code, { message: chat.error.message });
  }

  let suggestions: z.infer<typeof Suggestion>[];
  try {
    suggestions = parseSuggestions(chat.response.text);
  } catch (_error) {
    return await jsonError(502, 'provider_failed', {
      message: '模型输出未达到可展示的质量（没有解析出 ≥2 条合规建议）。请稍后重试。',
    });
  }

  const payload: DeepReadPayload = {
    suggestions,
    generatedAt: new Date().toISOString(),
    model: chat.response.model,
    disclaimer: body.locale === 'zh'
      ? 'AI 起草 · 数字均为平台自身实测聚合值（含真实算式）· 执行前请人工复核。'
      : 'AI-drafted · numbers are platform-measured aggregates (with real arithmetic) · human review required before acting.',
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
    headers: { 'cache-control': 'no-store', 'x-nexus-ai': 'deep-read' },
  });
}
