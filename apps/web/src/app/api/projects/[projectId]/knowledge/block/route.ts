import { NextResponse } from 'next/server';
import { readKnowledgeBlock, SOURCE_LABELS, type KnowledgeSourceType } from '@/server/domain/knowledge';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { badRequest, failure, jsonError, notFound } from '@/server/http';
import { z } from 'zod';

const BlockQuerySchema = z.object({
  sourceType: z.string().min(1),
  sourceId: z.string().min(1),
  maxChunks: z.number().int().positive().max(50).optional(),
});

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §49：把某一来源的**整块**语料取回来。
 *
 * 两个入口，同一份只读数据：
 * - **GET**（Studio 上下文面板用）：出处从 query 里来（`sourceType` + `sourceId`），
 *   与 `retrieve` 那条只读通道同一口径——读语料不该要求写权限，也不该把查询塞进 body。
 * - **POST**（Agent 上下文组装用）：出处从 body 里来。
 *
 * ⚠️ 这两个入口曾分叉成一次**真事故**：`ef33e55`（"知识检索 API 路由"）把这条路由从 GET 改写成了 POST，
 * 而 Studio 的 `ContextPanel.readBlock` 一直是 GET——客户端在真环境里拿 405，功能是坏的。
 * 它没被测出来，是因为 e2e 用 page.route 把这条路径的请求整个 mock 掉了：
 * **被 mock 掉的通道等于没有测试**。与 `notifications/settings` 那次同一族教训——
 * 改一条端点的形状时，要顺着它的所有调用方一起看。这里把 GET 补回来，POST 保留。
 *
 * 只读、按项目边界取：`sourceId` 在别的项目里可能是同一串（页面 id 是文档内的命名空间），
 * 所以查询条件里项目 id 是必须的，不是"顺手加个过滤"。
 */
export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  const params = new URL(req.url).searchParams;
  const sourceType = params.get('sourceType')?.trim() ?? '';
  const sourceId = params.get('sourceId')?.trim() ?? '';
  if (!(sourceType in SOURCE_LABELS)) {
    return jsonError(400, 'bad_source_type', {
      message: `sourceType 要在这几类里：${Object.keys(SOURCE_LABELS).join(' / ')}`,
    });
  }
  if (!sourceId || sourceId.length > 200) {
    return jsonError(400, 'bad_source_id', { message: 'sourceId 不能为空，且最多 200 字' });
  }
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const { blocks } = await readKnowledgeBlock(projectId, sourceType as KnowledgeSourceType, sourceId);
    if (!blocks.length) {
      // 说清是"库里没有这一块"而不是给一个空列表装作成功：来源被删而索引还没重建就是这个形状
      return jsonError(404, 'block_not_found', {
        message: '这一块的语料不在库里：可能来源已删除而索引还没重建（点「重建索引」核对）',
      });
    }
    return NextResponse.json({ ok: true, projectId, sourceType, sourceId, blocks });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/knowledge/block`);
  }
}

/** POST 入口（`ef33e55` 为 Agent 上下文组装加的）：出处从 body 里来，形状与 GET 各自服务各自的调用方 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const { projectId } = await ctx.params;

    if (!(await projectBelongsTo(projectId, user.id))) {
      return jsonError(404, 'not_found', { message: '项目不存在' });
    }

    const raw = await req.json();
    const parsed = BlockQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
    }

    const { sourceType, sourceId, maxChunks = 8 } = parsed.data;

    const result = await readKnowledgeBlock(projectId, sourceType as KnowledgeSourceType, sourceId, maxChunks);

    return NextResponse.json(result);
  } catch (_error) {
    return jsonError(500, 'internal', { message: '读取语料块失败' });
  }
}
