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
    /** 编年续写：模型只能挑这里已有的纪元字面，不许自造历史分期 */
    eras: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
    chronicle: z.boolean().default(false),
    /** 记忆回声模式：只给这一条节点写感官刻痕 */
    echo: z.boolean().default(false),
    focusTitle: z.string().trim().max(120).default(''),
    focusBody: z.string().trim().max(4000).default(''),
    /** 牵线模式：模型只能从这些候选 id 里挑一个目标 */
    link: z.boolean().default(false),
    candidates: z.array(z.object({
      id: z.string().min(1).max(80),
      title: z.string().max(120),
      body: z.string().max(600),
    })).max(24).default([]),
  })
  .strict();

export async function POST(req: Request): Promise<NextResponse> {
  const ip = clientIp(req);
  const rl = await getRateLimiter().hit(rateKey('ai-world-fill', ip, 'anon'), 10, 60 * 60 * 1000);
  if (!rl.allowed) return jsonError(429, 'rate_limited', { message: '填料太频繁了，稍后再试', retryAfterMs: rl.retryAfterMs });

  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  const b = parsed.data;

  const system = b.link
    ? (b.locale === 'zh'
      ? '你是这个世界的星图编纂者。给一条条目找一条**真的**有关系的目标。只输出一个 JSON 对象：{"toId":"候选id","label":"关系名"}，不要围栏、不要解释。toId 必须原样来自给定的候选列表，绝不自造；label ≤ 40 字，写具体关系（如「效忠」「磨盘记时的交接」「盐的来源」），不写空话。关系必须能从两条正文里读出来，否则输出 {"toId":"","label":""}。'
      : 'You map the relations of this world. Find ONE genuinely connected target for an entry. Output ONLY a JSON object: {"toId":"candidate id","label":"relation"} — no fences, no prose. toId must be copied verbatim from the candidate list; never invent one. Label ≤ 40 chars, concrete (e.g. "sworn to", "kept the mill-time", "source of the salt"), never vague. If no relation is supported by the two bodies, output {"toId":"","label":""}.')
    : b.echo
    ? (b.locale === 'zh'
      ? '你是这个世界的记忆保管者。给一条世界条目写「记忆回声」：只输出 JSON 数组 [{"title":"...","body":"..."}]，不要围栏、不要解释。title 原样抄回条目名；body 是一段 ≤240 字的纯感官刻痕——声音、味道、触感、光线里的一瞬，不是剧情梗概、不是评价、不写"作为 AI"之类的话。只依据给定条目的正文，没有任何可写的细节就返回 []。'
      : 'You keep this world’s memories. Write a "memory echo" for one world entry. Output ONLY a JSON array [{"title":"...","body":"..."}] — no fences, no prose. Copy the entry name into title; body must be a sensory trace of one instant (sound, taste, touch, light), ≤ 240 chars — never a plot summary, verdict, or "as an AI" chatter. Use only the supplied entry body; return [] if there is nothing to draw from.')
    : b.chronicle
    ? (b.locale === 'zh'
      ? '你是这个世界的史官。为编年册续写一条新故事。只输出 JSON 数组：[{"title":"...","body":"...","era":"..."}]，不要围栏、不要解释。era 必须从给定的纪元列表里原样挑一个，不许自造；如果列表为空就输出空串。title ≤ 40 字、body 100–300 字，写一件具体发生过的事：谁做了什么、代价是什么、留下什么可追问的痕迹。只依据给定的世界概述与已有条目，不编造数字，不写"作为 AI"之类的话。只要概述里有一句可用的前提，就必须写出一条；连概述都是空的才返回 []。'
      : 'You are the chronicler of this world. Write ONE new story entry for the chronicle. Output ONLY a JSON array: [{"title":"...","body":"...","era":"..."}] — no fences, no prose. The era must be copied verbatim from the supplied era list; never invent one, and use an empty string when the list is empty. Title ≤ 40 chars, body 100–300 chars: something that actually happened — who did what, what it cost, what trace remains. Use only the given summary and existing entries; invent no figures and no "as an AI" chatter. If the summary has even one usable premise, write an entry; return [] only when the summary is empty.')
    : (b.locale === 'zh'
      ? '你是这个世界的结构编纂者。为指定类别补 1–2 条可放进世界档案的条目。只输出 JSON 数组：[{"title":"...","body":"..."}]，不要围栏、不要解释。每条 title ≤ 40 字、body 60–240 字，写具体的感官细节与可追问的线索；只依据给定的世界概述与已有标题，不编造数字，不写"作为 AI"之类的话，不重复已有标题。没有依据就返回 []。'
      : 'You are the structural archivist of this world. Add 1–2 archive entries for the requested section. Output ONLY a JSON array: [{"title":"...","body":"..."}] — no fences, no prose. Each title ≤ 40 chars, body 60–240 chars, concrete sensory detail and a follow-up thread. Use only the given summary and existing titles; invent no figures, no "as an AI" chatter, no duplicate titles. If there is no basis, return [].');
  const user = [
    `World: ${b.worldName}`,
    `Summary: ${b.summary || '(empty)'}`,
    `Section: ${b.kind}`,
    `Existing titles in this section: ${b.existingTitles.length ? b.existingTitles.join(' | ') : '(none)'}`,
    ...(b.chronicle ? [`Existing eras (copy one verbatim): ${b.eras.length ? b.eras.join(' | ') : '(none — use empty string)'}`] : []),
    ...(b.echo ? [`Focus entry: ${b.focusTitle}`, `Entry body: ${b.focusBody || '(empty)'}`] : []),
    ...(b.link ? [
      `From entry: ${b.focusTitle}`,
      `From body: ${b.focusBody || '(empty)'}`,
      `Candidates (id | title | body):\n${b.candidates.map((x) => `${x.id} | ${x.title} | ${x.body}`).join('\n')}`,
    ] : []),
  ].join('\n');

  const result = await chatWithCharacter({ requestId: `world-fill-${Date.now()}`, system, user, modelClass: 'balanced' });
  if (!result.ok) return jsonError(502, 'provider-unavailable', { message: result.error?.message ?? 'provider 不可用' });
  return NextResponse.json({ ok: true, text: result.response.text, model: result.response.model, capability: result.response.capability });
}
