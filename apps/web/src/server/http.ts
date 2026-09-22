import { NextResponse } from 'next/server';

/** API 层的统一出口：错误响应不带堆栈，避免泄露内部结构（§26 / SECURITY.md） */

export async function readJson(req: Request): Promise<unknown | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export function jsonError(status: number, error: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error, ...extra }, { status });
}

export function badRequest(issues: string[]): NextResponse {
  return jsonError(400, 'validation_failed', { issues });
}

export function notFound(): NextResponse {
  return jsonError(404, 'not_found');
}

export function failure(error: unknown, context: string): NextResponse {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[api] ${context}: ${message}`);
  return jsonError(500, 'internal', { message: '服务器处理失败，请稍后重试' });
}

/**
 * 回一段用户上传的字节（§80）。
 *
 * 这些字节来自不可信输入，而 URL 挂在本应用同源下，所以响应头必须假设
 * "有人会把脚本伪装成图片传上来"：
 * - `nosniff`：不让浏览器按内容猜类型（猜成 HTML 就变成同源脚本执行）
 * - `default-src 'none'`：即便被渲染，也拿不到任何执行/外联能力
 * - 类型只由服务端决定（magic bytes 判定结果），从不回显客户端的 Content-Type
 */
export function bytesResponse(bytes: Uint8Array, mime: string, cache: string): NextResponse {
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'content-type': mime,
      'content-length': String(bytes.length),
      'cache-control': cache,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
      'accept-ranges': 'none',
    },
  });
}
