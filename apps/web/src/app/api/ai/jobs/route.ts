import { NextResponse } from 'next/server';
import { AiRequestSchema } from '@nexus/schemas';
import { getAiCapabilities } from '@/lib/env';
import { assembleAiRequest } from '@/server/ai/assemble';
import { agentLedgerFields, mentionNote } from '@/server/domain/agents';
import { submitJob } from '@/server/domain/ai-jobs';
import { requireUser } from '@/server/domain/session';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { badRequest, failure, jsonError } from '@/server/http';

/**
 * §162：把一次生成交给 ai-service 的队列，而不是挂在一个 HTTP 请求上等结果。
 *
 * 报文与 `/api/ai/run` 完全同一份（`AiRequestSchema` + 服务端装配），差别只在终点：
 * 这里不返回结果，返回一个作业号与它存在哪儿（`backend`）。同步那条路继续留着——
 * 一条会挂 60 秒的请求不该因为加了队列就消失，而两条路的账本都是 `agent_tasks`。
 *
 * 为什么没有真 provider 时直接拒：ai-service 里也有 Mock，但平台的 DEMO MODE 口径
 * 是 web 进程内那一份（§160）。让同一个"没配 key"的状态在两条路上长出两种假结果，
 * 看账本的人就再也分不清这条是哪儿给的。
 */
const MAX_BODY_BYTES = 6 * 1024 * 1024;

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return jsonError(413, 'payload_too_large', { message: `请求体超过 ${MAX_BODY_BYTES / 1024 / 1024}MB 上限` });
    raw = JSON.parse(text) as unknown;
  } catch {
    return badRequest(['请求体必须是 JSON']);
  }
  const parsed = AiRequestSchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));

  try {
    const user = await requireUser();
    const rl = getRateLimiter().hit(rateKey('ai/jobs', clientIp(req), user.id), 20, 10 * 60_000);
    if (!rl.allowed) {
      return jsonError(429, 'rate_limited', { message: '提交作业太频繁，稍后再试', retryAfterMs: rl.retryAfterMs });
    }
    const assembled = await assembleAiRequest(parsed.data, user.id);
    if (!assembled.ok) return jsonError(assembled.status, assembled.code, { message: assembled.message });

    const caps = await getAiCapabilities();
    if (caps.text !== 'real') {
      return jsonError(409, 'demo_mode', {
        message: '异步作业要有一个接上真 provider 的 AI Service。当前是 DEMO MODE：同步生成（/api/ai/run）照样能出模板结果，并标清是模板给的。',
      });
    }
    const result = await submitJob({
      wire: assembled.wire,
      projectId: parsed.data.context.projectId,
      createdById: user.id,
      // §112：这一轮归谁由服务端按名册解析，异步这条路与 /api/ai/run 同一份口径
      agent: assembled.agent,
      fallbackAgentKey: parsed.data.intent,
      capability: 'real',
    });
    if (!result.ok) {
      return jsonError(result.status ?? 503, result.error.code, { message: result.error.message, retryable: result.error.retryable });
    }
    // 队列的限制随回执一起给：backend=memory 时刷新页面、换实例都可能查不到这个 job，
    // 这话不写进报文，界面就只能猜，用户就只能"咦，我刚才那个作业呢"
    const fields = agentLedgerFields(assembled.agent, { askedAgentKey: parsed.data.agentKey, fallbackKey: parsed.data.intent });
    const headers: Record<string, string> = { 'x-nexus-task': result.taskId };
    // 与 /api/ai/run 同一组头：界面问"这一轮是谁做的、我点的那个名字认不认识"时，两条路得用同一个地方查
    if (fields.agent) headers['x-nexus-agent'] = fields.agent.key;
    const note = mentionNote(fields);
    if (note) headers['x-nexus-agent-note'] = encodeURIComponent(note);
    return NextResponse.json(result, { status: 202, headers });
  } catch (error) {
    return failure(error, 'POST /api/ai/jobs');
  }
}
