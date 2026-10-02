import { NextResponse } from 'next/server';
import { readKnowledgeBlock, type KnowledgeSourceType } from '@/server/domain/knowledge';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { badRequest, jsonError } from '@/server/http';
import { z } from 'zod';

const BlockQuerySchema = z.object({
  sourceType: z.string().min(1),
  sourceId: z.string().min(1),
  maxChunks: z.number().int().positive().max(50).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const { projectId } = await params;

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