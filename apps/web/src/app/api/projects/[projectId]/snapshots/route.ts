import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { createSnapshot, listSnapshots } from '@/server/domain/snapshots';
import { parseDocument } from '@/server/validation';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/** §27：快照列表只回元信息，文档体在需要时单独取 */
export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    return NextResponse.json({ snapshots: await listSnapshots(projectId) });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/snapshots`);
  }
}

/** 客户端能建的快照类型：手工命名与 AI 事务。import/publish/branch 由服务端流程自己写。 */
const CLIENT_SOURCES = new Set(['manual', 'ai']);

export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  if (!body || typeof body !== 'object') return badRequest(['请求体必须是 JSON 对象']);
  const { document, label, summary, source } = body as {
    document?: unknown;
    label?: unknown;
    summary?: unknown;
    source?: unknown;
  };
  if (!document) return badRequest(['缺少 document']);
  const parsed = parseDocument(document);
  if (!parsed.ok) return badRequest(parsed.issues);
  if (parsed.document.id !== projectId) {
    return jsonError(409, 'id_mismatch', { message: '文档 id 与项目 id 不一致' });
  }
  const kind = typeof source === 'string' && CLIENT_SOURCES.has(source) ? source : 'manual';
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const snapshot = await createSnapshot(projectId, {
      document: parsed.document,
      source: kind as 'manual' | 'ai',
      label: typeof label === 'string' ? label : null,
      summary: typeof summary === 'string' ? summary : null,
      createdById: user.id,
    });
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/snapshots`);
  }
}
