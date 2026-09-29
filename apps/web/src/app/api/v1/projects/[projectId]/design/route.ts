import { NextResponse } from 'next/server';
import { ApiDesignDocumentSchema, ApiDesignPatchRequestSchema, ApiDesignPatchResultSchema } from '@nexus/schemas';
import {
  apiDesignDocument,
  apiPatchDesign,
  authorizeApiRequest,
  recordApiAccess,
} from '@/server/domain/api-tokens';
import { apiJson, failure, jsonError, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §188：把**设计文档本体**给外部 Agent 读（§16：设计模型是唯一真值，渲染结果只是投影——
 * 所以外部程序要读的本来就是这一份，不是 HTML）。
 *
 * `source: 'database'` 那句不是装饰：这一条从不接受调用方递进来的文档（§68 同一口径），
 * 报文里那份是服务端按项目 id 从库里读出来的。文档的权威形状在 `@nexus/design-model`，
 * 这里不重定义一遍——两处定义同一份结构迟早漂。
 *
 * 没有分页、没有字段裁剪：一份顶档文档（§146 的 2 万节点上限）会整份回来，
 * 这一句限度写在页面上，而不是等人撞上来。
 */
export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const authed = await authorizeApiRequest(req, 'design:read');
  if (!authed.ok) return jsonError(authed.status, authed.error, { message: authed.message });
  const { projectId } = await ctx.params;
  try {
    const payload = await apiDesignDocument(authed.userId, projectId);
    if (!payload) {
      return jsonError(404, 'project_not_found', {
        message: `项目 ${projectId} 不在这一枚凭据所属的人名下、已被删除，或库里还没有文档`,
      });
    }
    const checked = ApiDesignDocumentSchema.safeParse(payload);
    if (!checked.success) return failure(new Error('设计文档报文不符合契约'), 'GET /api/v1/projects/[projectId]/design');
    await recordApiAccess({
      tokenId: authed.token.id,
      endpoint: 'GET /api/v1/projects/[projectId]/design',
      projectId,
    });
    return apiJson(checked.data, req, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return failure(error, 'GET /api/v1/projects/[projectId]/design');
  }
}

/**
 * §188 第二片：同一份文档的**补丁**写入口（`design:write`）。
 *
 * 发的是补丁而不是整份文档，这是这一格与 Studio 自动保存那条路唯一的实质差别：
 * 自动保存是"客户端说这一版就是全部"，公网调用方没有资格替服务端决定"其余的都不存在了"。
 * 补丁落在服务端此刻那一版文档上，读—改—写在一个事务里（见 `domain/api-tokens.ts` 的 `apiPatchDesign`）。
 *
 * 四种拒法各有其话，且都在写之前：`approval_required`（有删除类 op，这一侧没人能批准）、
 * `ops_skipped`（op 打不到存在的东西，写一半比不写更难查）、`document_rejected`
 * （打完补丁过不了 Studio 保存那道同一扇规模门）、`project_not_found`（别人的项目与不存在的同一个答案）。
 * 一次成功的写入会在项目历史里落一条带 patch 清单的记录，Studio 的历史面板能看到它的 diff（§151）。
 */
export async function PATCH(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const authed = await authorizeApiRequest(req, 'design:write');
  if (!authed.ok) return jsonError(authed.status, authed.error, { message: authed.message });
  const { projectId } = await ctx.params;
  const body = await readJson(req);
  const parsed = ApiDesignPatchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'invalid_patch', {
      message: `补丁报文不符合契约：${parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
        .join('；')}`,
    });
  }
  try {
    const outcome = await apiPatchDesign(
      { userId: authed.userId, tokenId: authed.token.id, tokenHint: authed.token.hint },
      projectId,
      parsed.data,
    );
    if (!outcome.ok) return jsonError(outcome.status, outcome.error, { message: outcome.message });
    const checked = ApiDesignPatchResultSchema.safeParse(outcome.result);
    if (!checked.success) return failure(new Error('补丁回执不符合契约'), 'PATCH /api/v1/projects/[projectId]/design');
    // 写也记在同一本账上：面板问的是“这枚凭据碰过哪些项目”，读与写不该分两本账
    await recordApiAccess({
      tokenId: authed.token.id,
      endpoint: 'PATCH /api/v1/projects/[projectId]/design',
      projectId,
    });
    return apiJson(checked.data, req, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return failure(error, `PATCH /api/v1/projects/${projectId}/design`);
  }
}
