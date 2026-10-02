import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { projectBelongsTo } from '@/server/domain/projects';
import { getDb } from '@/server/db/client';
import { characters, memories } from '@/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { badRequest, jsonError, notFound } from '@/server/http';
import { z } from 'zod';
import { getEmbeddingProvider, hasEmbeddingProvider } from '@/server/ai/embedding';
import { VectorStore } from '@/server/ai/vector-store';

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  sessionId: z.string().optional(),
});

/**
 * §47 Character Agent 对话 API。
 * 与角色档案（§46）对话：注入角色人设、声音、关系，检索相关记忆与语料，
 * 调用 LLM 生成回复。DEMO MODE 下走确定性模板。
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string; characterId: string }> }
): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const { projectId, characterId } = await params;

    if (!(await projectBelongsTo(projectId, user.id))) return notFound();

    const parsed = await req.json();
    const result = ChatRequestSchema.safeParse(parsed);
    if (!result.success) {
      return badRequest(result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
    }

    const { message, sessionId } = result.data;

    // 验证角色存在且属于该项目
    const db = getDb();
    const [character] = await db
      .select()
      .from(characters)
      .where(and(eq(characters.id, characterId), eq(characters.projectId, projectId)))
      .limit(1);

    if (!character) return notFound();

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

    // 检索相关语料（knowledge_chunks，sourceType=character, sourceId=characterId#*）
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
      knowledgeContext = searchResults
        .map((r) => r.chunk.content)
        .join('\n\n');
    }

    // 构建完整上下文
    const context = buildContext(persona, characterMemories, knowledgeContext);

    // DEMO MODE：使用确定性模板回复
    const reply = generateDemoReply(character, message, context);

    // 记录对话到记忆（scope=character, subjectId=characterId）
    await saveChatMemory(projectId, characterId, user.id, message, reply);

    return NextResponse.json({
      reply,
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

function buildPersonaPrompt(character: { name: string; profile: Record<string, unknown> | null }, profile: Record<string, unknown> | null): string {
  const name = character.name || '未命名角色';
  const p = profile as Record<string, unknown> | null;
  const voice = (p?.voice as Record<string, unknown> | null) ?? {};
  const visual = (p?.visualIdentity as Record<string, unknown> | null) ?? {};

  const sections: string[] = [
    `你是 ${name}。请完全沉浸在这个角色中，用第一人称回复。`,
    `【基本信息】`,
    typeof p?.identity === 'string' ? `身份：${p.identity}` : '',
    typeof p?.appearance === 'string' ? `外观：${p.appearance}` : '',
    typeof p?.personality === 'string' ? `性格：${p.personality}` : '',
    typeof p?.clothing === 'string' ? `穿着：${p.clothing}` : '',
    typeof p?.style === 'string' ? `画风：${p.style}` : '',
    p?.traits ? `特征：${Array.isArray(p.traits) ? p.traits.join('、') : typeof p.traits === 'string' ? p.traits : JSON.stringify(p.traits)}` : '',
    typeof p?.background === 'string' ? `背景故事：${p.background}` : '',
    typeof p?.goals === 'string' ? `目标：${p.goals}` : Array.isArray(p?.goals) ? `目标：${(p.goals as string[]).join('、')}` : '',
    typeof p?.fears === 'string' ? `恐惧：${p.fears}` : Array.isArray(p?.fears) ? `恐惧：${(p.fears as string[]).join('、')}` : '',
    typeof voice.register === 'string' ? `语域：${voice.register}` : '',
    typeof voice.pace === 'string' ? `语速：${voice.pace}` : '',
    Array.isArray(voice.catchphrases) ? `口头禅：${(voice.catchphrases as string[]).join('、')}` : '',
    typeof visual.silhouette === 'string' ? `轮廓：${visual.silhouette}` : '',
    Array.isArray(visual.motifs) ? `母题：${(visual.motifs as string[]).join('、')}` : '',
    Array.isArray(visual.palette) ? `色板：${(visual.palette as string[]).join('、')}` : '',
    p?.relationships ? `关系：${Array.isArray(p.relationships) ? (p.relationships as any[]).map((r) => `${r.kind || '关系'} → ${r.target}${r.note ? `（${r.note}）` : ''}`).join('\n') : JSON.stringify(p.relationships)}` : '',
  ].filter(Boolean);

  return sections.join('\n');
}

function buildContext(persona: string, memories: any[], knowledgeContext: string): string {
  const parts: string[] = [persona];

  if (memories.length > 0) {
    parts.push('【相关记忆】');
    memories.forEach((m) => {
      parts.push(`- ${m.content.slice(0, 200)}`);
    });
  }

  if (knowledgeContext) {
    parts.push('【相关语料】');
    parts.push(knowledgeContext.slice(0, 1000));
  }

  parts.push('【当前对话】');
  return parts.join('\n\n');
}

function generateDemoReply(_character: { name: string }, userMessage: string, _context: string): string {
  // DEMO MODE 确定性回复模板
  const templates = [
    `角色 微微颔首：“${userMessage}……这是个有趣的话题。”`,
    `角色 眼神微动：“……你这么说，我倒是想起了一些往事。”`,
    `角色 轻声道：“若你想知道更多，不妨再问细一点。”`,
    `角色 嘴角微扬：“这让我想起了${_context.slice(0, 30)}……那些日子。”`,
  ] as const;
  const idx = userMessage.length % templates.length;
  return templates[idx] ?? templates[0];
}

async function saveChatMemory(projectId: string, characterId: string, userId: string, userMessage: string, assistantReply: string): Promise<void> {
  const db = getDb();
  const content = `用户：${userMessage}\n${characterId}：${assistantReply}`;
  await db.insert(memories).values({
    projectId,
    scope: 'character',
    subjectId: characterId,
    content,
    ownerId: userId,
    createdAt: new Date(),
  });
}