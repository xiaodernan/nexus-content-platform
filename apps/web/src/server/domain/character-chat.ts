/**
 * §47 角色对话的人设与上下文组装（纯函数，不碰库、不调 provider）。
 *
 * 为什么单独抽一层：对话 API 在 DEMO MODE 下**不生成回复**（§47：没接真 provider
 * 之前不做假对话，§159），但"人设拼得对不对、记忆与语料进没进上下文"是纯逻辑，
 * 可以不依赖数据库与 provider 用单测钉死。真正的模型调用接上之后，
 * 这里拼出来的 prompt 就是发给 provider 的那一份。
 */

/** 记忆行的最小形状：对话上下文只需要正文 */
export interface ChatMemoryLike {
  content: string;
}

export function buildPersonaPrompt(
  character: { name: string; profile: Record<string, unknown> | null },
  profile: Record<string, unknown> | null,
): string {
  const name = character.name || '未命名角色';
  const p = profile as Record<string, unknown> | null;
  const voice = (p?.voice as Record<string, unknown> | null) ?? {};
  const visual = (p?.visualIdentity as Record<string, unknown> | null) ?? {};

  // 空栏位不占行：空字符串与空数组都不产生那一行，否则检索结果里会出现一排"外观：（空）"
  const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
  const nonEmptyList = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0;

  const sections: string[] = [
    `你是 ${name}。请完全沉浸在这个角色中，用第一人称回复。`,
    `【基本信息】`,
    nonEmpty(p?.identity) ? `身份：${p.identity}` : '',
    nonEmpty(p?.appearance) ? `外观：${p.appearance}` : '',
    nonEmpty(p?.personality) ? `性格：${p.personality}` : '',
    nonEmpty(p?.clothing) ? `穿着：${p.clothing}` : '',
    nonEmpty(p?.style) ? `画风：${p.style}` : '',
    nonEmptyList(p?.traits)
      ? `特征：${(p.traits as string[]).join('、')}`
      : nonEmpty(p?.traits)
        ? `特征：${p.traits}`
        : '',
    nonEmpty(p?.background) ? `背景故事：${p.background}` : '',
    nonEmpty(p?.goals)
      ? `目标：${p.goals}`
      : nonEmptyList(p?.goals)
        ? `目标：${(p.goals as string[]).join('、')}`
        : '',
    nonEmpty(p?.fears)
      ? `恐惧：${p.fears}`
      : nonEmptyList(p?.fears)
        ? `恐惧：${(p.fears as string[]).join('、')}`
        : '',
    nonEmpty(voice.register) ? `语域：${voice.register}` : '',
    nonEmpty(voice.pace) ? `语速：${voice.pace}` : '',
    nonEmptyList(voice.catchphrases) ? `口头禅：${(voice.catchphrases as string[]).join('、')}` : '',
    nonEmpty(visual.silhouette) ? `轮廓：${visual.silhouette}` : '',
    nonEmptyList(visual.motifs) ? `母题：${(visual.motifs as string[]).join('、')}` : '',
    nonEmptyList(visual.palette) ? `色板：${(visual.palette as string[]).join('、')}` : '',
    nonEmptyList(p?.relationships)
      ? `关系：${(p.relationships as Array<{ kind?: string; target?: string; note?: string }>).map(
          (r) => `${r.kind || '关系'} → ${r.target}${r.note ? `（${r.note}）` : ''}`,
        ).join('\n')}`
      : '',
  ].filter(Boolean);

  return sections.join('\n');
}

export function buildContext(persona: string, memories: ChatMemoryLike[], knowledgeContext: string): string {
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
