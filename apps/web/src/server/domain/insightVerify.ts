/**
 * §INSIGHT-4 · 「观察哨第⑧格」的机检门——模型解读不是一句话就信（§159「给过模型的数也不能换成模型说的数」）。
 *
 * 纯函数：不碰库、不碰网络、不给 provider 机会补考。
 * 满足 zh 的三个要素才算通过：「现象」+「证据」+ 至少一个 ASCII 数字。
 * en 同理对 observation/evidence 两个词（不分大小写）+ 至少一个数字。
 *
 * 不做：不用 diff（模型文本是什么就是什么）；不过了就标 false 交给调用方决定怎么办。
 */
export function verifyInsightAnalysis(text: string, locale: 'zh' | 'en'): boolean {
  if (typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length < 16) return false;
  if (!/\d/.test(t)) return false;
  if (locale === 'zh') {
    return t.includes('现象') && t.includes('证据');
  }
  const lower = t.toLowerCase();
  return (lower.includes('observation') || lower.includes('phenomenon')) && lower.includes('evidence');
}

/** 未通过机检时显示给用户看的短句（不隐藏模型文本——只补一句「这句话不成数的地方」的提醒）。 */
export const UNVERIFIED_NOTE = {
  zh: '机检提醒：这段解读没有带出处与数字，看看后面；不算数。',
  en: 'Machine check: this read did not carry its evidence; treat it as prose, not measurement.',
} as const;
