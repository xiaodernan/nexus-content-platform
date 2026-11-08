import { NextResponse } from 'next/server';
import { csrfOk } from '@/server/security/csrf';
import { requireUser } from '@/server/domain/session';
import { projectWriteAccess } from '@/server/domain/team';
import { projectVisibleTo } from '@/server/domain/team';
import { addMemory, clearMemories, countMemoriesByScope, listMemories } from '@/server/domain/memories';
import { searchMemories } from '@/server/domain/memory-search';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §48 记忆的查看与新增。全部按登录用户过滤：别人的记忆在这里既列不出来也读不到。
 * `?q=` 走 §49 那套混合检索（见 `domain/memory-search.ts`）：那是**词面**检索，
 * 不是语义检索，也搜不到不挂项目的「我的偏好」——这两句由响应里的 note 原样带给界面。
 */

export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  const query = new URL(req.url).searchParams.get('q');
  try {
    const user = await requireUser();
    if (!(await projectVisibleTo(projectId, user.id))) return notFound();
    if (query?.trim()) {
      const result = await searchMemories(user.id, projectId, query);
      return NextResponse.json({ ok: true, ...result, counts: await countMemoriesByScope(user.id, projectId) });
    }
    const [items, counts] = await Promise.all([
      listMemories({ ownerId: user.id, projectId }),
      countMemoriesByScope(user.id, projectId),
    ]);
    return NextResponse.json({ ok: true, items, counts });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/memories`);
  }
}

export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  if (!body || typeof body !== 'object') return badRequest(['请求体必须是 JSON 对象']);
  const { scope, subjectId, content } = body as {
    scope?: unknown;
    subjectId?: unknown;
    content?: unknown;
  };
  try {
    const user = await requireUser();
    const writeAccess = await projectWriteAccess(projectId, user.id);
    if (writeAccess === 'not_found') return notFound();
    if (writeAccess === 'read_only') return jsonError(403, 'read_only_role', { message: '查看者（viewer）角色对这个项目只读；写入权限在 owner 与 editor 手里' });
    const result = await addMemory({ ownerId: user.id, projectId, scope, subjectId, content });
    if (!result.ok) return jsonError(400, 'memory_rejected', { message: result.reason });
    return NextResponse.json({ ok: true, memory: result.entry }, { status: 201 });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/memories`);
  }
}

/**
 * 按类清空（§48）：`?scope=world`。scope 必给——没有"四类一起抹"的入口，
 * 一次误点就把用户全部记忆清掉这种事，界面上连按钮都不该存在。
 * 走 DELETE 集合而不是 /memories/clear：那个路径会和 /memories/[memoryId] 撞车（实测 405）。
 */
export async function DELETE(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const scope = new URL(req.url).searchParams.get('scope');
  if (!scope) return badRequest(['要先选定清哪一类记忆（?scope=…）。']);
  try {
    const user = await requireUser();
    const writeAccess = await projectWriteAccess(projectId, user.id);
    if (writeAccess === 'not_found') return notFound();
    if (writeAccess === 'read_only') return jsonError(403, 'read_only_role', { message: '查看者（viewer）角色对这个项目只读；写入权限在 owner 与 editor 手里' });
    const result = await clearMemories(user.id, projectId, scope);
    if (result.reason) return jsonError(400, 'memory_rejected', { message: result.reason });
    return NextResponse.json({ ok: true, removed: result.removed });
  } catch (error) {
    return failure(error, `DELETE /api/projects/${projectId}/memories`);
  }
}
