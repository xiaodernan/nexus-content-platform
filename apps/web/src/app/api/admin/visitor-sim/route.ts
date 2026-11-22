import { NextResponse } from 'next/server';
import { currentUserOrNull } from '@/server/domain/session';
import { runVisitorSimulation } from '@/server/domain/visitorSimRunner';
import { jsonError, readJson } from '@/server/http';
import { csrfOk } from '@/server/security/csrf';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const Body = z.object({
  count: z.number().int().min(1).max(500).optional().default(30),
  seed: z.number().int().min(1).max(2 ** 31 - 1).optional().default(() => Math.floor(Math.random() * 2 ** 31)),
});

/**
 * §SIM-1 `/api/admin/visitor-sim` POST：把一批模拟"真实用户"的人·天流量灌进 publication_visits
 *
 * 权限：role=admin（与 /admin/* 其余几件同一道门）。
 * 失败口径：没作品可选 → 503 + 明白原因；不撒谎、不伪造、不部分吞表格。
 */
export async function POST(req: Request): Promise<NextResponse> {
  const user = await currentUserOrNull();
  if (!user) return await jsonError(401, 'unauthenticated', { message: '需要先登录' });
  if (user.role !== 'admin') {
    return await jsonError(403, 'forbidden', { message: '行为演练只对审核员（role=admin）开放' });
  }
  if (!(await csrfOk(req))) return await jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const raw = await readJson(req);
  const parsed = Body.safeParse(raw ?? {});
  if (!parsed.success) {
    return await jsonError(400, 'bad_request', { message: 'count 必须是 1..500 的整数；seed 必须是正整数' });
  }
  try {
    const result = await runVisitorSimulation({ count: parsed.data.count, seed: parsed.data.seed });
    return NextResponse.json({ ...result }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[admin/visitor-sim] ${message}`);
    const status = message.includes('没有可接受模拟') ? 503 : 500;
    return await jsonError(status, 'sim_unavailable', { message });
  }
}
