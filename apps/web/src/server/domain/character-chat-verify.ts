/**
 * §47-Verify · 角色对话回的机检门——persona 回复不必先变成三段式，但「不能是模型自己漏稿纸 / 心里没底的回」。
 *
 * 纯函数，不联网。规则（zh/en 通用）：
 *   1) 非空且 ≤ 1500 字符；2) 不得含「我是 AI/语言模型」类自述（persona 维持第一人称，不能自曝架构）；
 *   3) 不得把内部骨架原封吐出（【相关记忆】/【相关语料】/【当前对话】 或 "[/system" 字样）。
 * 不做：不强求数字、不强求三段式（这不是分析题）、不翻 diff——这段回的是什么就是什么。
 */

export function characterReplyIssues(text: string): string[] {
  const issues: string[] = [];
  if (typeof text !== 'string') {
    issues.push('non-string');
    return issues;
  }
  const t = text.trim();
  if (!t) {
    issues.push('empty-reply');
    return issues;
  }
  if (t.length > 1500) issues.push('too-long');
  const lower = t.toLowerCase();
  for (const banned of ['语言模型', '人工智能', 'as an ai', 'i am an ai', 'i\'m an ai', '作为ai', '我是个 ai', '我是ai', 'codex', 'gpt-5', 'gpt-4', 'gpt-6', 'gpt-6.1', 'openai', 'claude', 'gemini', 'languagemodel']) {
    if (lower.includes(banned)) {
      issues.push('self-identity-leak');
      break;
    }
  }
  for (const leak of ['【相关记忆】', '【相关语料】', '【当前对话】', '[/system', '<|system|>']) {
    if (t.includes(leak)) issues.push('system-leak');
  }
  return issues;
}

export function verifyCharacterReply(text: string): boolean {
  return characterReplyIssues(text).length === 0;
}

/** 未过机检时给用户看的短句：不隐藏模型回文，只标注边界。 */
export const UNVERIFIED_CHARACTER_NOTE = {
  zh: '机检提醒：这段回复自己照实吐出了系统骨架/自述身份——只当散戏听，别全信。',
  en: 'Machine check: this reply leaked its own scaffolding or self-identity — treat it as improvisation, not as scripture.',
} as const;
