import { z } from 'zod';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { readJson, jsonError, badRequest } from '@/server/http';
import { getRateLimiter, rateKey, clientIp } from '@/server/security/rateLimit';
import { getAiCapabilities } from '@/lib/env';
import { chatWithCharacter } from '@/server/ai/client';
import { canonPrelude } from '@/lib/canonPrefix';

export const dynamic = 'force-dynamic';

/**
 * ──EDITOR-NOTE · /discover 的"馆长批注"（cont. 192）────────────────────────
 *
 * 输入：trending 榜前三张作品的**实测指标**（名称/类型/浏览/赞/转/热度分），
 * 输出：模型为每张卡各写一句话"为什么值得打开"——只允许用输入中的数字，不得编造。
 *
 * 纪律：
 *  1. 输入只有指标数字——任何"剧情好/画面美"之类无法度量的断言一律不准（模型不是读手稿，是读指标）；
 *  2. 每句批注必须包含具体数字（浏览/赞/转/热度的至少其一）——禁止形容词堆砌；
 *  3. DEMO MODE → 409 如实拒绝；限流 20/小时/IP；整批 24h LRU 缓存（省 provider 额度）；
 *  4. 模型输出过 zod 校验，不足 3 条即整体 502（不装"部分成功"）；
 *  5. disclaimer 常驻「AI 批注 · 依据实测数据 · 非人工背书」。
 */

const Card = z.object({
  publicationId: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  kind: z.string().min(1).max(24),
  views: z.number().finite().min(0),
  likes: z.number().finite().min(0),
  comments: z.number().finite().min(0),
  remixes: z.number().finite().min(0),
  score: z.number().finite().min(0).optional(),
});

const Body = z
  .object({
    locale: z.enum(['zh', 'en']).default('zh'),
    cards: z.array(Card).min(1).max(5),
  })
  .strict();

const Note = z.object({
  publicationId: z.string().min(1).max(64),
  note: z.string().min(4).max(160),
});

