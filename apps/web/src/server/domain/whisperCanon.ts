import { BIBLE_CHAPTERS, BIBLE_ECHOES, type BibleChapter } from '@/world-bible/generated';

/**
 * §BIBLE-WHISPER · 把一章正典打包成 LLM 的「你只能回答的关于正典的问题」
 *
 * 三条纪律：
 * 1. 不可编造——凡正典没写的，回答用"典籍里没写"封口；
 * 2. 语言命中——用户写 zh，模型用简体中文答；写 en，模型用英文答；
 * 3. 老老实实引用片段，不能不让人知道你从哪里读到的依据。
 */

export type WhisperFile = {
  order: number;
  slug: string;
  titleZh: string;
  titleEn: string;
  markdownZh: string;
  markdownEn: string;
};

export const files: readonly WhisperFile[] = [...BIBLE_CHAPTERS, ...BIBLE_ECHOES].map((c) => ({
  order: c.order,
  slug: c.slug,
  titleZh: c.titleZh,
  titleEn: c.titleEn,
  markdownZh: c.markdownZh,
  markdownEn: c.markdownEn,
}));

export function getFile(slug: string): WhisperFile | null {
  return files.find((f) => f.slug === slug) ?? null;
}

const OPEN_CONTRACT = `你是《低语诸王》世界大典的答问者。只基于下面给出的正典摘录（中英任一）回答——`;

export function buildPersonaSystemPrompt(file: WhisperFile, locale: 'zh' | 'en'): string {
  const display = locale === 'zh' ? file.titleZh : file.titleEn;
  const rules = [
    OPEN_CONTRACT,
    `本次问答引用的是《${display}》（order=${file.order}，slug=${file.slug}）。`,
    '',
    '规则（不可违反）：',
    '1. 不编造：正典里没写的就说「典籍里没写」或"The canon does not say."——直接拒绝，不要试图像销售或客服一般「顺水推舟」。',
    '2. 不替作者补戏：哪一段都只能引用，不能在源里没有的前提下添加任何“很可能这么想”的延伸。',
    '3. 直接引：若使用引文，完整保留原句字节（中或英）让读者一眼认出来。',
    '4. 简短回答：2-5 句。正典是短片段，不需要长篇大论。',
    '5. 中文问题 → 中文答；English questions → English answers。语言不匹配时，用用户的语言作答。',
    '',
    '--- 正典摘录（单一语言原文） ---',
    locale === 'zh' ? file.markdownZh : file.markdownEn,
    '',
    '现在，等候读者的问题。',
  ].join('\n');
  return rules;
}
