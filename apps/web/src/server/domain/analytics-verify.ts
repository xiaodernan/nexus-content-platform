/**
 * §169-AI-Verify · 「创作者数据解读」的机检门（与 §INSIGHT-4 / 问典 verify 同纪律）。
 *
 * 纯函数：不依赖 provider、不上网。规则（双语）：
 *   1) ≥ 24 字符；2) 至少一个 ASCII 数字（模型不得没有「数字钉子」）；
 *   3) 三段式序号 ① ② ③ 必须齐全（system prompt 强制三段式，两端通用）；
 *   4) 必须出现「动作 / action」（唯一可落地动作段）。
 * 不做：不用 diff（模型文本是什么就是什么）；不通过就返回 issues，不抹平。
 */
const ACTION_WORDS = ['动作', 'action'];

export function creatorAnalysisIssues(text: string, locale: 'zh' | 'en'): string[] {
  const issues: string[] = [];
  if (typeof text !== 'string') {
    issues.push('non-string');
    return issues;
  }
  const t = text.trim();
  if (t.length < 24) issues.push('too-short');
  if (!/\d/.test(t)) issues.push('missing-digits');
  for (const mark of ['①', '②', '③']) if (!t.includes(mark)) issues.push(`missing-section-${mark}`);
  const lower = t.toLowerCase();
  if (!ACTION_WORDS.some((w) => lower.includes(w))) issues.push('missing-action-section');
  void locale; // 两端同规（当前 system prompt 以「THE #1 highest-impact action」统一要求）
  return issues;
}

export function verifyCreatorAnalysis(text: string, locale: 'zh' | 'en'): boolean {
  return creatorAnalysisIssues(text, locale).length === 0;
}

/** 未通过机检时给用户看的短句——不隐藏模型文本，只标出「这话不算测量」的边界。 */
export const UNVERIFIED_CREATOR_NOTE = {
  zh: '机检提醒：这段解读没带齐「事实 + 证据 + 动作」与数字，当散文读，不当测量读。',
  en: 'Machine check: this read did not carry its fact/evidence/action with numbers — treat it as prose, not measurement.',
} as const;
