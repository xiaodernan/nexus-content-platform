import { z } from 'zod';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { readJson, jsonError, badRequest } from '@/server/http';
import { getRateLimiter, rateKey, clientIp } from '@/server/security/rateLimit';
import { getAiCapabilities } from '@/lib/env';
import { chatWithCharacter } from '@/server/ai/client';
import { canonIdentityPrelude } from '@/lib/canonPrefix';

export const dynamic = 'force-dynamic';

/**
 * ──MARKETPLACE-PICKS · /marketplace 的"AI 选品"（cont. 196）────────────────
 *
 * 输入：货架上仍在售（public/free）前三件的**实测字段**（标题 / 类型 / 价格 credits /
 * 下载量，下载量来自库里的计数列 download_count，随列表一同出所）。
 * 输出：模型为每件写一句"为什么值得看"——只允许用输入中的数字（价格 / 下载量）+ 类型常识。
 *
 * 纪律：
 *  1. 只看指标不看作品——不能对物品质量做事实断言（"精美/必备"这类形容词一律不准）；
 *  2. 每句必须引用输入数字（下载量或价格；0 也要说"0 下载"）；
 *  3. DEMO MODE → 409 如实拒绝；每 IP 每小时 10 次；整批 24h LRU 缓存；zod 全覆盖；
 *  4. 模型输出不足 3 条即 502（不装"部分成功"）；
 *  5. disclaimer 常驻「AI 选品 · 依据实测下载数 · 非人工背书」。
 */

const Card = z.object({
  itemId: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  type: z.string().min(1).max(32),
  priceCredits: z.number().finite().min(0),
  downloads: z.number().finite().int().min(0),
});

const Body = z
  .object({
    locale: z.enum(['zh', 'en']).default('zh'),
    items: z.array(Card).min(1).max(5),
  })
  .strict();

const Pick = z.object({
  itemId: z.string().min(1).max(64),
  note: z.string().min(4).max(160),
});

