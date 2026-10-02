import { NextResponse } from 'next/server';
import { retrieveProjectKnowledge } from '@/server/domain/knowledge';
import { getEmbeddingProvider, hasEmbeddingProvider } from '@/server/ai/embedding';
import { VectorStore } from '@/server/ai/vector-store';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { badRequest, jsonError } from '@/server/http';
import { z } from 'zod';

const SearchQuerySchema = z.object({
  q: z.string().min(1).max(500),
  vectorWeight: z.number().min(0).max(1).optional(),
  textWeight: z.number().min(0).max(1).optional(),
  vectorK: z.number().int().positive().max(50).optional(),
  textK: z.number().int().positive().max(50).optional(),
  limit: z.number().int().positive().max(50).optional(),
  sourceType: z.string().optional(),
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
    const parsed = SearchQuerySchema.safeParse(raw);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
    }

    const { q, vectorWeight, textWeight, vectorK, textK, limit, sourceType } = parsed.data;

    // 优先尝试向量检索（有 provider 时）
    let results;
    let vectorAvailable = false;

    if (hasEmbeddingProvider()) {
      const embeddingProvider = getEmbeddingProvider()!;
      const vectorStore = new VectorStore(embeddingProvider, embeddingProvider.model_for('embedding'));
      results = await vectorStore.search({
        projectId,
        query: q,
        vectorWeight: vectorWeight ?? 0.6,
        textWeight: textWeight ?? 0.4,
        vectorK: vectorK ?? 20,
        textK: textK ?? 20,
        limit: limit ?? 10,
        sourceType,
      });
      vectorAvailable = true;
    } else {
      // 无 provider：回落到纯全文检索
      const result = await retrieveProjectKnowledge(projectId, q, limit ?? 10);
      results = result.items;
      vectorAvailable = false;
    }

    return NextResponse.json({
      query: q,
      vectorAvailable,
      results,
    });
  } catch (_error) {
    return jsonError(500, 'internal', { message: '检索失败' });
  }
}