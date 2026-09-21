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
