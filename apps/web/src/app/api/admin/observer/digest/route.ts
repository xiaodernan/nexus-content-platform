import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readJson, jsonError, badRequest } from '@/server/http';
import { getRateLimiter, rateKey, clientIp } from '@/server/security/rateLimit';
import { getAiCapabilities } from '@/lib/env';
import { chatWithCharacter } from '@/server/ai/client';
import { currentUserOrNull } from '@/server/domain/session';
import { OBSERVER_COOKIE, OBSERVER_COOKIE_VALUE } from '../route';
import { readObserverMetrics, buildObserverAdvice } from '@/server/admin/observer';

export const dynamic = 'force-dynamic';

/**
 * ──OBSERVER-DEEPREAD · 只读观察站「AI 深读」（cont. 209 slice）─────────────
 *
 * 口令 123（public）后任何人都能看只读观察站；这一道按钮把同一份**实测聚合**
 * 再喂给 gpt-6.1-terra，产出 3–5 句「下一步具体做什么」——人的判断是规则引擎的，
 * 模型负责把数字串进叙事、指向瓶颈、点出优先级。模型**没有**别的输入：
 * 没有用户姓名、没有作品正文、没有单作品统计之外的行——只有计数。
 *
 * 纪律：
 *  1. 请求体只有 locale（客户端不带任何数据）——服务器自算指标，防止伪造输入；
 *  2. 输出必须含数字 → 否则 502（不展示空话）；
 *  3. DEMO MODE → 409；每 IP+观众 5/小时；24h LRU（指标签名键）；
 *  4. 缓存命中的模型回答也原样回声 `x-nexus-ai: observer-deepread-cached`。
 */

const Body = { parse: (v: unknown) => ({ locale: v && typeof v === 'object' && (v as { locale?: unknown }).locale === 'en' ? 'en' as const : 'zh' as const }) };

interface DigestPayload {
  digest: string;
  model: string;
  disclaimer: string;
  cached: boolean;
  /** 依据：服务器此刻算出来的实测指标（UI 原样展示，不经过模型） */
  metrics: {
    usersTotal: number;
    usersNew7d: number;
    publishesPublicApproved: number;
    viewsTotal: number;
    likesTotal: number;
    opens7d: number;
    opens30d: number;
    completionPctAvg30d: number | null;
    completionsGame: number;
    completionsWork: number;
    suspectedBots7d: number;
    tasksAwaitingApproval: number;
    tasksSucceeded: number;
    tasksFailed: number;
  };
}

const TTL_MS = 24 * 60 * 60 * 1000;
const LRU_MAX = 16;
const cache = new Map<string, { at: number; payload: DigestPayload }>();

function sigKey(locale: 'zh' | 'en', m: DigestPayload['metrics']): string {
  const sig = [
    m.usersTotal, m.usersNew7d, m.publishesPublicApproved, m.viewsTotal,
    m.likesTotal, m.opens7d, m.opens30d, m.completionPctAvg30d,
    m.completionsGame, m.completionsWork, m.suspectedBots7d,
    m.tasksAwaitingApproval, m.tasksSucceeded, m.tasksFailed,
  ].join('|');
  return crypto.createHash('sha256').update(`${locale}|${sig}`).digest('hex').slice(0, 16);
}

async function observerAllowed(): Promise<boolean> {
  const user = await currentUserOrNull();
  if (user?.role === 'admin') return true;
  const store = await cookies();
  return store.get(OBSERVER_COOKIE)?.value === OBSERVER_COOKIE_VALUE;
}

