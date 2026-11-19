import { z } from 'zod';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { readJson, jsonError, badRequest } from '@/server/http';
import { getRateLimiter, rateKey, clientIp } from '@/server/security/rateLimit';
import { getAiCapabilities } from '@/lib/env';
import { chatWithCharacter } from '@/server/ai/client';
import { BIBLE_CHAPTERS, BIBLE_ECHOES, type BibleChapter } from '@/world-bible/generated';
import { entryForDate, entryIndexFor, parseEditionOutput, epochDay } from '@/lib/dailyEdition';

export const dynamic = 'force-dynamic';

/**
 * ──DAILY-EDITION · 今日潮候（cont. 206 片）─────────────────────────────
 *
 * 输入：locale（可选 dateIso，用于预演历史/未来的期号——只接受 ISO 日期，不接受别的）。
 * 模型只读"这一期"的正典摘录（一章或一篇回响）——不编造、不超出；
 * 输出：三句话摘要 + 一句"Ponder: / 思考："（不替读者回答）。
 *
 * 纪律：
 *  1. 一次只喂一个条目——全典籍喂进去会毁掉 KV 前缀复用，也毁掉"今日潮候"这件事本身；
 *  2. 日期 → 期号是确定性的（epoch day % N 章/回响）——同一天所有人看到同一期；
 *  3. DEMO MODE → 409 如实拒绝；每小时 20 次/IP；24h LRU（slug|locale|date）；
 *  4. 输出必须带 Ponder/思考 标记且问句收尾——没有就 502（不展示半成品正文）。
 */

const Body = z.object({
  locale: z.enum(['zh', 'en']).default('zh'),
  dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

const MAX_EXCERPT_CHARS = 5_000;
const TTL_MS = 24 * 60 * 60 * 1000;
const LRU_MAX = 8;

interface EditionPayload {
  dateIso: string;
  leaf: { slug: string; titleZh: string; titleEn: string; kind: 'chapter' | 'echo'; index: number };
  digest: string;
  ponder: string;
  model: string;
  cached: boolean;
}

const cache = new Map<string, { at: number; payload: EditionPayload }>();

function cacheKey(slug: string, locale: 'zh' | 'en', dateIso: string): string {
  return crypto.createHash('sha256').update(`${dateIso}|${slug}|${locale}`).digest('hex').slice(0, 16);
}

function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: Request): Promise<Response> {
  const caps = await getAiCapabilities();
  if (caps.text !== 'real') {
    return await jsonError(409, 'demo_mode', { message: 'AI provider 未就绪——当前 DEMO MODE，如实拒绝出笺（不编造正典）。' });
  }

  const ip = clientIp(req);
  const rl = await getRateLimiter().hit(rateKey('daily-edition', ip, 'anon'), 20, 60 * 60 * 1000);
  if (!rl.allowed) {
    return await jsonError(429, 'rate_limited', { message: '今日潮候次数超限（每小时 20 次），稍后再来。', retryAfterMs: rl.retryAfterMs });
  }

  const raw = await readJson(req);
  const parsed = Body.safeParse(raw ?? {});
  if (!parsed.success) {
    return await badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  const { locale } = parsed.data;
  const dateIso = parsed.data.dateIso ?? todayUtcIso();

  const entries = [...BIBLE_CHAPTERS, ...BIBLE_ECHOES];
  if (entries.length === 0) {
    return await jsonError(503, 'empty_canon', { message: '典籍室为空——无期可出。' });
  }
  const picked = entryForDate(dateIso);
  if (!picked) return await jsonError(503, 'empty_canon', { message: '典籍室为空——无期可出。' });
  const leafIndex = entryIndexFor(dateIso);
  const isEcho = BIBLE_ECHOES.includes(picked as BibleChapter);

  const key = cacheKey(picked.slug, locale, dateIso);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ...hit.payload, cached: true }, { headers: { 'cache-control': 'no-store' } });
  }

  const markdown = locale === 'en' ? picked.markdownEn : picked.markdownZh;
  const excerpt = markdown.slice(0, MAX_EXCERPT_CHARS);
  const system = locale === 'zh'
    ? [
        '你是《低语诸王》世界大典的伴读者。用户今天翻到这一篇摘录——你只能说这一篇写了什么。',
        '用三句话回应——不许超出摘录、不许编造、不许替作者发挥；语气克制，像一盏只照见灯下的人在说话。',
        '最后单独输出一行"思考："引出一句问句，把读者留在门边——不要替读者回答。',
        '格式：三句话摘要（换行），空一行，"思考：" 开头的一句问句。不输出标题、不输出其他文字。',
        '',
        '--- 正文摘录 ---',
        excerpt,
      ].join('\n')
    : [
        'You are a companion reader of The Whispers\' Kings world bible. Today the reader opened this excerpt.',
        'In three sentences, say what this piece is about — no beyond-the-excerpt facts, no invention, no authorial performance.',
        'Tone: restrained — a lamp-lit voice at most.',
        "End with a single line starting with 'Ponder:' and one question — leave the reader at the door; never answer it for them.",
        'Format: three-sentence digest (new lines), one blank line, then "Ponder:" + one question. No headers, no extra text.',
        '',
        '--- Excerpt ---',
        excerpt,
      ].join('\n');

  const user = locale === 'en'
    ? 'Here is today’s excerpt — write today’s edition.'
    : '这是今天的摘录——请出今日潮候。';
  const chat = await chatWithCharacter({ requestId: `daily_edition_${epochDay(dateIso)}_${locale}`, system, user, modelClass: 'fast' });
  if (!chat.ok) {
    const status = chat.status && chat.status >= 400 && chat.status < 600 ? chat.status : 503;
    return await jsonError(status, chat.error.code, { message: chat.error.message });
  }

  const parsedOut = parseEditionOutput(chat.response.text, locale);
  if (!parsedOut.ok) {
    return await jsonError(502, 'provider_failed', { message: '模型输出没落成「三句话 + 思考」的形状——不展示这类半成品，请稍后重试。' });
  }

  const payload: EditionPayload = {
    dateIso,
    leaf: { slug: picked.slug, titleZh: picked.titleZh, titleEn: picked.titleEn, kind: isEcho ? 'echo' : 'chapter', index: leafIndex },
    digest: parsedOut.value.digest,
    ponder: parsedOut.value.ponder,
    model: chat.response.model,
    cached: false,
  };

  if (cache.size >= LRU_MAX) {
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [k, v] of cache) {
      if (v.at < oldestAt) {
        oldestAt = v.at;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { at: Date.now(), payload });

  return NextResponse.json(payload, { headers: { 'cache-control': 'no-store', 'x-nexus-ai': 'daily-edition' } });
}
