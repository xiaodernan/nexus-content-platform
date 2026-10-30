import { NextResponse } from 'next/server';
import { BlocksClearRequestSchema, BlocksRequestSchema } from '@nexus/schemas';
import { clearBlock, setBlock, userByHandle } from '@/server/domain/blocks';
import { requireUser } from '@/server/domain/session';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, ipWriteGate, rateKey } from '@/server/security/rateLimit';
import { badRequest, jsonError, readJson } from '@/server/http';

/**
 * §132 block / mute 的入口。列表不在这里（`/settings/blocks` 是服务端渲染的，
 * 一个只给自己看的名单没有必要再开一条 JSON 接口）。
 *
 * 按 handle 而不是 id：界面上给的是 @name，而"知道某个人的 uuid"不该是能做这件事的前提。
 * 限流按人而不按 IP（出口 IP 相同的访客可能是一整个宿舍，拉黑本来就是少数几次动作，
 * 卡在人身上才既挡得住脚本又不会误伤）。
 */
const RATE_PER_10_MIN = 30;

async function rateLimit(req: Request, userId: string): Promise<NextResponse | null> {
  const rl = await getRateLimiter().hit(rateKey('blocks', clientIp(req), userId), RATE_PER_10_MIN, 10 * 60_000);
  return rl.allowed
    ? null
    : jsonError(429, 'rate_limited', { message: '操作太频繁了，稍后再试', retryAfterMs: rl.retryAfterMs });
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  // §137 的 guest 自动签发：无会话客户端的 user.id 每请求都是新的，按身份限流对它空转
  // （marketplace 那条注释早就点破过"换 cookie 就能无限造行"，但 user.id + IP 双键仍挡不住新身份）。
  // 所以这道按 IP 的闸必须放在 requireUser() 之前——被挡住的请求一个 guest 都不该建。
  const gate = await ipWriteGate('blocks', req, 60, 3600000);
  if (gate.limited) return jsonError(429, 'rate_limited', { message: '操作太频繁了，稍后再试', retryAfterMs: gate.retryAfterMs });

  const body = await readJson(req);
  if (!body) return badRequest(['请求体必须是 JSON']);
  const parsed = BlocksRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  const user = await requireUser();
  const limited = await rateLimit(req, user.id);
  if (limited) return limited;

  const target = await userByHandle(parsed.data.handle);
  if (!target) return jsonError(404, 'not_found', { message: '没有这个作者' });
  const result = await setBlock(user.id, target.id, parsed.data.kind);
  if (!result.ok) return jsonError(400, 'cannot_block', { message: result.reason });
  return NextResponse.json({ ...result, handle: target.handle, name: target.name });
}

/** 解除。没有这一行就是 no-op 而不是错误：界面上"取消"点两次不该变红 */
export async function DELETE(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  // §137 的 guest 自动签发：无会话客户端的 user.id 每请求都是新的，按身份限流对它空转
  // （marketplace 那条注释早就点破过"换 cookie 就能无限造行"，但 user.id + IP 双键仍挡不住新身份）。
  // 所以这道按 IP 的闸必须放在 requireUser() 之前——被挡住的请求一个 guest 都不该建。
  const gate = await ipWriteGate('blocks', req, 60, 3600000);
  if (gate.limited) return jsonError(429, 'rate_limited', { message: '操作太频繁了，稍后再试', retryAfterMs: gate.retryAfterMs });

  const body = await readJson(req);
  if (!body) return badRequest(['请求体必须是 JSON']);
  const parsed = BlocksClearRequestSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  const user = await requireUser();
  const limited = await rateLimit(req, user.id);
  if (limited) return limited;

  const target = await userByHandle(parsed.data.handle);
  if (!target) return jsonError(404, 'not_found', { message: '没有这个作者' });
  const { removed } = await clearBlock(user.id, target.id);
  return NextResponse.json({ ok: true, removed });
}
