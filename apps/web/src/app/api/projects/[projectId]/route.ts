import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { loadDocument, saveDocument, softDeleteProject, updateProjectDescription } from'@/server/domain/projects';
import { projectWriteAccess } from '@/server/domain/team';
import { projectVisibleTo } from '@/server/domain/team';
import { scanTextForRedlines } from '@/server/domain/moderation';
import { parseDocument } from '@/server/validation';
import { ProjectDeleteRequestSchema, ProjectPatchRequestSchema } from '@nexus/schemas';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectVisibleTo(projectId, user.id))) return notFound();
    const document = await loadDocument(projectId);
    if (!document) return notFound();
    return NextResponse.json({ projectId, document });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}`);
  }
}

export async function PUT(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
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
    const writeAccess = await projectWriteAccess(projectId, user.id);
    if (writeAccess === 'not_found') return notFound();
    if (writeAccess === 'read_only') return jsonError(403, 'read_only_role', { message: '查看者（viewer）角色对这个项目只读；写入权限在 owner 与 editor 手里' });
    await saveDocument(projectId, parsed.document);
    // 不回读整份文档：这条链是自动保存，每改一个像素都会跑一次，
    // 而 4000 节点那一档量下来，"读回来再序列化发出去"就是这次请求里最大的一块。
    // 客户端要的是"存上了没有 + 存于何时"（它自己就是发的那一份的作者），
    // 真要核对库里存了什么，走 GET 那条路（`store.load` / 压测脚本都这么做）。
    return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (error) {
    return failure(error, `PUT /api/projects/${projectId}`);
  }
}

/**
 * §49 项目简介。名字不在这里改（见 ProjectPatchRequestSchema 的注释），
 * PUT 那条链是设计文档的自动保存，每改一个像素都会跑一次——把简介挂在 PUT 上
 * 就等于让"改圆角"顺手覆盖简介，两边都会莫名其妙。
 *
 * 简介会经 `og:description` 出现在公网（§166），所以它和主页 bio 走同一份红线词表（§129）：
 * 命中就不保存，不"先存下来以后再清"。
 */
export async function PATCH(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  if (!body) return badRequest(['请求体必须是 JSON']);
  const parsed = ProjectPatchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  const description = parsed.data.description;
  if (description && scanTextForRedlines(description).length) {
    return jsonError(400, 'description_rejected', { message: '这段简介被机检挡下，没有保存' });
  }
  try {
    const user = await requireUser();
    const rl = await getRateLimiter().hit(rateKey('projects/patch', clientIp(req), user.id), 120, 10 * 60_000);
    if (!rl.allowed) {
      return jsonError(429, 'rate_limited', { message: '修改太频繁了，稍后再试', retryAfterMs: rl.retryAfterMs });
    }
    const updated = await updateProjectDescription(user.id, projectId, description ?? null);
    if (!updated) return notFound();
    return NextResponse.json({ ok: true, project: updated });
  } catch (error) {
    return failure(error, `PATCH /api/projects/${projectId}`);
  }
}

/**
 * §74 删除项目。这一条是"必须人工审批"清单上的动作，所以审批做在服务端：
 * `confirm` 必须逐字等于项目名，不匹配就一条都不写，只留下一行 `allowed:false` 的审计。
 * 只在界面上放个 `window.confirm` 等于没有审批——直接打接口的人不受它约束，
 * 而"删掉一个项目"恰恰是不能靠调用方自觉的那种动作。
 *
 * 删除是软的（`deletedAt` 有时间戳、行还在）：§108 把用户的项目历史归给 Snapshot，
 * 一次撤销不该把发布记录、快照、评论一起带走。界面上"永久删除"这种字样在这里不支持，
 * 真要做到那一步需要一个单独的、更重的动作，而不是把这条改硬。
 */
export async function DELETE(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  if (!body) return badRequest(['请求体必须是 JSON']);
  const parsed = ProjectDeleteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  try {
    const user = await requireUser();
    const rl = await getRateLimiter().hit(rateKey('projects/delete', clientIp(req), user.id), 20, 10 * 60_000);
    if (!rl.allowed) {
      return jsonError(429, 'rate_limited', { message: '删除操作太频繁了，稍后再试', retryAfterMs: rl.retryAfterMs });
    }
    const result = await softDeleteProject(user.id, projectId, parsed.data.confirm);
    if (!result.ok) {
      if (result.code === 'approval_required') {
        return jsonError(400, 'approval_required', { message: '确认词与项目名不一致，没有删除这个项目' });
      }
      return notFound();
    }
    return NextResponse.json({ ok: true, projectId, name: result.name, deleted: true });
  } catch (error) {
    return failure(error, `DELETE /api/projects/${projectId}`);
  }
}
