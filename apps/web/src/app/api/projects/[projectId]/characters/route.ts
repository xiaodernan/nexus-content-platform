import { NextResponse } from 'next/server';
import { CharacterCreateRequestSchema } from '@nexus/schemas';
import { csrfOk } from '@/server/security/csrf';
import { requireUser } from '@/server/domain/session';
import { projectWriteAccess } from '@/server/domain/team';
import { projectVisibleTo } from '@/server/domain/team';
import { createProjectCharacter, listCharacters } from '@/server/domain/characters';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §46 角色列表与建档。建档只给名字，其余字段留空——
 * AI 生成角色设定要真 provider，没接之前给一份"看起来像人"的模板就是假生成（§159）。
 */

export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectVisibleTo(projectId, user.id))) return notFound();
    const { items, unreadable } = await listCharacters(projectId);
    return NextResponse.json({ ok: true, characters: items, unreadable });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/characters`);
  }
}

export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  const parsed = CharacterCreateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  try {
    const user = await requireUser();
    const writeAccess = await projectWriteAccess(projectId, user.id);
    if (writeAccess === 'not_found') return notFound();
    if (writeAccess === 'read_only') return jsonError(403, 'read_only_role', { message: '查看者（viewer）角色对这个项目只读；写入权限在 owner 与 editor 手里' });
    const result = await createProjectCharacter(projectId, user.id, parsed.data);
    if (!result.ok) return jsonError(400, 'character_rejected', { message: result.reason });
    return NextResponse.json({ ok: true, character: result.character }, { status: 201 });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/characters`);
  }
}
