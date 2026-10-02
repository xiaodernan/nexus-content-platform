import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { getDb } from '@/server/db/client';
import { characters, memories } from '@/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { badRequest, jsonError, notFound } from '@/server/http';
import { z } from 'zod';
import { getAiCapabilities } from '@/lib/env';
import { getEmbeddingProvider, hasEmbeddingProvider } from '@/server/ai/embedding';
import { VectorStore } from '@/server/ai/vector-store';
import { buildContext, buildPersonaPrompt } from '@/server/domain/character-chat';

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  sessionId: z.string().optional(),
});

/**
 * §47 Character Agent 对话 API。
 *
 * 与角色档案（§46）对话：注入角色人设、声音、关系，检索相关记忆与语料，
 * 再调用 LLM 生成回复。
 *
 * 两条诚实的边界（§159 / §47）：
 * - DEMO MODE（没有真 provider）直接 409，不生成"看起来像角色说的"模板回复；
 * - 接上真 provider 但模型调用尚未接入时 501，并带回已装配好的上下文规模，
 *   证明"人设与上下文装配"这一半是通的。
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string; characterId: string }> },
): Promise<Response> {
  try {
    const user = await requireUser();
    const { projectId, characterId } = await params;

    if (!(await projectBelongsTo(projectId, user.id))) return notFound();

    const parsed = await req.json();
    const result = ChatRequestSchema.safeParse(parsed);
    if (!result.success) {
      return badRequest(result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
    }

    const { message } = result.data;

    // 验证角色存在且属于该项目（404 优先于 409：不存在的东西不谈"能不能聊"）
    const db = getDb();
    const [character] = await db
      .select()
      .from(characters)
      .where(and(eq(characters.id, characterId), eq(characters.projectId, projectId)))
      .limit(1);

    if (!character) return notFound();

    // DEMO MODE 不生成回复：确定性模板假装是角色在说话，违反"没接真 provider 不做假对话"
    const caps = await getAiCapabilities();
    if (caps.text !== 'real') {
      return jsonError(409, 'demo_mode', {
        message: '角色对话需要接上真 provider 的 AI Service。当前是 DEMO MODE：不生成回复，也不落对话记忆。',
      });
    }

    // 构建角色人设提示词
    const profile = (character.profile as Record<string, unknown>) ?? null;
    const persona = buildPersonaPrompt({ name: character.name, profile }, profile);

    // 检索相关记忆（scope=character, subjectId=characterId）
    const characterMemories = await db
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.projectId, projectId),
          eq(memories.scope, 'character'),
          eq(memories.subjectId, characterId),
        ),
      )
      .orderBy(desc(memories.createdAt))
      .limit(5);

    // 检索相关语料（knowledge_chunks，sourceType=character）
    let knowledgeContext = '';
    if (hasEmbeddingProvider()) {
      const embeddingProvider = getEmbeddingProvider()!;
      const vectorStore = new VectorStore(embeddingProvider, embeddingProvider.model_for('embedding'));
      const searchResults = await vectorStore.search({
        projectId,
        query: message,
        vectorWeight: 0.5,
        textWeight: 0.5,
        vectorK: 5,
        textK: 5,
        limit: 3,
        sourceType: 'character',
      });
      knowledgeContext = searchResults.map((r) => r.chunk.content).join('\n\n');
    }

    // 构建完整上下文
    const context = buildContext(persona, characterMemories, knowledgeContext);

    // 模型调用尚未接入：如实 501，并带回已装配好的上下文规模
    return jsonError(501, 'not_implemented', {
      message: '角色对话的模型调用尚未接入：人设与上下文装配已就绪，等 provider 的 chat 调用接上这一格。',
      personaChars: persona.length,
      memoryCount: characterMemories.length,
      knowledgeChars: knowledgeContext.length,
      contextChars: context.length,
    });
  } catch (_error) {
    return jsonError(500, 'internal', { message: '对话失败' });
  }
}
