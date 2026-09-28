import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { readKnowledgeBlock, SOURCE_LABELS, type KnowledgeSourceType } from '@/server/domain/knowledge';
import { failure, jsonError, notFound } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §49：把某一来源的**整块**语料取回来。
 *
 * 为什么要有这一条：上下文装配（§66-71）与检索面板发出去的都是命中位置附近的摘录窗口，
 * 那一句 `unavailable`（"要整块得按 sourceId 回库里取，而那条通道还没有"）说的就是缺这个。
 * 现在有了：出处（sourceType + sourceId）在报文里本来就带着，顺着它就能拿回正文。
 *
 * 只读、按项目边界取：`sourceId` 在别的再项目里可能是同一串（页面 id 是文档内的命名空间），
 * 所以查询条件里项目 id 是必须的，不是"顺手加个过滤"。
 */
export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  const params = new URL(_req.url).searchParams;
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
