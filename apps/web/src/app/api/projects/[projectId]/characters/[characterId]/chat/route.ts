import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { projectWriteAccess } from '@/server/domain/team';
import { getDb } from '@/server/db/client';
import { characters, memories } from '@/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { readJson, badRequest, jsonError, notFound } from '@/server/http';
import { z } from 'zod';
import { getAiCapabilities } from '@/lib/env';
import { chatWithCharacter } from '@/server/ai/client';
import { getEmbeddingProvider, hasEmbeddingProvider } from '@/server/ai/embedding';
import { VectorStore } from '@/server/ai/vector-store';
import { buildContext, buildPersonaPrompt } from '@/server/domain/character-chat';
import { isUuid } from '@/server/domain/ids';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  sessionId: z.string().optional(),
});

/**
 * §47 Character Agent 对话 API。
 *
 * 与角色档案（§46）对话：注入角色人设、声音、关系，检索相关记忆与语料，
 * 再经 ai-service `/v1/ai/chat` 调用 LLM 生成回复。
 *
 * 三条诚实的边界（§159 / §47）：
 * - DEMO MODE（没有真 provider）直接 409，不生成"看起来像角色说的"模板回复，
 *   也不落对话记忆；
 * - 真 provider 路上拿不到结果（不可达 / 报错 / 契约不符）如实透传状态码与原因；
 * - 对话只落记忆行（用户原话 + 真实回复），不改设计文档，所以 §73/§74 的
 *   补丁口径不适用这一路。
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string; characterId: string }> },
): Promise<Response> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  try {
    const user = await requireUser();
    const { projectId, characterId } = await params;

    const writeAccess = await projectWriteAccess(projectId, user.id);
    if (writeAccess === 'not_found') return notFound();
    if (writeAccess === 'read_only') return jsonError(403, 'read_only_role', { message: '查看者（viewer）角色对这个项目只读；写入权限在 owner 与 editor 手里' });

    const rl = await getRateLimiter().hit(rateKey('character-chat', clientIp(req), user.id), 20, 10 * 60_000);
    if (!rl.allowed) {
      return jsonError(429, 'rate_limited', { message: '对话太频繁，稍后再试', retryAfterMs: rl.retryAfterMs });
    }

    const parsed = await readJson(req);
    const result = ChatRequestSchema.safeParse(parsed);
    if (!result.success) {
      return badRequest(result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
    }

    const { message, sessionId } = result.data;

    // 形状不对的 id 按"没有这个角色"处理：下面那次 eq(characters.id, …) 会撞 22P02，
    // 被这层的 catch 兜成 500「对话失败」——那句话会把请求写错说成服务端的错（domain/ids.ts）。
    if (!isUuid(characterId)) return notFound();
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

    // 构建完整上下文并调用模型
    const context = buildContext(persona, characterMemories, knowledgeContext);
    const chat = await chatWithCharacter({
      requestId: `chat_${Date.now().toString(36)}`,
      system: context,
      user: message,
      modelClass: 'balanced',
    });
    if (!chat.ok) {
      return jsonError(chat.status ?? 503, chat.error.code, { message: chat.error.message });
    }

    // 只有真实回复才落记忆：用户原话 + 模型原话，一行只记一次对话
    await saveChatMemory(projectId, characterId, user.id, character.name, message, chat.response.text);

    return NextResponse.json({
      reply: chat.response.text,
      character: {
        id: character.id,
        name: character.name,
      },
      sessionId: sessionId ?? `chat_${Date.now()}`,
    });
  } catch (_error) {
    return jsonError(500, 'internal', { message: '对话失败' });
  }
}

async function saveChatMemory(
  projectId: string,
  characterId: string,
  userId: string,
  characterName: string,
  userMessage: string,
  assistantReply: string,
): Promise<void> {
  const db = getDb();
  const content = `用户：${userMessage}\n${characterName}：${assistantReply}`;
  await db.insert(memories).values({
    projectId,
    scope: 'character',
    subjectId: characterId,
    content,
    ownerId: userId,
    createdAt: new Date(),
  });
}
