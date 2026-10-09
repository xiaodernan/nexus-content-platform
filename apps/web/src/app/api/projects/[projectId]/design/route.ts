import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { patchProjectDocument, projectBelongsTo } from '@/server/domain/projects';
import { ProjectDesignPatchRequestSchema, type DesignPatchPayload } from '@nexus/schemas';
import type { DesignPatch, PatchOp } from '@nexus/design-model';
import { csrfOk } from '@/server/security/csrf';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * #62② Studio 自动保存的补丁路径（ADR-0033）。资源是设计文档，动词是 §150 的 Command 补丁：
 * 客户端把"这一轮攒下的命令补丁"按时间序发来，服务端在锁内读到的最新版上逐条 apply。
 * 语义分工写在 `patchProjectDocument` 的头上——补丁是合并、全量 PUT（同目录 `route.ts`）
 * 仍是"缺失即删"的替换；任何一条 op 打空整批 409 一条不写，客户端拿到 409 就走全量兜底。
 * 这里刻意不设审批门：报文来自作者本人的编辑器（requireUser + 归属判定），与 PUT 同一信任级，
 * §74 的门拦的是 AI 与公开 API 的删除，不是人自己的撤销栈。
 */
export async function PATCH(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  if (!body) return badRequest(['请求体必须是 JSON']);
  const parsed = ProjectDesignPatchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    // wire 上的 ops 只能是 record（schemas 不依赖 design-model）；模型侧同一条桥接见 api-tokens.ts
    const patches: DesignPatch[] = parsed.data.patches.map((patch: DesignPatchPayload) => ({
      ...patch,
      ops: patch.ops as unknown as PatchOp[],
    }));
    const outcome = await patchProjectDocument(projectId, patches);
    if (!outcome.ok) {
      if (outcome.code === 'not_found') return notFound();
      if (outcome.code === 'ops_skipped') {
        return jsonError(409, 'ops_skipped', {
          message: '有补丁没有落到目标上（可能对应的内容已被别处改掉），这一批一条都没写',
          skipped: outcome.skipped,
        });
      }
      return jsonError(400, 'document_rejected', {
        message: '补丁打完后的文档过不了规模/形状门，这一批一条都没写',
        issues: outcome.issues,
      });
    }
    // 与 PUT 同一条纪律：不回读整份文档，客户端要的只是"存上了没有 + 存于何时"
    return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (error) {
    return failure(error, `PATCH /api/projects/${projectId}/design`);
  }
}
