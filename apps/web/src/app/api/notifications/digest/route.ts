import { z } from 'zod';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { readJson, jsonError, badRequest } from '@/server/http';
import { getRateLimiter, rateKey, clientIp } from '@/server/security/rateLimit';
import { getAiCapabilities } from '@/lib/env';
import { chatWithCharacter } from '@/server/ai/client';
import { currentUserOrNull } from '@/server/domain/session';
import { inboxKindHistogram } from '@/server/domain/notifications';

export const dynamic = 'force-dynamic';

/**
 * ──NOTIFICATIONS-DIGEST · 收件箱"AI 先读一下"（cont. 194）───────────────────
 *
 * 输入：只有一个 locale（客户端不带任何收件箱数据）。
 * 服务端自己算当前用户的"按 kind 聚合的实测计数"——
 * **标题 / 正文 / 行为者姓名一个字都不会进模型**。
 *
 * 模型被要求：
 *  1. 只基于计数说"先开哪件"——moderation/approval/team 这类有人在等你的优先，
 *     like/follow 这类纯计数的留到最后；
 *  2. 每条判断必须带计数（如"moderation 未读 2 / 共 3"）——禁止形容词背书；
 *  3. 不替用户做结论，只排顺序、给出一条清理建议；
 *  4. DEMO MODE → 409；每 IP+用户 20/小时；6 小时 LRU 缓存（计数签名键）。
 */

const Body = z.object({ locale: z.enum(['zh', 'en']).default('zh') }).strict();

interface DigestPayload {
  digest: string;
  model: string;
  disclaimer: string;
  cached: boolean;
  /** 依据：本次喂给模型的实测计数（UI 原样展示，可与页签对照复核） */
  histogram: { total: number; unread: number; kinds: { kind: string; total: number; unread: number }[] };
}

const TTL_MS = 6 * 60 * 60 * 1000;
const LRU_MAX = 32;
const cache = new Map<string, { at: number; payload: DigestPayload }>();

function histoKey(userId: string, locale: 'zh' | 'en', kinds: { kind: string; total: number; unread: number }[]): string {
  const sig = kinds.map((k) => `${k.kind}:${k.total}/${k.unread}`).join('|');
  return crypto.createHash('sha256').update(`${userId}|${locale}|${sig}`).digest('hex').slice(0, 16);
}

export async function POST(req: Request): Promise<Response> {
  const viewer = await currentUserOrNull();
  if (!viewer) {
    return await jsonError(401, 'not_authenticated', { message: '收件箱属于你——先登录，再让模型替你读。' });
  }

  const caps = await getAiCapabilities();
  if (caps.text !== 'real') {
    return await jsonError(409, 'demo_mode', { message: 'AI provider 未就绪——当前 DEMO MODE，如实拒绝出摘要（不编造收件箱）。' });
  }

  const ip = clientIp(req);
  const rl = await getRateLimiter().hit(rateKey('notif-digest', ip, viewer.id), 20, 60 * 60 * 1000);
  if (!rl.allowed) {
    return await jsonError(429, 'rate_limited', { message: '次数超限（每小时 20 次），稍后再来。', retryAfterMs: rl.retryAfterMs });
  }

  const raw = await readJson(req).catch(() => null);
  const parsed = Body.safeParse(raw ?? {});
  if (!parsed.success) {
    return await badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  const { locale } = parsed.data;

  const histogram = await inboxKindHistogram(viewer.id);

  if (histogram.total === 0) {
    const payload: DigestPayload = {
      digest: locale === 'zh'
        ? '收件箱是空的——没有任何人等你。不是"系统没通知"，是没人有事做到需要通知你。去做新东西，或者歇一会儿。'
        : 'Your inbox is empty — nobody is waiting on you. That is not “the system failed to notify”; it is “nothing reached the moment worth notifying you”. Go build something, or take the afternoon.',
      model: 'no-model (server-authored empty case)',
      disclaimer: locale === 'zh'
        ? '未调用模型——收件箱为空时不消耗 provider。'
        : 'No model was called — empty inboxes never spend provider budget.',
      cached: false,
      histogram,
    };
    return NextResponse.json(payload, { headers: { 'cache-control': 'no-store', 'x-nexus-ai': 'notif-digest-empty' } });
  }

  const key = histoKey(viewer.id, locale, histogram.kinds);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ...hit.payload, cached: true }, { headers: { 'cache-control': 'no-store' } });
  }

  const histoJson = JSON.stringify(histogram);
  const system = locale === 'zh'
    ? [
        '你是 NEXUS 的"收件箱伴读"。用户的收件箱按类型聚合的**实测计数**如下（JSON，total 为全部通知数，unread 为未读）：',
        histoJson,
        '',
        '纪律（不可违反）：',
        '1. 只允许依据这些计数下判断——不许想象内容、语气、行为者；',
        '2. 说清"先开哪几件"：有人在等你结论的类型（moderation/approval/team）优先于纯计数类型（like/follow）；',
        '3. 每条判断必须带计数（例如"moderation 未读 2/共 3"）——禁止"重要的事情最重要"这类空话；',
        '4. 最后给一条收件箱清理建议（例如先标已读、先处理堆积未读），基于计数；',
        '5. 总长度 4 句以内，口语、克制，不卖弄；',
        '6. 不用"建议您""亲"——直接说。',
      ].join('\n')
    : [
        'You are the inbox companion for NEXUS. Here is the user’s inbox as **measured per-kind counts** (JSON; total = all notifications, unread = unread):',
        histoJson,
        '',
        'Rules (non-negotiable):',
        '1. Judge only from these counts — never imagine titles, bodies, tones or actors;',
        '2. Say what to open first: kinds where a human waits on your decision (moderation/approval/team) outrank pure tallies (like/follow);',
        '3. Every judgment must cite its figures (e.g. “moderation 2 unread / 3 total”) — no empty phrasing;',
        '4. End with one inbox-hygiene step, also based on the counts;',
        '5. Four sentences max, plain and restrained;',
        '6. No marketing voice.',
      ].join('\n');

  const user = locale === 'en'
    ? 'Four short sentences, grounded in the counts, ending with one hygiene step. In English.'
    : '四句以内，落在计数上，结尾给一条清理动作。用中文。';
  const reqId = `notif_digest_${Date.now().toString(36)}`;
  const chat = await chatWithCharacter({ requestId: reqId, system, user, modelClass: 'balanced' });
  if (!chat.ok) {
    const status = chat.status && chat.status >= 400 && chat.status < 600 ? chat.status : 503;
    return await jsonError(status, chat.error.code, { message: chat.error.message });
  }

  const digest = chat.response.text.trim();
  // 计数纪律的机械检查：输出必须包含至少一个数字，否则不展示（防模型空话）
  if (digest.length < 20 || !/\d/.test(digest)) {
    return await jsonError(502, 'provider_failed', {
      message: '模型输出没落在实测计数上（缺少数字）——不展示这类空话，请稍后重试。',
    });
  }

  const payload: DigestPayload = {
    digest: digest.slice(0, 900),
    model: chat.response.model,
    disclaimer: locale === 'zh'
      ? 'AI 摘要 · 只看计数不看内容 · 计数全部实测（可与下方页签对照）。'
      : 'AI digest · counts only, never content · every figure is measured (cross-check against the tab above).',
    cached: false,
    histogram,
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
    headers: { 'cache-control': 'no-store', 'x-nexus-ai': 'notif-digest' },
  });
}