export async function POST(req: Request): Promise<Response> {
  if (!(await observerAllowed())) {
    return await jsonError(401, 'not_authenticated', { message: '先带口令 123（或以 admin 身份）进只读观察站。' });
  }

  const caps = await getAiCapabilities();
  if (caps.text !== 'real') {
    return await jsonError(409, 'demo_mode', { message: 'AI provider 未就绪——当前 DEMO MODE，如实拒绝出建议（不编造）。' });
  }

  const ip = clientIp(req);
  const rl = await getRateLimiter().hit(rateKey('observer-deepread', ip, 'observer'), 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return await jsonError(429, 'rate_limited', { message: '次数超限（每小时 5 次），稍后再来。', retryAfterMs: rl.retryAfterMs });
  }

  const raw = await readJson(req).catch(() => null);
  const parsed = Body.parse(raw ?? {});
  const { locale } = parsed;

  const m = await readObserverMetrics();
  const advice = buildObserverAdvice(m);

  if (m.opens30d === 0 && m.viewsTotal === 0) {
    const payload: DigestPayload = {
      digest: locale === 'zh'
        ? '平台是空的——连一个公开作品都还没有过审。先把 1 个作品完整做完、过审、让至少 3 个人打开一次，再谈优化。'
        : 'The platform is empty — not a single approved public work yet. Ship one complete piece, get it past review, put it in front of at least three real people; then we talk optimization.',
      model: 'no-model (server-authored empty case)',
      disclaimer: locale === 'zh' ? '未调用模型——没有任何实测数字可解释时不消耗 provider。' : 'No model call — with zero measured traffic there is nothing to explain.',
      cached: false,
      metrics: compactMetrics(m),
    };
    return NextResponse.json(payload, { headers: { 'cache-control': 'no-store', 'x-nexus-ai': 'observer-deepread-empty' } });
  }

  const metrics = compactMetrics(m);
  const key = sigKey(locale, metrics);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ...hit.payload, cached: true }, { headers: { 'cache-control': 'no-store', 'x-nexus-ai': 'observer-deepread-cached' } });
  }

  const metricsJson = JSON.stringify(metrics);
  const adviceJson = JSON.stringify(advice.map((a) => ({ severity: a.severity, text: locale === 'zh' ? a.textZh : a.textEn })));
  // Codex-style KV reuse: system prefix 永不变（只给角色与纪律，不含任何数据），
  // 所有"本次变动"（metrics JSON / 规则引擎输出）放在 user 里——
  // 这样任何同一 locale 的 deep-read 调用都共享同一 cache key 前缀，命中率 = 100%（第 2 次起）。
  const system = locale === 'zh'
    ? [
        '你是 NEXUS 平台的首席产品顾问，正在给一位独立开发者看他自己产品的**实测**聚合数据。',
        '',
        '纪律（不可违反）：',
        '1. 只允许依据这些数字与那条规则建议下断言——禁止想象任何作品内容、用户心理、竞争对手；',
        '2. 说清楚下一步具体做什么：先做哪件事、为什么（引用数字）、预期效果、成本（几页/几天）；',
        '3. 语气平静、克制、口语；不用营销腔；3–5 句；',
        '4. 每句必须带数字；不带数字的句子一律不许出现；',
        '5. 不替用户做结论，只排优先级与动作。',
      ].join('\n')
    : [
        'You are the lead product adviser for NEXUS, reviewing the founder\'s own platform from its **measured** aggregate numbers.',
        '',
        'Rules (non-negotiable):',
        '1. Judge only from these numbers and that rule-engine input —\r NEVER invent work contents, user psychology, or competitors;',
        '2. Say exactly what to do next: which thing first, why (cite figures), expected effect, and cost (which pages / how many days);',
        '3. Calm, restrained, plain-spoken tone; no marketing voice; 3–5 sentences;',
        '4. Every sentence must carry a figure; no figureless sentences allowed;',
        '5. Do not make decisions for the founder — rank the actions and explain the order.',
      ].join('\n');

  const user = locale === 'en'
    ? [
        `Metrics (JSON, all real): ${metricsJson}`,
        `Rule engine has already raised (JSON): ${adviceJson}`,
        'Three to five sentences, grounded in the figures, ordered by what pays back first. In English.',
      ].join('\n')
    : [
        `数据（JSON，全部为真实计数）：${metricsJson}`,
        `规则引擎已经按阈值提出了（JSON）：${adviceJson}`,
        '三到五句，落在数字上，按「最先回本」的顺序给出下一步。用中文。',
      ].join('\n');
  const reqId = `observer_deepread_${Date.now().toString(36)}`;
  const chat = await chatWithCharacter({ requestId: reqId, system, user, modelClass: 'balanced' });
  if (!chat.ok) {
    const status = chat.status && chat.status >= 400 && chat.status < 600 ? chat.status : 503;
    return await jsonError(status, chat.error.code, { message: chat.error.message });
  }

  const digest = chat.response.text.trim();
  if (digest.length < 20 || !/\d/.test(digest)) {
    return await jsonError(502, 'provider_failed', {
      message: '模型输出没落在实测数字上（缺少数字）——不展示这类空话，请稍后重试。',
    });
  }

  const payload: DigestPayload = {
    digest: digest.slice(0, 900),
    model: chat.response.model,
    disclaimer: locale === 'zh'
      ? 'AI 深读 · 只喂实测聚合 · 每条判断带数字 · 规则引擎建议同屏对照'
      : 'AI deep-read · only measured aggregates in · every judgment cites a figure · rule-engine advice alongside for cross-check.',
    cached: false,
    metrics,
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
    headers: { 'cache-control': 'no-store', 'x-nexus-ai': 'observer-deepread' },
  });
}

function compactMetrics(m: Awaited<ReturnType<typeof readObserverMetrics>>): DigestPayload['metrics'] {
  return {
    usersTotal: m.usersTotal,
    usersNew7d: m.usersNew7d,
    publishesPublicApproved: m.publishesPublicApproved,
    viewsTotal: m.viewsTotal,
    likesTotal: m.likesTotal,
    opens7d: m.opens7d,
    opens30d: m.opens30d,
    completionPctAvg30d: m.completionPctAvg30d,
    completionsGame: m.completionsGame,
    completionsWork: m.completionsWork,
    suspectedBots7d: m.suspectedBots7d,
    tasksAwaitingApproval: m.tasks.awaitingApproval,
    tasksSucceeded: m.tasks.succeeded,
    tasksFailed: m.tasks.failed,
  };
}
