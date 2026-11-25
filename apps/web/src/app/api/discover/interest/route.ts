import { z } from 'zod';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { readJson, jsonError, badRequest } from '@/server/http';
import { getRateLimiter, rateKey, clientIp } from '@/server/security/rateLimit';
import { getAiCapabilities } from '@/lib/env';
import { chatWithCharacter } from '@/server/ai/client';
import { currentUserOrNull } from '@/server/domain/session';
import { discoverInterestSignals, type InterestSignalCard } from '@/server/domain/social';
import { canonIdentityPrelude } from '@/lib/canonPrefix';

export const dynamic = 'force-dynamic';

/**
 * ──DISCOVER-INTEREST · /discover 的"推荐位"（cont. 199）─────────────────────
 *
 * 输入：只有一个 locale。服务端自算**这个用户自己**的实测阅读信号——
 * 他对每件公开作品各打开多少次（myOpens）+ 作品的实测指标（views/likes）。
 * 行为者姓名、阅读时长、completionPct 等全部不进模型，也不出服务端。
 *
 * 纪律：
 *  1. 模型只回答"为什么可能想再打开"——每句必须引用 myOpens 或作品实测数，
 *     禁止"这部作品很棒"这类无法度量的背书；
 *  2. 用户阅读痕迹不足 → 不调模型，server-authored 空态（"我们不替没有痕迹的人排序"）；
 *  3. DEMO MODE → 409；未登录 → 401；每 IP+用户 10/小时；24h LRU（32 槽）；
 *  4. 缺数字即 502（与 notif-digest 同一机械检查）；
 *  5. disclaimer 常驻「AI 推荐 · 依据你的真实阅读 · 非人工背书」。
 */

const Body = z.object({ locale: z.enum(['zh', 'en']).default('zh') }).strict();

interface InterestPayload {
  picks: { publicationId: string; path: string; name: string; note: string }[];
  generatedAt: string;
  model: string;
  disclaimer: string;
  cached: boolean;
  /** 依据：本次喂给模型的实测信号（只含这个用户自己打开过什么、多少次） */
  signals: InterestSignalCard[];
}

const TTL_MS = 24 * 60 * 60 * 1000;
const LRU_MAX = 32;
const cache = new Map<string, { at: number; payload: InterestPayload }>();

function signalsKey(userId: string, locale: string, signals: InterestSignalCard[]): string {
  const sig = signals.map((s) => `${s.publicationId}:${s.myOpens}`).join('|');
  return crypto.createHash('sha256').update(`${userId}|${locale}|${sig}`).digest('hex').slice(0, 16);
}

const PickSchema = z.object({
  publicationId: z.string().min(1).max(64),
  note: z.string().min(4).max(160),
});

function parsePicks(text: string, signals: InterestSignalCard[]): z.infer<typeof PickSchema>[] {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('no json array found');
  const raw = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  const arr = Array.isArray(raw) ? raw : [];
  const want = new Set(signals.map((s) => s.publicationId));
  const out: z.infer<typeof PickSchema>[] = [];
  for (const item of arr) {
    const parsed = PickSchema.safeParse(item);
    if (parsed.success && want.has(parsed.data.publicationId)) out.push(parsed.data);
  }
  if (out.length < signals.length) throw new Error(`only ${out.length}/${signals.length} valid picks`);
  return out.slice(0, signals.length);
}

