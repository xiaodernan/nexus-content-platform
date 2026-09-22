import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { getPublication, publishProject, unpublishProject, type Visibility } from '@/server/domain/publish';
import { csrfOk } from '@/server/security/csrf';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

const VISIBILITIES: Visibility[] = ['private', 'unlisted', 'public'];

/** 作者视角：当前发布状态（含 private——作者要能看到"这条 URL 现在不公开"） */
export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    return NextResponse.json({ ok: true, publication: await getPublication(projectId) });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/publish`);
  }
}

/** §57 Publish：选 Public / Unlisted / Private，门禁不过就挡住并列出原因 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return badRequest(['请求体必须是 JSON 对象']);
  const { visibility } = body as { visibility?: unknown };
  if (typeof visibility !== 'string' || !VISIBILITIES.includes(visibility as Visibility)) {
    return badRequest(['visibility 必须是 private / unlisted / public']);
  }
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const result = await publishProject(projectId, { visibility: visibility as Visibility, createdById: user.id });
    if (!result) return notFound();
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.reason, gate: result.gate },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, publication: result.publication, gate: result.gate });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/publish`);
  }
}

/** 取消发布：URL 立刻失效，历史快照留着 */
export async function DELETE(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    return NextResponse.json({ ok: true, removed: await unpublishProject(projectId) });
  } catch (error) {
    return failure(error, `DELETE /api/projects/${projectId}/publish`);
  }
}
