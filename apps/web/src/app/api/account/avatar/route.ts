import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { clearAvatar, setAvatar } from '@/server/domain/avatar';
import { MAX_IMAGE_BYTES } from '@/server/storage/images';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { jsonError } from '@/server/http';

/**
 * §60 头像的写入口。和 §9c 的资产上传同一条纪律：CSRF 双提交、multipart 的 file 字段、
 * 先按 Content-Length 拒掉超量请求（别把 50MB 先缓冲进内存），字节校验全在 domain 里。
 *
 * 限流按人而不是按 IP：一个 NAT 后面的多个 guest 不该互相拖死，
 * 而"一个人狂换头像"才是这条链路真正要挡的（每次都要重编码 + 删旧对象）。
 */
const UPLOADS_PER_10_MIN = 20;

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const user = await requireUser();
  const rl = getRateLimiter().hit(rateKey('account/avatar', clientIp(req), user.id), UPLOADS_PER_10_MIN, 10 * 60_000);
  if (!rl.allowed) {
    return jsonError(429, 'rate_limited', { message: '换头像太频繁了，稍后再试', retryAfterMs: rl.retryAfterMs });
  }

  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_IMAGE_BYTES + 512 * 1024) {
    return jsonError(413, 'too_large', {
      reason: `上传体积 ${Math.round(declared / 1024 / 1024)}MB 超过上限 ${MAX_IMAGE_BYTES / 1024 / 1024}MB`,
    });
  }
  if (!(req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    return jsonError(400, 'unsupported_media_type', { reason: '上传必须使用 multipart/form-data 的 file 字段' });
  }
  const file = (await req.formData()).get('file');
  if (!(file instanceof File)) return jsonError(400, 'no_file', { reason: '表单里没有找到 file 字段' });

  const result = await setAvatar(user.id, { data: await file.arrayBuffer() });
  if (!result.ok) return jsonError(400, 'avatar_rejected', { reason: result.reason, issues: result.issues });
  // 同一份字节第二次提交不改任何东西，所以是 200 不是 201
  return NextResponse.json(result, { status: result.reused ? 200 : 201 });
}

/** 摘掉头像。这一支不返回"默认头像"，列回到 null，主页重新显示首字母（§159） */
export async function DELETE(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const user = await requireUser();
  const { removed } = await clearAvatar(user.id);
  return NextResponse.json({ ok: true, removed });
}
