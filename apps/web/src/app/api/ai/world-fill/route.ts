import { z } from 'zod';
import { NextResponse } from 'next/server';
import { readJson, jsonError, badRequest } from '@/server/http';
import { getRateLimiter, rateKey, clientIp } from '@/server/security/rateLimit';
import { chatWithCharacter } from '@/server/ai/client';

export const dynamic = 'force-dynamic';

/**
 * §44 世界填料的服务端代理。浏览器不直接 import `server/ai/client`（那是服务端模块，
 * 在客户端里 process.env 读不到、CORS 也会被 ai-service 的 405 挡掉），统一走 web 这一跳：
 * provider 调用留在 ai-service，限流与凭据收口在 web，写库仍由 WorldPanel 的显式动作完成。
 *
 * 返回的是模型原文，不做"兜底生成"——解析失败由 lib/worldFill 的纯函数判空，界面照实说没拿到。
 */
const Body = z
  .object({
    locale: z.enum(['zh', 'en']).default('zh'),
    worldName: z.string().trim().min(1).max(120),
    summary: z.string().trim().max(4000).default(''),
    kind: z.string().trim().min(1).max(40),
    existingTitles: z.array(z.string().trim().max(120)).max(200).default([]),
  })
  .strict();

export async function POST(req: Request): Promise<NextResponse> {
  const ip = clientIp(req);
  const rl = await getRateLimiter().hit(rateKey('ai-world-fill', ip, 'anon'), 10, 60 * 60 * 1000);
  if (!rl.allowed) return jsonError(429, 'rate_limited', { message: '填料太频繁了，稍后再试', retryAfterMs: rl.retryAfterMs });

  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  const b = parsed.data;

  const system = b.locale === 'zh'
    ? '你是这个世界的结构编纂者。为指定类别补 1–2 条可放进世界档案的条目。只输出 JSON 数组：[{"title":"...","body":"..."}]，不要围栏、不要解释。每条 title ≤ 40 字、body 60–240 字，写具体的感官细节与可追问的线索；只依据给定的世界概述与已有标题，不编造数字，不写"作为 AI"之类的话，不重复已有标题。没有依据就返回 []。'
    : 'You are the structural archivist of this world. Add 1–2 archive entries for the requested section. Output ONLY a JSON array: [{"title":"...","body":"..."}] — no fences, no prose. Each title ≤ 40 chars, body 60–240 chars, concrete sensory detail and a follow-up thread. Use only the given summary and existing titles; invent no figures, no "as an AI" chatter, no duplicate titles. If there is no basis, return [].';
  const user = [
    `World: ${b.worldName}`,
    `Summary: ${b.summary || '(empty)'}`,
    `Section: ${b.kind}`,
    `Existing titles in this section: ${b.existingTitles.length ? b.existingTitles.join(' | ') : '(none)'}`,
  ].join('\n');

  const result = await chatWithCharacter({ requestId: `world-fill-${Date.now()}`, system, user, modelClass: 'balanced' });
  if (!result.ok) return jsonError(502, 'provider-unavailable', { message: result.error?.message ?? 'provider 不可用' });
  return NextResponse.json({ ok: true, text: result.response.text, model: result.response.model, capability: result.response.capability });
}
