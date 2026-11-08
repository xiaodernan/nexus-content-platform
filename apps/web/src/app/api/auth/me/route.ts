import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { countProjects } from '@/server/domain/auth';
import { failure } from '@/server/http';

/** 当前身份（含 guest）：前端账号面板据此显示「游客 / 邮箱」与登出按钮。 */
export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireUser();
    return NextResponse.json({ user, projectCount: await countProjects(user.id) });
  } catch (error) {
    return failure(error, 'GET /api/auth/me');
  }
}
