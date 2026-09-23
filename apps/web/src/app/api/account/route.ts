import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/server/domain/session';
import { updateProfile } from '@/server/domain/profile';
import { scanTextForRedlines } from '@/server/domain/moderation';
import { csrfOk } from '@/server/security/csrf';
import { badRequest, jsonError } from '@/server/http';

/**
 * §60：改自己的主页（显示名与简介）。
 *
 * 简介会出现在公开主页上，所以它走的是发布机检同一份红线词表（§129）：
 * 命中就不保存。这不是"审核通过"，只是"这段话我们不能替你公开"。
 */
const PatchSchema = z.object({
  bio: z.string().max(500).optional(),
  displayName: z.string().min(1).max(60).optional(),
});

export async function PATCH(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  if (parsed.data.bio && scanTextForRedlines(parsed.data.bio).length) {
    return jsonError(400, 'bio_rejected', { message: '这段简介被机检挡下，没有保存' });
  }
  const user = await requireUser();
  const saved = await updateProfile(user.id, parsed.data);
  return NextResponse.json({ ok: true, ...saved });
}