interface PicksPayload {
  picks: z.infer<typeof Pick>[];
  generatedAt: string;
  model: string;
  disclaimer: string;
  cached: boolean;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const LRU_MAX = 4;
const cache = new Map<string, { at: number; payload: PicksPayload }>();

function digest(body: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
}

function buildSystem(items: z.infer<typeof Card>[], locale: 'zh' | 'en'): string {
  const isZh = locale === 'zh';
  const zh = [
    canonIdentityPrelude('zh', { zh: '--- 你正在复核的货架：NEXUS /marketplace 仍在售的几件物品的实测字段 ---', en: '' }),
    '',
    '你是 NEXUS 平台 /marketplace 的"选品员"。用户消息里有货架上仍在售的前几件物品的**实测字段**（价格 credits / 下载量——全部来自数据库真实计数）。',
    '请为每一件写一句"为什么值得看"的短荐语。',
    '',
    '纪律（不可违反）：',
    '1. 每句必须引用用户消息中的数字（例如"下载 12 次"、"0 下载的新品"、"价格 30 credits"）——禁止只用"精美/必备/精品"；',
    '2. 你没买过、没读过作品本体——不能对质量做任何事实断言；',
    '3. 一句话，不超过 80 字；不贬低同类、不营销套话（"错过等一年"）；',
    '4. 输出格式：严格 JSON 数组，无 markdown、无前言：',
    '   [{"itemId":"…","note":"…"}, …]',
    '5. 荐语语言：跟随输入语言（此条为中文）。',
  ].join('\n');
  const en = [
    canonIdentityPrelude('en', { zh: '', en: '--- The shelf you are reviewing: NEXUS’s /marketplace items still on sale, with measured fields ---' }),
    '',
    'You are the NEXUS /marketplace pick clerk. The user message carries the **measured fields** of a few items still on the shelf (price in credits and download counts — all real database counters).',
    'Write ONE short pick-note per item — why it deserves a look.',
    '',
    'Rules (non-negotiable):',
    '1. Each note MUST cite an input figure (e.g. “12 downloads”, “0 downloads — new”, “price 30 credits”) — no unmeasurable adjectives alone.',
    '2. You never bought or read these works — do NOT assert facts about their quality.',
    '3. One sentence, ≤ 140 chars, no demeaning rivals, no marketing hype.',
    '4. Output format: a strict JSON array, no markdown, no preamble:',
    '   [{"itemId":"…","note":"…"}, …]',
    '5. Note language: follow the input (this one is English).',
  ].join('\n');
  return isZh ? zh : en;
}

function buildUser(items: z.infer<typeof Card>[], locale: 'zh' | 'en'): string {
  const isZh = locale === 'zh';
  const compact = items.map((i) => ({
    id: i.itemId,
    title: i.title,
    type: i.type,
    priceCredits: i.priceCredits,
    downloads: i.downloads,
  }));
  const label = isZh ? '【/marketplace 仍在售的货架（实测字段，JSON）】' : '【The shelf (/marketplace items still on sale, measured fields as JSON)】';
  const tail = isZh
    ? '请严格输出 JSON 数组：[{"itemId":"…","note":"…"}, …]——每个 itemId 对应一句话荐语。'
    : 'Output strict JSON: [{"itemId":"…","note":"…"}, …] — one note per itemId.';
  return [label, JSON.stringify(compact, null, 2), '', tail].join('\n');
}

function parsePicks(text: string, items: z.infer<typeof Card>[]): z.infer<typeof Pick>[] {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('no json array found');
  const raw = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  const arr = Array.isArray(raw) ? raw : [];
  const want = new Set(items.map((i) => i.itemId));
  const out: z.infer<typeof Pick>[] = [];
  for (const item of arr) {
    const parsed = Pick.safeParse(item);
    if (parsed.success && want.has(parsed.data.itemId)) out.push(parsed.data);
  }
  if (out.length < items.length) throw new Error(`only ${out.length}/${items.length} valid picks`);
  return out.slice(0, items.length);
}

export async function POST(req: Request): Promise<Response> {
  const caps = await getAiCapabilities();
  if (caps.text !== 'real') {
    return await jsonError(409, 'demo_mode', { message: 'AI provider 未就绪——当前 DEMO MODE，如实拒绝出荐语（不编造选品）。' });
  }

  const ip = clientIp(req);
  const rl = await getRateLimiter().hit(rateKey('marketplace-picks', ip, 'anon'), 10, 60 * 60 * 1000);
  if (!rl.allowed) {
    return await jsonError(429, 'rate_limited', { message: '选品次数超限（每小时 10 次），稍后再来。', retryAfterMs: rl.retryAfterMs });
  }

  const raw = await readJson(req);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return await badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  const { items, locale } = parsed.data;

  const key = digest({ items, locale });
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ...hit.payload, cached: true }, { headers: { 'cache-control': 'no-store' } });
  }

  const system = buildSystem(items, locale);
  const user = buildUser(items, locale);
  const reqId = `marketplace_picks_${Date.now().toString(36)}`;
  const chat = await chatWithCharacter({ requestId: reqId, system, user, modelClass: 'balanced' });
  if (!chat.ok) {
    const status = chat.status && chat.status >= 400 && chat.status < 600 ? chat.status : 503;
    return await jsonError(status, chat.error.code, { message: chat.error.message });
  }

  let picks: z.infer<typeof Pick>[];
  try {
    picks = parsePicks(chat.response.text, items);
  } catch {
    return await jsonError(502, 'provider_failed', {
      message: '模型输出未达到可展示的质量（未覆盖全部物品）。请稍后重试。',
    });
  }

  const payload: PicksPayload = {
    picks,
    generatedAt: new Date().toISOString(),
    model: chat.response.model,
    disclaimer: locale === 'zh'
      ? 'AI 选品 · 依据实测下载数（非人工背书）· 下载数如实展示。'
      : 'AI picks · grounded in measured download counts (not human endorsement) · figures shown as measured.',
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
    headers: { 'cache-control': 'no-store', 'x-nexus-ai': 'marketplace-picks' },
  });
}
