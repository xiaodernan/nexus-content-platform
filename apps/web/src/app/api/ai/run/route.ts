import { NextResponse } from 'next/server';
import { AiRequestSchema, AiResponseSchema } from '@nexus/schemas';
import { getAiCapabilities } from '@/lib/env';
import { mockProvider } from '@/server/ai/mock';
import { runAiService } from '@/server/ai/client';
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
      // 检测到真实 key：交给 ai-service 调真模型；拿不到服务就明确报不可用，绝不拿 Mock 冒充（§159）
      const result = await runAiService(parsed.data);
      if (!result.ok) return NextResponse.json(result.error, { status: result.status ?? 503 });
      return NextResponse.json(result.response);
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
