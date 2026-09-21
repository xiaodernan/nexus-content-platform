import { NextResponse } from 'next/server';
import { AiRequestSchema, AiResponseSchema } from '@nexus/schemas';
import { getAiCapabilities } from '@/lib/env';
import { mockProvider } from '@/server/ai/mock';
import { requireUser } from '@/server/domain/session';
import { badRequest, failure, jsonError } from '@/server/http';

/** 设计文档可能很大；给请求体一个明确上限，超过就拒绝而不是慢慢吃内存 */
const MAX_BODY_BYTES = 6 * 1024 * 1024;

export async function POST(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return jsonError(413, 'payload_too_large', { message: `请求体超过 ${MAX_BODY_BYTES / 1024 / 1024}MB 上限` });
    raw = JSON.parse(text) as unknown;
  } catch {
    return badRequest(['请求体必须是 JSON']);
  }

  const parsed = AiRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }

  try {
    await requireUser();
    const caps = getAiCapabilities();
    if (caps.text === 'real') {
      // 检测到真实 key，但适配器尚未接入：明确报不可用，绝不拿 Mock 冒充真模型（§159）
      return NextResponse.json(
        {
          requestId: parsed.data.requestId,
          capability: 'unavailable',
          provider: 'none',
          model: 'none',
          plans: [],
          patches: [],
          labels: [],
          activities: [],
          explanation: '',
          usage: {
            provider: 'none',
            model: 'none',
            modelClass: parsed.data.modelClass,
            tokensIn: 0,
            tokensOut: 0,
            latencyMs: 0,
            costUsd: 0,
            toolCalls: 0,
            demoMode: false,
          },
          approvals: [],
          error: {
            code: 'provider-unavailable',
            message: '已检测到 provider key，但真实 provider 适配器还没接入',
            hint: '当前只提供标注过的确定性 Mock；真实链路在 AI Service（FastAPI）落地后接管。',
            retryable: false,
          },
        },
        { status: 503 },
      );
    }

    const response = await mockProvider.run(parsed.data);
    const validated = AiResponseSchema.safeParse(response);
    if (!validated.success) {
      return failure(new Error(`provider 输出不符合契约：${validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；')}`), 'POST /api/ai/run');
    }
    return NextResponse.json(validated.data);
  } catch (error) {
    return failure(error, 'POST /api/ai/run');
  }
}
