import { NextResponse } from 'next/server';
import { AiRequestSchema, AiResponseSchema } from '@nexus/schemas';
import { getAiCapabilities } from '@/lib/env';
import { assembleAiRequest } from '@/server/ai/assemble';
import { mockProvider } from '@/server/ai/mock';
import { runAiService } from '@/server/ai/client';
import { requireUser } from '@/server/domain/session';
import { csrfOk } from '@/server/security/csrf';
import { badRequest, failure, jsonError } from '@/server/http';

/**
 * 请求体上限：上下文里的整份文档已经不让客户端发了（§68），剩下的体积大头是
 * `references[].dataUrl`（参考图的 base64），所以这个上限是为它留的，不是为文档留的。
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
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }

  try {
    const user = await requireUser();
    const assembled = await assembleAiRequest(parsed.data, user.id);
    if (!assembled.ok) return jsonError(assembled.status, assembled.code, { message: assembled.message });

    const caps = await getAiCapabilities();
    if (caps.text === 'real') {
      // ai-service /healthz 报告其 llm provider 就绪：交给它调真模型；拿不到服务就明确报不可用，绝不拿 Mock 冒充（§159）
      // 注意发出去的是 assembled.wire：带目录、不带整份文档（§68）
      const result = await runAiService(assembled.wire);
      if (!result.ok) return NextResponse.json(result.error, { status: result.status ?? 503 });
      return NextResponse.json(result.response);
    }

    const response = await mockProvider.run(assembled.wire, { document: assembled.toolDocument ?? undefined });
    const validated = AiResponseSchema.safeParse(response);
    if (!validated.success) {
      return failure(new Error(`provider 输出不符合契约：${validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；')}`), 'POST /api/ai/run');
    }
    return NextResponse.json(validated.data);
  } catch (error) {
    return failure(error, 'POST /api/ai/run');
  }
}
