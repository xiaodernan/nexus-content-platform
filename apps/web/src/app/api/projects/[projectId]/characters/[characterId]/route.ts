import { NextResponse } from 'next/server';
import { CharacterProfileSchema } from '@nexus/schemas';
import { csrfOk } from '@/server/security/csrf';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { deleteCharacter, updateCharacterProfile } from '@/server/domain/characters';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string; characterId: string }>;
}

/**
 * §46 改与删单个角色。路由挂在项目下面，所以归属检查只看项目——
 * 拿着别的项目的角色 id 来，域层按 (id, projectId) 查不到，直接 404（默认拒绝）。
 */

export async function PATCH(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId, characterId } = await ctx.params;
  const body = await readJson(req);
  if (!body || typeof body !== 'object') return badRequest(['请求体必须是 JSON 对象']);
  const { profile } = body as { profile?: unknown };
  const parsed = CharacterProfileSchema.safeParse(profile);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const result = await updateCharacterProfile(characterId, projectId, parsed.data);
    if (!result.ok) return jsonError(400, 'character_rejected', { message: result.reason });
    return NextResponse.json({ ok: true, character: result.character });
  } catch (error) {
    return failure(error, `PATCH /api/projects/${projectId}/characters/${characterId}`);
  }
}

export async function DELETE(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId, characterId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const removed = await deleteCharacter(characterId, projectId);
    if (!removed) return notFound();
    return NextResponse.json({ ok: true, removed: true });
  } catch (error) {
    return failure(error, `DELETE /api/projects/${projectId}/characters/${characterId}`);
  }
}
