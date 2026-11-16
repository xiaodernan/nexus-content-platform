import { z } from 'zod';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { readJson, jsonError, badRequest } from '@/server/http';
import { getRateLimiter, rateKey, clientIp } from '@/server/security/rateLimit';
import { getAiCapabilities } from '@/lib/env';
import { chatWithCharacter } from '@/server/ai/client';
import { BIBLE_CHAPTERS, BIBLE_ECHOES } from '@/world-bible/generated';

export const dynamic = 'force-dynamic';

/**
 * ──BIBLE-CHAPTER-DIGEST · 让模型"读一遍给你听"（cont. 193）─────────────────
 *
 * 输入：slug + locale，单一正文章节 / 回响。
 * 模型只读原文摘录，不得编造、不得超出——输出三句话摘要 + 一句思考题。
 *
 * 纪律：
 *  1. 不读全书也不读其他章节——只允许当前 slug 的 markdown（正典唯一真值）；
 *  2. 不许补充正典没有的事实——只许复述当前章/回响已经写明的东西；
 *  3. DEMO MODE → 409 如实拒绝；20/小时/IP；7 天 LRU 缓存（每章节/语言只计费一次）；
 *  4. 输出必须以"思考："（zh）/"Ponder:"（en）引出一句问句——不替读者下结论，只递一个门。
 */

const Body = z.object({ slug: z.string().min(1).max(80), locale: z.enum(['zh', 'en']).default('zh') }).strict();

const MAX_DIGEST_MARKDOWN_CHARS = 6000;

interface ChapterDigestPayload {
  digest: string;
  ponder: string;
  model: string;
  cached: boolean;
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LRU_MAX = 32;
const cache = new Map<string, { at: number; payload: ChapterDigestPayload }>();

function digestKey(slug: string, locale: 'zh' | 'en'): string {
  return crypto.createHash('sha256').update(`${slug}|${locale}`).digest('hex').slice(0, 16);
}

export async function POST(req: Request): Promise<Response> {
  const caps = await getAiCapabilities();
  if (caps.text !== 'real') {
    return await jsonError(409, 'demo_mode', { message: 'AI provider 未就绪——当前 DEMO MODE，如实拒绝出摘要（不编造正典）。' });
  }

  const ip = clientIp(req);
  const rl = await getRateLimiter().hit(rateKey('bible-digest', ip, 'anon'), 20, 60 * 60 * 1000);
  if (!rl.allowed) {
    return await jsonError(429, 'rate_limited', { message: '摘要次数超限（每小时 20 次），稍后再来。', retryAfterMs: rl.retryAfterMs });
  }

  const raw = await readJson(req);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return await badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  const { slug, locale } = parsed.data;

  const chapter = BIBLE_CHAPTERS.find((ch) => ch.slug === slug) ?? BIBLE_ECHOES.find((ch) => ch.slug === slug);
  if (!chapter) return await jsonError(404, 'chapter_not_found', { message: '典籍室里没有这一篇。' });

  const key = digestKey(slug, locale);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ...hit.payload, cached: true }, { headers: { 'cache-control': 'no-store' } });
  }

  const markdown = locale === 'en' ? chapter.markdownEn : chapter.markdownZh;
  const excerpt = markdown.slice(0, MAX_DIGEST_MARKDOWN_CHARS);

  const system = locale === 'zh'
    ? [
        '你是《低语诸王》世界大典的伴读者。下面是正典中某一章/回响的摘录。',
        '请用三句话回答"这一章/回响写了什么"——不许超出摘录、不许编造、不许替作者发挥。',
        '语气克制，像一盏只照见灯下的人在说话。',
        '最后单独输出一行"思考："引出一句问句，把读者留在门边——不要替读者回答。',
        '格式：摘要三句话（换行），空一行，"思考："开头的一句问句。不输出标题、不输出其他文字。',
        '',
        '--- 正文摘录 ---',
        excerpt,
      ].join('\n')
    : [
        'You are a companion reader of The Whispers’ Kings world bible. Below is an excerpt from one chapter/echo of the canon.',
        'In three sentences, say what this chapter/echo is about — no invention, no beyond-the-excerpt facts, no authorial invention.',
        'Keep the tone restrained — like a lamp-lit voice, nothing more.',
        'End with a single line starting with "Ponder:" and one question — leave the reader at the door, never answer it for them.',
        'Format: three-sentence digest (new lines), one blank line, then "Ponder:" + one question. No headers, no extra text.',
        '',
        '--- Excerpt ---',
        excerpt,
      ].join('\n');

  const user = locale === 'en' ? 'Three sentences, then "Ponder:". In English.' : '三句摘要，然后"思考："。用中文。';
  const reqId = `digest_${Date.now().toString(36)}`;
  const chat = await chatWithCharacter({ requestId: reqId, system, user, modelClass: 'balanced' });
  if (!chat.ok) {
    const status = chat.status && chat.status >= 400 && chat.status < 600 ? chat.status : 503;
    return await jsonError(status, chat.error.code, { message: chat.error.message });
  }

  const text = chat.response.text.trim();
  const ponderMatch = text.match(/(?:Ponder:|思考：)([^\n]+)/i);
  const ponder = ponderMatch ? ponderMatch[1]!.trim() : (locale === 'zh' ? '（未能生成思考题）' : '(no pondering question generated)');
  const digest = ponderMatch ? text.slice(0, ponderMatch.index).trim() : text;

  const payload: ChapterDigestPayload = {
    digest: digest.slice(0, 1200),
    ponder: ponder.slice(0, 300),
    model: chat.response.model,
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
    headers: { 'cache-control': 'no-store', 'x-nexus-ai': 'chapter-digest' },
  });
}