interface EditorNotePayload {
  notes: z.infer<typeof Note>[];
  generatedAt: string;
  model: string;
  disclaimer: string;
  cached: boolean;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const LRU_MAX = 4;
const cache = new Map<string, { at: number; payload: EditorNotePayload }>();

function digest(body: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
}

function buildSystem(cards: z.infer<typeof Card>[], locale: 'zh' | 'en'): string {
  const isZh = locale === 'zh';
  const zh = [
    canonPrelude('zh', { zh: '--- 你正在复核的对象：/discover 热度榜前几名的实测指标 ---', en: '' }),
    '',
    '你是 NEXUS 平台的"馆长"（策展人）。用户消息里有该平台 /discover 热度榜前几名的**实测指标**（浏览/赞/评论/转化/热度分，全部来自数据库真实计数）。',
    '请为每一项作品写一句"为什么值得打开"的短批注。',
    '',
    '纪律（不可违反）：',
    '1. 批注必须包含输入中的具体数字（例如浏览、赞、热度，或其计算——如 210 次浏览）——禁止只用"精彩/美轮美奂"这类无法度量的形容词；',
    '2. 你只读指标，没读作品正文——不能对作品内容做任何事实断言（不准说"讲一个关于…的故事"、"画风独特"这类没依据的话）；',
    '3. 一句话，不超过 80 字；不人身攻击、不贬低、不营销套话（"错过等一年"）；',
    '4. 输出格式：严格 JSON 数组，无 markdown、无前言：',
    '   [{"publicationId":"…","note":"…"}, …]',
    '5. 批注语言：跟随输入语言（此条为中文）。',
  ].join('\n');
  const en = [
    canonPrelude('en', { zh: '', en: '--- What you are reviewing: NEXUS /discover’s top entries, measured ---' }),
    '',
    'You are the NEXUS platform curator. Below are the **measured metrics** for the top entries of /discover (views/likes/comments/remixes/heat, all real database counts).',
    'Write ONE short editor\u2019s note per work — the reason it deserves opening.',
    '',
    'Rules (non-negotiable):',
    '1. Each note MUST cite at least one input figure (views, likes, heat, or a computation such as "210 views") — no unmeasurable adjectives alone.',
    '2. You read metrics, never the work itself — do NOT assert facts about its content ("a story about…", "a unique style") — you have no evidence for those.',
    '3. One sentence, ≤ 140 chars, no personal attacks, no marketing hype.',
    '4. Output format: a strict JSON array, no markdown, no preamble:',
    '   [{"publicationId":"…","note":"…"}, …]',
    '5. Note language: follow the input (this one is English).',
  ].join('\n');
  return isZh ? zh : en;
}

function buildUser(cards: z.infer<typeof Card>[], locale: 'zh' | 'en'): string {
  const isZh = locale === 'zh';
  const compact = cards.map((c) => ({
    id: c.publicationId,
    name: c.name,
    kind: c.kind,
    views: c.views,
    likes: c.likes,
    comments: c.comments,
    remixes: c.remixes,
    ...(c.score !== undefined ? { heat: c.score } : {}),
  }));
  const label = isZh ? '【/discover 热度榜前段的实测指标（JSON）】' : '【/discover top entries (measured metrics as JSON)】';
  const tail = isZh
    ? '请严格输出 JSON 数组：[{"publicationId":"…","note":"…"}, …]——每个 publicationId 对应一句话批注。'
    : 'Output strict JSON: [{"publicationId":"…","note":"…"}, …] — one note per publicationId.';
  return [label, JSON.stringify(compact, null, 2), '', tail].join('\n');
}

function parseNotes(text: string, cards: z.infer<typeof Card>[]): z.infer<typeof Note>[] {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('no json array found');
  const raw = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  const arr = Array.isArray(raw) ? raw : [];
  const want = new Set(cards.map((c) => c.publicationId));
  const out: z.infer<typeof Note>[] = [];
  for (const item of arr) {
    const parsed = Note.safeParse(item);
    if (parsed.success && want.has(parsed.data.publicationId)) out.push(parsed.data);
  }
  if (out.length < cards.length) throw new Error(`only ${out.length}/${cards.length} valid notes`);
  return out.slice(0, cards.length);
}

export async function POST(req: Request): Promise<Response> {
  const caps = await getAiCapabilities();
  if (caps.text !== 'real') {
    return await jsonError(409, 'demo_mode', { message: 'AI provider 未就绪——当前 DEMO MODE，如实拒绝出批注（不编造荐语）。' });
  }

  const ip = clientIp(req);
  const rl = await getRateLimiter().hit(rateKey('editor-note', ip, 'anon'), 20, 60 * 60 * 1000);
  if (!rl.allowed) {
    return await jsonError(429, 'rate_limited', { message: '馆长批注次数超限（每小时 20 次），稍后再来。', retryAfterMs: rl.retryAfterMs });
  }

  const raw = await readJson(req);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return await badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  const { cards, locale } = parsed.data;

  const key = digest({ cards, locale });
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ...hit.payload, cached: true }, { headers: { 'cache-control': 'no-store' } });
  }

  const system = buildSystem(cards, locale);
  const user = buildUser(cards, locale);
  const reqId = `editor_note_${Date.now().toString(36)}`;
  const chat = await chatWithCharacter({ requestId: reqId, system, user, modelClass: 'balanced' });
  if (!chat.ok) {
    const status = chat.status && chat.status >= 400 && chat.status < 600 ? chat.status : 503;
    return await jsonError(status, chat.error.code, { message: chat.error.message });
  }

  let notes: z.infer<typeof Note>[];
  try {
    notes = parseNotes(chat.response.text, cards);
  } catch {
    return await jsonError(502, 'provider_failed', {
      message: '模型输出未达到可展示的质量（未覆盖全部作品）。请稍后重试。',
    });
  }

  const payload: EditorNotePayload = {
    notes,
    generatedAt: new Date().toISOString(),
    model: chat.response.model,
    disclaimer: locale === 'zh'
      ? 'AI 批注 · 依据实测指标（非人工背书）· 指标如实展示。'
      : 'AI notes · grounded in measured metrics (not human endorsement) · figures shown as measured.',
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
    headers: { 'cache-control': 'no-store', 'x-nexus-ai': 'editor-note' },
  });
}
