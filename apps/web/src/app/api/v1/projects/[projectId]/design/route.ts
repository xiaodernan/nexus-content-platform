import { NextResponse } from 'next/server';
import { ApiDesignDocumentSchema } from '@nexus/schemas';
import { apiDesignDocument, authorizeApiRequest } from '@/server/domain/api-tokens';
import { failure, jsonError } from '@/server/http';

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
    return NextResponse.json(checked.data, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return failure(error, 'GET /api/v1/projects/[projectId]/design');
  }
}
