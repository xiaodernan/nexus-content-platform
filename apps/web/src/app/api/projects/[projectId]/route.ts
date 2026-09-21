import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { loadDocument, projectBelongsTo, saveDocument } from '@/server/domain/projects';
import { parseDocument } from '@/server/validation';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const document = await loadDocument(projectId);
    if (!document) return notFound();
    return NextResponse.json({ projectId, document });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}`);
  }
}

export async function PUT(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  if (!body) return badRequest(['请求体必须是 JSON']);
  const parsed = parseDocument(body);
  if (!parsed.ok) return badRequest(parsed.issues);
  if (parsed.document.id !== projectId) {
    return jsonError(409, 'id_mismatch', { message: '文档 id 与项目 id 不一致' });
  }
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    await saveDocument(projectId, parsed.document);
    const stored = await loadDocument(projectId);
    return NextResponse.json({ ok: true, document: stored, savedAt: new Date().toISOString() });
  } catch (error) {
    return failure(error, `PUT /api/projects/${projectId}`);
  }
}
