import { BIBLE_CHAPTERS, BIBLE_ECHOES, type BibleChapter } from '@/world-bible/generated';

/**
 * §BIBLE-WHISPER · 把一章正典打包成 LLM 的「你只能回答的关于正典的问题」——
 *
 * 三条纪律：
 * 1. 不可编造——凡正典没写的，回答「典籍里没写」或"The canon does not say."；
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
    '--- 正典摘录（单一语言原文）---',
    locale === 'zh' ? file.markdownZh : file.markdownEn,
    '',
    '现在，等候读者的问题。',
  ].join('\n');
  return rules;
}

/**
 * §GAME-TIDE-WITNESS · 潮汐见证：章节的「现场旁证」——
 * 典籍室坐着一穿长衫的人，只说典抄里有的话。输出限制在一句话，
 * 锚句只用于风格对齐（不强制引用），不需要引文。
 *
 * 前缀字节必须稳定：`buildWitnessPrompt` 对同一（文件，语言）返回逐字节一致的内容，
 * 这样 provider 的前缀 KV 缓存才能复用（整大盘多轮稳定的最重分量就在 ST-DKEY）。
 */
export function buildWitnessPrompt(file: WhisperFile, locale: 'zh' | 'en'): string {
  const display = locale === 'zh' ? file.titleZh : file.titleEn;
  const rules = [
    locale === 'zh'
      ? '你是「潮汐见证」——典籍室门口长袖的那位，袖子上沾过正典每一章的墨。你说的每一句都只能引自本章内容；典章没有写的，你一个字也不能说。'
      : 'You are the Tide-Eye witness — the figure at the door of the copying hall, sleeves blackened with the ink of every chapter. You may say only what this chapter already says; anything the canon did not write, you cannot speak.',
    '',
    `本章：《${display}》（order=${file.order}，slug=${file.slug}）。`,
    '',
    '硬约束（不可违反）：',
    '1. 一句话：一句话结束，不超过 140 个汉字（EN：不超过 60 words）。',
    '2. 不编造：正典里没写的就说「典籍没这一页」/ “The canon does not hold this page.”——字面没有就不成句。',
    '3. 不补戏：不得添加人物、地点、事件、动机、情绪——只准引本章。',
    '4. 风格：平实、沉默、克制。不华丽、不煽情、不预言、不全知。',
    '5. 语言：中文问中文答，英文问英文答；不混语。',
    '',
    '--- 正典摘录（单一语言原文）---',
    locale === 'zh' ? file.markdownZh : file.markdownEn,
    '',
    '等读者问潮沙。',
  ].join('\n');
  return rules;
}