export async function POST(req: Request): Promise<Response> {
  const viewer = await currentUserOrNull();
  if (!viewer) {
    return await jsonError(401, 'not_authenticated', { message: '推荐位只对有痕迹的人说话——先登录。' });
  }

  const caps = await getAiCapabilities();
  if (caps.text !== 'real') {
    return await jsonError(409, 'demo_mode', { message: 'AI provider 未就绪——当前 DEMO MODE，如实拒绝出推荐（不编造品味）。' });
  }

  const ip = clientIp(req);
  const rl = await getRateLimiter().hit(rateKey('discover-interest', ip, viewer.id), 10, 60 * 60 * 1000);
  if (!rl.allowed) {
    return await jsonError(429, 'rate_limited', { message: '推荐次数超限（每小时 10 次），稍后再来。', retryAfterMs: rl.retryAfterMs });
  }

  const raw = await readJson(req).catch(() => null);
  const parsed = Body.safeParse(raw ?? {});
  if (!parsed.success) {
    return await badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  const { locale } = parsed.data;

  const signals = await discoverInterestSignals(viewer.id, 3);

  if (signals.length === 0) {
    const payload: InterestPayload = {
      picks: [],
      generatedAt: new Date().toISOString(),
      model: 'no-model (server-authored empty case)',
      disclaimer: locale === 'zh'
        ? '未调用模型——你还没有阅读痕迹，我们不替没有痕迹的人排序。先去 /discover trending 逛一圈。'
        : 'No model was called — you have no reading trace yet; we do not rank for people without traces. Go browse /discover trending first.',
      cached: false,
      signals: [],
    };
    return NextResponse.json(payload, { headers: { 'cache-control': 'no-store', 'x-nexus-ai': 'discover-interest-empty' } });
  }

  const key = signalsKey(viewer.id, locale, signals);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ...hit.payload, cached: true }, { headers: { 'cache-control': 'no-store' } });
  }

  const histoJson = JSON.stringify(
    signals.map((s) => ({
      publicationId: s.publicationId,
      name: s.name,
      kind: s.kind,
      views: s.views,
      likes: s.likes,
      myOpens: s.myOpens,
      myLastSeen: s.myLastSeen,
    })),
    null,
    2,
  );

  const label = locale === 'zh' ? '【用户自己打开过的作品（JSON，全部实测）】' : '【Works this user opened (JSON, measured)】';
  const tail = locale === 'zh'
    ? '请严格输出 JSON 数组：[{"publicationId":"…","note":"…"}, …]——每条引用 myOpens 或 views/likes。'
    : 'Output strict JSON: [{"publicationId":"…","note":"…"}, …] — cite myOpens or views/likes.';
  const user = [label, histoJson, '', tail].join('\n');
  const system = locale === 'zh'
    ? [
        canonIdentityPrelude('zh', { zh: '--- 你正在复核的对象：这位用户真实打开过的作品记录 ---', en: '' }),
        '',
        '你是 NEXUS /discover 的"推荐官"。用户消息里有用户自己打开过的作品记录（JSON，全部实测——myOpens 是这个用户自己打开的次数）。',
        '',
        '纪律（不可违反）：',
        '1. 只允许依据这些实测数说"为什么可能想再打开"——禁止评价作品好坏、禁止情绪化形容词；',
        '2. 每条必须引用 myOpens 或作品的 views/likes（例如"你上次 07-12 打开过 3 次"或"210 次浏览·34 赞"）；',
        '3. 一句话，不超过 60 字；语气像朋友推荐，不用"亲""建议您"；',
        '4. 输出格式：严格 JSON 数组，无 markdown、无前言：',
        '   [{"publicationId":"…","note":"…"}, …]',
        '5. 语言：跟随输入（此条为中文）。',
      ].join('\n')
    : [
        canonIdentityPrelude('en', { zh: '', en: '--- What you are reviewing: the works this user actually opened ---' }),
        '',
        'You are the /discover recommendation clerk for NEXUS. The user message carries the works this user opened themselves, with measured figures (JSON; myOpens = how many times this user opened it).',
        '',
        'Rules (non-negotiable):',
        '1. Only judge from these measured figures — no verdicts on quality, no emotional adjectives;',
        '2. Each line MUST cite myOpens or the work’s views/likes (e.g. “you opened it 3 times” or “210 views · 34 likes”);',
        '3. One sentence, ≤ 90 chars, friend-tone, no marketing voice;',
        '4. Output format: a strict JSON array, no markdown, no preamble:',
        '   [{"publicationId":"…","note":"…"}, …]',
        '5. Language: follow the input (this one is English).',
      ].join('\n');

  const reqId = `discover_interest_${Date.now().toString(36)}`;
  const chat = await chatWithCharacter({ requestId: reqId, system, user, modelClass: 'balanced' });
  if (!chat.ok) {
    const status = chat.status && chat.status >= 400 && chat.status < 600 ? chat.status : 503;
    return await jsonError(status, chat.error.code, { message: chat.error.message });
  }

  let picks: z.infer<typeof PickSchema>[];
  try {
    picks = parsePicks(chat.response.text, signals);
  } catch {
    return await jsonError(502, 'provider_failed', {
      message: '模型输出未落在实测信号上（缺数字或未覆盖全部条目）——不展示这类空话，请稍后重试。',
    });
  }

  const pathById = new Map(signals.map((s) => [s.publicationId, s.path] as const));
  const nameById = new Map(signals.map((s) => [s.publicationId, s.name] as const));

  const payload: InterestPayload = {
    picks: picks.map((p) => ({ ...p, path: pathById.get(p.publicationId)!, name: nameById.get(p.publicationId)! })),
    generatedAt: new Date().toISOString(),
    model: chat.response.model,
    disclaimer: locale === 'zh'
      ? 'AI 推荐 · 依据你的真实阅读（myOpens 实测）· 非人工背书。'
      : 'AI picks · grounded in your real reading trace (measured myOpens) · not human endorsement.',
    cached: false,
    signals,
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
    headers: { 'cache-control': 'no-store', 'x-nexus-ai': 'discover-interest' },
  });
}
