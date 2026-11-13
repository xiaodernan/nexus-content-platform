import { NextResponse } from 'next/server';
import { currentUserOrNull } from '@/server/domain/session';
import { jsonError } from '@/server/http';
import { readDeadLettersPage, exportDeadLettersJsonl, DEFAULT_LIMIT } from '@/server/deadLetters';

export const dynamic = 'force-dynamic';

const DL_MAX_EXPORT_ITEMS = 1000;

/**
 * v689：死信的有界只读检视入口。
 * - `?limit=N`（上界 100，默认 DEFAULT_LIMIT）；`?cursor=<opaque>`（base64url { s, e }）。
 * - `?download=1`：以 NDJSON 回执整份导出（上界 DL_MAX_EXPORT_ITEMS=1000）。
 */
export async function GET(req: Request): Promise<Response> {
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });
  if (user.role !== 'admin') return jsonError(403, 'forbidden', { message: '死信只对审核员（role=admin）开放' });

  const url = new URL(req.url);
  const download = url.searchParams.get('download') === '1';
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw === null ? DEFAULT_LIMIT : Number(limitRaw);
  const cursor = url.searchParams.get('cursor');

  if (download) {
    const maxItems = Math.min(DL_MAX_EXPORT_ITEMS, Math.max(1, Number(url.searchParams.get('maxItems') ?? '500') || 500));
    const exported = await exportDeadLettersJsonl({ maxItems });
    if (!('items' in exported)) {
      return jsonError(503, 'redis-unconfigured', { message: '未配置 NEXUS_REDIS_URL，导出不可用' });
    }
    const body = exported.items.map((item) => JSON.stringify(item)).join('\n') + (exported.items.length ? '\n' : '');
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'content-disposition': `attachment; filename="dead-letters-${stamp}.jsonl"`,
        'cache-control': 'no-store',
      },
    });
  }

  const result = await readDeadLettersPage({ cursor, limit });
  if (result.kind === 'unavailable') return jsonError(503, 'redis-unconfigured', { message: result.note });
  if (result.kind === 'invalid-cursor') return jsonError(400, 'invalid-cursor', { message: '无法解析 cursor（或被改写）' });
  if (result.kind === 'snapshot-stale') return jsonError(409, 'snapshot-stale', { message: 'dead 列表在本次分页内已被头部 LPUSH 改写；请刷新重来（tail 相对下标整体平移）' });
  if (result.kind === 'read-error') return jsonError(502, 'redis-read-error', { message: result.note });

  return NextResponse.json({
    snapshotSize: result.snapshotSize,
    entries: result.entries,
    nextCursor: result.nextCursor,
    key: 'nexus:ai:dead',
  }, {
    status: 200,
    headers: { 'cache-control': 'no-store' },
  });
}
